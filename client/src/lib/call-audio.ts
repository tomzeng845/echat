export type CallMode = "audio" | "video";

export function defaultSpeakerForCallMode(mode: CallMode) {
  return mode === "video";
}

export function toggledSpeakerState(current: boolean) {
  return !current;
}
