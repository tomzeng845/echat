package com.echat.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;
import cn.jpush.android.api.JPushInterface;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebChromeClient(new HarmonyWebChromeClient(getBridge(), this));
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> logJPushStatus(), 3000L);
    }

    private void logJPushStatus() {
        try {
            String registrationId = JPushInterface.getRegistrationID(getApplicationContext());
            EChatNativeLog.info(this, "android-jpush", "JPush runtime status",
                "sdkAvailable", true,
                "pushStopped", JPushInterface.isPushStopped(getApplicationContext()),
                "registrationIdPresent", registrationId != null && !registrationId.isBlank(),
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
    public void onStop() {
        CallListenerService.setAppActive(getApplicationContext(), false);
        EChatNativeLog.info(this, "android-lifecycle", "MainActivity onStop");
        super.onStop();
    }
}
