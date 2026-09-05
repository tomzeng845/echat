export type CallMode = "audio" | "video";
export type CallStatus = "incoming" | "answering" | "calling" | "connected";

export function defaultSpeakerForCallMode(mode: CallMode) {
  return mode === "video";
}

export function toggledSpeakerState(current: boolean) {
  return !current;
}

export function shouldCloseCallFromNativeClear(status: CallStatus) {
  return status === "incoming";
}

export function shouldPlayOutgoingRingback(status: CallStatus) {
  return status === "calling";
}
