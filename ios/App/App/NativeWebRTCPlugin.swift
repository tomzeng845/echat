import Foundation
import UIKit
import AVFoundation
import Capacitor
import LiveKitWebRTC

@objc(NativeWebRTCPlugin)
public final class NativeWebRTCPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeWebRTCPlugin"
    public let jsName = "NativeWebRTC"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createOffer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRemoteDescription", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createAnswer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addIceCandidate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMicrophoneEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCameraEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        NativeIosWebRTCManager.shared.plugin = self
    }

    @objc func start(_ call: CAPPluginCall) {
        let mode = call.getString("mode") == "video" ? "video" : "audio"
        let speaker = call.getBool("speaker") ?? false
        let rawServers = call.getArray("iceServers", JSObject.self) ?? []
        let iceServers = rawServers.compactMap { item -> NativeIceServer? in
            let urls: [String]
            if let values = item["urls"] as? [String] {
                urls = values
            } else if let value = item["urls"] as? String {
                urls = [value]
            } else {
                urls = []
            }
            guard !urls.isEmpty else { return nil }
            return NativeIceServer(
                urls: urls,
                username: item["username"] as? String,
                credential: item["credential"] as? String
            )
        }
        NativeIosWebRTCManager.shared.start(
            mode: mode,
            iceServers: iceServers,
            speaker: speaker
        ) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve(["started": true, "mode": mode])
                case .failure(let error):
                    call.reject("无法启动 iOS 原生通话", nil, error)
                }
            }
        }
    }

    @objc func createOffer(_ call: CAPPluginCall) {
        NativeIosWebRTCManager.shared.createOffer { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload): call.resolve(["payload": payload])
                case .failure(let error): call.reject("无法创建原生通话 Offer", nil, error)
                }
            }
        }
    }

    @objc func setRemoteDescription(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), !payload.isEmpty else {
            call.reject("缺少远端 SDP")
            return
        }
        NativeIosWebRTCManager.shared.setRemoteDescription(payload: payload) { result in
            DispatchQueue.main.async {
                switch result {
                case .success: call.resolve()
                case .failure(let error): call.reject("无法设置远端 SDP", nil, error)
                }
            }
        }
    }

    @objc func createAnswer(_ call: CAPPluginCall) {
        NativeIosWebRTCManager.shared.createAnswer { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload): call.resolve(["payload": payload])
                case .failure(let error): call.reject("无法创建原生通话 Answer", nil, error)
                }
            }
        }
    }

    @objc func addIceCandidate(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), !payload.isEmpty else {
            call.reject("缺少 ICE candidate")
            return
        }
        NativeIosWebRTCManager.shared.addIceCandidate(payload: payload) { result in
            DispatchQueue.main.async {
                switch result {
                case .success: call.resolve()
                case .failure(let error): call.reject("无法添加 ICE candidate", nil, error)
                }
            }
        }
    }

    @objc func setMicrophoneEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        NativeIosWebRTCManager.shared.setMicrophoneEnabled(enabled)
        call.resolve(["enabled": enabled])
    }

    @objc func setCameraEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        NativeIosWebRTCManager.shared.setCameraEnabled(enabled)
        call.resolve(["enabled": enabled])
    }

    @objc func setSpeaker(_ call: CAPPluginCall) {
        let speaker = call.getBool("speaker") ?? false
        NativeIosWebRTCManager.shared.setSpeaker(speaker)
        call.resolve(["speaker": speaker])
    }

    @objc func close(_ call: CAPPluginCall) {
        NativeIosWebRTCManager.shared.close {
            DispatchQueue.main.async { call.resolve() }
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(NativeIosWebRTCManager.shared.stateSnapshot())
    }

    func emitIceCandidate(_ candidate: LKRTCIceCandidate) {
        notifyListeners("iceCandidate", data: [
            "candidate": candidate.sdp,
            "sdpMid": candidate.sdpMid ?? NSNull(),
            "sdpMLineIndex": candidate.sdpMLineIndex
        ])
    }

    func emitConnectionState(_ state: String) {
        notifyListeners("connectionState", data: ["state": state])
    }

    func emitDiagnostic(_ event: String, details: [String: Any] = [:]) {
        var payload = details
        payload["event"] = event
        notifyListeners("diagnostic", data: payload)
    }
}

struct NativeIceServer {
    let urls: [String]
    let username: String?
    let credential: String?
}

private final class NativeVideoCaptureDelegate: NSObject, LKRTCVideoCapturerDelegate {
    private let source: LKRTCVideoSource
    weak var owner: NativeIosWebRTCManager?

    init(source: LKRTCVideoSource) {
        self.source = source
        super.init()
    }

    func capturer(_ capturer: LKRTCVideoCapturer, didCapture frame: LKRTCVideoFrame) {
        // RTCCameraVideoCapturer keeps its delegate weakly. Keep this adapter
        // strongly in the manager and explicitly forward every frame to the
        // RTCVideoSource so capture, preview and outbound encoding share the
        // exact same verified frame path.
        source.capturer(capturer, didCapture: frame)
        owner?.didCaptureLocalVideoFrame(frame)
    }
}

private final class RemoteVideoFrameRelay: NSObject, LKRTCVideoRenderer {
    weak var owner: NativeIosWebRTCManager?
    weak var target: LKRTCVideoRenderer?
    private let lock = NSLock()
    private var frameCount: Int64 = 0
    private var lastFrameAt: Date?

    func setSize(_ size: CGSize) {
        target?.setSize(size)
        owner?.didChangeRemoteVideoSize(size)
    }

    func renderFrame(_ frame: LKRTCVideoFrame?) {
        target?.renderFrame(frame)
        guard let frame else { return }
        lock.lock()
        frameCount += 1
        let count = frameCount
        lastFrameAt = Date()
        lock.unlock()
        owner?.didRenderRemoteVideoFrame(frame, count: count)
    }

    func snapshot() -> (frames: Int64, lastFrameAt: Date?) {
        lock.lock()
        defer { lock.unlock() }
        return (frameCount, lastFrameAt)
    }
}

private final class EChatVideoCapturer: LKRTCVideoCapturer, AVCaptureVideoDataOutputSampleBufferDelegate {
    let captureSession = AVCaptureSession()
    let videoOutput = AVCaptureVideoDataOutput()
    var diagnosticHandler: ((String, [String: Any]) -> Void)?
    private let sessionQueue = DispatchQueue(label: "com.tomzeng845.echat.camera-session")
    private let frameQueue = DispatchQueue(label: "com.tomzeng845.echat.camera-frames")
    private var capturedFrameCount: Int64 = 0

    override init(delegate: LKRTCVideoCapturerDelegate) {
        super.init(delegate: delegate)
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(self, queue: frameQueue)
        captureSession.beginConfiguration()
        if captureSession.canSetSessionPreset(.inputPriority) {
            captureSession.sessionPreset = .inputPriority
        }
        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
        }
        captureSession.commitConfiguration()
    }

    func startCapture(
        with device: AVCaptureDevice,
        format: AVCaptureDevice.Format,
        fps: Int,
        completionHandler: @escaping (Error?) -> Void
    ) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            do {
                let input = try AVCaptureDeviceInput(device: device)
                let mediaSubtype = CMFormatDescriptionGetMediaSubType(format.formatDescription)
                guard self.videoOutput.availableVideoPixelFormatTypes.contains(mediaSubtype) else {
                    completionHandler(self.error("video-output-format-incompatible"))
                    return
                }
                var configurationFailed = false
                let configurationException = EChatExceptionCatcher.captureException {
                    self.captureSession.beginConfiguration()
                    if self.captureSession.canSetSessionPreset(.inputPriority) {
                        self.captureSession.sessionPreset = .inputPriority
                    }
                    for oldInput in self.captureSession.inputs {
                        self.captureSession.removeInput(oldInput)
                    }
                    if self.captureSession.canAddInput(input) {
                        self.captureSession.addInput(input)
                    } else {
                        configurationFailed = true
                    }
                    self.videoOutput.videoSettings = [
                        kCVPixelBufferPixelFormatTypeKey as String: NSNumber(value: mediaSubtype)
                    ]
                    self.captureSession.commitConfiguration()
                }
                if let configurationException {
                    completionHandler(self.error(
                        configurationException["message"] as? String ?? "capture-session-configuration-exception"
                    ))
                    return
                }
                guard !configurationFailed else {
                    completionHandler(self.error("camera-input-incompatible"))
                    return
                }
                self.diagnosticHandler?("native-custom-camera-session-configured", [
                    "sessionPreset": self.captureSession.sessionPreset.rawValue,
                    "sessionInputs": self.captureSession.inputs.count,
                    "sessionOutputs": self.captureSession.outputs.count,
                    "candidatePixelFormat": self.fourCC(mediaSubtype),
                    "outputPixelFormat": self.fourCC(
                        (self.videoOutput.videoSettings[
                            kCVPixelBufferPixelFormatTypeKey as String
                        ] as? NSNumber)?.uint32Value ?? 0
                    ),
                    "availableOutputPixelFormats": self.videoOutput.availableVideoPixelFormatTypes.map {
                        self.fourCC(FourCharCode($0))
                    }
                ])

                try device.lockForConfiguration()
                let formatException = EChatExceptionCatcher.captureException {
                    device.activeFormat = format
                    let duration = CMTime(value: 1, timescale: CMTimeScale(fps))
                    device.activeVideoMinFrameDuration = duration
                    device.activeVideoMaxFrameDuration = duration
                }
                device.unlockForConfiguration()
                if let formatException {
                    completionHandler(self.error(
                        formatException["message"] as? String ?? "camera-format-configuration-exception"
                    ))
                    return
                }
                let activeDimensions = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
                let availableAfter = self.videoOutput.availableVideoPixelFormatTypes
                let configuredOutputSubtype = (self.videoOutput.videoSettings[
                    kCVPixelBufferPixelFormatTypeKey as String
                ] as? NSNumber)?.uint32Value
                let outputCompatible = availableAfter.contains(mediaSubtype)
                    && configuredOutputSubtype == mediaSubtype
                self.diagnosticHandler?("native-custom-camera-active-format-configured", [
                    "matchesRequestedFormat": device.activeFormat === format,
                    "width": activeDimensions.width,
                    "height": activeDimensions.height,
                    "pixelFormat": self.fourCC(
                        CMFormatDescriptionGetMediaSubType(device.activeFormat.formatDescription)
                    ),
                    "fps": fps,
                    "outputCompatible": outputCompatible,
                    "outputPixelFormat": self.fourCC(configuredOutputSubtype ?? 0),
                    "availableOutputPixelFormats": availableAfter.map(self.fourCC)
                ])
                guard device.activeFormat === format, outputCompatible else {
                    completionHandler(self.error("active-format-output-incompatible"))
                    return
                }

                let startException = EChatExceptionCatcher.captureException {
                    self.captureSession.startRunning()
                }
                if let startException {
                    completionHandler(self.error(
                        startException["message"] as? String ?? "capture-session-start-exception"
                    ))
                    return
                }
                guard self.captureSession.isRunning else {
                    completionHandler(self.error("capture-session-not-running"))
                    return
                }
                self.diagnosticHandler?("native-custom-camera-session-started", [
                    "sessionRunning": true,
                    "sessionInputs": self.captureSession.inputs.count,
                    "sessionOutputs": self.captureSession.outputs.count,
                    "fps": fps
                ])
                completionHandler(nil)
            } catch {
                completionHandler(error)
            }
        }
    }

    func stopCapture(completionHandler: (() -> Void)? = nil) {
        sessionQueue.async { [weak self] in
            guard let self else {
                completionHandler?()
                return
            }
            if self.captureSession.isRunning {
                self.captureSession.stopRunning()
            }
            self.diagnosticHandler?("native-custom-camera-session-stopped", [
                "sessionRunning": self.captureSession.isRunning
            ])
            completionHandler?()
        }
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let timestampNs = Int64(CMTimeGetSeconds(presentationTime) * 1_000_000_000)
        let rtcBuffer = LKRTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let frame = LKRTCVideoFrame(
            buffer: rtcBuffer,
            rotation: videoRotation(),
            timeStampNs: timestampNs
        )
        capturedFrameCount += 1
        if capturedFrameCount == 1 {
            diagnosticHandler?("native-custom-camera-first-sample", [
                "width": CVPixelBufferGetWidth(pixelBuffer),
                "height": CVPixelBufferGetHeight(pixelBuffer),
                "pixelFormat": fourCC(CVPixelBufferGetPixelFormatType(pixelBuffer)),
                "timestampNs": timestampNs
            ])
        }
        delegate?.capturer(self, didCapture: frame)
    }

    private func videoRotation() -> LKRTCVideoRotation {
        switch UIDevice.current.orientation {
        case .portraitUpsideDown: return ._270
        case .landscapeLeft: return ._180
        case .landscapeRight: return ._0
        default: return ._90
        }
    }

    private func error(_ message: String) -> NSError {
        NSError(
            domain: "com.tomzeng845.echat.camera",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private func fourCC(_ value: FourCharCode) -> String {
        let bytes: [UInt8] = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff)
        ]
        return String(bytes: bytes, encoding: .ascii) ?? String(value)
    }
}

private enum NativeWebRTCError: LocalizedError {
    case notStarted
    case peerCreationFailed
    case invalidPayload
    case missingSessionDescription
    case cameraUnavailable

    var errorDescription: String? {
        switch self {
        case .notStarted: return "原生 WebRTC 尚未启动"
        case .peerCreationFailed: return "无法创建原生 PeerConnection"
        case .invalidPayload: return "信令数据格式无效"
        case .missingSessionDescription: return "WebRTC 未返回 SDP"
        case .cameraUnavailable: return "未检测到可用摄像头"
        }
    }
}

final class NativeIosWebRTCManager: NSObject, LKRTCPeerConnectionDelegate, LKRTCRtpReceiverDelegate {
    static let shared = NativeIosWebRTCManager()

    weak var plugin: NativeWebRTCPlugin?
    private let queue = DispatchQueue(label: "com.tomzeng845.echat.native-webrtc")
    private var factory: LKRTCPeerConnectionFactory?
    private var peer: LKRTCPeerConnection?
    private var localAudioTrack: LKRTCAudioTrack?
    private var remoteAudioTrack: LKRTCAudioTrack?
    private var remoteAudioReceiver: LKRTCRtpReceiver?
    private var audioStatsTimer: DispatchSourceTimer?
    private var localVideoTrack: LKRTCVideoTrack?
    private var localVideoSource: LKRTCVideoSource?
    private var localVideoSender: LKRTCRtpSender?
    private var remoteVideoTrack: LKRTCVideoTrack?
    private var remoteVideoReceiver: LKRTCRtpReceiver?
    private var cameraCapturer: EChatVideoCapturer?
    private var videoCaptureDelegate: NativeVideoCaptureDelegate?
    private var cameraDevice: AVCaptureDevice?
    private var cameraFormat: AVCaptureDevice.Format?
    private var cameraFormatCandidates: [AVCaptureDevice.Format] = []
    private var cameraFormatCandidateIndex = 0
    private var lastFormatFailureGeneration: Int?
    private var cameraFps = 24
    private var cameraCaptureHasStarted = false
    private var localVideoFrameCount: Int64 = 0
    private var lastLocalVideoFrameAt: Date?
    private var cameraRestartAttempts = 0
    private var cameraCaptureGeneration = 0
    private var cameraRecoveryWorkItem: DispatchWorkItem?
    private var cameraSessionObservers: [NSObjectProtocol] = []
    private var videoStatsTimer: DispatchSourceTimer?
    private var pendingCandidates: [LKRTCIceCandidate] = []
    private var remoteDescriptionReady = false
    private var mode = "audio"
    private var speaker = false
    private var microphoneEnabled = true
    private var cameraEnabled = true
    private var callKitAudioActive = false
    private var activatedByApp = false
    private var interruptionActive = false
    private var activationRetryCount = 0
    private var activationRetryWorkItem: DispatchWorkItem?
    private var sslInitialized = false
    private var _isRunning = false
    private var videoOverlay: UIView?
    private var remoteRenderer: LKRTCMTLVideoView?
    private var localRenderer: LKRTCMTLVideoView?
    private var remoteFrameRelay: RemoteVideoFrameRelay?
    private var remoteRendererBoundTrackId: String?
    private var remoteRendererRebindAttempts = 0

    var isRunning: Bool { queue.sync { _isRunning } }

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc private func applicationDidBecomeActive() {
        queue.async {
            guard self._isRunning, self.mode == "video", self.cameraEnabled else { return }
            // didBecomeActive can arrive while the first asynchronous camera
            // start is still settling. Restarting immediately cancels that
            // start before AVCaptureSession becomes running. Debounce recovery
            // and only restart if no frames arrive during the stability window.
            self.scheduleCameraRecoveryLocked(
                reason: "application-became-active",
                delay: .milliseconds(1200)
            )
        }
    }

    func start(
        mode: String,
        iceServers: [NativeIceServer],
        speaker: Bool,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        queue.async {
            if !self.sslInitialized {
                LKRTCInitializeSSL()
                self.sslInitialized = true
            }
            self.closeLocked(deactivateSession: true)
            self.mode = mode
            self.speaker = speaker
            self.callKitAudioActive = false
            self.interruptionActive = false
            self.activationRetryCount = 0
            self.activationRetryWorkItem?.cancel()
            self.activationRetryWorkItem = nil
            self.microphoneEnabled = true
            self.cameraEnabled = true
            self.remoteDescriptionReady = false
            self.pendingCandidates.removeAll()

            let rtcAudioSession = LKRTCAudioSession.sharedInstance()
            rtcAudioSession.useManualAudio = true
            rtcAudioSession.isAudioEnabled = false
            if EChatVoipManager.shared.callKitAudioActive {
                rtcAudioSession.audioSessionDidActivate(AVAudioSession.sharedInstance())
                self.callKitAudioActive = true
            }

            let factory = LKRTCPeerConnectionFactory()
            let config = LKRTCConfiguration()
            config.sdpSemantics = .unifiedPlan
            config.bundlePolicy = .maxBundle
            config.rtcpMuxPolicy = .require
            config.iceCandidatePoolSize = 4
            config.continualGatheringPolicy = .gatherContinually
            config.audioJitterBufferFastAccelerate = true
            config.audioJitterBufferMaxPackets = 80
            config.iceServers = iceServers.map {
                LKRTCIceServer(
                    urlStrings: $0.urls,
                    username: $0.username,
                    credential: $0.credential
                )
            }

            let pcConstraints = LKRTCMediaConstraints(
                mandatoryConstraints: nil,
                optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
            )
            guard let peer = factory.peerConnection(
                with: config,
                constraints: pcConstraints,
                delegate: self
            ) else {
                completion(.failure(NativeWebRTCError.peerCreationFailed))
                return
            }

            let audioConstraints = LKRTCMediaConstraints(
                mandatoryConstraints: nil,
                optionalConstraints: [
                    "googEchoCancellation": "true",
                    "googAutoGainControl": "true",
                    "googNoiseSuppression": "true",
                    "googHighpassFilter": "true"
                ]
            )
            let audioSource = factory.audioSource(with: audioConstraints)
            let audioTrack = factory.audioTrack(with: audioSource, trackId: "echat-audio")
            audioTrack.isEnabled = true
            _ = peer.add(audioTrack, streamIds: ["echat-stream"])

            self.factory = factory
            self.peer = peer
            self.localAudioTrack = audioTrack
            self._isRunning = true

            if mode == "video" {
                self.prepareVideoLocked(factory: factory, peer: peer) { result in
                    self.queue.async {
                        switch result {
                        case .success:
                            self.emitDiagnostic("native-webrtc-started")
                            completion(.success(()))
                        case .failure(let error):
                            self.closeLocked(deactivateSession: true)
                            completion(.failure(error))
                        }
                    }
                }
            } else {
                self.emitDiagnostic("native-webrtc-started")
                completion(.success(()))
            }
        }
    }

    private func prepareVideoLocked(
        factory: LKRTCPeerConnectionFactory,
        peer: LKRTCPeerConnection,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        let videoSource = factory.videoSource()
        let captureDelegate = NativeVideoCaptureDelegate(source: videoSource)
        captureDelegate.owner = self
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "echat-video")
        videoTrack.isEnabled = true
        guard let videoSender = peer.add(videoTrack, streamIds: ["echat-stream"]) else {
            completion(.failure(NativeWebRTCError.peerCreationFailed))
            return
        }
        localVideoTrack = videoTrack
        localVideoSource = videoSource
        localVideoSender = videoSender
        videoCaptureDelegate = captureDelegate

        let capturer = EChatVideoCapturer(delegate: captureDelegate)
        capturer.diagnosticHandler = { [weak self] event, details in
            self?.emitDiagnostic(event, details: details)
        }
        cameraCapturer = capturer
        observeCaptureSession(capturer.captureSession)
        let startCapture: () -> Void = { [weak self] in
            guard let self else { return }
            guard let device = AVCaptureDevice.default(
                .builtInWideAngleCamera,
                for: .video,
                position: .front
            ) ?? AVCaptureDevice.default(for: .video) else {
                self.emitDiagnostic("native-camera-unavailable")
                completion(.failure(NativeWebRTCError.cameraUnavailable))
                return
            }
            let formats = device.formats
            let candidates = Array(self.orderedCameraFormats(
                device: device,
                formats: formats,
                session: capturer.captureSession
            ).prefix(8))
            guard let format = candidates.first else {
                self.emitDiagnostic("native-camera-format-unavailable")
                completion(.failure(NativeWebRTCError.cameraUnavailable))
                return
            }
            let captureFps = self.captureFps(for: format)
            self.cameraDevice = device
            self.cameraFormat = format
            self.cameraFormatCandidates = candidates
            self.cameraFormatCandidateIndex = 0
            self.lastFormatFailureGeneration = nil
            self.cameraFps = captureFps
            self.cameraCaptureHasStarted = false
            self.localVideoFrameCount = 0
            self.lastLocalVideoFrameAt = nil
            self.cameraRestartAttempts = 0
            self.cameraCaptureGeneration += 1
            let generation = self.cameraCaptureGeneration

            DispatchQueue.main.async {
                self.installVideoOverlay()
                guard let localRenderer = self.localRenderer else {
                    self.emitDiagnostic("native-local-preview-unavailable")
                    completion(.failure(NativeWebRTCError.cameraUnavailable))
                    return
                }
                self.emitDiagnostic("native-local-preview-attached", details: [
                    "device": device.localizedName,
                    "width": CMVideoFormatDescriptionGetDimensions(format.formatDescription).width,
                    "height": CMVideoFormatDescriptionGetDimensions(format.formatDescription).height,
                    "renderer": String(describing: type(of: localRenderer))
                ])
                self.emitDiagnostic("native-camera-format-candidates", details: [
                    "count": candidates.count,
                    "outputPixelFormats": self.availableVideoPixelFormats(in: capturer.captureSession).map(self.fourCC),
                    "formats": candidates.enumerated().map { index, candidate in
                        self.cameraFormatDescription(candidate, index: index)
                    }
                ])
                self.queue.async { self.startVideoStatsLocked() }
                guard UIApplication.shared.applicationState == .active else {
                    self.emitDiagnostic("native-camera-start-deferred", details: [
                        "applicationState": UIApplication.shared.applicationState.rawValue
                    ])
                    self.queue.async {
                        self.scheduleCameraRecoveryLocked(
                            reason: "waiting-for-foreground",
                            delay: .milliseconds(500)
                        )
                    }
                    // Keep the negotiated video sender alive. Camera capture
                    // will start from didBecomeActive once iOS permits it.
                    completion(.success(()))
                    return
                }
                // Let the WebRTC audio/session setup settle before touching
                // AVCaptureSession. On iOS the old same-turn start could call
                // back successfully while the session was still stopped.
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(250)) {
                    guard UIApplication.shared.applicationState == .active else {
                        self.emitDiagnostic("native-camera-start-postponed", details: [
                            "applicationState": UIApplication.shared.applicationState.rawValue
                        ])
                        self.queue.async {
                            self.scheduleCameraRecoveryLocked(
                                reason: "start-waiting-for-active",
                                delay: .milliseconds(500)
                            )
                        }
                        completion(.success(()))
                        return
                    }
                    self.cameraCaptureHasStarted = true
                    capturer.startCapture(with: device, format: format, fps: captureFps) { error in
                        if let error {
                            self.emitDiagnostic("native-camera-capture-failed", details: ["error": error.localizedDescription])
                            self.queue.async {
                                if self.lastFormatFailureGeneration != generation {
                                    self.lastFormatFailureGeneration = generation
                                    self.advanceCameraFormatLocked(reason: "custom-capturer-start-failed")
                                }
                                self.scheduleCameraRecoveryLocked(
                                    reason: "custom-capturer-start-failed",
                                    delay: .milliseconds(300)
                                )
                            }
                            completion(.success(()))
                        } else {
                            self.emitDiagnostic("native-camera-capture-started", details: [
                                "device": device.localizedName,
                                "fps": captureFps,
                                "sessionRunning": capturer.captureSession.isRunning,
                                "applicationState": UIApplication.shared.applicationState.rawValue,
                                "senderTrack": videoSender.track?.trackId ?? ""
                            ])
                            self.queue.async {
                                self.verifyCameraSessionLocked(generation: generation, delay: .milliseconds(150))
                                self.scheduleCameraFrameWatchdogLocked(generation: generation)
                            }
                            completion(.success(()))
                        }
                    }
                }
            }
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startCapture()
        case .notDetermined:
            emitDiagnostic("native-camera-permission-requested")
            AVCaptureDevice.requestAccess(for: .video) { granted in
                self.queue.async {
                    guard granted else {
                        self.emitDiagnostic("native-camera-permission-denied")
                        completion(.failure(NativeWebRTCError.cameraUnavailable))
                        return
                    }
                    self.emitDiagnostic("native-camera-permission-granted")
                    startCapture()
                }
            }
        default:
            emitDiagnostic("native-camera-permission-denied")
            completion(.failure(NativeWebRTCError.cameraUnavailable))
        }
    }

    private func orderedCameraFormats(
        device: AVCaptureDevice,
        formats: [AVCaptureDevice.Format],
        session: AVCaptureSession
    ) -> [AVCaptureDevice.Format] {
        let availableOutputFormats = Set(availableVideoPixelFormats(in: session))
        let nv12Formats: Set<FourCharCode> = [
            kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
            kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        ]
        var compatible = formats.filter { format in
            let mediaSubtype = CMFormatDescriptionGetMediaSubType(format.formatDescription)
            return !format.videoSupportedFrameRateRanges.isEmpty
                && nv12Formats.contains(mediaSubtype)
                && availableOutputFormats.contains(mediaSubtype)
        }
        let activeFormat = device.activeFormat
        let activeSubtype = CMFormatDescriptionGetMediaSubType(activeFormat.formatDescription)
        if compatible.isEmpty,
           nv12Formats.contains(activeSubtype),
           availableOutputFormats.contains(activeSubtype) {
            compatible.append(activeFormat)
        }
        return compatible.sorted { lhs, rhs in
            cameraFormatScore(lhs) < cameraFormatScore(rhs)
        }
    }

    private func availableVideoPixelFormats(in session: AVCaptureSession) -> [FourCharCode] {
        guard let output = session.outputs.compactMap({ $0 as? AVCaptureVideoDataOutput }).first else {
            return []
        }
        return output.availableVideoPixelFormatTypes.map { FourCharCode($0) }
    }

    private func cameraFormatScore(_ format: AVCaptureDevice.Format) -> Int64 {
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        let width = Int64(dimensions.width)
        let height = Int64(dimensions.height)
        let resolutionRank: Int64
        switch (width, height) {
        case (640, 480), (480, 640): resolutionRank = 0
        case (1280, 720), (720, 1280): resolutionRank = 1
        case (352, 288), (288, 352): resolutionRank = 2
        case (1920, 1080), (1080, 1920): resolutionRank = 3
        default: resolutionRank = 4
        }
        let distance = abs(width - 640) + abs(height - 480)
        let hdrPenalty: Int64 = format.isVideoHDRSupported ? 1_000_000 : 0
        let fpsPenalty: Int64 = format.videoSupportedFrameRateRanges.contains {
            $0.minFrameRate <= 24 && $0.maxFrameRate >= 24
        } ? 0 : 100_000
        return hdrPenalty + fpsPenalty + resolutionRank * 10_000 + distance
    }

    private func captureFps(for format: AVCaptureDevice.Format) -> Int {
        if format.videoSupportedFrameRateRanges.contains(where: {
            $0.minFrameRate <= 24 && $0.maxFrameRate >= 24
        }) {
            return 24
        }
        guard let range = format.videoSupportedFrameRateRanges.max(by: {
            $0.maxFrameRate < $1.maxFrameRate
        }) else { return 15 }
        return max(Int(ceil(range.minFrameRate)), min(24, Int(floor(range.maxFrameRate))))
    }

    private func cameraFormatDescription(
        _ format: AVCaptureDevice.Format,
        index: Int
    ) -> [String: Any] {
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        return [
            "index": index,
            "width": dimensions.width,
            "height": dimensions.height,
            "pixelFormat": fourCC(CMFormatDescriptionGetMediaSubType(format.formatDescription)),
            "hdr": format.isVideoHDRSupported,
            "fps": captureFps(for: format)
        ]
    }

    private func fourCC(_ value: FourCharCode) -> String {
        let bytes: [UInt8] = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff)
        ]
        return String(bytes: bytes, encoding: .ascii) ?? String(value)
    }

    private func advanceCameraFormatLocked(reason: String) {
        guard cameraFormatCandidateIndex + 1 < cameraFormatCandidates.count else {
            emitDiagnostic("native-camera-format-fallback-exhausted", details: [
                "reason": reason,
                "attemptedFormats": cameraFormatCandidateIndex + 1
            ])
            return
        }
        cameraFormatCandidateIndex += 1
        let format = cameraFormatCandidates[cameraFormatCandidateIndex]
        cameraFormat = format
        cameraFps = captureFps(for: format)
        var details = cameraFormatDescription(format, index: cameraFormatCandidateIndex)
        details["reason"] = reason
        emitDiagnostic("native-camera-format-fallback-selected", details: details)
    }

    fileprivate func didCaptureLocalVideoFrame(_ frame: LKRTCVideoFrame) {
        queue.async {
            guard self._isRunning, self.mode == "video" else { return }
            self.localVideoFrameCount += 1
            self.lastLocalVideoFrameAt = Date()
            if self.localVideoFrameCount == 1 {
                self.cameraRestartAttempts = 0
                self.emitDiagnostic("native-camera-first-frame", details: [
                    "width": frame.width,
                    "height": frame.height,
                    "rotation": frame.rotation.rawValue,
                    "trackEnabled": self.localVideoTrack?.isEnabled ?? false,
                    "senderAttached": self.localVideoSender?.track != nil
                ])
                DispatchQueue.main.async {
                    if let overlay = self.videoOverlay,
                       let window = overlay.window {
                        window.bringSubviewToFront(overlay)
                    }
                }
            }
        }
    }

    private func scheduleCameraFrameWatchdogLocked(generation: Int) {
        queue.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self,
                  self._isRunning,
                  self.mode == "video",
                  self.cameraEnabled,
                  generation == self.cameraCaptureGeneration,
                  self.localVideoFrameCount == 0
            else { return }
            self.emitDiagnostic("native-camera-no-frames", details: [
                "sessionRunning": self.cameraCapturer?.captureSession.isRunning ?? false,
                "attempt": self.cameraRestartAttempts + 1
            ])
            self.scheduleCameraRecoveryLocked(reason: "no-first-frame", delay: .milliseconds(200))
        }
    }

    private func verifyCameraSessionLocked(
        generation: Int,
        delay: DispatchTimeInterval
    ) {
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self,
                  self._isRunning,
                  self.mode == "video",
                  self.cameraEnabled,
                  generation == self.cameraCaptureGeneration,
                  let capturer = self.cameraCapturer
            else { return }
            let running = capturer.captureSession.isRunning
            self.emitDiagnostic("native-camera-session-verified", details: [
                "sessionRunning": running,
                "capturedFrames": self.localVideoFrameCount,
                "generation": generation
            ])
            guard !running, self.localVideoFrameCount == 0 else { return }
            self.scheduleCameraRecoveryLocked(
                reason: "capture-session-not-running",
                delay: .milliseconds(300)
            )
        }
    }

    private func scheduleCameraRecoveryLocked(
        reason: String,
        delay: DispatchTimeInterval
    ) {
        cameraRecoveryWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self._isRunning, self.mode == "video", self.cameraEnabled else { return }
            let frameIsStale = self.lastLocalVideoFrameAt.map {
                Date().timeIntervalSince($0) > 2
            } ?? true
            guard frameIsStale else { return }
            self.restartCameraCaptureLocked(reason: reason)
        }
        cameraRecoveryWorkItem = work
        queue.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func restartCameraCaptureLocked(reason: String) {
        guard _isRunning,
              mode == "video",
              cameraEnabled,
              cameraRestartAttempts < 8,
              let capturer = cameraCapturer,
              let device = cameraDevice,
              let format = cameraFormat
        else { return }
        cameraRestartAttempts += 1
        cameraCaptureGeneration += 1
        let generation = cameraCaptureGeneration
        localVideoFrameCount = 0
        lastLocalVideoFrameAt = nil
        emitDiagnostic("native-camera-restarting", details: [
            "reason": reason,
            "attempt": cameraRestartAttempts,
            "formatIndex": cameraFormatCandidateIndex,
            "format": cameraFormatDescription(format, index: cameraFormatCandidateIndex),
            "applicationState": UIApplication.shared.applicationState.rawValue,
            "authorization": AVCaptureDevice.authorizationStatus(for: .video).rawValue,
            "deviceAvailable": device.isConnected,
            "sessionRunningBeforeStop": capturer.captureSession.isRunning,
            "sessionInputsBeforeStop": capturer.captureSession.inputs.count,
            "sessionOutputsBeforeStop": capturer.captureSession.outputs.count
        ])
        DispatchQueue.main.async {
            let startDirectly = !self.cameraCaptureHasStarted
            let start: () -> Void = {
                // Give AVCaptureSession one main-run-loop turn to become idle
                // before starting it again; immediate stop/start is racy on
                // iOS and was observed as sessionRunning=false forever.
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(150)) {
                    self.resetCaptureSession(capturer.captureSession, reason: reason)
                    self.cameraCaptureHasStarted = true
                    guard let delegate = self.videoCaptureDelegate else {
                        self.emitDiagnostic("native-camera-restart-failed", details: [
                            "reason": reason,
                            "error": "capture delegate released before restart"
                        ])
                        return
                    }
                    // Recreate the capturer after a completed stop. This
                    // releases the previous AVCaptureSession instead of
                    // allowing generation-only recovery to reuse a poisoned
                    // session that is no longer running.
                    let freshCapturer = EChatVideoCapturer(delegate: delegate)
                    freshCapturer.diagnosticHandler = { [weak self] event, details in
                        self?.emitDiagnostic(event, details: details)
                    }
                    self.cameraCapturer = freshCapturer
                    self.observeCaptureSession(freshCapturer.captureSession)
                    freshCapturer.startCapture(with: device, format: format, fps: self.cameraFps) { error in
                        if let error {
                            self.emitDiagnostic("native-camera-restart-failed", details: [
                                "reason": reason,
                                "error": error.localizedDescription,
                                "deviceAvailable": device.isConnected
                            ])
                            self.queue.async {
                                if self.lastFormatFailureGeneration != generation {
                                    self.lastFormatFailureGeneration = generation
                                    self.advanceCameraFormatLocked(reason: "custom-capturer-restart-failed")
                                }
                                self.scheduleCameraRecoveryLocked(
                                    reason: "custom-capturer-restart-failed",
                                    delay: .milliseconds(300)
                                )
                            }
                        } else {
                            let session = freshCapturer.captureSession
                            let wasRunning = session.isRunning
                            var deviceLockSucceeded = false
                            var deviceLockError = ""
                            do {
                                try device.lockForConfiguration()
                                deviceLockSucceeded = true
                                device.unlockForConfiguration()
                            } catch {
                                deviceLockError = error.localizedDescription
                            }
                            if !wasRunning {
                                self.emitDiagnostic("native-camera-start-running", details: [
                                    "before": false,
                                    "deviceAvailable": device.isConnected,
                                    "deviceLockSucceeded": deviceLockSucceeded,
                                    "deviceLockError": deviceLockError,
                                    "sessionInputs": session.inputs.count,
                                    "sessionOutputs": session.outputs.count
                                ])
                                let exception = EChatExceptionCatcher.captureException {
                                    session.startRunning()
                                }
                                if let exception {
                                    self.emitDiagnostic("native-camera-start-running-exception", details: [
                                        "message": exception["message"] as? String ?? "",
                                        "exceptionName": exception["exceptionName"] as? String ?? "",
                                        "callStack": exception["callStackSymbols"] as? [String] ?? []
                                    ])
                                }
                                self.emitDiagnostic("native-camera-start-running-returned", details: [
                                    "completedWithoutException": exception == nil,
                                    "sessionRunning": session.isRunning,
                                    "sessionInputs": session.inputs.count,
                                    "sessionOutputs": session.outputs.count
                                ])
                            }
                            self.emitDiagnostic("native-camera-restarted", details: [
                                "reason": reason,
                                "sessionRunning": session.isRunning,
                                "startRunningWasCalled": !wasRunning,
                                "deviceAvailable": device.isConnected,
                                "deviceLockSucceeded": deviceLockSucceeded,
                                "deviceLockError": deviceLockError,
                                "sessionInputs": session.inputs.count,
                                "sessionOutputs": session.outputs.count
                            ])
                        }
                        self.queue.async {
                            self.verifyCameraSessionLocked(generation: generation, delay: .milliseconds(150))
                            self.scheduleCameraFrameWatchdogLocked(generation: generation)
                        }
                    }
                }
            }
            if startDirectly {
                self.emitDiagnostic("native-camera-starting-after-inactive")
                start()
            } else {
                capturer.stopCapture {
                    start()
                }
            }
        }
    }

    private func resetCaptureSession(_ session: AVCaptureSession, reason: String) {
        let inputs = session.inputs
        let outputs = session.outputs
        emitDiagnostic("native-camera-session-reset", details: [
            "reason": reason,
            "wasRunning": session.isRunning,
            "inputsBefore": inputs.count,
            "outputsBefore": outputs.count
        ])
        if session.isRunning {
            session.stopRunning()
        }
        session.beginConfiguration()
        for output in outputs {
            session.removeOutput(output)
        }
        for input in inputs {
            session.removeInput(input)
        }
        session.commitConfiguration()
        emitDiagnostic("native-camera-session-reset-complete", details: [
            "isRunning": session.isRunning,
            "inputsAfter": session.inputs.count,
            "outputsAfter": session.outputs.count
        ])
    }

    private func observeCaptureSession(_ session: AVCaptureSession) {
        removeCaptureSessionObservers()
        let center = NotificationCenter.default
        let sessionId = String(describing: ObjectIdentifier(session))
        let notifications: [Notification.Name] = [
            AVCaptureSession.runtimeErrorNotification,
            AVCaptureSession.wasInterruptedNotification,
            AVCaptureSession.interruptionEndedNotification,
            AVCaptureSession.didStartRunningNotification,
            AVCaptureSession.didStopRunningNotification
        ]
        cameraSessionObservers = notifications.map { name in
            center.addObserver(forName: name, object: session, queue: .main) { [weak self, weak session] notification in
                guard let self, let session else { return }
                var details: [String: Any] = [
                    "notification": name.rawValue,
                    "sessionId": sessionId,
                    "sessionRunning": session.isRunning,
                    "sessionInputs": session.inputs.count,
                    "sessionOutputs": session.outputs.count,
                    "applicationState": UIApplication.shared.applicationState.rawValue
                ]
                if let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError {
                    details["errorMessage"] = error.localizedDescription
                    details["errorDomain"] = error.domain
                    details["errorCode"] = error.code
                    details["errorUserInfo"] = error.userInfo.description
                    if error.domain == AVFoundationErrorDomain, error.code == -11873 {
                        self.queue.async {
                            let generation = self.cameraCaptureGeneration
                            guard self.lastFormatFailureGeneration != generation else { return }
                            self.lastFormatFailureGeneration = generation
                            self.advanceCameraFormatLocked(reason: "runtime-error--11873")
                        }
                    }
                }
                if let reason = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber {
                    details["interruptionReason"] = reason.intValue
                }
                let event: String
                switch name {
                case AVCaptureSession.runtimeErrorNotification:
                    event = "native-camera-session-runtime-error"
                case AVCaptureSession.wasInterruptedNotification:
                    event = "native-camera-session-interrupted"
                case AVCaptureSession.interruptionEndedNotification:
                    event = "native-camera-session-interruption-ended"
                case AVCaptureSession.didStartRunningNotification:
                    event = "native-camera-session-did-start-running"
                case AVCaptureSession.didStopRunningNotification:
                    event = "native-camera-session-did-stop-running"
                default:
                    event = "native-camera-session-notification"
                }
                self.emitDiagnostic(event, details: details)
            }
        }
        emitDiagnostic("native-camera-session-observers-installed", details: [
            "sessionId": sessionId,
            "observerCount": cameraSessionObservers.count
        ])
    }

    private func removeCaptureSessionObservers() {
        let center = NotificationCenter.default
        cameraSessionObservers.forEach { center.removeObserver($0) }
        cameraSessionObservers.removeAll()
    }

    func createOffer(completion: @escaping (Result<String, Error>) -> Void) {
        queue.async {
            guard let peer = self.peer else {
                completion(.failure(NativeWebRTCError.notStarted))
                return
            }
            self.activateAudioIfReadyLocked()
            let constraints = LKRTCMediaConstraints(
                mandatoryConstraints: [
                    "OfferToReceiveAudio": "true",
                    "OfferToReceiveVideo": self.mode == "video" ? "true" : "false"
                ],
                optionalConstraints: nil
            )
            peer.offer(for: constraints) { description, error in
                if let error { completion(.failure(error)); return }
                guard let description else {
                    completion(.failure(NativeWebRTCError.missingSessionDescription))
                    return
                }
                peer.setLocalDescription(description) { error in
                    if let error { completion(.failure(error)); return }
                    self.emitVideoSdpDiagnostic(description, role: "offer")
                    completion(self.serialized(description: description))
                }
            }
        }
    }

    func createAnswer(completion: @escaping (Result<String, Error>) -> Void) {
        queue.async {
            guard let peer = self.peer else {
                completion(.failure(NativeWebRTCError.notStarted))
                return
            }
            let constraints = LKRTCMediaConstraints(
                mandatoryConstraints: [
                    "OfferToReceiveAudio": "true",
                    "OfferToReceiveVideo": self.mode == "video" ? "true" : "false"
                ],
                optionalConstraints: nil
            )
            peer.answer(for: constraints) { description, error in
                if let error { completion(.failure(error)); return }
                guard let description else {
                    completion(.failure(NativeWebRTCError.missingSessionDescription))
                    return
                }
                peer.setLocalDescription(description) { error in
                    if let error { completion(.failure(error)); return }
                    self.emitVideoSdpDiagnostic(description, role: "answer")
                    completion(self.serialized(description: description))
                }
            }
        }
    }

    func setRemoteDescription(
        payload: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        queue.async {
            guard let peer = self.peer else {
                completion(.failure(NativeWebRTCError.notStarted))
                return
            }
            self.activateAudioIfReadyLocked()
            guard let data = payload.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let typeString = json["type"] as? String,
                  let sdp = json["sdp"] as? String
            else {
                completion(.failure(NativeWebRTCError.invalidPayload))
                return
            }
            let type: LKRTCSdpType = typeString == "offer" ? .offer : .answer
            let description = LKRTCSessionDescription(type: type, sdp: sdp)
            peer.setRemoteDescription(description) { error in
                if let error { completion(.failure(error)); return }
                self.emitVideoSdpDiagnostic(description, role: "remote-\(typeString)")
                self.queue.async {
                    self.remoteDescriptionReady = true
                    self.emitVideoTransceiverSnapshotLocked(reason: "remote-description-set")
                    self.bindRemoteVideoReceiverIfNeededLocked(reason: "remote-description-set")
                    let candidates = self.pendingCandidates
                    self.pendingCandidates.removeAll()
                    guard !candidates.isEmpty else {
                        completion(.success(()))
                        return
                    }
                    let group = DispatchGroup()
                    var firstError: Error?
                    for candidate in candidates {
                        group.enter()
                        peer.add(candidate) { error in
                            if firstError == nil { firstError = error }
                            group.leave()
                        }
                    }
                    group.notify(queue: self.queue) {
                        if let firstError { completion(.failure(firstError)) }
                        else { completion(.success(())) }
                    }
                }
            }
        }
    }

    func addIceCandidate(
        payload: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        queue.async {
            guard let peer = self.peer else {
                completion(.failure(NativeWebRTCError.notStarted))
                return
            }
            guard let data = payload.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let sdp = json["candidate"] as? String
            else {
                completion(.failure(NativeWebRTCError.invalidPayload))
                return
            }
            let lineIndex = Int32(json["sdpMLineIndex"] as? Int ?? 0)
            let candidate = LKRTCIceCandidate(
                sdp: sdp,
                sdpMLineIndex: lineIndex,
                sdpMid: json["sdpMid"] as? String
            )
            guard self.remoteDescriptionReady else {
                self.pendingCandidates.append(candidate)
                completion(.success(()))
                return
            }
            peer.add(candidate) { error in
                if let error { completion(.failure(error)) }
                else { completion(.success(())) }
            }
        }
    }

    func setMicrophoneEnabled(_ enabled: Bool) {
        queue.async {
            self.microphoneEnabled = enabled
            self.localAudioTrack?.isEnabled = enabled
        }
    }

    func setCameraEnabled(_ enabled: Bool) {
        queue.async {
            self.cameraEnabled = enabled
            self.localVideoTrack?.isEnabled = enabled
        }
    }

    func setSpeaker(_ speaker: Bool) {
        queue.async {
            self.speaker = speaker
            self.configureAudioSessionLocked(activate: self.callKitAudioActive || self.activatedByApp)
        }
    }

    func callKitDidActivate(_ audioSession: AVAudioSession) {
        queue.async {
            self.callKitAudioActive = true
            let rtcAudioSession = LKRTCAudioSession.sharedInstance()
            rtcAudioSession.audioSessionDidActivate(audioSession)
            guard self._isRunning else { return }
            if self.configureAudioSessionLocked(activate: false) {
                rtcAudioSession.isAudioEnabled = true
            }
            self.emitDiagnostic("native-callkit-audio-activated")
        }
    }

    func callKitDidDeactivate(_ audioSession: AVAudioSession) {
        queue.async {
            self.callKitAudioActive = false
            let rtcAudioSession = LKRTCAudioSession.sharedInstance()
            rtcAudioSession.isAudioEnabled = false
            rtcAudioSession.audioSessionDidDeactivate(audioSession)
            self.emitDiagnostic("native-callkit-audio-deactivated")
        }
    }

    func handleInterruption(ended: Bool) {
        queue.async {
            guard self._isRunning else { return }
            let rtcAudioSession = LKRTCAudioSession.sharedInstance()
            if ended {
                self.interruptionActive = false
                if self.configureAudioSessionLocked(activate: !self.callKitAudioActive) {
                    rtcAudioSession.isAudioEnabled = true
                    self.emitDiagnostic("native-audio-interruption-recovered")
                } else {
                    self.scheduleAudioActivationRetryLocked()
                }
                if self.mode == "video" {
                    self.cameraRestartAttempts = 0
                    self.scheduleCameraRecoveryLocked(
                        reason: "audio-interruption-ended",
                        delay: .milliseconds(500)
                    )
                }
            } else {
                self.interruptionActive = true
                rtcAudioSession.isAudioEnabled = false
                self.emitDiagnostic("native-audio-interruption-began")
                self.scheduleAudioActivationRetryLocked()
            }
        }
    }

    func reassertAudioSession(force: Bool = false) {
        queue.async {
            guard self._isRunning else { return }
            if EChatVoipManager.shared.callKitAudioActive && !self.callKitAudioActive {
                self.callKitAudioActive = true
                LKRTCAudioSession.sharedInstance().audioSessionDidActivate(
                    AVAudioSession.sharedInstance()
                )
            }
            if !force && self.audioRouteMatchesPreferenceLocked() { return }
            if self.configureAudioSessionLocked(activate: !self.callKitAudioActive) {
                LKRTCAudioSession.sharedInstance().isAudioEnabled = true
            }
        }
    }

    func close(completion: (() -> Void)? = nil) {
        queue.async {
            self.closeLocked(deactivateSession: true)
            completion?()
        }
    }

    func stateSnapshot() -> [String: Any] {
        queue.sync {
            [
                "running": _isRunning,
                "mode": mode,
                "speaker": speaker,
                "microphoneEnabled": microphoneEnabled,
                "cameraEnabled": cameraEnabled,
                "callKitAudioActive": callKitAudioActive,
                "connectionState": connectionStateName(peer?.connectionState),
                "cameraSessionRunning": cameraCapturer?.captureSession.isRunning ?? false,
                "localVideoFrames": localVideoFrameCount,
                "localVideoSenderAttached": localVideoSender?.track != nil,
                "remoteVideoTrack": remoteVideoTrack != nil
            ]
        }
    }

    private func activateAudioIfReadyLocked() {
        if EChatVoipManager.shared.callKitAudioActive && !callKitAudioActive {
            callKitAudioActive = true
            LKRTCAudioSession.sharedInstance().audioSessionDidActivate(
                AVAudioSession.sharedInstance()
            )
        }
        if configureAudioSessionLocked(activate: !callKitAudioActive) {
            LKRTCAudioSession.sharedInstance().isAudioEnabled = true
        }
    }

    @discardableResult
    private func configureAudioSessionLocked(activate: Bool) -> Bool {
        let rtcSession = LKRTCAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP]
        if speaker { options.insert(.defaultToSpeaker) }
        let configuration = LKRTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        configuration.categoryOptions = options
        configuration.mode = (mode == "video"
            ? AVAudioSession.Mode.videoChat
            : AVAudioSession.Mode.voiceChat).rawValue
        configuration.sampleRate = 48_000
        configuration.ioBufferDuration = 0.01
        configuration.inputNumberOfChannels = 1
        configuration.outputNumberOfChannels = 1
        rtcSession.ignoresPreferredAttributeConfigurationErrors = true
        rtcSession.lockForConfiguration()
        defer { rtcSession.unlockForConfiguration() }
        do {
            if activate && !activatedByApp {
                try rtcSession.setConfiguration(configuration, active: true)
                activatedByApp = true
            } else {
                try rtcSession.setConfiguration(configuration)
            }
            let hasBluetooth = rtcSession.currentRoute.outputs.contains {
                [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE].contains($0.portType)
            }
            if speaker {
                try rtcSession.overrideOutputAudioPort(.speaker)
            } else if !hasBluetooth {
                try rtcSession.overrideOutputAudioPort(.none)
            }
            activationRetryCount = 0
            activationRetryWorkItem?.cancel()
            activationRetryWorkItem = nil
            return true
        } catch {
            let nsError = error as NSError
            emitDiagnostic("native-audio-session-error", details: [
                "message": error.localizedDescription,
                "domain": nsError.domain,
                "code": nsError.code,
                "activateRequested": activate,
                "activatedByApp": activatedByApp,
                "rtcActivationCount": rtcSession.activationCount,
                "rtcSessionCount": rtcSession.webRTCSessionCount
            ])
            if activate {
                scheduleAudioActivationRetryLocked()
            }
            return false
        }
    }

    private func scheduleAudioActivationRetryLocked() {
        guard _isRunning, !callKitAudioActive, activationRetryCount < 10 else { return }
        activationRetryCount += 1
        activationRetryWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.queue.async {
                guard self._isRunning, !self.interruptionActive else { return }
                let rtcSession = LKRTCAudioSession.sharedInstance()
                if self.configureAudioSessionLocked(activate: true) {
                    rtcSession.isAudioEnabled = true
                    self.emitDiagnostic("native-audio-session-recovered")
                }
            }
        }
        activationRetryWorkItem = work
        queue.asyncAfter(deadline: .now() + .milliseconds(300), execute: work)
    }

    private func audioRouteMatchesPreferenceLocked() -> Bool {
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
        guard !outputs.isEmpty else { return false }
        let usesSpeaker = outputs.contains { $0.portType == .builtInSpeaker }
        let usesExternalOutput = outputs.contains {
            [
                .bluetoothHFP,
                .bluetoothA2DP,
                .bluetoothLE,
                .headphones,
                .airPlay,
                .carAudio
            ].contains($0.portType)
        }
        return speaker ? usesSpeaker : (!usesSpeaker || usesExternalOutput)
    }

    private func closeLocked(deactivateSession: Bool) {
        let wasRunning = _isRunning
        let remoteTrackForCleanup = remoteVideoTrack
        let remoteRelayForCleanup = remoteFrameRelay
        let localTrackForCleanup = localVideoTrack
        let localRendererForCleanup = localRenderer
        let overlayForCleanup = videoOverlay
        _isRunning = false
        activationRetryWorkItem?.cancel()
        activationRetryWorkItem = nil
        activationRetryCount = 0
        interruptionActive = false
        localAudioTrack?.isEnabled = false
        localVideoTrack?.isEnabled = false
        remoteVideoTrack?.isEnabled = false
        remoteAudioTrack?.isEnabled = false
        audioStatsTimer?.cancel()
        audioStatsTimer = nil
        videoStatsTimer?.cancel()
        videoStatsTimer = nil
        cameraRecoveryWorkItem?.cancel()
        cameraRecoveryWorkItem = nil
        cameraCaptureGeneration += 1
        removeCaptureSessionObservers()
        cameraCapturer?.stopCapture(completionHandler: nil)
        cameraCaptureHasStarted = false
        peer?.close()
        peer = nil
        factory = nil
        localAudioTrack = nil
        remoteAudioTrack = nil
        remoteAudioReceiver = nil
        localVideoTrack = nil
        localVideoSource = nil
        localVideoSender = nil
        remoteVideoTrack = nil
        remoteVideoReceiver = nil
        remoteFrameRelay = nil
        remoteRendererBoundTrackId = nil
        remoteRendererRebindAttempts = 0
        remoteRenderer = nil
        localRenderer = nil
        videoOverlay = nil
        cameraCapturer = nil
        videoCaptureDelegate = nil
        cameraDevice = nil
        cameraFormat = nil
        cameraFormatCandidates.removeAll()
        cameraFormatCandidateIndex = 0
        lastFormatFailureGeneration = nil
        localVideoFrameCount = 0
        lastLocalVideoFrameAt = nil
        cameraRestartAttempts = 0
        pendingCandidates.removeAll()
        remoteDescriptionReady = false
        let rtcAudioSession = LKRTCAudioSession.sharedInstance()
        rtcAudioSession.isAudioEnabled = false
        if deactivateSession && activatedByApp && !callKitAudioActive {
            rtcAudioSession.lockForConfiguration()
            defer { rtcAudioSession.unlockForConfiguration() }
            do {
                try rtcAudioSession.setActive(false)
            } catch {
                let nsError = error as NSError
                emitDiagnostic("native-audio-session-deactivate-error", details: [
                    "message": error.localizedDescription,
                    "domain": nsError.domain,
                    "code": nsError.code,
                    "rtcActivationCount": rtcAudioSession.activationCount,
                    "rtcSessionCount": rtcAudioSession.webRTCSessionCount
                ])
            }
        }
        activatedByApp = false
        DispatchQueue.main.async {
            if let remoteTrackForCleanup, let remoteRelayForCleanup {
                remoteTrackForCleanup.remove(remoteRelayForCleanup)
                remoteRelayForCleanup.target = nil
            }
            if let localTrackForCleanup, let localRendererForCleanup {
                localTrackForCleanup.remove(localRendererForCleanup)
            }
            overlayForCleanup?.removeFromSuperview()
        }
        if wasRunning { emitDiagnostic("native-webrtc-closed") }
    }

    private func serialized(description: LKRTCSessionDescription) -> Result<String, Error> {
        let type = description.type == .offer ? "offer" : "answer"
        let object: [String: Any] = ["type": type, "sdp": description.sdp]
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let value = String(data: data, encoding: .utf8)
        else { return .failure(NativeWebRTCError.invalidPayload) }
        return .success(value)
    }

    private func emitVideoSdpDiagnostic(_ description: LKRTCSessionDescription, role: String) {
        let lines = description.sdp.components(separatedBy: .newlines).map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let videoStart = lines.firstIndex(where: { $0.hasPrefix("m=video ") }) else {
            emitDiagnostic("native-video-sdp", details: [
                "role": role,
                "mode": mode,
                "hasVideoMLine": false,
                "localTrackEnabled": localVideoTrack?.isEnabled ?? false,
                "senderAttached": localVideoSender?.track != nil,
                "capturedFrames": localVideoFrameCount
            ])
            return
        }
        let videoEnd = lines[(videoStart + 1)...].firstIndex(where: { $0.hasPrefix("m=") })
            ?? lines.endIndex
        let videoLines = Array(lines[videoStart..<videoEnd])
        let mediaParts = videoLines[0].split(separator: " ").map(String.init)
        let direction = videoLines.first {
            ["a=sendrecv", "a=sendonly", "a=recvonly", "a=inactive"].contains($0)
        } ?? "unknown"
        let codecs = videoLines.filter { $0.hasPrefix("a=rtpmap:") }
        let mid = videoLines.first(where: { $0.hasPrefix("a=mid:") })?
            .replacingOccurrences(of: "a=mid:", with: "") ?? ""
        let msid = videoLines.first(where: { $0.hasPrefix("a=msid:") }) ?? ""
        let payloadTypes = mediaParts.count > 3 ? Array(mediaParts.dropFirst(3)) : []
        emitDiagnostic("native-video-sdp", details: [
            "role": role,
            "mode": mode,
            "hasVideoMLine": true,
            "direction": direction,
            "videoPort": mediaParts.count > 1 ? mediaParts[1] : "",
            "videoRejected": mediaParts.count > 1 && mediaParts[1] == "0",
            "mid": mid,
            "msid": msid,
            "payloadTypes": payloadTypes,
            "codecs": codecs,
            "ssrcLineCount": videoLines.filter { $0.hasPrefix("a=ssrc:") }.count,
            "localTrackEnabled": localVideoTrack?.isEnabled ?? false,
            "senderAttached": localVideoSender?.track != nil,
            "capturedFrames": localVideoFrameCount,
            "remoteTrackPresent": remoteVideoTrack != nil
        ])
    }

    private func startVideoStatsLocked() {
        videoStatsTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self, self._isRunning, self.mode == "video", let peer = self.peer else { return }
            let base: [String: Any] = [
                "capturedFrames": self.localVideoFrameCount,
                "captureSessionRunning": self.cameraCapturer?.captureSession.isRunning ?? false,
                "localTrackEnabled": self.localVideoTrack?.isEnabled ?? false,
                "remoteTrackEnabled": self.remoteVideoTrack?.isEnabled ?? false,
                "remoteTrackShouldReceive": self.remoteVideoTrack?.shouldReceive ?? false,
                "remoteTrackReadyState": self.remoteVideoTrack?.readyState == .live ? "live" : "ended",
                "remoteReceiverPresent": self.remoteVideoReceiver != nil,
                "remoteReceiverSourceCount": self.remoteVideoReceiver?.sources.count ?? 0,
                "renderedFrames": self.remoteFrameRelay?.snapshot().frames ?? 0,
                "remoteRendererReady": self.remoteRenderer != nil,
                "remoteRendererBoundTrackId": self.remoteRendererBoundTrackId ?? ""
            ]
            if let sender = self.localVideoSender {
                peer.statistics(for: sender) { report in
                    let outbound = report.statistics.values.first { statistic in
                        guard statistic.type == "outbound-rtp" else { return false }
                        let kind = statistic.values["kind"] as? String
                            ?? statistic.values["mediaType"] as? String
                        return kind == "video"
                    }
                    var details = base
                    details["framesEncoded"] = (outbound?.values["framesEncoded"] as? NSNumber)?.int64Value ?? 0
                    details["framesSent"] = (outbound?.values["framesSent"] as? NSNumber)?.int64Value ?? 0
                    details["bytesSent"] = (outbound?.values["bytesSent"] as? NSNumber)?.int64Value ?? 0
                    self.emitDiagnostic("native-webrtc-video-outbound-stats", details: details)
                }
            }
            if let receiver = self.remoteVideoReceiver {
                peer.statistics(for: receiver) { report in
                    let inbound = report.statistics.values.first { statistic in
                        guard statistic.type == "inbound-rtp" else { return false }
                        let kind = statistic.values["kind"] as? String
                            ?? statistic.values["mediaType"] as? String
                        return kind == "video"
                    }
                    let framesDecoded = (inbound?.values["framesDecoded"] as? NSNumber)?.int64Value ?? 0
                    let framesReceived = (inbound?.values["framesReceived"] as? NSNumber)?.int64Value ?? 0
                    let renderSnapshot = self.remoteFrameRelay?.snapshot()
                    var details = base
                    details["framesDecoded"] = framesDecoded
                    details["framesReceived"] = framesReceived
                    details["renderedFrames"] = renderSnapshot?.frames ?? 0
                    details["bytesReceived"] = (inbound?.values["bytesReceived"] as? NSNumber)?.int64Value ?? 0
                    details["packetsReceived"] = (inbound?.values["packetsReceived"] as? NSNumber)?.int64Value ?? 0
                    details["packetsLost"] = (inbound?.values["packetsLost"] as? NSNumber)?.int64Value ?? 0
                    details["keyFramesDecoded"] = (inbound?.values["keyFramesDecoded"] as? NSNumber)?.int64Value ?? 0
                    details["frameWidth"] = (inbound?.values["frameWidth"] as? NSNumber)?.intValue ?? 0
                    details["frameHeight"] = (inbound?.values["frameHeight"] as? NSNumber)?.intValue ?? 0
                    details["framesDropped"] = (inbound?.values["framesDropped"] as? NSNumber)?.int64Value ?? 0
                    details["freezeCount"] = (inbound?.values["freezeCount"] as? NSNumber)?.int64Value ?? 0
                    details["jitter"] = (inbound?.values["jitter"] as? NSNumber)?.doubleValue ?? 0
                    details["nackCount"] = (inbound?.values["nackCount"] as? NSNumber)?.int64Value ?? 0
                    details["pliCount"] = (inbound?.values["pliCount"] as? NSNumber)?.int64Value ?? 0
                    details["firCount"] = (inbound?.values["firCount"] as? NSNumber)?.int64Value ?? 0
                    details["codecId"] = inbound?.values["codecId"] as? String ?? ""
                    details["decoderImplementation"] = inbound?.values["decoderImplementation"] as? String ?? ""
                    details["lastRendererFrameAgeMs"] = renderSnapshot?.lastFrameAt.map {
                        Int(Date().timeIntervalSince($0) * 1_000)
                    } ?? -1
                    self.emitDiagnostic("native-webrtc-video-inbound-stats", details: details)
                    let rendererHasNoFrames = (renderSnapshot?.frames ?? 0) == 0
                    let rendererIsStale = renderSnapshot?.lastFrameAt.map {
                        Date().timeIntervalSince($0) > 2
                    } ?? true
                    if framesDecoded > 0 && (rendererHasNoFrames || rendererIsStale) {
                        DispatchQueue.main.async {
                            self.rebindRemoteRendererOnMain(reason: "decoded-without-render")
                        }
                    }
                }
            } else {
                self.emitDiagnostic("native-webrtc-video-receiver-missing", details: base)
                self.bindRemoteVideoReceiverIfNeededLocked(reason: "stats-receiver-missing")
            }
        }
        videoStatsTimer = timer
        timer.resume()
    }

    private func emitDiagnostic(_ event: String, details: [String: Any] = [:]) {
        DispatchQueue.main.async { self.plugin?.emitDiagnostic(event, details: details) }
    }

    fileprivate func didRenderRemoteVideoFrame(_ frame: LKRTCVideoFrame, count: Int64) {
        queue.async {
            if count == 1 {
                self.remoteRendererRebindAttempts = 0
                self.emitDiagnostic("native-remote-video-first-frame", details: [
                    "width": frame.width,
                    "height": frame.height,
                    "rotation": frame.rotation.rawValue,
                    "trackEnabled": self.remoteVideoTrack?.isEnabled ?? false,
                    "trackShouldReceive": self.remoteVideoTrack?.shouldReceive ?? false,
                    "trackReadyState": self.remoteVideoTrack?.readyState == .live ? "live" : "ended"
                ])
                DispatchQueue.main.async {
                    if let overlay = self.videoOverlay, let window = overlay.window {
                        window.bringSubviewToFront(overlay)
                    }
                    self.emitVideoOverlayAudit(reason: "first-remote-frame")
                }
            } else if count % 120 == 0 {
                self.emitDiagnostic("native-remote-video-render-progress", details: [
                    "renderedFrames": count,
                    "width": frame.width,
                    "height": frame.height,
                    "rotation": frame.rotation.rawValue
                ])
            }
        }
    }

    fileprivate func didChangeRemoteVideoSize(_ size: CGSize) {
        emitDiagnostic("native-remote-video-size-changed", details: [
            "width": size.width,
            "height": size.height
        ])
    }

    private func emitVideoOverlayAudit(reason: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.emitVideoOverlayAudit(reason: reason) }
            return
        }
        let overlay = videoOverlay
        let remote = remoteRenderer
        let snapshot = remoteFrameRelay?.snapshot()
        emitDiagnostic("native-video-overlay-audit", details: [
            "reason": reason,
            "overlayExists": overlay != nil,
            "overlayInWindow": overlay?.window != nil,
            "overlayHidden": overlay?.isHidden ?? true,
            "overlayAlpha": overlay?.alpha ?? 0,
            "overlayFrame": overlay.map { NSCoder.string(for: $0.frame) } ?? "",
            "overlayBounds": overlay.map { NSCoder.string(for: $0.bounds) } ?? "",
            "overlayZPosition": overlay?.layer.zPosition ?? 0,
            "remoteRendererExists": remote != nil,
            "remoteRendererEnabled": remote?.isEnabled ?? false,
            "remoteRendererHidden": remote?.isHidden ?? true,
            "remoteRendererAlpha": remote?.alpha ?? 0,
            "remoteRendererFrame": remote.map { NSCoder.string(for: $0.frame) } ?? "",
            "remoteRendererBounds": remote.map { NSCoder.string(for: $0.bounds) } ?? "",
            "remoteTrackAttached": remoteVideoTrack != nil,
            "remoteTrackEnabled": remoteVideoTrack?.isEnabled ?? false,
            "remoteTrackShouldReceive": remoteVideoTrack?.shouldReceive ?? false,
            "renderedFrames": snapshot?.frames ?? 0
        ])
    }

    private func rebindRemoteRendererOnMain(reason: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.rebindRemoteRendererOnMain(reason: reason) }
            return
        }
        guard remoteRendererRebindAttempts < 3,
              let track = remoteVideoTrack,
              let relay = remoteFrameRelay,
              let renderer = remoteRenderer
        else {
            emitVideoOverlayAudit(reason: "rebind-unavailable-\(reason)")
            return
        }
        remoteRendererRebindAttempts += 1
        track.remove(relay)
        relay.target = renderer
        track.isEnabled = true
        track.shouldReceive = true
        renderer.isEnabled = true
        track.add(relay)
        if let overlay = videoOverlay, let window = overlay.window {
            window.bringSubviewToFront(overlay)
        }
        emitDiagnostic("native-remote-video-renderer-rebound", details: [
            "reason": reason,
            "attempt": remoteRendererRebindAttempts,
            "trackId": track.trackId,
            "trackEnabled": track.isEnabled,
            "trackShouldReceive": track.shouldReceive,
            "rendererEnabled": renderer.isEnabled
        ])
        emitVideoOverlayAudit(reason: "after-rebind-\(reason)")
    }

    private func connectionStateName(_ state: LKRTCPeerConnectionState?) -> String {
        guard let state else { return "closed" }
        switch state {
        case .new: return "new"
        case .connecting: return "connecting"
        case .connected: return "connected"
        case .disconnected: return "disconnected"
        case .failed: return "failed"
        case .closed: return "closed"
        @unknown default: return "unknown"
        }
    }

    private func installVideoOverlay() {
        removeVideoOverlay()
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })
            ?? UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { !$0.isHidden && $0.windowLevel == .normal })
        else {
            emitDiagnostic("native-video-window-unavailable")
            return
        }

        let overlay = UIView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = .black
        overlay.isUserInteractionEnabled = false
        overlay.layer.zPosition = 1000

        let remote = LKRTCMTLVideoView()
        remote.translatesAutoresizingMaskIntoConstraints = false
        remote.videoContentMode = .scaleAspectFill
        remote.isEnabled = true
        overlay.addSubview(remote)

        let local = LKRTCMTLVideoView()
        local.translatesAutoresizingMaskIntoConstraints = false
        local.videoContentMode = .scaleAspectFill
        local.isEnabled = true
        local.layer.cornerRadius = 16
        local.layer.masksToBounds = true
        local.layer.borderWidth = 1
        local.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
        overlay.addSubview(local)

        // Attach directly to the Scene's top-level window rather than the
        // Capacitor root view. WKWebView can add/bring its own subviews to
        // the front after the call UI is mounted, which otherwise leaves
        // both native video renderers hidden while audio continues normally.
        window.addSubview(overlay)
        window.bringSubviewToFront(overlay)
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: window.leadingAnchor, constant: 16),
            overlay.trailingAnchor.constraint(equalTo: window.trailingAnchor, constant: -16),
            overlay.topAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor, constant: 84),
            overlay.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -116),
            remote.leadingAnchor.constraint(equalTo: overlay.leadingAnchor),
            remote.trailingAnchor.constraint(equalTo: overlay.trailingAnchor),
            remote.topAnchor.constraint(equalTo: overlay.topAnchor),
            remote.bottomAnchor.constraint(equalTo: overlay.bottomAnchor),
            local.widthAnchor.constraint(equalToConstant: 104),
            local.heightAnchor.constraint(equalToConstant: 148),
            local.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -12),
            local.bottomAnchor.constraint(equalTo: overlay.bottomAnchor, constant: -12)
        ])
        videoOverlay = overlay
        remoteRenderer = remote
        localRenderer = local
        localVideoTrack?.add(local)
        let relay = RemoteVideoFrameRelay()
        relay.owner = self
        relay.target = remote
        remoteFrameRelay = relay
        remoteVideoTrack?.add(relay)
        remoteRendererBoundTrackId = remoteVideoTrack?.trackId
        emitDiagnostic("native-video-overlay-installed", details: [
            "window": window.isKeyWindow,
            "windowWidth": window.bounds.width,
            "windowHeight": window.bounds.height,
            "windowLevel": window.windowLevel.rawValue,
            "overlayHidden": overlay.isHidden,
            "overlayAlpha": overlay.alpha,
            "overlayFrame": NSCoder.string(for: overlay.frame),
            "remoteRendererEnabled": remote.isEnabled,
            "remoteRendererHidden": remote.isHidden,
            "remoteRendererAlpha": remote.alpha,
            "remoteRendererFrame": NSCoder.string(for: remote.frame),
            "remoteTrackAttached": remoteVideoTrack != nil,
            "relayAttached": remoteVideoTrack != nil
        ])
        DispatchQueue.main.async {
            self.emitVideoOverlayAudit(reason: "post-layout")
        }
    }

    private func removeVideoOverlay() {
        if let remoteVideoTrack, let remoteFrameRelay { remoteVideoTrack.remove(remoteFrameRelay) }
        if let localVideoTrack, let localRenderer { localVideoTrack.remove(localRenderer) }
        remoteFrameRelay?.target = nil
        videoOverlay?.removeFromSuperview()
        videoOverlay = nil
        remoteRenderer = nil
        localRenderer = nil
        remoteFrameRelay = nil
        remoteRendererBoundTrackId = nil
    }

    private func emitVideoTransceiverSnapshotLocked(reason: String) {
        guard let peer else { return }
        let videoTransceivers = peer.transceivers.filter { $0.mediaType == .video }
        emitDiagnostic("native-video-transceiver-snapshot", details: [
            "reason": reason,
            "count": videoTransceivers.count,
            "transceivers": videoTransceivers.map { transceiver -> [String: Any] in
                var currentDirection = transceiver.direction
                let hasCurrentDirection = transceiver.currentDirection(&currentDirection)
                let track = transceiver.receiver.track
                return [
                    "mid": String(describing: transceiver.mid),
                    "direction": transceiver.direction.rawValue,
                    "hasCurrentDirection": hasCurrentDirection,
                    "currentDirection": currentDirection.rawValue,
                    "isStopped": transceiver.isStopped,
                    "receiverId": transceiver.receiver.receiverId,
                    "receiverTrackKind": track?.kind ?? "",
                    "receiverTrackId": track?.trackId ?? "",
                    "receiverTrackEnabled": track?.isEnabled ?? false,
                    "receiverTrackReadyState": track?.readyState == .live ? "live" : "ended",
                    "receiverSourceCount": transceiver.receiver.sources.count
                ]
            }
        ])
    }

    private func bindRemoteVideoReceiverIfNeededLocked(reason: String) {
        guard let peer else { return }
        guard let receiver = peer.receivers.first(where: { $0.track?.kind == "video" }) else {
            emitDiagnostic("native-remote-video-receiver-unavailable", details: [
                "reason": reason,
                "receiverCount": peer.receivers.count,
                "receiverKinds": peer.receivers.map { $0.track?.kind ?? "none" }
            ])
            return
        }
        bindRemoteVideoReceiverLocked(receiver, reason: reason)
    }

    private func bindRemoteVideoReceiverLocked(_ receiver: LKRTCRtpReceiver, reason: String) {
        guard let videoTrack = receiver.track as? LKRTCVideoTrack else {
            emitDiagnostic("native-remote-video-track-unavailable", details: [
                "reason": reason,
                "receiverId": receiver.receiverId,
                "trackKind": receiver.track?.kind ?? "none"
            ])
            return
        }
        let previousTrack = remoteVideoTrack
        receiver.delegate = self
        remoteVideoTrack = videoTrack
        remoteVideoReceiver = receiver
        videoTrack.isEnabled = true
        videoTrack.shouldReceive = true
        emitDiagnostic("native-webrtc-remote-video-track", details: [
            "reason": reason,
            "receiverId": receiver.receiverId,
            "trackId": videoTrack.trackId,
            "enabled": videoTrack.isEnabled,
            "shouldReceive": videoTrack.shouldReceive,
            "readyState": videoTrack.readyState == .live ? "live" : "ended",
            "sourceCount": receiver.sources.count,
            "rendererReady": remoteRenderer != nil,
            "relayReady": remoteFrameRelay != nil
        ])
        DispatchQueue.main.async {
            if self.remoteRenderer == nil || self.remoteFrameRelay == nil {
                self.installVideoOverlay()
            } else if let renderer = self.remoteRenderer,
                      let relay = self.remoteFrameRelay {
                if let previousTrack, previousTrack.trackId != videoTrack.trackId {
                    previousTrack.remove(relay)
                }
                relay.owner = self
                relay.target = renderer
                renderer.isEnabled = true
                if self.remoteRendererBoundTrackId != videoTrack.trackId {
                    videoTrack.add(relay)
                    self.remoteRendererBoundTrackId = videoTrack.trackId
                }
            }
            if let overlay = self.videoOverlay, let window = overlay.window {
                window.bringSubviewToFront(overlay)
            }
            self.emitDiagnostic("native-remote-video-renderer-attached", details: [
                "reason": reason,
                "trackId": videoTrack.trackId,
                "trackEnabled": videoTrack.isEnabled,
                "trackShouldReceive": videoTrack.shouldReceive,
                "rendererReady": self.remoteRenderer != nil,
                "relayReady": self.remoteFrameRelay != nil
            ])
            self.emitVideoOverlayAudit(reason: "receiver-bound-\(reason)")
        }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange stateChanged: LKRTCSignalingState
    ) {
        emitDiagnostic("native-webrtc-signaling-state", details: [
            "state": stateChanged.rawValue,
            "hasLocalDescription": peerConnection.localDescription != nil,
            "hasRemoteDescription": peerConnection.remoteDescription != nil,
            "receiverCount": peerConnection.receivers.count,
            "transceiverCount": peerConnection.transceivers.count
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didAdd stream: LKRTCMediaStream
    ) {
        emitDiagnostic("native-webrtc-media-stream-added", details: [
            "streamId": stream.streamId,
            "audioTrackIds": stream.audioTracks.map(\.trackId),
            "videoTrackIds": stream.videoTracks.map(\.trackId)
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didRemove stream: LKRTCMediaStream
    ) {
        emitDiagnostic("native-webrtc-media-stream-removed", details: [
            "streamId": stream.streamId,
            "audioTrackIds": stream.audioTracks.map(\.trackId),
            "videoTrackIds": stream.videoTracks.map(\.trackId)
        ])
    }

    func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {
        emitDiagnostic("native-webrtc-negotiation-needed", details: [
            "signalingState": peerConnection.signalingState.rawValue,
            "receiverCount": peerConnection.receivers.count,
            "transceiverCount": peerConnection.transceivers.count
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange newState: LKRTCIceConnectionState
    ) {
        emitDiagnostic("native-webrtc-ice-connection-state", details: [
            "state": newState.rawValue
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange newState: LKRTCIceGatheringState
    ) {
        emitDiagnostic("native-webrtc-ice-gathering-state", details: [
            "state": newState.rawValue
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didGenerate candidate: LKRTCIceCandidate
    ) {
        let parts = candidate.sdp.split(separator: " ").map(String.init)
        let typeIndex = parts.firstIndex(of: "typ")
        emitDiagnostic("native-webrtc-ice-candidate-generated", details: [
            "sdpMid": candidate.sdpMid ?? "",
            "sdpMLineIndex": candidate.sdpMLineIndex,
            "protocol": parts.count > 2 ? parts[2].lowercased() : "",
            "candidateType": typeIndex.map { index in
                index + 1 < parts.count ? parts[index + 1] : ""
            } ?? ""
        ])
        DispatchQueue.main.async { self.plugin?.emitIceCandidate(candidate) }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didRemove candidates: [LKRTCIceCandidate]
    ) {
        emitDiagnostic("native-webrtc-ice-candidates-removed", details: [
            "count": candidates.count,
            "mids": candidates.compactMap(\.sdpMid)
        ])
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didOpen dataChannel: LKRTCDataChannel
    ) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange newState: LKRTCPeerConnectionState
    ) {
        let state = connectionStateName(newState)
        DispatchQueue.main.async { self.plugin?.emitConnectionState(state) }
        if newState == .connected {
            queue.async {
                self.emitVideoTransceiverSnapshotLocked(reason: "peer-connected")
                self.bindRemoteVideoReceiverIfNeededLocked(reason: "peer-connected")
                let rtcSession = LKRTCAudioSession.sharedInstance()
                self.emitDiagnostic("native-webrtc-audio-ready", details: [
                    "remoteAudioTrack": self.remoteAudioTrack != nil,
                    "remoteAudioEnabled": self.remoteAudioTrack?.isEnabled ?? false,
                    "audioUnitEnabled": rtcSession.isAudioEnabled,
                    "audioSessionActive": rtcSession.isActive,
                    "rtcActivationCount": rtcSession.activationCount,
                    "rtcSessionCount": rtcSession.webRTCSessionCount,
                    "category": rtcSession.category,
                    "mode": rtcSession.mode
                ])
                DispatchQueue.main.async {
                    self.emitVideoOverlayAudit(reason: "peer-connected")
                }
            }
        }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didAdd rtpReceiver: LKRTCRtpReceiver,
        streams mediaStreams: [LKRTCMediaStream]
    ) {
        if let audioTrack = rtpReceiver.track as? LKRTCAudioTrack {
            queue.async {
                rtpReceiver.delegate = self
                self.remoteAudioTrack = audioTrack
                self.remoteAudioReceiver = rtpReceiver
                audioTrack.isEnabled = true
                self.emitDiagnostic("native-webrtc-remote-audio-track", details: [
                    "trackId": audioTrack.trackId,
                    "enabled": audioTrack.isEnabled,
                    "readyState": audioTrack.readyState == .live ? "live" : "ended"
                ])
                self.startAudioStatsLocked()
            }
            return
        }
        queue.async {
            self.bindRemoteVideoReceiverLocked(rtpReceiver, reason: "did-add-receiver")
            self.emitVideoTransceiverSnapshotLocked(reason: "did-add-receiver")
        }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didStartReceivingOn transceiver: LKRTCRtpTransceiver
    ) {
        queue.async {
            var currentDirection = transceiver.direction
            let hasCurrentDirection = transceiver.currentDirection(&currentDirection)
            self.emitDiagnostic("native-video-transceiver-started-receiving", details: [
                "mediaType": transceiver.mediaType.rawValue,
                "mid": String(describing: transceiver.mid),
                "direction": transceiver.direction.rawValue,
                "hasCurrentDirection": hasCurrentDirection,
                "currentDirection": currentDirection.rawValue,
                "receiverId": transceiver.receiver.receiverId,
                "trackKind": transceiver.receiver.track?.kind ?? "",
                "trackId": transceiver.receiver.track?.trackId ?? "",
                "trackReadyState": transceiver.receiver.track?.readyState == .live ? "live" : "ended"
            ])
            if transceiver.mediaType == .video {
                self.bindRemoteVideoReceiverLocked(
                    transceiver.receiver,
                    reason: "did-start-receiving-transceiver"
                )
            }
        }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didRemove rtpReceiver: LKRTCRtpReceiver
    ) {
        queue.async {
            self.emitDiagnostic("native-rtp-receiver-removed", details: [
                "receiverId": rtpReceiver.receiverId,
                "trackKind": rtpReceiver.track?.kind ?? "",
                "trackId": rtpReceiver.track?.trackId ?? ""
            ])
            if self.remoteVideoReceiver?.receiverId == rtpReceiver.receiverId {
                self.remoteVideoTrack = nil
                self.remoteVideoReceiver = nil
                self.remoteRendererBoundTrackId = nil
            }
        }
    }

    func rtpReceiver(
        _ rtpReceiver: LKRTCRtpReceiver,
        didReceiveFirstPacketFor mediaType: LKRTCRtpMediaType
    ) {
        emitDiagnostic("native-rtp-receiver-first-packet", details: [
            "receiverId": rtpReceiver.receiverId,
            "mediaType": mediaType.rawValue,
            "trackKind": rtpReceiver.track?.kind ?? "",
            "trackId": rtpReceiver.track?.trackId ?? "",
            "trackEnabled": rtpReceiver.track?.isEnabled ?? false,
            "trackReadyState": rtpReceiver.track?.readyState == .live ? "live" : "ended",
            "sourceCount": rtpReceiver.sources.count
        ])
    }

    private func startAudioStatsLocked() {
        audioStatsTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self,
                  self._isRunning,
                  let peer = self.peer,
                  let receiver = self.remoteAudioReceiver
            else { return }
            peer.statistics(for: receiver) { report in
                let inbound = report.statistics.values.first { statistic in
                    guard statistic.type == "inbound-rtp" else { return false }
                    let kind = statistic.values["kind"] as? String
                        ?? statistic.values["mediaType"] as? String
                    return kind == "audio"
                }
                guard let inbound else { return }
                let values = inbound.values
                self.emitDiagnostic("native-webrtc-audio-stats", details: [
                    "packetsReceived": (values["packetsReceived"] as? NSNumber)?.int64Value ?? 0,
                    "bytesReceived": (values["bytesReceived"] as? NSNumber)?.int64Value ?? 0,
                    "packetsLost": (values["packetsLost"] as? NSNumber)?.int64Value ?? 0,
                    "jitter": (values["jitter"] as? NSNumber)?.doubleValue ?? 0,
                    "audioLevel": (values["audioLevel"] as? NSNumber)?.doubleValue ?? -1,
                    "totalAudioEnergy": (values["totalAudioEnergy"] as? NSNumber)?.doubleValue ?? 0
                ])
            }
        }
        audioStatsTimer = timer
        timer.resume()
    }
}
