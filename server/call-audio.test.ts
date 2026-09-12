import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adaptiveBitrate,
  classifyNetworkQuality,
  defaultSpeakerForCallMode,
  preferredAudioConstraints,
  shouldCloseCallFromNativeClear,
  shouldPlayOutgoingRingback,
  toggledSpeakerState,
} from "../client/src/lib/call-audio";

describe("Android call audio routing", () => {
  it("uses the earpiece for voice and video by default", () => {
    expect(defaultSpeakerForCallMode("audio")).toBe(false);
    expect(defaultSpeakerForCallMode("video")).toBe(false);
  });

  it("toggles the visible speaker control state", () => {
    expect(toggledSpeakerState(false)).toBe(true);
    expect(toggledSpeakerState(true)).toBe(false);
  });

  it("does not hang up a call when native code only clears its incoming notification", () => {
    expect(shouldCloseCallFromNativeClear("incoming")).toBe(true);
    expect(shouldCloseCallFromNativeClear("answering")).toBe(false);
    expect(shouldCloseCallFromNativeClear("connected")).toBe(false);
    expect(shouldCloseCallFromNativeClear("calling")).toBe(false);
  });

  it("ends the local call when native cleanup represents a remote hangup", () => {
    expect(shouldCloseCallFromNativeClear("calling", "ended")).toBe(true);
    expect(shouldCloseCallFromNativeClear("connected", "rejected")).toBe(true);
    expect(shouldCloseCallFromNativeClear("calling", "accepted")).toBe(false);
    expect(shouldCloseCallFromNativeClear("calling", "answering")).toBe(false);
  });

  it("plays ringback only while waiting for the peer to answer", () => {
    expect(shouldPlayOutgoingRingback("calling")).toBe(true);
    expect(shouldPlayOutgoingRingback("incoming")).toBe(false);
    expect(shouldPlayOutgoingRingback("answering")).toBe(false);
    expect(shouldPlayOutgoingRingback("connected")).toBe(false);
  });

  it("requests browser hardware echo cancellation, noise suppression and AGC", () => {
    const constraints = preferredAudioConstraints();
    expect(constraints.echoCancellation).toEqual({ ideal: true });
    expect(constraints.noiseSuppression).toEqual({ ideal: true });
    expect(constraints.autoGainControl).toEqual({ ideal: true });
  });

  it("keeps OpenIM administrator credentials on the API server", () => {
    const service = readFileSync(
      new URL("../Api/OpenImService.cs", import.meta.url),
      "utf8"
    );
    const controller = readFileSync(
      new URL("../Api/Controllers/OpenImController.cs", import.meta.url),
      "utf8"
    );
    expect(service).toContain(
      'Environment.GetEnvironmentVariable("OPENIM_ADMIN_TOKEN")'
    );
    expect(service).toContain("/auth/get_user_token");
    expect(service).toContain("platformID");
    expect(controller).toContain("[Authorize]");
    expect(controller).toContain('Route("api/openim")');
    expect(controller).not.toContain("AdminToken");
  });

  it("lowers bitrate when loss, jitter or RTT become severe", () => {
    expect(classifyNetworkQuality(1, 999, 0.01, 0.05)).toBe("excellent");
    expect(classifyNetworkQuality(80, 920, 0.09, 0.5)).toBe("degraded");
    expect(classifyNetworkQuality(150, 850, 0.3, 1.1)).toBe("poor");
    expect(adaptiveBitrate("poor", true).maxBitrate).toBeLessThan(
      adaptiveBitrate("good", true).maxBitrate
    );
    expect(adaptiveBitrate("poor", false).maxBitrate).toBe(16_000);
  });

  it("does not feed remote playback events back into native route changes", () => {
    const source = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("echat-remote-audio-playback");
    expect(source).not.toContain("audioRouteTimers");
    expect(source).not.toContain("refreshAudioSession");
    expect(source).toContain("element.paused ||");
  });

  it("restores the native call session after stopping a ringtone", () => {
    const source = readFileSync(
      new URL("../ios/App/App/AppDelegate.swift", import.meta.url),
      "utf8"
    );
    expect(source).toContain('reassertAudioSession(reason: "alert-stopped")');
    expect(source).toContain("var callAudioSessionRequested = false");
    expect(source).toContain("callAudioSessionRequested = true");
  });

  it("initializes PushKit immediately and keeps VoIP background modes enabled", () => {
    const appDelegate = readFileSync(
      new URL("../ios/App/App/AppDelegate.swift", import.meta.url),
      "utf8"
    );
    const info = readFileSync(
      new URL("../ios/App/App/Info.plist", import.meta.url),
      "utf8"
    );
    expect(appDelegate).toContain("if Thread.isMainThread { install() }");
    expect(appDelegate).toContain("registry.desiredPushTypes = [.voIP]");
    expect(appDelegate).toContain("didReceiveIncomingPushWith payload");
    expect(info).toContain("<string>voip</string>");
    expect(info).toContain("<string>remote-notification</string>");
  });

  it("keeps a regular APNs fallback for calls when VoIP delivery is unavailable", () => {
    const apns = readFileSync(
      new URL("../Api/ApnsNotificationService.cs", import.meta.url),
      "utf8"
    );
    const push = readFileSync(
      new URL("../Api/PushNotificationService.cs", import.meta.url),
      "utf8"
    );
    expect(apns).toContain('["content-available"] = 1');
    expect(push).toContain("SelectCallPushDevices(devices)");
    expect(push).toContain('"ios" => IosEnabled ? apns.SendAsync');
    expect(push).toContain('"ios-voip" => IosEnabled');
    expect(push).toContain("SelectCallPushDevices");
    expect(push).toContain("voipDeviceIds");
  });

  it("turns an APNs call fallback into the same CallKit path", () => {
    const source = readFileSync(
      new URL("../ios/App/App/AppDelegate.swift", import.meta.url),
      "utf8"
    );
    expect(source).toContain("didReceiveRemoteNotification userInfo");
    expect(source).toContain("handleFallbackRemoteNotification");
    expect(source).toContain("reportNewIncomingCall(with: uuid");
  });

  it("restores the Harmony/Android listener after reboot and task removal", () => {
    const service = readFileSync(
      new URL(
        "../android/app/src/main/java/com/echat/app/CallListenerService.java",
        import.meta.url
      ),
      "utf8"
    );
    const receiver = readFileSync(
      new URL(
        "../android/app/src/main/java/com/echat/app/CallListenerBootReceiver.java",
        import.meta.url
      ),
      "utf8"
    );
    const manifest = readFileSync(
      new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8"
    );
    const nativeLog = readFileSync(
      new URL(
        "../android/app/src/main/java/com/echat/app/EChatNativeLog.java",
        import.meta.url
      ),
      "utf8"
    );
    const plugin = readFileSync(
      new URL(
        "../android/app/src/main/java/com/echat/app/MediaPermissionsPlugin.java",
        import.meta.url
      ),
      "utf8"
    );
    expect(service).toContain("public static void restore(Context context)");
    expect(service).toContain("onTaskRemoved(Intent rootIntent)");
    expect(service).toContain("setAndAllowWhileIdle");
    expect(service).toContain("PendingIntent.getForegroundService");
    expect(service).toContain("explicitStopRequested");
    expect(service).toContain("ACTION_WATCHDOG");
    expect(service).toContain("WATCHDOG_INTERVAL_MS = 45_000L");
    expect(service).toContain("moveSharedPreferencesFrom");
    expect(service).toContain("scheduleRestart(5_000L");
    expect(service).not.toContain("if (!stopping) scheduleRestart()");
    expect(receiver).toContain("ACTION_BOOT_COMPLETED");
    expect(receiver).toContain("CallListenerService.restore");
    expect(manifest).toContain("RECEIVE_BOOT_COMPLETED");
    expect(manifest).toContain("USE_FULL_SCREEN_INTENT");
    expect(manifest).toContain('android:directBootAware="true"');
    expect(manifest).toContain(".CallListenerBootReceiver");
    expect(nativeLog).toContain("echat-native-runtime.jsonl");
    expect(nativeLog).toContain("MAX_EXPORTED_ENTRIES = 500");
    expect(plugin).toContain("getRuntimeLogs(PluginCall call)");
  });

  it("routes iOS calls through one native WebRTC audio owner", () => {
    const callManager = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    const nativePlugin = readFileSync(
      new URL("../ios/App/App/NativeWebRTCPlugin.swift", import.meta.url),
      "utf8"
    );
    expect(callManager).toContain("shouldUseNativeIosWebRTC()");
    expect(callManager).toContain("startNativeIosWebRTC");
    expect(callManager).toContain("setNativeRtcRemoteDescription");
    expect(nativePlugin).toContain("rtcAudioSession.useManualAudio = true");
    expect(nativePlugin).toContain("rtcAudioSession.isAudioEnabled = false");
    expect(nativePlugin).toContain("audioSessionDidActivate");
    expect(nativePlugin).toContain("LKRTCPeerConnectionFactory");
    expect(nativePlugin).toContain("rtcSession.lockForConfiguration()");
    expect(nativePlugin).toContain(
      "try rtcSession.setConfiguration(configuration, active: true)"
    );
    expect(nativePlugin).toContain("try rtcAudioSession.setActive(false)");
    expect(nativePlugin).toContain("native-webrtc-remote-audio-track");
    expect(nativePlugin).toContain("native-webrtc-audio-stats");
    expect(nativePlugin).not.toContain(
      "try AVAudioSession.sharedInstance().setActive("
    );
  });

  it("waits for native WebRTC teardown and avoids a second audio-session deactivation", () => {
    const callManager = readFileSync(
      new URL("../client/src/components/chat/CallManager.tsx", import.meta.url),
      "utf8"
    );
    const nativePlugin = readFileSync(
      new URL("../ios/App/App/NativeWebRTCPlugin.swift", import.meta.url),
      "utf8"
    );
    expect(callManager).toContain(
      "const finishedNativeRtc = nativeRtcActive.current"
    );
    expect(callManager).toContain("if (!finishedNativeRtc)");
    expect(nativePlugin).toContain("self.closeLocked(deactivateSession: true)");
    expect(nativePlugin).toContain("completion?()");
  });

  it("verifies and recovers the native iOS camera frame and outbound video path", () => {
    const nativePlugin = readFileSync(
      new URL("../ios/App/App/NativeWebRTCPlugin.swift", import.meta.url),
      "utf8"
    );
    const exceptionCatcher = readFileSync(
      new URL("../ios/App/App/EChatExceptionCatcher.m", import.meta.url),
      "utf8"
    );
    const xcodeProject = readFileSync(
      new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url),
      "utf8"
    );
    expect(nativePlugin).toContain("NativeVideoCaptureDelegate");
    expect(nativePlugin).toContain(
      "source.capturer(capturer, didCapture: frame)"
    );
    expect(nativePlugin).toContain("native-camera-first-frame");
    expect(nativePlugin).toContain("native-camera-no-frames");
    expect(nativePlugin).toContain("restartCameraCaptureLocked");
    expect(nativePlugin).toContain("native-camera-start-deferred");
    expect(nativePlugin).toContain('reason: "audio-interruption-ended"');
    expect(nativePlugin).toContain("cameraRecoveryWorkItem?.cancel()");
    expect(nativePlugin).toContain("native-camera-session-verified");
    expect(nativePlugin).toContain("capture-session-not-running");
    expect(nativePlugin).toContain("cameraCaptureHasStarted");
    expect(nativePlugin).toContain("native-camera-starting-after-inactive");
    expect(nativePlugin).toContain("start-waiting-for-active");
    expect(nativePlugin).toContain("sessionRunningBeforeStop");
    expect(nativePlugin).toContain("sessionInputsBeforeStop");
    expect(nativePlugin).toContain("sessionOutputsBeforeStop");
    expect(nativePlugin).toContain("private final class EChatVideoCapturer");
    expect(nativePlugin).toContain("let freshCapturer = EChatVideoCapturer");
    expect(nativePlugin).not.toContain("LKRTCCameraVideoCapturer");
    expect(nativePlugin).toContain("self.cameraCapturer = freshCapturer");
    expect(nativePlugin).toContain("native-camera-session-reset");
    expect(nativePlugin).toContain("native-camera-session-reset-complete");
    expect(nativePlugin).toContain("session.stopRunning()");
    expect(nativePlugin).toContain("session.removeOutput(output)");
    expect(nativePlugin).toContain("session.removeInput(input)");
    expect(nativePlugin).toContain("native-camera-start-running");
    expect(nativePlugin).toContain("native-camera-start-running-returned");
    expect(nativePlugin).toContain("native-camera-start-running-exception");
    expect(nativePlugin).toContain("startRunningWasCalled");
    expect(nativePlugin).toContain("AVCaptureSession.runtimeErrorNotification");
    expect(nativePlugin).toContain(
      "AVCaptureSession.wasInterruptedNotification"
    );
    expect(nativePlugin).toContain(
      "AVCaptureSession.interruptionEndedNotification"
    );
    expect(nativePlugin).toContain(
      "AVCaptureSession.didStartRunningNotification"
    );
    expect(nativePlugin).toContain(
      "AVCaptureSession.didStopRunningNotification"
    );
    expect(nativePlugin).toContain("native-camera-session-runtime-error");
    expect(nativePlugin).toContain("native-camera-session-interrupted");
    expect(nativePlugin).toContain("orderedCameraFormats");
    expect(nativePlugin).toContain("cameraFormatCandidates");
    expect(nativePlugin).toContain("format.isVideoHDRSupported");
    expect(nativePlugin).toContain("device.activeFormat = format");
    expect(nativePlugin).toContain(
      "native-custom-camera-active-format-configured"
    );
    expect(nativePlugin).toContain("native-custom-camera-session-configured");
    expect(nativePlugin).toContain("native-custom-camera-session-started");
    expect(nativePlugin).toContain("native-custom-camera-first-sample");
    expect(nativePlugin).toContain(
      "LKRTCCVPixelBuffer(pixelBuffer: pixelBuffer)"
    );
    expect(nativePlugin).toContain(
      "delegate?.capturer(self, didCapture: frame)"
    );
    expect(nativePlugin).toContain("native-camera-format-fallback-selected");
    expect(nativePlugin).toContain("error.code == -11873");
    expect(nativePlugin).toContain("lastFormatFailureGeneration");
    expect(nativePlugin).toContain("availableVideoPixelFormatTypes");
    expect(nativePlugin).toContain(
      "kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange"
    );
    expect(nativePlugin).toContain(
      "kCVPixelFormatType_420YpCbCr8BiPlanarFullRange"
    );
    expect(nativePlugin).toContain("videoOutput.videoSettings");
    expect(nativePlugin).toContain("canSetSessionPreset(.inputPriority)");
    expect(nativePlugin).toContain("outputCompatible");
    expect(nativePlugin).toContain("cameraRestartAttempts < 8");
    expect(exceptionCatcher).toContain("@catch (NSException *exception)");
    expect(xcodeProject).toContain("EChatExceptionCatcher.m in Sources");
    expect(xcodeProject).toContain(
      'SWIFT_OBJC_BRIDGING_HEADER = "App/EChat-Bridging-Header.h"'
    );
    expect(nativePlugin).toContain(
      "asyncAfter(deadline: .now() + .milliseconds(250))"
    );
    expect(nativePlugin).toContain(
      "asyncAfter(deadline: .now() + .milliseconds(150))"
    );
    expect(nativePlugin).toContain("native-webrtc-video-outbound-stats");
    expect(nativePlugin).toContain("native-webrtc-video-inbound-stats");
    expect(nativePlugin).toContain("LKRTCDefaultVideoEncoderFactory");
    expect(nativePlugin).toContain("LKRTCDefaultVideoDecoderFactory");
    expect(nativePlugin).toContain(
      'encoderFactory.preferredCodec = LKRTCVideoCodecInfo(name: "VP8")'
    );
    expect(nativePlugin).toContain("native-video-codec-factory");
    expect(nativePlugin).toContain("codecParameters");
    expect(nativePlugin).toContain("codecFeedback");
    expect(nativePlugin).toContain("inboundCandidates");
    expect(nativePlugin).toContain('!mime.contains("rtx")');
    expect(nativePlugin).toContain("private func statInt64");
    expect(nativePlugin).toContain("private func statDouble");
    expect(nativePlugin).toContain("native-video-sdp");
    expect(nativePlugin).toContain("remote-description-set");
    expect(nativePlugin).toContain("native-video-transceiver-snapshot");
    expect(nativePlugin).toContain(
      "native-video-transceiver-started-receiving"
    );
    expect(nativePlugin).toContain("native-rtp-receiver-first-packet");
    expect(nativePlugin).toContain("private final class RemoteVideoFrameRelay");
    expect(nativePlugin).toContain("native-remote-video-first-frame");
    expect(nativePlugin).toContain("native-remote-video-render-progress");
    expect(nativePlugin).toContain("native-video-overlay-audit");
    expect(nativePlugin).toContain("native-remote-video-renderer-rebound");
    expect(nativePlugin).toContain('reason: "decoded-without-render"');
    expect(nativePlugin).toContain("remoteRendererRebindAttempts < 3");
    expect(nativePlugin).toContain("framesDecoded");
    expect(nativePlugin).toContain("framesReceived");
    expect(nativePlugin).toContain("renderedFrames");
    expect(nativePlugin).toContain("UIApplication.didBecomeActiveNotification");
  });

  it("uses the pure WebRTC binary without the LiveKit Room or Rust runtime", () => {
    const packageManifest = readFileSync(
      new URL("../ios/App/CapApp-SPM/Package.swift", import.meta.url),
      "utf8"
    );
    expect(packageManifest).toContain("livekit/webrtc-xcframework.git");
    expect(packageManifest).toContain('product(name: "LiveKitWebRTC"');
    expect(packageManifest).not.toContain("client-sdk-swift");
    expect(packageManifest).not.toContain("RustLiveKitUniFFI");
  });

  it("records HTTP, SignalR and native bridge API calls in exportable logs", () => {
    const diagnostics = readFileSync(
      new URL("../client/src/lib/runtime-diagnostics.ts", import.meta.url),
      "utf8"
    );
    const apiClient = readFileSync(
      new URL("../client/src/lib/echat-api.ts", import.meta.url),
      "utf8"
    );
    const mobileNative = readFileSync(
      new URL("../client/src/lib/mobile-native.ts", import.meta.url),
      "utf8"
    );
    const profile = readFileSync(
      new URL("../client/src/components/P1ProfilePanel.tsx", import.meta.url),
      "utf8"
    );
    expect(diagnostics).toContain("installApiFetchCapture");
    expect(diagnostics).toContain('info("api", "HTTP request"');
    expect(diagnostics).toContain('info("api", "HTTP response"');
    expect(diagnostics).toContain("echat.runtime-diagnostics.v2");
    expect(diagnostics).toContain("extraEntries: DiagnosticEntry[]");
    expect(apiClient).toContain("instrumentRealtimeConnection");
    expect(apiClient).toContain('direction: "outbound"');
    expect(apiClient).toContain('direction: "inbound"');
    expect(apiClient).toContain("connection.onreconnecting");
    expect(mobileNative).toContain("getNativeRuntimeLogs");
    expect(profile).toContain("exportDiagnosticLog(nativeEntries)");
  });
});
