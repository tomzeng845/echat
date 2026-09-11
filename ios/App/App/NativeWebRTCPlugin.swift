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
        NativeIosWebRTCManager.shared.close()
        call.resolve()
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
    private var _isRunning = false
    private var videoOverlay: UIView?
    private var remoteRenderer: LKRTCMTLVideoView?
    private var localRenderer: LKRTCMTLVideoView?

    var isRunning: Bool { queue.sync { _isRunning } }

    private override init() {
        super.init()
        LKRTCInitializeSSL()
    }

    func start(
        mode: String,
        iceServers: [NativeIceServer],
        speaker: Bool,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        queue.async {
            self.closeLocked(deactivateSession: true)
            self.mode = mode
            self.speaker = speaker
            self.microphoneEnabled = true
            self.cameraEnabled = true
            self.remoteDescriptionReady = false
            self.pendingCandidates.removeAll()

            let rtcAudioSession = LKRTCAudioSession.sharedInstance()
            rtcAudioSession.useManualAudio = true
            rtcAudioSession.isAudioEnabled = false

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
            completion(.failure(NativeWebRTCError.cameraUnavailable))
            return
        }
        let formats = LKRTCCameraVideoCapturer.supportedFormats(for: device)
        guard let format = formats.min(by: { lhs, rhs in
            let left = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
            let right = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
            let leftDistance = abs(Int(left.width) - 1280) + abs(Int(left.height) - 720)
            let rightDistance = abs(Int(right.width) - 1280) + abs(Int(right.height) - 720)
            return leftDistance < rightDistance
        }) else {
            completion(.failure(NativeWebRTCError.cameraUnavailable))
            return
        }

        DispatchQueue.main.async {
            self.installVideoOverlay()
            if let localRenderer = self.localRenderer {
                videoTrack.add(localRenderer)
            }
            capturer.startCapture(with: device, format: format, fps: 30) { error in
                if let error { completion(.failure(error)) }
                else { completion(.success(())) }
            }
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
            self.configureAudioSessionLocked(activate: false)
            rtcAudioSession.isAudioEnabled = true
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
                self.configureAudioSessionLocked(activate: !self.callKitAudioActive)
                rtcAudioSession.isAudioEnabled = true
                self.emitDiagnostic("native-audio-interruption-recovered")
            } else {
                rtcAudioSession.isAudioEnabled = false
                self.emitDiagnostic("native-audio-interruption-began")
            }
        }
    }

    func reassertAudioSession() {
        queue.async {
            guard self._isRunning else { return }
            self.configureAudioSessionLocked(activate: !self.callKitAudioActive)
            LKRTCAudioSession.sharedInstance().isAudioEnabled = true
        }
    }

    func close() {
        queue.async { self.closeLocked(deactivateSession: true) }
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
        configureAudioSessionLocked(activate: !callKitAudioActive)
        LKRTCAudioSession.sharedInstance().isAudioEnabled = true
    }

    private func configureAudioSessionLocked(activate: Bool) {
        let session = AVAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP]
        if speaker { options.insert(.defaultToSpeaker) }
        do {
            try session.setCategory(
                .playAndRecord,
                mode: mode == "video" ? .videoChat : .voiceChat,
                options: options
            )
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.01)
            if activate {
                try session.setActive(true)
                activatedByApp = true
            }
            let hasBluetooth = session.currentRoute.outputs.contains {
                [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE].contains($0.portType)
            }
            if speaker {
                try session.overrideOutputAudioPort(.speaker)
            } else if !hasBluetooth {
                try session.overrideOutputAudioPort(.none)
            }
        } catch {
            emitDiagnostic("native-audio-session-error", details: [
                "message": error.localizedDescription
            ])
        }
    }

    private func closeLocked(deactivateSession: Bool) {
        let wasRunning = _isRunning
        _isRunning = false
        localAudioTrack?.isEnabled = false
        localVideoTrack?.isEnabled = false
        remoteVideoTrack?.isEnabled = false
        cameraCapturer?.stopCapture(completionHandler: nil)
        peer?.close()
        peer = nil
        factory = nil
        localAudioTrack = nil
        localVideoTrack = nil
        remoteVideoTrack = nil
        cameraCapturer = nil
        pendingCandidates.removeAll()
        remoteDescriptionReady = false
        LKRTCAudioSession.sharedInstance().isAudioEnabled = false
        if deactivateSession && activatedByApp && !callKitAudioActive {
            try? AVAudioSession.sharedInstance().setActive(
                false,
                options: [.notifyOthersOnDeactivation]
            )
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
            .first(where: { $0.isKeyWindow }),
              let rootView = window.rootViewController?.view
        else { return }

        let overlay = UIView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = .black
        overlay.isUserInteractionEnabled = false

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
    }

    func peerConnection(
        _ peerConnection: LKRTCPeerConnection,
        didAdd rtpReceiver: LKRTCRtpReceiver,
        streams mediaStreams: [LKRTCMediaStream]
    ) {
        guard let videoTrack = rtpReceiver.track as? LKRTCVideoTrack else { return }
        queue.async {
            self.remoteVideoTrack = videoTrack
            videoTrack.isEnabled = true
            DispatchQueue.main.async {
                if let renderer = self.remoteRenderer { videoTrack.add(renderer) }
            }
        }
    }
}
