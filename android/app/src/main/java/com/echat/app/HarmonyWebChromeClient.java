package com.echat.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/** Grants already-approved media permissions directly to WebView on Harmony builds. */
public final class HarmonyWebChromeClient extends BridgeWebChromeClient {
    private final Activity activity;

    public HarmonyWebChromeClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        boolean cameraRequested = false;
        boolean microphoneRequested = false;
        for (String resource : request.getResources()) {
            cameraRequested |= PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource);
            microphoneRequested |= PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource);
        }
        boolean cameraGranted = !cameraRequested || ContextCompat.checkSelfPermission(
            activity, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;
        boolean microphoneGranted = !microphoneRequested || ContextCompat.checkSelfPermission(
            activity, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        if (cameraGranted && microphoneGranted) {
            request.grant(request.getResources());
            return;
        }
        super.onPermissionRequest(request);
    }
}
