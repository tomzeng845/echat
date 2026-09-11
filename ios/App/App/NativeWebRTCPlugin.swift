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

final class NativeIosWebRTCManager: NSObject, LKRTCPeerConnectionDelegate {
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
    private var remoteVideoTrack: LKRTCVideoTrack?
    private var cameraCapturer: LKRTCCameraVideoCapturer?
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

    var isRunning: Bool { queue.sync { _isRunning } }

    private override init() {
        super.init()
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
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "echat-video")
        videoTrack.isEnabled = true
        _ = peer.add(videoTrack, streamIds: ["echat-stream"])
        localVideoTrack = videoTrack

        let capturer = LKRTCCameraVideoCapturer(delegate: videoSource)
        cameraCapturer = capturer
        guard let device = LKRTCCameraVideoCapturer.captureDevices().first(where: {
            $0.position == .front
        }) ?? LKRTCCameraVideoCapturer.captureDevices().first else {
            emitDiagnostic("native-camera-unavailable")
            completion(.failure(NativeWebRTCError.cameraUnavailable))
            return
        }

        let startCapture: () -> Void = { [weak self] in
            guard let self else { return }
            let formats = LKRTCCameraVideoCapturer.supportedFormats(for: device)
            let compatibleFormats = formats.filter { format in
                format.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 30 }
            }
            guard let format = (compatibleFormats.isEmpty ? formats : compatibleFormats).min(by: { lhs, rhs in
                let left = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
                let right = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
                let leftDistance = abs(Int(left.width) - 1280) + abs(Int(left.height) - 720)
                let rightDistance = abs(Int(right.width) - 1280) + abs(Int(right.height) - 720)
                return leftDistance < rightDistance
            }) else {
                self.emitDiagnostic("native-camera-format-unavailable")
                completion(.failure(NativeWebRTCError.cameraUnavailable))
                return
            }

            DispatchQueue.main.async {
                self.installVideoOverlay()
                guard let localRenderer = self.localRenderer else {
                    self.emitDiagnostic("native-local-preview-unavailable")
                    completion(.failure(NativeWebRTCError.cameraUnavailable))
                    return
                }
                videoTrack.add(localRenderer)
                self.emitDiagnostic("native-local-preview-attached", details: [
                    "device": device.localizedName,
                    "width": CMVideoFormatDescriptionGetDimensions(format.formatDescription).width,
                    "height": CMVideoFormatDescriptionGetDimensions(format.formatDescription).height
                ])
                capturer.startCapture(with: device, format: format, fps: 30) { error in
                    if let error {
                        self.emitDiagnostic("native-camera-capture-failed", details: ["error": error.localizedDescription])
                        completion(.failure(error))
                    } else {
                        self.emitDiagnostic("native-camera-capture-started", details: ["device": device.localizedName])
                        completion(.success(()))
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
                self.queue.async {
                    self.remoteDescriptionReady = true
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
                "connectionState": connectionStateName(peer?.connectionState)
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
        cameraCapturer?.stopCapture(completionHandler: nil)
        peer?.close()
        peer = nil
        factory = nil
        localAudioTrack = nil
        remoteAudioTrack = nil
        remoteAudioReceiver = nil
        localVideoTrack = nil
        remoteVideoTrack = nil
        cameraCapturer = nil
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
        DispatchQueue.main.async { self.removeVideoOverlay() }
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

    private func emitDiagnostic(_ event: String, details: [String: Any] = [:]) {
        DispatchQueue.main.async { self.plugin?.emitDiagnostic(event, details: details) }
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
                .first(where: { !$0.isHidden && $0.windowLevel == .normal }),
              let rootView = window.rootViewController?.view
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
        overlay.addSubview(remote)

        let local = LKRTCMTLVideoView()
        local.translatesAutoresizingMaskIntoConstraints = false
        local.videoContentMode = .scaleAspectFill
        local.layer.cornerRadius = 16
        local.layer.masksToBounds = true
        local.layer.borderWidth = 1
        local.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
        overlay.addSubview(local)

        rootView.addSubview(overlay)
        rootView.bringSubviewToFront(overlay)
        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: rootView.leadingAnchor, constant: 16),
            overlay.trailingAnchor.constraint(equalTo: rootView.trailingAnchor, constant: -16),
            overlay.topAnchor.constraint(equalTo: rootView.safeAreaLayoutGuide.topAnchor, constant: 84),
            overlay.bottomAnchor.constraint(equalTo: rootView.safeAreaLayoutGuide.bottomAnchor, constant: -116),
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
        emitDiagnostic("native-video-overlay-installed", details: [
            "window": window.isKeyWindow,
            "rootViewWidth": rootView.bounds.width,
            "rootViewHeight": rootView.bounds.height
        ])
    }

    private func removeVideoOverlay() {
        if let remoteVideoTrack, let remoteRenderer { remoteVideoTrack.remove(remoteRenderer) }
        if let localVideoTrack, let localRenderer { localVideoTrack.remove(localRenderer) }
        videoOverlay?.removeFromSuperview()
        videoOverlay = nil
        remoteRenderer = nil
        localRenderer = nil
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange stateChanged: LKRTCSignalingState
    ) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didAdd stream: LKRTCMediaStream
    ) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didRemove stream: LKRTCMediaStream
    ) {}

    func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange newState: LKRTCIceConnectionState
    ) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didChange newState: LKRTCIceGatheringState
    ) {}

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didGenerate candidate: LKRTCIceCandidate
    ) {
        DispatchQueue.main.async { self.plugin?.emitIceCandidate(candidate) }
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didRemove candidates: [LKRTCIceCandidate]
    ) {}

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
        guard let videoTrack = rtpReceiver.track as? LKRTCVideoTrack else { return }
        queue.async {
            self.remoteVideoTrack = videoTrack
            videoTrack.isEnabled = true
            DispatchQueue.main.async {
                if let renderer = self.remoteRenderer { videoTrack.add(renderer) }
            }
        }
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
