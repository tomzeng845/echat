package com.echat.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;
import cn.jpush.android.api.JPushInterface;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaPermissionsPlugin.class);
        registerPlugin(NativeVideoCompressorPlugin.class);
        registerPlugin(NativeVideoPlayerPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            android.webkit.WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            EChatNativeLog.info(this, "android-webview", "Media playback gesture policy configured",
                "mediaPlaybackRequiresUserGesture", false,
                "javaScriptEnabled", settings.getJavaScriptEnabled(),
                "domStorageEnabled", settings.getDomStorageEnabled());
            webView.setWebChromeClient(new HarmonyWebChromeClient(getBridge(), this));
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> logJPushStatus(), 3000L);
    }

    private void logJPushStatus() {
        try {
            String registrationId = JPushInterface.getRegistrationID(getApplicationContext());
            EChatNativeLog.info(this, "android-jpush", "JPush runtime status",
                "sdkAvailable", true,
                "packageName", getPackageName(),
                "sdkInt", android.os.Build.VERSION.SDK_INT,
                "pushStopped", JPushInterface.isPushStopped(getApplicationContext()),
                "registrationIdPresent", registrationId != null && !registrationId.isBlank(),
                "registrationIdLength", registrationId == null ? 0 : registrationId.length(),
                "notificationsEnabled", getSystemService(android.app.NotificationManager.class).areNotificationsEnabled());
        } catch (Throwable error) {
            EChatNativeLog.error(this, "android-jpush", "JPush runtime status check failed", error);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        CallListenerService.setAppActive(getApplicationContext(), true);
        EChatNativeLog.info(this, "android-lifecycle", "MainActivity onStart");
    }

    @Override
    public void onResume() {
        super.onResume();
        CallListenerService.setAppActive(getApplicationContext(), true);
        EChatNativeLog.info(this, "android-lifecycle", "MainActivity onResume",
            "notificationLaunch", getIntent() != null && "call".equals(getIntent().getStringExtra("echat_notification_type")));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        EChatNativeLog.info(this, "android-lifecycle", "MainActivity onNewIntent",
            "notificationLaunch", intent != null && "call".equals(intent.getStringExtra("echat_notification_type")));
    }

    @Override
    public void onStop() {
        CallListenerService.setAppActive(getApplicationContext(), false);
        EChatNativeLog.info(this, "android-lifecycle", "MainActivity onStop");
        super.onStop();
    }
}
