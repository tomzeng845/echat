package com.echat.app;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeVideoPlayer")
public class NativeVideoPlayerPlugin extends Plugin {
    @PluginMethod
    public void playVideo(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.isBlank() || !(url.startsWith("https://") || url.startsWith("http://"))) {
            EChatNativeLog.error(getContext(), "android-video-player", "Native play rejected",
                new IllegalArgumentException("Only HTTP(S) video URLs are supported"));
            call.reject("视频地址无效", "INVALID_VIDEO_URL");
            return;
        }
        EChatNativeLog.info(getContext(), "android-video-player", "Native play requested",
            "urlScheme", url.startsWith("https://") ? "https" : "http",
            "urlLength", url.length());
        try {
            Intent intent = new Intent(getContext(), NativeVideoPlayerActivity.class);
            intent.putExtra(NativeVideoPlayerActivity.EXTRA_VIDEO_URL, url);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getContext().startActivity(intent);
            EChatNativeLog.info(getContext(), "android-video-player", "Native player Activity started");
            call.resolve();
        } catch (RuntimeException error) {
            EChatNativeLog.error(getContext(), "android-video-player", "Native player Activity failed to start", error);
            call.reject("原生播放器启动失败", "NATIVE_PLAYER_START_FAILED", error);
        }
    }
}
