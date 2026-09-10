export type CallMode = "audio" | "video";
export type CallStatus = "incoming" | "answering" | "calling" | "connected";
export type NetworkQuality = "excellent" | "good" | "degraded" | "poor";

export function preferredAudioConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  };
}

export function classifyNetworkQuality(
  packetsLost: number,
  packetsReceived: number,
  jitterSeconds: number,
  roundTripTimeSeconds: number
): NetworkQuality {
  const loss =
    packetsLost + packetsReceived > 0
      ? packetsLost / (packetsLost + packetsReceived)
      : 0;
  if (loss >= 0.12 || jitterSeconds >= 0.25 || roundTripTimeSeconds >= 1)
    return "poor";
  if (loss >= 0.05 || jitterSeconds >= 0.08 || roundTripTimeSeconds >= 0.45)
    return "degraded";
  if (loss >= 0.02 || jitterSeconds >= 0.03 || roundTripTimeSeconds >= 0.2)
    return "good";
  return "excellent";
}

export function adaptiveBitrate(quality: NetworkQuality, video: boolean) {
  if (video) {
    return {
      maxBitrate:
        quality === "poor"
          ? 180_000
          : quality === "degraded"
            ? 450_000
            : quality === "good"
              ? 900_000
              : 1_500_000,
      scaleDownBy: quality === "poor" ? 2 : quality === "degraded" ? 1.5 : 1,
    };
  }
  return {
    maxBitrate:
      quality === "poor"
        ? 16_000
        : quality === "degraded"
          ? 24_000
          : quality === "good"
            ? 40_000
            : 64_000,
    scaleDownBy: 1,
  };
}

export function defaultSpeakerForCallMode(mode: CallMode) {
  return mode === "video";
}

export function toggledSpeakerState(current: boolean) {
  return !current;
}

export function shouldCloseCallFromNativeClear(
  status: CallStatus,
  reason?: string
) {
  if (
    ["ended", "rejected", "declined", "busy", "permission"].includes(
      reason || ""
    )
  )
    return true;
  return status === "incoming";
}

export function shouldPlayOutgoingRingback(status: CallStatus) {
  return status === "calling";
}
