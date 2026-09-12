package com.echat.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebChromeClient(new HarmonyWebChromeClient(getBridge(), this));
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
