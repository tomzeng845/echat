package com.echat.app;

import android.Manifest;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
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
    private final AudioManager.OnAudioFocusChangeListener audioFocusListener = focusChange -> {};
    private AudioFocusRequest audioFocusRequest;

    @PluginMethod
    public void setCallAudioRoute(PluginCall call) {
        boolean speaker = Boolean.TRUE.equals(call.getBoolean("speaker", false));
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        int focusResult;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(audioFocusListener)
                    .build();
            }
            focusResult = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            focusResult = audioManager.requestAudioFocus(audioFocusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        boolean applied = focusResult == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo target = null;
            int targetType = speaker ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                if (device.getType() == targetType) {
                    target = device;
                    break;
                }
            }
            if (target != null) applied = audioManager.setCommunicationDevice(target) && applied;
            else if (!speaker) audioManager.clearCommunicationDevice();
        } else {
            audioManager.setSpeakerphoneOn(speaker);
        }
        JSObject result = new JSObject();
        result.put("speaker", speaker);
        result.put("applied", applied);
        call.resolve(result);
    }

    @PluginMethod
    public void endCallAudioSession(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice();
        else audioManager.setSpeakerphoneOn(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null)
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        else audioManager.abandonAudioFocus(audioFocusListener);
        audioManager.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }

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
