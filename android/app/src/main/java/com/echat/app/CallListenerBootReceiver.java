package com.echat.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores the persisted SignalR call listener after a reboot or app update. */
public final class CallListenerBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : intent.getAction();
        EChatNativeLog.info(context, "android-call-listener-boot", "Broadcast received",
            "action", action,
            "directBoot", Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action));
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            CallListenerService.restore(context.getApplicationContext());
        }
    }
}
