import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { HubConnectionState, type HubConnection } from "@microsoft/signalr";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume1,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  adaptiveBitrate,
  classifyNetworkQuality,
  defaultSpeakerForCallMode,
  preferredAudioConstraints,
  shouldCloseCallFromNativeClear,
  shouldPlayOutgoingRingback,
  toggledSpeakerState,
} from "@/lib/call-audio";
import { createUuid } from "@/lib/uuid";
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
import {
  clearNativeCallListenerAlert,
  consumePendingNativeCall,
  endNativeCallAudioSession,
  ensureNativeMediaPermissions,
  notifyIncomingEvent,
  playOutgoingCallAlert,
  setNativeCallAudioRoute,
  stopIncomingCallAlert,
} from "@/lib/mobile-native";
import {
  recordAudioState,
  recordCallQuality,
  recordIceRestart,
  recordNoAudio,
  recordOutputDevice,
} from "@/lib/runtime-diagnostics";

export type CallManagerHandle = {
  start: (conversation: Conversation, mode: "audio" | "video") => Promise<void>;
};
type ActiveCall = {
  callId: string;
  conversationId: string;
  conversationName: string;
  mode: "audio" | "video";
  status: "incoming" | "answering" | "calling" | "connected";
  callerId?: string;
  callerName?: string;
};

function StreamView({
  stream,
  muted = false,
  className = "",
  audioRole = "remote",
}: {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
  audioRole?: "local" | "remote";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      const element = ref.current;
      const play = () => {
        element.muted = muted;
        element.volume = 1;
        element.play().catch(() => undefined);
      };
      element.srcObject = stream;
      element.onloadedmetadata = play;
      element.oncanplay = play;
      const retries = [0, 250, 1000, 2500].map(delay =>
        window.setTimeout(play, delay)
      );
      return () => {
        retries.forEach(window.clearTimeout);
        element.onloadedmetadata = null;
        element.oncanplay = null;
      };
    }
  }, [muted, stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      data-audio-role={audioRole}
      className={className}
    />
  );
}

function AudioStream({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      const element = ref.current;
      let disposed = false;
      const play = () => {
        if (disposed) return;
        element.muted = false;
        element.volume = 1;
        const needsResume =
          element.paused || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
        recordAudioState({
          event: "play-attempt",
          paused: element.paused,
          readyState: element.readyState,
          streamActive: stream.active,
          tracks: stream.getAudioTracks().map(track => ({
            id: track.id,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          })),
        });
        if (needsResume)
          window.dispatchEvent(new CustomEvent("echat-remote-audio-playback"));
        element.play().then(
          () =>
            recordAudioState({
              event: "play-succeeded",
              paused: element.paused,
              readyState: element.readyState,
            }),
          error =>
            recordAudioState({
              event: "play-failed",
              name: error instanceof DOMException ? error.name : "unknown",
              message: error instanceof Error ? error.message : String(error),
              paused: element.paused,
              readyState: element.readyState,
            })
        );
      };
      element.srcObject = stream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
        track.onunmute = play;
        track.onmute = play;
        track.onended = play;
      });
      element.onloadedmetadata = play;
      element.oncanplay = play;
      element.onplaying = play;
      element.onpause = play;
      element.onstalled = play;
      element.onwaiting = play;
      const retries = [0, 250, 1000, 2500, 5000].map(delay =>
        window.setTimeout(play, delay)
      );
      const watchdog = window.setInterval(play, 2000);
      const resumeFromUserGesture = () => play();
      window.addEventListener(
        "echat-resume-remote-audio",
        resumeFromUserGesture
      );
      recordAudioState({
        event: "remote-audio-attached",
        streamActive: stream.active,
        tracks: stream.getAudioTracks().map(track => ({
          id: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
        })),
      });
      return () => {
        disposed = true;
        retries.forEach(window.clearTimeout);
        window.clearInterval(watchdog);
        window.removeEventListener(
          "echat-resume-remote-audio",
          resumeFromUserGesture
        );
        element.onloadedmetadata = null;
        element.oncanplay = null;
        element.onplaying = null;
        element.onpause = null;
        element.onstalled = null;
        element.onwaiting = null;
        stream.getAudioTracks().forEach(track => {
          track.onunmute = null;
          track.onmute = null;
          track.onended = null;
        });
      };
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

async function waitForRealtimeConnection(
  connection: HubConnection,
  timeoutMs = 8000
) {
  const deadline = Date.now() + timeoutMs;
  while (connection.state !== HubConnectionState.Connected) {
    if (connection.state === HubConnectionState.Disconnected)
      await connection.start().catch(() => undefined);
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return true;
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function activeCallIsConnected(call: ActiveCall | null) {
  return call?.status === "connected";
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
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const qualityTimer = useRef<number | null>(null);
  const audioRouteTimers = useRef<number[]>([]);
  const lastIceRestart = useRef(new Map<string, number>());
  const previousStats = useRef(
    new Map<string, { packetsLost: number; packetsReceived: number }>()
  );
  const noAudioSince = useRef(new Map<string, number>());
  const rtcConfigRef = useRef<RTCConfiguration>({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    iceCandidatePoolSize: 4,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(false);
  const speakerOnRef = useRef(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [networkQuality, setNetworkQuality] = useState("检测中");
  callRef.current = call;
  remoteStreamsRef.current = remoteStreams;
  speakerOnRef.current = speakerOn;

  function markConnected() {
    if (connectedAtRef.current !== null) return;
    const timestamp = Date.now();
    connectedAtRef.current = timestamp;
    setConnectedAt(timestamp);
    setElapsedSeconds(0);
  }

  useEffect(() => {
    if (call?.status !== "connected" || connectedAt === null) return;
    const update = () =>
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [call?.status, connectedAt]);

  useEffect(() => {
    const restoreAudioRoute = () => {
      if (callRef.current?.status !== "connected") return;
      setNativeCallAudioRoute(speakerOnRef.current).catch(() => undefined);
    };
    window.addEventListener("echat-remote-audio-playback", restoreAudioRoute);
    return () =>
      window.removeEventListener("echat-remote-audio-playback", restoreAudioRoute);
  }, []);

  useEffect(() => {
    api<RtcConfig>("/api/rtc/config")
      .then(value => {
        rtcConfigRef.current = {
          iceServers: value.iceServers,
          iceCandidatePoolSize: 4,
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require",
        };
      })
      .catch(() => undefined);
  }, []);

  async function acquire(mode: "audio" | "video") {
    await ensureNativeMediaPermissions({
      camera: mode === "video",
      microphone: true,
    });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: preferredAudioConstraints(),
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
    const useSpeaker = defaultSpeakerForCallMode(mode);
    await setNativeCallAudioRoute(useSpeaker).catch(() => useSpeaker);
    setSpeakerOn(useSpeaker);
    speakerOnRef.current = useSpeaker;
    return stream;
  }

  async function updatePeerQuality(
    peer: RTCPeerConnection,
    mode: "audio" | "video"
  ) {
    const reports: Array<Record<string, unknown>> = [];
    (await peer.getStats()).forEach(report =>
      reports.push(report as Record<string, unknown>)
    );
    const inbound = reports.filter(report => report.type === "inbound-rtp");
    const audioInbound = inbound.filter(
      report => report.kind === "audio" || report.mediaType === "audio"
    );
    const candidate = reports.find(
      report => report.type === "candidate-pair" && report.state === "succeeded"
    );
    const totalPacketsLost = inbound.reduce(
      (total, report) => total + Number(report.packetsLost || 0),
      0
    );
    const totalPacketsReceived = inbound.reduce(
      (total, report) => total + Number(report.packetsReceived || 0),
      0
    );
    let peerKey: string | undefined;
    peers.current.forEach((value, key) => {
      if (value === peer) peerKey = key;
    });
    const previous = peerKey ? previousStats.current.get(peerKey) : undefined;
    const packetsLost = Math.max(
      0,
      totalPacketsLost - (previous?.packetsLost || 0)
    );
    const packetsReceived = Math.max(
      0,
      totalPacketsReceived - (previous?.packetsReceived || 0)
    );
    if (peerKey)
      previousStats.current.set(peerKey, {
        packetsLost: totalPacketsLost,
        packetsReceived: totalPacketsReceived,
      });
    const jitter = inbound.reduce(
      (max, report) => Math.max(max, Number(report.jitter || 0)),
      0
    );
    const quality = classifyNetworkQuality(
      packetsLost,
      packetsReceived,
      jitter,
      Number(candidate?.currentRoundTripTime || 0)
    );
    const rttMs = Number(candidate?.currentRoundTripTime || 0) * 1000;
    if (rttMs > 0) setLatencyMs(Math.round(rttMs));
    setNetworkQuality(
      quality === "excellent" || quality === "good"
        ? "良好"
        : quality === "degraded"
          ? "一般"
          : "较差"
    );
    recordCallQuality({ quality, rttMs, packetsLost, packetsReceived, jitter });
    const audioPackets = audioInbound.reduce(
      (total, report) => total + Number(report.packetsReceived || 0),
      0
    );
    const audioPrevious = previousStats.current.get(`${peerKey}:audio`);
    const audioDelta = Math.max(0, audioPackets - (audioPrevious?.packetsReceived || 0));
    if (peerKey) {
      previousStats.current.set(`${peerKey}:audio`, {
        packetsLost: 0,
        packetsReceived: audioPackets,
      });
      const remoteHasAudio = remoteStreamsRef.current[peerKey]?.getAudioTracks().length;
      if (activeCallIsConnected(callRef.current) && remoteHasAudio) {
        const started = noAudioSince.current.get(peerKey);
        if (audioDelta > 0) noAudioSince.current.delete(peerKey);
        else if (!started) noAudioSince.current.set(peerKey, Date.now());
        else if (
          Date.now() - started > 8000 &&
          (peer.iceConnectionState === "failed" ||
            peer.iceConnectionState === "disconnected")
        ) {
          const last = lastIceRestart.current.get(`${peerKey}:audio`) || 0;
          if (Date.now() - last > 10000) {
            lastIceRestart.current.set(`${peerKey}:audio`, Date.now());
            recordNoAudio({ peerKey, audioPackets });
            recordIceRestart({ peerKey, reason: "no-audio-data-and-ice-failed" });
            toast.info("检测到远端音频中断，正在尝试恢复连接…", {
              duration: 3000,
            });
            peer.restartIce();
          }
        }
      }
    }
    if (mode === "video") {
      const bitrate = adaptiveBitrate(quality, true);
      for (const sender of peer.getSenders()) {
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) parameters.encodings = [{}];
        for (const encoding of parameters.encodings) {
          if (bitrate.maxBitrate !== undefined)
            encoding.maxBitrate = bitrate.maxBitrate;
          encoding.scaleResolutionDownBy = bitrate.scaleDownBy;
        }
        await sender.setParameters(parameters).catch(() => undefined);
      }
    }
  }

  function startQualityMonitor() {
    if (qualityTimer.current !== null) return;
    qualityTimer.current = window.setInterval(() => {
      const active = callRef.current;
      if (!active) return;
      peers.current.forEach(peer =>
        updatePeerQuality(peer, active.mode).catch(() => undefined)
      );
    }, 2500);
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
      const audioCapabilities = RTCRtpReceiver.getCapabilities?.("audio");
      if (audioCapabilities) {
        const preferredAudioCodecs = audioCapabilities.codecs.filter(codec =>
          ["audio/opus", "audio/PCMU", "audio/PCMA"].includes(
            codec.mimeType.toLowerCase()
          )
        );
        peer
          .getTransceivers()
          .filter(transceiver => transceiver.receiver.track.kind === "audio")
          .forEach(transceiver => {
            if (preferredAudioCodecs.length)
              transceiver.setCodecPreferences(preferredAudioCodecs);
          });
      }
      const videoCapabilities = RTCRtpSender.getCapabilities?.("video");
      if (videoCapabilities) {
        const preferredVideoCodecs = videoCapabilities.codecs.filter(codec =>
          ["video/VP9", "video/AV1", "video/H264", "video/VP8"].includes(
            codec.mimeType
          )
        );
        peer
          .getTransceivers()
          .filter(transceiver => transceiver.receiver.track.kind === "video")
          .forEach(transceiver => {
            if (preferredVideoCodecs.length)
              transceiver.setCodecPreferences(preferredVideoCodecs);
          });
      }
      peer
        .getTransceivers()
        .filter(transceiver => transceiver.sender.track?.kind === "video")
        .forEach(transceiver => {
          const parameters = transceiver.sender.getParameters();
          for (const encoding of parameters.encodings || [])
            encoding.maxFramerate = 30;
          parameters.degradationPreference = "maintain-framerate";
          transceiver.sender.setParameters(parameters).catch(() => undefined);
        });
      startQualityMonitor();
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
      peer.ontrack = event => {
        event.track.enabled = true;
        [0, 250, 1000, 2500].forEach(delay => {
          const timer = window.setTimeout(() => {
            setNativeCallAudioRoute(speakerOnRef.current).catch(
              () => undefined
            );
          }, delay);
          audioRouteTimers.current.push(timer);
        });
        setRemoteStreams(current => {
          const existing = current[targetUserId];
          const incoming = event.streams[0];
          if (existing) {
            if (!existing.getTracks().some(track => track.id === event.track.id))
              existing.addTrack(event.track);
            return { ...current };
          }
          return {
            ...current,
            [targetUserId]: incoming ?? new MediaStream([event.track]),
          };
        });
      };
      peer.onconnectionstatechange = () => {
        if (
          peer?.connectionState === "failed" ||
          peer?.connectionState === "disconnected"
        ) {
          const last = lastIceRestart.current.get(targetUserId) || 0;
          if (Date.now() - last > 3000) {
            lastIceRestart.current.set(targetUserId, Date.now());
            peer.restartIce();
          }
        }
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
    if (qualityTimer.current !== null)
      window.clearInterval(qualityTimer.current);
    qualityTimer.current = null;
    audioRouteTimers.current.forEach(window.clearTimeout);
    audioRouteTimers.current = [];
    lastIceRestart.current.clear();
    noAudioSince.current.clear();
    previousStats.current.clear();
    peers.current.forEach(peer => peer.close());
    peers.current.clear();
    pendingIce.current.clear();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (active) await clearNativeCallListenerAlert(active.callId);
    await stopIncomingCallAlert();
    await endNativeCallAudioSession().catch(() => undefined);
    setLocalStream(null);
    setRemoteStreams({});
    setMembers([]);
    setSpeakerOn(false);
    speakerOnRef.current = false;
    connectedAtRef.current = null;
    setConnectedAt(null);
    setElapsedSeconds(0);
    setLatencyMs(null);
    setNetworkQuality("检测中");
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
        const next: ActiveCall = {
          callId: createUuid(),
          conversationId: conversation.id,
          conversationName: conversation.name,
          mode,
          status: "calling",
        };
        await acquire(mode);
        setMembers(
          await api<ConversationMember[]>(
            `/api/conversations/${conversation.id}/members`
          )
        );
        setCall(next);
        callRef.current = next;
        if (shouldPlayOutgoingRingback(next.status))
          await playOutgoingCallAlert(next.callId);
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
      if (callRef.current?.callId === invite.callId) return;
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
      notifyIncomingEvent({
        kind: invite.mode === "video" ? "video-call" : "voice-call",
        eventId: invite.callId,
        title: invite.callerName || "E聊来电",
        body:
          invite.mode === "video" ? "邀请你进行视频通话" : "邀请你进行语音通话",
        target: {
          type: "call",
          conversationId: invite.conversationId,
          callId: invite.callId,
        },
      }).catch(() => undefined);
    };
    const accepted = async (participant: CallParticipant) => {
      const active = callRef.current;
      if (!active || active.callId !== participant.callId) return;
      await stopIncomingCallAlert();
      await setNativeCallAudioRoute(speakerOnRef.current).catch(
        () => speakerOnRef.current
      );
      const connected: ActiveCall = { ...active, status: "connected" };
      callRef.current = connected;
      setCall(connected);
      markConnected();
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
      if (peers.current.size <= 1) void finish(false);
    };
    connection.on("call.invited", invited);
    connection.on("call.accepted", accepted);
    connection.on("call.signal", signaled);
    connection.on("call.rejected", rejected);
    connection.on("call.ended", ended);
    const nativeInvited = (event: Event) => {
      consumePendingNativeCall();
      const invite = (
        event as CustomEvent<CallInvite & { answerRequested?: boolean }>
      ).detail;
      invited(invite);
      if (invite.answerRequested)
        window.setTimeout(() => accept().catch(() => undefined), 0);
    };
    const nativeCleared = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          callId: string;
          conversationId?: string;
          callerId?: string;
          reason?: string;
        }>
      ).detail;
      const callId = detail.callId;
      const active = callRef.current;
      if (
        active?.callId === callId &&
        shouldCloseCallFromNativeClear(active.status, detail.reason)
      ) {
        if (detail.reason === "declined")
          connection
            .invoke(
              "CallReject",
              detail.conversationId || active.conversationId,
              callId,
              detail.callerId || active.callerId,
              "declined"
            )
            .catch(() => undefined);
        finish(false);
      }
    };
    window.addEventListener("echat-native-call", nativeInvited);
    window.addEventListener("echat-native-call-cleared", nativeCleared);
    const pendingNativeCall = consumePendingNativeCall();
    if (pendingNativeCall) {
      invited(pendingNativeCall);
      if (pendingNativeCall.answerRequested)
        window.setTimeout(() => accept().catch(() => undefined), 0);
    }
    return () => {
      connection.off("call.invited", invited);
      connection.off("call.accepted", accepted);
      connection.off("call.signal", signaled);
      connection.off("call.rejected", rejected);
      connection.off("call.ended", ended);
      window.removeEventListener("echat-native-call", nativeInvited);
      window.removeEventListener("echat-native-call-cleared", nativeCleared);
    };
  }, [connection, remoteStreams, user.id]);

  async function accept() {
    const active = callRef.current;
    if (!active || !connection || active.status !== "incoming") return;
    const answering: ActiveCall = { ...active, status: "answering" };
    callRef.current = answering;
    setCall(answering);
    if (!(await waitForRealtimeConnection(connection))) {
      callRef.current = active;
      setCall(active);
      toast.error("实时连接正在恢复，请稍后再次接听");
      return;
    }
    try {
      await connection.invoke(
        "CallPrepareAnswer",
        active.conversationId,
        active.callId
      );
      await clearNativeCallListenerAlert(active.callId);
      await stopIncomingCallAlert();
      await acquire(active.mode);
      setMembers(
        await api<ConversationMember[]>(
          `/api/conversations/${active.conversationId}/members`
        )
      );
      await connection.invoke(
        "CallAccept",
        active.conversationId,
        active.callId
      );
      const connected: ActiveCall = { ...active, status: "connected" };
      callRef.current = connected;
      setCall(connected);
      markConnected();
      await createPeer(active.callerId || "", false);
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
  async function toggleSpeaker() {
    const next = toggledSpeakerState(speakerOn);
    try {
      window.dispatchEvent(new CustomEvent("echat-resume-remote-audio"));
      const applied = await setNativeCallAudioRoute(next);
      window.dispatchEvent(new CustomEvent("echat-resume-remote-audio"));
      speakerOnRef.current = applied;
      setSpeakerOn(applied);
      recordOutputDevice({ speaker: applied, label: applied ? "speaker" : "earpiece" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法切换扬声器");
    }
  }

  if (!call) return null;
  const remoteEntries = Object.entries(remoteStreams);
  const statusText =
    call.status === "incoming"
      ? `${call.callerName} 邀请你${call.mode === "video" ? "视频" : "语音"}通话`
      : call.status === "answering"
        ? "正在接听…"
        : call.status === "calling"
          ? "正在等待对方接听…"
          : `通话中 · ${remoteEntries.length + 1} 人`;
  const durationText = formatCallDuration(elapsedSeconds);
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
        {call.status === "connected"
            ? `${statusText} · ${durationText}`
            : statusText}
        </p>
      </header>
      {call.status === "connected" && (
        <div className="flex justify-center gap-2 px-4 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1">
            {speakerOn ? <Volume2 size={13} /> : <Volume1 size={13} />}
            {speakerOn ? "外放" : "听筒"}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            网络 {networkQuality}
            {latencyMs === null ? " · 延迟检测中" : ` · ${latencyMs} ms`}
          </span>
        </div>
      )}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 md:p-8">
        {call.mode === "audio" &&
          remoteEntries.map(([id, stream]) => (
            <AudioStream key={`audio-${id}`} stream={stream} />
          ))}
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
              audioRole="local"
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
              aria-label="拒绝通话"
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
              aria-label="接听通话"
              className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 shadow-lg"
            >
              <Phone />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMic}
              aria-label={micOn ? "关闭麦克风" : "打开麦克风"}
              className={`grid h-12 w-12 place-items-center rounded-full ${micOn ? "bg-white/10" : "bg-white text-slate-900"}`}
            >
              {micOn ? <Mic /> : <MicOff />}
            </button>
            {call.mode === "video" && (
              <button
                onClick={toggleCamera}
                aria-label={cameraOn ? "关闭摄像头" : "打开摄像头"}
                className={`grid h-12 w-12 place-items-center rounded-full ${cameraOn ? "bg-white/10" : "bg-white text-slate-900"}`}
              >
                {cameraOn ? <Video /> : <VideoOff />}
              </button>
            )}
            <button
              onClick={toggleSpeaker}
              className={`grid h-12 w-12 place-items-center rounded-full ${speakerOn ? "bg-teal-400 text-slate-950" : "bg-white/10"}`}
              aria-label={speakerOn ? "关闭扬声器" : "打开扬声器"}
              title={speakerOn ? "扬声器已打开" : "打开扬声器"}
            >
              {speakerOn ? <Volume2 /> : <Volume1 />}
            </button>
            <button
              onClick={() => finish()}
              aria-label="结束通话"
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
