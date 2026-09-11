import UIKit
import Capacitor
import AVFoundation
import AudioToolbox
import PushKit
import CallKit
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        EChatVoipManager.shared.start()
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        EChatVoipManager.shared.handleFallbackRemoteNotification(userInfo) {
            completionHandler(.newData)
        }
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        config.delegateClass = SceneDelegate.self
        return config
    }
}

@objc(MyViewController)
public class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MediaPermissionsPlugin())
        bridge?.registerPluginInstance(NativeWebRTCPlugin())
    }
}

@objc(MediaPermissionsPlugin)
public class MediaPermissionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaPermissionsPlugin"
    public let jsName = "MediaPermissions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBackgroundCallSupport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackgroundCallExemption", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBackgroundCallSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playAlertSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAlertSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCallAudioRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCallAudioSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCallListener", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCallListener", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearCallListenerAlert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoipToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private var alertPlayer: AVAudioPlayer?

    override public func load() {
        EChatVoipManager.shared.plugin = self
        EChatVoipManager.shared.start()
        if let cleared = EChatVoipManager.shared.consumePendingClearedCall() {
            notifyListeners("callListenerCleared", data: cleared, retainUntilConsumed: true)
        }
    }

    @objc func getCapabilities(_ call: CAPPluginCall) {
        call.resolve([
            "firebaseConfigured": true,
            "apnsAvailable": true,
            "voipAvailable": true
        ])
    }

    @objc func getBackgroundCallSupport(_ call: CAPPluginCall) {
        call.resolve([
            "manufacturer": "Apple",
            "harmonyCompatible": false,
            "batteryOptimizationIgnored": true
        ])
    }

    @objc func requestBackgroundCallExemption(_ call: CAPPluginCall) {
        getBackgroundCallSupport(call)
    }

    @objc func openBackgroundCallSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.resolve(["opened": false])
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        let wantsCamera = call.getBool("camera") ?? false
        let wantsMicrophone = call.getBool("microphone") ?? false
        let group = DispatchGroup()

        if wantsCamera && AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .video) { _ in group.leave() }
        }
        if wantsMicrophone && AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            group.enter()
            AVCaptureDevice.requestAccess(for: .audio) { _ in group.leave() }
        }

        group.notify(queue: .main) {
            call.resolve([
                "camera": !wantsCamera || AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
                "microphone": !wantsMicrophone || AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
            ])
        }
    }

    @objc func playAlertSound(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "message"
        DispatchQueue.main.async {
            if kind == "message" {
                AudioServicesPlaySystemSound(1007)
                call.resolve(["playing": true])
                return
            }
            let resource = kind == "outgoing-call" ? "echat_ringback" : "echat_call"
            guard let url = Bundle.main.url(forResource: resource, withExtension: "wav") else {
                call.resolve(["playing": false])
                return
            }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.duckOthers])
                try session.setActive(true)
                self.alertPlayer?.stop()
                self.alertPlayer = try AVAudioPlayer(contentsOf: url)
                self.alertPlayer?.numberOfLoops = -1
                self.alertPlayer?.prepareToPlay()
                call.resolve(["playing": self.alertPlayer?.play() ?? false])
            } catch {
                call.reject("无法播放提示音", nil, error)
            }
        }
    }

    @objc func stopAlertSound(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let kind = call.getString("kind") ?? "message"
            self.alertPlayer?.stop()
            self.alertPlayer = nil
            // The ringtone uses .playback. Restore the call session immediately
            // after stopping it so WebKit is not left on Playback/Default.
            if kind == "call" && EChatVoipManager.shared.callAudioSessionRequested {
                EChatVoipManager.shared.reassertAudioSession(reason: "alert-stopped")
            }
            call.resolve()
        }
    }

    @objc func setCallAudioRoute(_ call: CAPPluginCall) {
        let speaker = call.getBool("speaker") ?? false
        DispatchQueue.main.async {
            EChatVoipManager.shared.callAudioSessionRequested = true
            EChatVoipManager.shared.speakerPreferred = speaker
            EChatVoipManager.shared.reassertAudioSession(reason: "manual-route")
            call.resolve(["speaker": speaker, "applied": true])
        }
    }

    @objc func endCallAudioSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.alertPlayer?.stop()
            self.alertPlayer = nil
            EChatVoipManager.shared.callAudioSessionRequested = false
            do {
                try AVAudioSession.sharedInstance().setActive(
                    false,
                    options: [.notifyOthersOnDeactivation]
                )
                call.resolve()
            } catch {
                call.reject("无法结束通话音频会话", nil, error)
            }
        }
    }

    @objc func startCallListener(_ call: CAPPluginCall) {
        EChatVoipManager.shared.start()
        call.resolve(["running": true])
    }

    @objc func stopCallListener(_ call: CAPPluginCall) {
        EChatVoipManager.shared.clearPendingCall()
        call.resolve()
    }

    @objc func clearCallListenerAlert(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        EChatVoipManager.shared.clearCallListenerAlert(callId: callId)
        call.resolve()
    }

    @objc func getPendingCall(_ call: CAPPluginCall) {
        guard let pending = EChatVoipManager.shared.pendingCall else {
            call.resolve(["available": false])
            return
        }
        var result: [String: Any] = pending
        result["available"] = true
        call.resolve(result)
    }

    @objc func getVoipToken(_ call: CAPPluginCall) {
        call.resolve([
            "token": EChatVoipManager.shared.voipToken ?? "",
            "available": EChatVoipManager.shared.voipToken != nil
        ])
    }

    public func emitVoipToken(_ token: String) {
        notifyListeners("voipToken", data: ["token": token])
    }

    public func emitIncomingCall(_ payload: [String: Any]) {
        notifyListeners("callListenerIncoming", data: payload)
    }

    public func emitClearedCall(_ payload: [String: Any]) {
        notifyListeners("callListenerCleared", data: payload, retainUntilConsumed: true)
    }
}

final class EChatVoipManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = EChatVoipManager()

    weak var plugin: MediaPermissionsPlugin?
    private var registry: PKPushRegistry?
    private var provider: CXProvider?
    private let pendingKey = "echat.ios.pending-call.v1"
    private let activeKey = "echat.ios.active-call.v1"
    private let pendingClearedKey = "echat.ios.pending-cleared-call.v1"
    private let voipTokenKey = "echat.ios.voip-token.v1"
    private var audioSessionObserversInstalled = false
    private var audioSessionRecoveryWorkItem: DispatchWorkItem?
    private var lastConfiguredAudioMode: AVAudioSession.Mode?
    private var lastConfiguredSpeaker: Bool?
    var speakerPreferred = false
    var callAudioSessionRequested = false
    private(set) var callKitAudioActive = false

    var currentAudioMode: AVAudioSession.Mode {
        let call = activeCall ?? pendingCall
        return (call?["mode"] as? String) == "video" ? .videoChat : .voiceChat
    }

    var voipToken: String? {
        UserDefaults.standard.string(forKey: voipTokenKey)
    }

    var pendingCall: [String: Any]? {
        guard let data = UserDefaults.standard.data(forKey: pendingKey),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return value
    }

    func start() {
        let install = { [weak self] in
            guard let self else { return }
            if self.provider == nil {
                let configuration = CXProviderConfiguration(localizedName: "E聊")
                configuration.supportsVideo = true
                configuration.maximumCallGroups = 1
                configuration.maximumCallsPerCallGroup = 1
                configuration.supportedHandleTypes = [.generic]
                configuration.ringtoneSound = "echat_call.wav"
                let provider = CXProvider(configuration: configuration)
                provider.setDelegate(self, queue: .main)
                self.provider = provider
            }
            if self.registry == nil {
                let registry = PKPushRegistry(queue: .main)
                registry.delegate = self
                // Set this immediately during cold launch. Delaying it behind
                // the WebView/plugin lifecycle can miss the first VoIP push.
                registry.desiredPushTypes = [.voIP]
                self.registry = registry
            }
            self.installAudioSessionObservers()
        }
        if Thread.isMainThread { install() } else { DispatchQueue.main.async(execute: install) }
    }

    private func installAudioSessionObservers() {
        guard !audioSessionObserversInstalled else { return }
        audioSessionObserversInstalled = true
        let center = NotificationCenter.default
        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            let type = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue ?? 0
            let ended = type == AVAudioSession.InterruptionType.ended.rawValue
            var state = self.audioSessionSnapshot()
            state["reason"] = ended ? "interruption-ended" : "interruption-began"
            self.plugin?.notifyListeners("audioSessionState", data: state)
            if NativeIosWebRTCManager.shared.isRunning {
                NativeIosWebRTCManager.shared.handleInterruption(ended: ended)
            }
            guard ended, self.activeCall != nil else { return }
            self.restoreActiveAudioSession(reason: "interruption-ended")
        }
        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let session = AVAudioSession.sharedInstance()
            var state = self.audioSessionSnapshot()
            state["reason"] = "route-changed"
            self.plugin?.notifyListeners("audioSessionState", data: state)
            if NativeIosWebRTCManager.shared.isRunning {
                NativeIosWebRTCManager.shared.reassertAudioSession()
                return
            }
            guard self.activeCall != nil,
                  !self.audioRouteMatchesPreference(session)
            else { return }
            self.restoreActiveAudioSession(reason: "route-changed")
        }
        center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.lastConfiguredAudioMode = nil
            self.lastConfiguredSpeaker = nil
            var state = self.audioSessionSnapshot()
            state["reason"] = "media-services-reset"
            self.plugin?.notifyListeners("audioSessionState", data: state)
            if NativeIosWebRTCManager.shared.isRunning {
                NativeIosWebRTCManager.shared.reassertAudioSession(force: true)
                return
            }
            guard self.activeCall != nil else { return }
            self.restoreActiveAudioSession(reason: "media-services-reset")
        }
    }

    private func audioSessionSnapshot() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return [
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "sampleRate": session.sampleRate,
            "outputs": session.currentRoute.outputs.map {
                "\($0.portType.rawValue):\($0.portName)"
            },
            "inputs": session.currentRoute.inputs.map {
                "\($0.portType.rawValue):\($0.portName)"
            },
            "otherAudioPlaying": session.isOtherAudioPlaying,
        ]
    }

    private func audioRouteMatchesPreference(_ session: AVAudioSession) -> Bool {
        let outputs = session.currentRoute.outputs
        guard !outputs.isEmpty else { return false }
        let usesBuiltInSpeaker = outputs.contains { $0.portType == .builtInSpeaker }
        return speakerPreferred ? usesBuiltInSpeaker : !usesBuiltInSpeaker
    }

    private func restoreActiveAudioSession(reason: String) {
        reassertAudioSession(reason: reason)
    }

    func reassertAudioSession(reason: String) {
        audioSessionRecoveryWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self,
                  self.activeCall != nil ||
                    reason == "manual-route" ||
                    reason == "alert-stopped"
            else { return }
            if NativeIosWebRTCManager.shared.isRunning {
                NativeIosWebRTCManager.shared.reassertAudioSession()
                return
            }
            let session = AVAudioSession.sharedInstance()
            self.applyAudioRoute(to: session)
            var state = self.audioSessionSnapshot()
            state["reason"] = reason
            self.plugin?.notifyListeners("audioSessionRecovered", data: state)
            self.plugin?.notifyListeners("audioSessionState", data: state)
        }
        audioSessionRecoveryWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08, execute: work)
    }

    func handleFallbackRemoteNotification(
        _ raw: [AnyHashable: Any],
        completion: @escaping () -> Void
    ) {
        guard (raw["type"] as? String) == "call" else {
            completion()
            return
        }
        let callId = raw["callId"] as? String ?? ""
        let action = raw["action"] as? String ?? "invite"
        if action == "end" {
            endCall(callId: callId, notifyPlugin: true)
            completion()
            return
        }
        guard !callId.isEmpty, let uuid = UUID(uuidString: callId) else {
            completion()
            return
        }
        if pendingCall?["callId"] as? String == callId {
            if let pending = pendingCall { plugin?.emitIncomingCall(pending) }
            completion()
            return
        }
        let call: [String: Any] = [
            "conversationId": raw["conversationId"] as? String ?? "",
            "callId": callId,
            "mode": raw["mode"] as? String ?? "audio",
            "callerId": raw["callerId"] as? String ?? "",
            "callerName": raw["callerName"] as? String ?? "E聊来电",
            "callerAvatarUrl": raw["callerAvatarUrl"] as? String ?? "",
            "nativeUuid": uuid.uuidString,
            "answerRequested": false
        ]
        savePending(call)
        let update = CXCallUpdate()
        update.localizedCallerName = call["callerName"] as? String
        update.remoteHandle = CXHandle(type: .generic, value: call["callerName"] as? String ?? "E聊来电")
        update.hasVideo = (call["mode"] as? String) == "video"
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        provider?.reportNewIncomingCall(with: uuid, update: update) { _ in
            self.plugin?.emitIncomingCall(call)
            completion()
        }
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: voipTokenKey)
        plugin?.emitVoipToken(token)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        if type == .voIP { UserDefaults.standard.removeObject(forKey: voipTokenKey) }
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        let raw = payload.dictionaryPayload
        let callId = raw["callId"] as? String ?? ""
        let action = raw["action"] as? String ?? "invite"
        if action == "end" {
            endCall(callId: callId, notifyPlugin: true)
            completion()
            return
        }
        guard !callId.isEmpty else {
            completion()
            return
        }
        guard let uuid = UUID(uuidString: callId) else {
            completion()
            return
        }
        if pendingCall?["callId"] as? String == callId {
            if let pending = pendingCall { plugin?.emitIncomingCall(pending) }
            completion()
            return
        }

        var call: [String: Any] = [
            "conversationId": raw["conversationId"] as? String ?? "",
            "callId": callId,
            "mode": raw["mode"] as? String ?? "audio",
            "callerId": raw["callerId"] as? String ?? "",
            "callerName": raw["callerName"] as? String ?? "E聊来电",
            "callerAvatarUrl": raw["callerAvatarUrl"] as? String ?? "",
            "nativeUuid": uuid.uuidString,
            "answerRequested": false
        ]
        savePending(call)

        let update = CXCallUpdate()
        update.localizedCallerName = call["callerName"] as? String
        update.remoteHandle = CXHandle(
            type: .generic,
            value: call["callerName"] as? String ?? "E聊来电"
        )
        update.hasVideo = (call["mode"] as? String) == "video"
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        provider?.reportNewIncomingCall(with: uuid, update: update) { _ in
            self.plugin?.emitIncomingCall(call)
            completion()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        if var call = pendingCall,
           let uuid = UUID(uuidString: call["nativeUuid"] as? String ?? ""),
           uuid == action.callUUID {
            // A CallKit answer can happen while the WebView is still in the
            // background. Prepare the voice-chat category before JS starts
            // getUserMedia/RTCPeerConnection; didActivate will make it active
            // again after CallKit owns the audio session.
            speakerPreferred = false
            callAudioSessionRequested = true
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(
                .playAndRecord,
                mode: currentAudioMode,
                options: [.allowBluetoothHFP]
            )
            call["answerRequested"] = true
            savePending(call)
            plugin?.emitIncomingCall(call)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let pending = pendingCall
        let active = activeCall
        let pendingUuid = UUID(uuidString: pending?["nativeUuid"] as? String ?? "")
        let activeUuid = UUID(uuidString: active?["nativeUuid"] as? String ?? "")
        let isPending = pendingUuid == action.callUUID
        let selected = isPending ? pending : active
        let callId = (isPending ? pending?["callId"] : active?["callId"]) as? String ?? ""
        if !callId.isEmpty {
            let event: [String: Any] = [
                "callId": callId,
                "conversationId": selected?["conversationId"] as? String ?? "",
                "callerId": selected?["callerId"] as? String ?? "",
                "reason": isPending ? "declined" : "ended"
            ]
            clearPendingCall()
            clearActiveCall()
            emitOrStoreClearedCall(event)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        callKitAudioActive = true
        if NativeIosWebRTCManager.shared.isRunning {
            NativeIosWebRTCManager.shared.callKitDidActivate(audioSession)
        } else {
            applyAudioRoute(to: audioSession)
        }
        var state = audioSessionSnapshot()
        state["reason"] = "callkit-did-activate"
        plugin?.notifyListeners("audioSessionState", data: state)
        [0.15, 0.5, 1.2].forEach { delay in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak audioSession] in
                guard let self, let audioSession else { return }
                if NativeIosWebRTCManager.shared.isRunning {
                    NativeIosWebRTCManager.shared.reassertAudioSession()
                } else {
                    self.applyAudioRoute(to: audioSession)
                }
            }
        }
    }

    private func applyAudioRoute(to audioSession: AVAudioSession) {
        var options: AVAudioSession.CategoryOptions = [.allowBluetoothHFP]
        if speakerPreferred { options.insert(.defaultToSpeaker) }
        if lastConfiguredAudioMode != currentAudioMode || lastConfiguredSpeaker != speakerPreferred || audioSession.category != .playAndRecord || audioSession.mode != currentAudioMode {
            try? audioSession.setCategory(.playAndRecord, mode: currentAudioMode, options: options)
            try? audioSession.setPreferredSampleRate(48_000)
            try? audioSession.setPreferredIOBufferDuration(0.01)
            lastConfiguredAudioMode = currentAudioMode
            lastConfiguredSpeaker = speakerPreferred
        }
        try? audioSession.setActive(true)
        if !audioRouteMatchesPreference(audioSession) {
            try? audioSession.overrideOutputAudioPort(speakerPreferred ? .speaker : .none)
        }
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        callKitAudioActive = false
        callAudioSessionRequested = false
        var state = audioSessionSnapshot()
        state["reason"] = "callkit-did-deactivate"
        plugin?.notifyListeners("audioSessionState", data: state)
        if NativeIosWebRTCManager.shared.isRunning {
            NativeIosWebRTCManager.shared.callKitDidDeactivate(audioSession)
        } else {
            try? audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
        }
    }

    func providerDidReset(_ provider: CXProvider) {
        clearPendingCall()
        clearActiveCall()
    }

    func endCall(callId: String, notifyPlugin: Bool) {
        guard !callId.isEmpty else { return }
        let stored = [pendingCall, activeCall].compactMap { $0 }.first {
            $0["callId"] as? String == callId
        }
        guard let stored,
              let uuid = UUID(uuidString: stored["nativeUuid"] as? String ?? callId)
        else {
            if notifyPlugin { emitOrStoreClearedCall(["callId": callId, "reason": "ended"]) }
            return
        }
        provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        clearPendingCall()
        clearActiveCall()
        if notifyPlugin {
            emitOrStoreClearedCall([
                "callId": callId,
                "conversationId": stored["conversationId"] as? String ?? "",
                "callerId": stored["callerId"] as? String ?? "",
                "reason": "ended"
            ])
        }
    }

    func clearCallListenerAlert(callId: String) {
        guard !callId.isEmpty else { return }
        if pendingCall?["callId"] as? String == callId,
           pendingCall?["answerRequested"] as? Bool == true {
            acknowledgeAnswer(callId: callId)
        } else {
            endCall(callId: callId, notifyPlugin: false)
        }
    }

    /// Removes the pending incoming-call payload after the user answers.
    /// This must not report a CallKit ended reason: the CallKit call remains
    /// active while WebRTC owns the media session.
    func acknowledgeAnswer(callId: String) {
        guard !callId.isEmpty else { return }
        guard var pending = pendingCall,
              pending["callId"] as? String == callId else { return }
        pending["answerRequested"] = true
        saveActive(pending)
        clearPendingCall()
    }

    func clearPendingCall() {
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }

    private var activeCall: [String: Any]? {
        guard let data = UserDefaults.standard.data(forKey: activeKey),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return value
    }

    private func clearActiveCall() {
        UserDefaults.standard.removeObject(forKey: activeKey)
    }

    func consumePendingClearedCall() -> [String: Any]? {
        guard let data = UserDefaults.standard.data(forKey: pendingClearedKey),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        UserDefaults.standard.removeObject(forKey: pendingClearedKey)
        return value
    }

    private func emitOrStoreClearedCall(_ event: [String: Any]) {
        if let plugin {
            plugin.emitClearedCall(event)
            return
        }
        guard let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        UserDefaults.standard.set(data, forKey: pendingClearedKey)
    }

    private func savePending(_ call: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: call) else { return }
        UserDefaults.standard.set(data, forKey: pendingKey)
    }

    private func saveActive(_ call: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: call) else { return }
        UserDefaults.standard.set(data, forKey: activeKey)
    }
}
