import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type { RtcConfig } from "./echat-api";

export type NativeRtcDescription = {
  type: "offer" | "answer";
  sdp: string;
};

export type NativeRtcIceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex: number;
};

type NativeWebRTCPlugin = {
  start(options: {
    mode: "audio" | "video";
    speaker: boolean;
    iceServers: RtcConfig["iceServers"];
  }): Promise<{ started: boolean; mode: "audio" | "video" }>;
  createOffer(): Promise<{ payload: string }>;
  setRemoteDescription(options: { payload: string }): Promise<void>;
  createAnswer(): Promise<{ payload: string }>;
  addIceCandidate(options: { payload: string }): Promise<void>;
  setMicrophoneEnabled(options: {
    enabled: boolean;
  }): Promise<{ enabled: boolean }>;
  setCameraEnabled(options: {
    enabled: boolean;
  }): Promise<{ enabled: boolean }>;
  setSpeaker(options: { speaker: boolean }): Promise<{ speaker: boolean }>;
  close(): Promise<void>;
  getState(): Promise<{
    running: boolean;
    mode: "audio" | "video";
    speaker: boolean;
    microphoneEnabled: boolean;
    cameraEnabled: boolean;
    callKitAudioActive: boolean;
    connectionState: string;
  }>;
  addListener(
    eventName: "iceCandidate",
    listener: (candidate: NativeRtcIceCandidate) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "connectionState",
    listener: (event: { state: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "diagnostic",
    listener: (event: { event: string; [key: string]: unknown }) => void
  ): Promise<PluginListenerHandle>;
};

const NativeWebRTC = registerPlugin<NativeWebRTCPlugin>("NativeWebRTC");

export function shouldUseNativeIosWebRTC() {
  return Capacitor.getPlatform() === "ios";
}

export function startNativeIosWebRTC(options: {
  mode: "audio" | "video";
  speaker: boolean;
  iceServers: RtcConfig["iceServers"];
}) {
  return NativeWebRTC.start(options);
}

export function createNativeRtcOffer() {
  return NativeWebRTC.createOffer();
}

export function setNativeRtcRemoteDescription(payload: string) {
  return NativeWebRTC.setRemoteDescription({ payload });
}

export function createNativeRtcAnswer() {
  return NativeWebRTC.createAnswer();
}

export function addNativeRtcIceCandidate(payload: string) {
  return NativeWebRTC.addIceCandidate({ payload });
}

export function setNativeRtcMicrophone(enabled: boolean) {
  return NativeWebRTC.setMicrophoneEnabled({ enabled });
}

export function setNativeRtcCamera(enabled: boolean) {
  return NativeWebRTC.setCameraEnabled({ enabled });
}

export function setNativeRtcSpeaker(speaker: boolean) {
  return NativeWebRTC.setSpeaker({ speaker });
}

export function closeNativeIosWebRTC() {
  return NativeWebRTC.close();
}

export function addNativeRtcIceListener(
  listener: (candidate: NativeRtcIceCandidate) => void
) {
  return NativeWebRTC.addListener("iceCandidate", listener);
}

export function addNativeRtcConnectionStateListener(
  listener: (event: { state: string }) => void
) {
  return NativeWebRTC.addListener("connectionState", listener);
}

export function addNativeRtcDiagnosticListener(
  listener: (event: { event: string; [key: string]: unknown }) => void
) {
  return NativeWebRTC.addListener("diagnostic", listener);
}
