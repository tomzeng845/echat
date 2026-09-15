package com.echat.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.TransformationException;
import androidx.media3.transformer.VideoEncoderSettings;
import java.util.Collections;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.Locale;

@CapacitorPlugin(name = "NativeVideoCompressor")
public class NativeVideoCompressorPlugin extends Plugin {
    private static final int PICK_VIDEO = 7401;
    private PluginCall pendingCall;
    private long startedAt;

    @PluginMethod
    public void pickAndCompressVideo(PluginCall call) {
        EChatNativeLog.info(getContext(), "android-video-compression", "pickAndCompressVideo invoked",
            "plugin", "NativeVideoCompressor", "pending", pendingCall != null);
        if (pendingCall != null) {
            call.reject("已有视频正在处理");
            return;
        }
        pendingCall = call;
        startedAt = System.currentTimeMillis();
        EChatNativeLog.info(getContext(), "android-video-compression", "Native video picker opened");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
        startActivityForResult(call, intent, "videoPicked");
    }

    @ActivityCallback
    private void videoPicked(PluginCall ignored, androidx.activity.result.ActivityResult result) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            EChatNativeLog.info(getContext(), "android-video-compression", "Native video picker cancelled");
            call.reject("未选择视频", "PICKER_CANCELLED");
            return;
        }
        Uri input = result.getData().getData();
        EChatNativeLog.info(getContext(), "android-video-compression", "Native video selected",
            "uriScheme", input.getScheme(), "uriPresent", true);
        try {
            getContext().getContentResolver().takePersistableUriPermission(input, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Throwable ignoredError) {
            // Some providers do not offer persistable permissions; the current grant is enough.
        }
        compress(input, call);
    }

    private void compress(Uri input, PluginCall call) {
        File output = new File(getContext().getCacheDir(), "echat-video-" + System.currentTimeMillis() + ".mp4");
        long inputBytes = inputSize(input);
        EChatNativeLog.info(getContext(), "android-video-compression", "Native compression started",
            "source", input.toString(), "inputBytes", inputBytes, "output", output.getAbsolutePath());
        try {
            VideoEncoderSettings videoSettings = new VideoEncoderSettings.Builder()
                .setBitrate(1_500_000)
                .build();
            DefaultEncoderFactory encoderFactory = new DefaultEncoderFactory.Builder(getContext())
                .setRequestedVideoEncoderSettings(videoSettings)
                .build();
            Transformer transformer = new Transformer.Builder(getContext())
                .setEncoderFactory(encoderFactory)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .addListener(new Transformer.Listener() {
                    @Override
                    public void onTransformationCompleted(MediaItem mediaItem) {
                        long elapsed = System.currentTimeMillis() - startedAt;
                        JSObject result = new JSObject();
                        result.put("path", output.getAbsolutePath());
                        result.put("fileName", output.getName());
                        result.put("mimeType", "video/mp4");
                        result.put("size", output.length());
                        result.put("inputSize", inputBytes);
                        result.put("durationMs", elapsed);
                        EChatNativeLog.info(getContext(), "android-video-compression", "Native compression completed",
                            "elapsedMs", elapsed, "inputUriPresent", true, "outputBytes", output.length(),
                            "inputBytes", inputBytes, "compressionRatio", inputBytes > 0 ? (double) output.length() / inputBytes : 0,
                            "outputMimeType", "video/mp4", "outputExists", output.exists());
                        call.resolve(result);
                    }

                    @Override
                    public void onTransformationError(MediaItem mediaItem, TransformationException exception) {
                        if (output.exists()) output.delete();
                        EChatNativeLog.error(getContext(), "android-video-compression", "Native compression failed", exception);
                        call.reject("Android 原生视频压缩失败", "COMPRESSION_FAILED", exception);
                    }
                }).build();
            EditedMediaItem edited = new EditedMediaItem.Builder(MediaItem.fromUri(input))
                .setEffects(new Effects(
                    Collections.emptyList(),
                    Collections.singletonList(Presentation.createForHeight(720))))
                .build();
            transformer.start(edited, output.getAbsolutePath());
        } catch (Throwable error) {
            if (output.exists()) output.delete();
            EChatNativeLog.error(getContext(), "android-video-compression", "Native compression setup failed", error);
            call.reject("Android 原生视频压缩初始化失败", "COMPRESSION_SETUP_FAILED", error instanceof Exception ? (Exception) error : new Exception(error));
        }
    }

    private long inputSize(Uri input) {
        try (android.content.res.AssetFileDescriptor descriptor = getContext().getContentResolver().openAssetFileDescriptor(input, "r")) {
            return descriptor == null ? 0 : descriptor.getLength();
        } catch (Throwable ignored) {
            return 0;
        }
    }
}
