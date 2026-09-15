import Capacitor
import AVFoundation
import PhotosUI
import UIKit

@objc(NativeVideoCompressorPlugin)
public final class NativeVideoCompressorPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "NativeVideoCompressorPlugin"
    public let jsName = "NativeVideoCompressor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickAndCompressVideo", returnType: CAPPluginReturnPromise)
    ]

    private var pickerCall: CAPPluginCall?
    private var startedAt: Date?

    @objc func pickAndCompressVideo(_ call: CAPPluginCall) {
        guard pickerCall == nil else {
            call.reject("已有视频正在处理", "BUSY")
            return
        }
        pickerCall = call
        startedAt = Date()
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .videos
        configuration.selectionLimit = 1
        DispatchQueue.main.async {
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.bridge?.viewController?.present(picker, animated: true)
        }
        NSLog("[EChat][ios-video-compression] Native video picker opened")
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickerCall else { return }
        guard let result = results.first else {
            pickerCall = nil
            NSLog("[EChat][ios-video-compression] Native video picker cancelled")
            call.reject("未选择视频", "PICKER_CANCELLED")
            return
        }
        result.itemProvider.loadFileRepresentation(forTypeIdentifier: "public.movie") { [weak self] url, error in
            guard let self else { return }
            guard let url, error == nil else {
                self.finishFailure(call, message: "iOS 视频文件读取失败", code: "PICKER_READ_FAILED", error: error)
                return
            }
            let source = FileManager.default.temporaryDirectory.appendingPathComponent("echat-source-\(UUID().uuidString).mov")
            do {
                try FileManager.default.copyItem(at: url, to: source)
                self.compress(source: source, call: call)
            } catch {
                self.finishFailure(call, message: "iOS 视频文件复制失败", code: "PICKER_COPY_FAILED", error: error)
            }
        }
    }

    private func compress(source: URL, call: CAPPluginCall) {
        let asset = AVAsset(url: source)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else {
            finishFailure(call, message: "iOS 不支持视频压缩配置", code: "COMPRESSION_SETUP_FAILED", error: nil)
            return
        }
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("echat-video-\(UUID().uuidString).mp4")
        session.outputURL = output
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        NSLog("[EChat][ios-video-compression] Native compression started sourceBytes=%lld", fileSize(source))
        session.exportAsynchronously { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                if session.status == .completed {
                    let elapsed = Int((Date().timeIntervalSince(self.startedAt ?? Date())) * 1000)
                    let result: [String: Any] = [
                        "path": output.path,
                        "fileName": output.lastPathComponent,
                        "mimeType": "video/mp4",
                        "size": self.fileSize(output),
                        "durationMs": elapsed
                    ]
                    NSLog("[EChat][ios-video-compression] Native compression completed elapsedMs=%d outputBytes=%lld", elapsed, self.fileSize(output))
                    self.finishSuccess(call, result: result)
                } else {
                    self.finishFailure(call, message: "iOS 原生视频压缩失败", code: "COMPRESSION_FAILED", error: session.error)
                }
                try? FileManager.default.removeItem(at: source)
            }
        }
    }

    private func finishSuccess(_ call: CAPPluginCall, result: [String: Any]) {
        pickerCall = nil
        startedAt = nil
        call.resolve(result)
    }

    private func finishFailure(_ call: CAPPluginCall, message: String, code: String, error: Error?) {
        NSLog("[EChat][ios-video-compression] Native compression failed code=%@ message=%@", code, error?.localizedDescription ?? message)
        pickerCall = nil
        startedAt = nil
        call.reject(message, code, error)
    }

    private func fileSize(_ url: URL) -> Int64 {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    }
}
