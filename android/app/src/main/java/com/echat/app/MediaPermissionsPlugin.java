package com.echat.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
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
    private MediaPlayer messagePlayer;
    private MediaPlayer callPlayer;
    private BroadcastReceiver callListenerReceiver;

    @Override
    public void load() {
        callListenerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (CallListenerService.ACTION_INCOMING.equals(intent.getAction())) emitPendingCall(true);
                else if (CallListenerService.ACTION_CLEARED.equals(intent.getAction())) {
                    JSObject data = new JSObject();
                    data.put("callId", intent.getStringExtra(CallListenerService.EXTRA_CALL_ID));
                    notifyListeners("callListenerCleared", data);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(CallListenerService.ACTION_INCOMING);
        filter.addAction(CallListenerService.ACTION_CLEARED);
        ContextCompat.registerReceiver(getContext(), callListenerReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @PluginMethod
    public void startCallListener(PluginCall call) {
        String hubUrl = call.getString("hubUrl", "");
        String token = call.getString("token", "");
        String userId = call.getString("userId", "");
        if (!hubUrl.startsWith("https://") || token.isBlank() || userId.isBlank()) {
            call.reject("来电服务配置无效");
            return;
        }
        CallListenerService.start(getContext(), hubUrl, token, userId);
        emitPendingCall(true);
        JSObject result = new JSObject();
        result.put("running", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopCallListener(PluginCall call) {
        CallListenerService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearCallListenerAlert(PluginCall call) {
        CallListenerService.clear(getContext(), call.getString("callId", ""));
        call.resolve();
    }

    @PluginMethod
    public void getPendingCall(PluginCall call) {
        CallListenerService.IncomingCallPayload pending = CallListenerService.consumePendingCall(getContext());
        JSObject result = toCallJson(pending);
        result.put("available", pending != null);
        call.resolve(result);
    }

    private void emitPendingCall(boolean retainUntilConsumed) {
        CallListenerService.IncomingCallPayload pending = CallListenerService.consumePendingCall(getContext());
        if (pending != null) notifyListeners("callListenerIncoming", toCallJson(pending), retainUntilConsumed);
    }

    private static JSObject toCallJson(CallListenerService.IncomingCallPayload call) {
        JSObject result = new JSObject();
        if (call == null) return result;
        result.put("conversationId", call.conversationId);
        result.put("callId", call.callId);
        result.put("mode", call.mode);
        result.put("callerId", call.callerId);
        result.put("callerName", call.callerName);
        result.put("callerAvatarUrl", call.callerAvatarUrl);
        return result;
    }

    @PluginMethod
    public void playAlertSound(PluginCall call) {
        String kind = call.getString("kind", "message");
        boolean incomingCall = "voice-call".equals(kind) || "video-call".equals(kind);
        MediaPlayer existing = incomingCall ? callPlayer : messagePlayer;
        releasePlayer(existing);
        int resourceId = getContext().getResources().getIdentifier(
            incomingCall ? "echat_call" : "echat_message",
            "raw",
            getContext().getPackageName()
        );
        if (resourceId == 0) {
            call.reject("提示音资源不存在");
            return;
        }
        try {
            Uri uri = Uri.parse("android.resource://" + getContext().getPackageName() + "/" + resourceId);
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(incomingCall ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE : AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(getContext(), uri);
            player.setLooping(incomingCall);
            player.setOnCompletionListener(completed -> {
                releasePlayer(completed);
                if (completed == messagePlayer) messagePlayer = null;
            });
            player.prepare();
            player.start();
            if (incomingCall) callPlayer = player;
            else messagePlayer = player;
            JSObject result = new JSObject();
            result.put("playing", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法播放提示音", error);
        }
    }

    @PluginMethod
    public void stopAlertSound(PluginCall call) {
        String kind = call.getString("kind", "all");
        if ("all".equals(kind) || "message".equals(kind)) {
            releasePlayer(messagePlayer);
            messagePlayer = null;
        }
        if ("all".equals(kind) || "call".equals(kind)) {
            releasePlayer(callPlayer);
            callPlayer = null;
        }
        call.resolve();
    }

    private static void releasePlayer(MediaPlayer player) {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (IllegalStateException ignored) {
            // The player may already be completing or released.
        }
        player.reset();
        player.release();
    }

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
        releasePlayer(callPlayer);
        callPlayer = null;
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice();
        else audioManager.setSpeakerphoneOn(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null)
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        else audioManager.abandonAudioFocus(audioFocusListener);
        audioManager.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer(messagePlayer);
        releasePlayer(callPlayer);
        messagePlayer = null;
        callPlayer = null;
        if (callListenerReceiver != null) {
            getContext().unregisterReceiver(callListenerReceiver);
            callListenerReceiver = null;
        }
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnResume() {
        CallListenerService.setAppActive(getContext(), true);
        emitPendingCall(true);
    }

    @Override
    protected void handleOnPause() {
        CallListenerService.setAppActive(getContext(), false);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        CallListenerService.setAppActive(getContext(), true);
        emitPendingCall(true);
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
