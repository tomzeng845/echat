package com.echat.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "MediaPermissions",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class MediaPermissionsPlugin extends Plugin {
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        int googleAppId = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("firebaseConfigured", googleAppId != 0);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (Boolean.TRUE.equals(call.getBoolean("camera", false)) && getPermissionState("camera") != PermissionState.GRANTED) {
            aliases.add("camera");
        }
        if (Boolean.TRUE.equals(call.getBoolean("microphone", false)) && getPermissionState("microphone") != PermissionState.GRANTED) {
            aliases.add("microphone");
        }
        if (aliases.isEmpty()) {
            resolveState(call);
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolveState(call);
    }

    private void resolveState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("camera", getPermissionState("camera") == PermissionState.GRANTED);
        result.put("microphone", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(result);
    }
}
