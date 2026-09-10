package com.echat.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaPermissionsPlugin.class);
        registerPlugin(JitsiCallPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
