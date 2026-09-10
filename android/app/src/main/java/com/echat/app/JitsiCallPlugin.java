package com.echat.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.jitsi.meet.sdk.JitsiMeet;
import org.jitsi.meet.sdk.JitsiMeetActivity;
import org.jitsi.meet.sdk.JitsiMeetConferenceOptions;

import java.net.MalformedURLException;
import java.net.URL;

@CapacitorPlugin(name = "JitsiCall")
public class JitsiCallPlugin extends Plugin {
    private static final String DEFAULT_SERVER_URL = "https://meet.jit.si";

    @Override
    public void load() {
        try {
            JitsiMeetConferenceOptions defaults = new JitsiMeetConferenceOptions.Builder()
                .setServerURL(new URL(DEFAULT_SERVER_URL))
                .setFeatureFlag("welcomepage.enabled", false)
                .setFeatureFlag("prejoinpage.enabled", false)
                .build();
            JitsiMeet.setDefaultConferenceOptions(defaults);
        } catch (MalformedURLException ignored) {
            // The constant above is validated at build time and cannot be malformed.
        }
    }

    @PluginMethod
    public void join(PluginCall call) {
        String serverUrl = call.getString("serverUrl", DEFAULT_SERVER_URL);
        String roomName = call.getString("roomName");
        String mode = call.getString("mode", "audio");
        if (roomName == null || roomName.trim().isEmpty()) {
            call.reject("Jitsi 房间名不能为空");
            return;
        }
        try {
            JitsiMeetConferenceOptions options = new JitsiMeetConferenceOptions.Builder()
                .setServerURL(new URL(serverUrl))
                .setRoom(roomName)
                .setAudioOnly("audio".equals(mode))
                .setAudioMuted(false)
                .setVideoMuted(!"video".equals(mode))
                .setFeatureFlag("welcomepage.enabled", false)
                .setFeatureFlag("prejoinpage.enabled", false)
                .build();
            getActivity().runOnUiThread(() -> {
                JitsiMeetActivity.launch(getActivity(), options);
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            });
        } catch (MalformedURLException error) {
            call.reject("Jitsi 服务器地址无效", error);
        }
    }

    @PluginMethod
    public void leave(PluginCall call) {
        // JitsiMeetActivity automatically finishes when its conference is left.
        // This method is intentionally idempotent for the JS lifecycle bridge.
        JSObject result = new JSObject();
        result.put("left", true);
        call.resolve(result);
    }
}
