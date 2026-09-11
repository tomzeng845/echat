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
}
