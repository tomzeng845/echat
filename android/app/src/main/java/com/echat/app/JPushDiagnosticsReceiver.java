package com.echat.app;

import android.content.Context;
import cn.jpush.android.api.CustomMessage;
import cn.jpush.android.api.NotificationMessage;
import cn.jpush.android.service.JPushMessageReceiver;

/**
 * Diagnostic-only receiver for the asynchronous JPush lifecycle.
 * It deliberately records only safe metadata, never the Registration ID itself.
 */
public final class JPushDiagnosticsReceiver extends JPushMessageReceiver {
    @Override
    public void onRegister(Context context, String registrationId) {
        EChatNativeLog.info(context, "android-jpush", "JPush onRegister callback",
            "registrationIdPresent", registrationId != null && !registrationId.isBlank(),
            "registrationIdLength", registrationId == null ? 0 : registrationId.length());
    }

    @Override
    public void onConnected(Context context, boolean connected) {
        EChatNativeLog.info(context, "android-jpush", "JPush onConnected callback",
            "connected", connected);
    }

    @Override
    public void onMessage(Context context, CustomMessage message) {
        EChatNativeLog.info(context, "android-jpush", "JPush custom message callback",
            "messagePresent", message != null);
    }

    @Override
    public void onNotifyMessageArrived(Context context, NotificationMessage message) {
        EChatNativeLog.info(context, "android-jpush", "JPush notification arrived callback",
            "messagePresent", message != null);
    }

    @Override
    public void onNotifyMessageOpened(Context context, NotificationMessage message) {
        EChatNativeLog.info(context, "android-jpush", "JPush notification opened callback",
            "messagePresent", message != null);
    }
}
