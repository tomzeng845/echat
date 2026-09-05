import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { HubConnection } from "@microsoft/signalr";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type CallEnded,
  type CallInvite,
  type CallParticipant,
  type CallSignal,
  type Conversation,
  type ConversationMember,
  type RtcConfig,
  type User,
} from "@/lib/echat-api";
import { ensureNativeMediaPermissions } from "@/lib/mobile-native";

export type CallManagerHandle = {
  start: (conversation: Conversation, mode: "audio" | "video") => Promise<void>;
};
type ActiveCall = {
  callId: string;
  conversationId: string;
  conversationName: string;
  mode: "audio" | "video";
  status: "incoming" | "calling" | "connected";
  callerId?: string;
  callerName?: string;
};

function StreamView({
  stream,
  muted = false,
  className = "",
}: {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video ref={ref} autoPlay playsInline muted={muted} className={className} />
  );
}

const CallManager = forwardRef<
  CallManagerHandle,
  { user: User; connection: HubConnection | null }
>(function CallManager({ user, connection }, ref) {
  const [call, setCall] = useState<ActiveCall | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const rtcConfigRef = useRef<RTCConfiguration>({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  callRef.current = call;

  useEffect(() => {
    api<RtcConfig>("/api/rtc/config")
      .then(value => {
        rtcConfigRef.current = { iceServers: value.iceServers };
      })
      .catch(() => undefined);
  }, []);

  async function acquire(mode: "audio" | "video") {
    await ensureNativeMediaPermissions({
      camera: mode === "video",
      microphone: true,
    });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        mode === "video"
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            }
          : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicOn(true);
    setCameraOn(mode === "video");
    return stream;
  }

  async function createPeer(targetUserId: string, createOffer: boolean) {
    const active = callRef.current;
    const stream = localStreamRef.current;
    if (!active || !stream || !connection || targetUserId === user.id) return;
    let peer = peers.current.get(targetUserId);
    if (!peer) {
      peer = new RTCPeerConnection(rtcConfigRef.current);
      peers.current.set(targetUserId, peer);
      stream.getTracks().forEach(track => peer!.addTrack(track, stream));
      peer.onicecandidate = event => {
        if (event.candidate)
          connection
            .invoke(
              "CallSignal",
              active.conversationId,
              active.callId,
              targetUserId,
              "ice",
              JSON.stringify(event.candidate.toJSON())
            )
            .catch(() => undefined);
      };
      peer.ontrack = event =>
        setRemoteStreams(current => ({
          ...current,
          [targetUserId]: event.streams[0] ?? new MediaStream([event.track]),
        }));
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === "failed") peer.restartIce();
        if (peer?.connectionState === "closed")
          setRemoteStreams(current => {
            const next = { ...current };
            delete next[targetUserId];
            return next;
          });
      };
    }
    if (createOffer && peer.signalingState === "stable") {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await connection.invoke(
        "CallSignal",
        active.conversationId,
        active.callId,
        targetUserId,
        "offer",
        JSON.stringify(offer)
      );
    }
    return peer;
  }

  async function finish(notify = true) {
    const active = callRef.current;
    if (notify && active && connection)
      connection
        .invoke("CallEnd", active.conversationId, active.callId)
        .catch(() => undefined);
    peers.current.forEach(peer => peer.close());
    peers.current.clear();
    pendingIce.current.clear();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setMembers([]);
    setCall(null);
  }

  useImperativeHandle(ref, () => ({
    start: async (conversation, mode) => {
      if (!connection) {
        toast.error("实时连接尚未就绪");
        return;
      }
      if (callRef.current) {
        toast.warning("已有通话正在进行");
        return;
      }
      try {
        await acquire(mode);
        const next: ActiveCall = {
          callId: crypto.randomUUID(),
          conversationId: conversation.id,
          conversationName: conversation.name,
          mode,
          status: "calling",
        };
        setMembers(
          await api<ConversationMember[]>(
            `/api/conversations/${conversation.id}/members`
          )
        );
        setCall(next);
        callRef.current = next;
        await connection.invoke(
          "CallInvite",
          conversation.id,
          next.callId,
          mode
        );
      } catch (cause) {
        await finish(false);
        const message =
          cause instanceof Error && cause.name === "NotAllowedError"
            ? "请允许摄像头和麦克风权限"
            : cause instanceof Error && cause.name === "NotFoundError"
              ? "当前设备未检测到可用的摄像头或麦克风"
              : "无法发起通话";
        toast.error(message);
      }
    },
  }));

  useEffect(() => {
    if (!connection) return;
    const invited = (invite: CallInvite) => {
      if (callRef.current) {
        connection
          .invoke(
            "CallReject",
            invite.conversationId,
            invite.callId,
            invite.callerId,
            "busy"
          )
          .catch(() => undefined);
        return;
      }
      const next: ActiveCall = {
        callId: invite.callId,
        conversationId: invite.conversationId,
        conversationName: invite.callerName,
        mode: invite.mode,
        status: "incoming",
        callerId: invite.callerId,
        callerName: invite.callerName,
      };
      setCall(next);
      callRef.current = next;
    };
    const accepted = async (participant: CallParticipant) => {
      if (callRef.current?.callId !== participant.callId) return;
      setCall(current =>
        current ? { ...current, status: "connected" } : current
      );
      await createPeer(participant.userId, true);
    };
    const signaled = async (signal: CallSignal) => {
      const active = callRef.current;
      if (!active || active.callId !== signal.callId) return;
      try {
        const peer = await createPeer(signal.fromUserId, false);
        if (!peer) return;
        if (signal.signalType === "offer") {
          await peer.setRemoteDescription(JSON.parse(signal.payload));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await connection.invoke(
            "CallSignal",
            active.conversationId,
            active.callId,
            signal.fromUserId,
            "answer",
            JSON.stringify(answer)
          );
        } else if (signal.signalType === "answer") {
          await peer.setRemoteDescription(JSON.parse(signal.payload));
        } else {
          const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
          if (peer.remoteDescription) await peer.addIceCandidate(candidate);
          else
            pendingIce.current.set(signal.fromUserId, [
              ...(pendingIce.current.get(signal.fromUserId) || []),
              candidate,
            ]);
        }
        if (peer.remoteDescription) {
          for (const candidate of pendingIce.current.get(signal.fromUserId) ||
            [])
            await peer.addIceCandidate(candidate);
          pendingIce.current.delete(signal.fromUserId);
        }
      } catch {
        toast.error("通话协商失败，请重试");
      }
    };
    const rejected = (event: CallEnded) => {
      if (callRef.current?.callId === event.callId) {
        toast.info(
          event.reason === "busy" ? "对方正在通话中" : "对方已拒绝通话"
        );
        finish(false);
      }
    };
    const ended = (event: CallEnded) => {
      if (callRef.current?.callId !== event.callId) return;
      peers.current.get(event.userId)?.close();
      peers.current.delete(event.userId);
      setRemoteStreams(current => {
        const next = { ...current };
        delete next[event.userId];
        return next;
      });
      if (Object.keys(remoteStreams).length <= 1) finish(false);
    };
    connection.on("call.invited", invited);
    connection.on("call.accepted", accepted);
    connection.on("call.signal", signaled);
    connection.on("call.rejected", rejected);
    connection.on("call.ended", ended);
    return () => {
      connection.off("call.invited", invited);
      connection.off("call.accepted", accepted);
      connection.off("call.signal", signaled);
      connection.off("call.rejected", rejected);
      connection.off("call.ended", ended);
    };
  }, [connection, remoteStreams, user.id]);

  async function accept() {
    const active = callRef.current;
    if (!active || !connection) return;
    try {
      await acquire(active.mode);
      setMembers(
        await api<ConversationMember[]>(
          `/api/conversations/${active.conversationId}/members`
        )
      );
      setCall({ ...active, status: "connected" });
      await connection.invoke(
        "CallAccept",
        active.conversationId,
        active.callId
      );
    } catch (cause) {
      await connection
        .invoke(
          "CallReject",
          active.conversationId,
          active.callId,
          active.callerId,
          "permission"
        )
        .catch(() => undefined);
      await finish(false);
      toast.error("无法获取摄像头或麦克风权限");
    }
  }

  function toggleMic() {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach(track => (track.enabled = !track.enabled));
    setMicOn(value => !value);
  }
  function toggleCamera() {
    localStreamRef.current
      ?.getVideoTracks()
      .forEach(track => (track.enabled = !track.enabled));
    setCameraOn(value => !value);
  }

  if (!call) return null;
  const remoteEntries = Object.entries(remoteStreams);
  const statusText =
    call.status === "incoming"
      ? `${call.callerName} 邀请你${call.mode === "video" ? "视频" : "语音"}通话`
      : call.status === "calling"
        ? "正在等待对方接听…"
        : `通话中 · ${remoteEntries.length + 1} 人`;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#06111d] text-white">
      <header className="flex h-20 items-center justify-between px-5 md:px-8">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-teal-300">
            E聊 {call.mode === "video" ? "Video" : "Voice"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {call.conversationName}
          </h2>
        </div>
        <p className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-300">
          {statusText}
        </p>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 md:p-8">
        {call.mode === "video" ? (
          <div
            className={`grid h-full w-full max-w-6xl gap-3 ${remoteEntries.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
          >
            {remoteEntries.length ? (
              remoteEntries.map(([id, stream]) => (
                <div
                  key={id}
                  className="relative overflow-hidden rounded-3xl bg-slate-900"
                >
                  <StreamView
                    stream={stream}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-4 left-4 rounded-full bg-black/40 px-3 py-1 text-xs">
                    {members.find(item => item.userId === id)?.displayName ||
                      "通话成员"}
                  </span>
                </div>
              ))
            ) : (
              <div className="grid place-items-center rounded-3xl bg-white/[.04]">
                <div className="text-center">
                  <Volume2 className="mx-auto h-10 w-10 animate-pulse text-teal-300" />
                  <p className="mt-4 text-sm text-slate-300">{statusText}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-[36px] bg-gradient-to-br from-teal-400 to-emerald-600 text-3xl font-semibold shadow-2xl shadow-teal-500/20">
              {Array.from(call.conversationName).slice(-2).join("")}
            </div>
            <p className="mt-6 text-xl font-semibold">
              {call.conversationName}
            </p>
            <p className="mt-2 text-sm text-slate-400">{statusText}</p>
          </div>
        )}
        {localStream && call.mode === "video" && (
          <div className="absolute bottom-5 right-5 h-32 w-24 overflow-hidden rounded-2xl border-2 border-white/20 bg-slate-800 shadow-2xl md:h-48 md:w-36">
            <StreamView
              stream={localStream}
              muted
              className="h-full w-full object-cover -scale-x-100"
            />
            <span className="absolute bottom-2 left-2 text-[10px]">我</span>
          </div>
        )}
      </div>
      <footer className="flex h-28 shrink-0 items-center justify-center gap-4 bg-black/20 px-4">
        {call.status === "incoming" ? (
          <>
            <button
              onClick={() => {
                connection?.invoke(
                  "CallReject",
                  call.conversationId,
                  call.callId,
                  call.callerId,
                  "declined"
                );
                finish(false);
              }}
              className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 shadow-lg"
            >
              <PhoneOff />
            </button>
            <button
              onClick={accept}
              className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 shadow-lg"
            >
              <Phone />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMic}
              className={`grid h-12 w-12 place-items-center rounded-full ${micOn ? "bg-white/10" : "bg-white text-slate-900"}`}
            >
              {micOn ? <Mic /> : <MicOff />}
            </button>
            {call.mode === "video" && (
              <button
                onClick={toggleCamera}
                className={`grid h-12 w-12 place-items-center rounded-full ${cameraOn ? "bg-white/10" : "bg-white text-slate-900"}`}
              >
                {cameraOn ? <Video /> : <VideoOff />}
              </button>
            )}
            <button
              onClick={() => finish()}
              className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 shadow-lg"
            >
              <PhoneOff />
            </button>
          </>
        )}
      </footer>
    </div>
  );
});

export default CallManager;
