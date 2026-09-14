package com.echat.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ContentValues;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
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
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

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
    private CallListenerService.IncomingCallPayload pendingIntentCall;

    @Override
    public void load() {
        EChatNativeLog.info(getContext(), "android-native-bridge", "MediaPermissions.load");
        Intent initialIntent = getActivity() == null ? null : getActivity().getIntent();
        if (initialIntent != null && initialIntent.hasExtra(CallListenerService.EXTRA_CALL_ID)) {
            CallListenerService.IncomingCallPayload candidate = fromIntent(initialIntent);
            if (!CallListenerService.isCallRecentlyCleared(getContext(), candidate.callId))
                pendingIntentCall = candidate;
        }
        callListenerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (CallListenerService.ACTION_INCOMING.equals(intent.getAction()))
                    notifyListeners("callListenerIncoming", toCallJson(fromIntent(intent)), false);
                else if (CallListenerService.ACTION_CLEARED.equals(intent.getAction())) {
                    String callId = intent.getStringExtra(CallListenerService.EXTRA_CALL_ID);
                    if (pendingIntentCall != null && callId != null && callId.equals(pendingIntentCall.callId))
                        pendingIntentCall = null;
                    JSObject data = new JSObject();
                    data.put("callId", callId);
                    data.put("reason", intent.getStringExtra("reason"));
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
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "startCallListener",
            "hubUrl", EChatNativeLog.safeEndpoint(hubUrl),
            "credentialPresent", !token.isBlank(),
            "hasUserId", !userId.isBlank());
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
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "stopCallListener");
        CallListenerService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearCallListenerAlert(PluginCall call) {
        String callId = call.getString("callId", "");
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "clearCallListenerAlert",
            "hasCallId", !callId.isBlank());
        if (pendingIntentCall != null && callId.equals(pendingIntentCall.callId)) pendingIntentCall = null;
        CallListenerService.clear(getContext(), callId);
        call.resolve();
    }

    @PluginMethod
    public void getPendingCall(PluginCall call) {
        CallListenerService.IncomingCallPayload pending = takePendingCall();
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "getPendingCall",
            "available", pending != null);
        JSObject result = toCallJson(pending);
        result.put("available", pending != null);
        call.resolve(result);
    }

    @PluginMethod
    public void getRuntimeLogs(PluginCall call) {
        JSObject result = new JSObject();
        result.put("entriesJson", EChatNativeLog.snapshotJson(getContext()));
        call.resolve(result);
    }

    private void emitPendingCall(boolean retainUntilConsumed) {
        CallListenerService.IncomingCallPayload pending = takePendingCall();
        if (pending != null) notifyListeners("callListenerIncoming", toCallJson(pending), false);
    }

    private CallListenerService.IncomingCallPayload takePendingCall() {
        if (pendingIntentCall != null) {
            CallListenerService.IncomingCallPayload result = pendingIntentCall;
            pendingIntentCall = null;
            if (!CallListenerService.isCallRecentlyCleared(getContext(), result.callId)) return result;
        }
        return CallListenerService.consumePendingCall(getContext());
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

    private static CallListenerService.IncomingCallPayload fromIntent(Intent intent) {
        CallListenerService.IncomingCallPayload result = new CallListenerService.IncomingCallPayload();
        result.conversationId = intent.getStringExtra(CallListenerService.EXTRA_CONVERSATION_ID);
        result.callId = intent.getStringExtra(CallListenerService.EXTRA_CALL_ID);
        result.mode = intent.getStringExtra(CallListenerService.EXTRA_MODE);
        result.callerId = intent.getStringExtra(CallListenerService.EXTRA_CALLER_ID);
        result.callerName = intent.getStringExtra(CallListenerService.EXTRA_CALLER_NAME);
        result.callerAvatarUrl = intent.getStringExtra(CallListenerService.EXTRA_CALLER_AVATAR_URL);
        return result;
    }

    @PluginMethod
    public void playAlertSound(PluginCall call) {
        String kind = call.getString("kind", "message");
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "playAlertSound", "kind", kind);
        boolean incomingCall = "voice-call".equals(kind) || "video-call".equals(kind);
        boolean outgoingCall = "outgoing-call".equals(kind);
        boolean callSound = incomingCall || outgoingCall;
        MediaPlayer existing = callSound ? callPlayer : messagePlayer;
        releasePlayer(existing);
        int resourceId = getContext().getResources().getIdentifier(
            outgoingCall ? "echat_ringback" : incomingCall ? "echat_call" : "echat_message",
            "raw",
            getContext().getPackageName()
        );
        if (resourceId == 0) {
            call.reject("提示音资源不存在");
            return;
        }
        try {
            if (outgoingCall) routeOutgoingRingbackToSpeaker();
            Uri uri = Uri.parse("android.resource://" + getContext().getPackageName() + "/" + resourceId);
            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(outgoingCall
                    ? AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
                    : incomingCall ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE : AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setDataSource(getContext(), uri);
            player.setVolume(1.0f, 1.0f);
            player.setLooping(callSound);
            player.setOnCompletionListener(completed -> {
                releasePlayer(completed);
                if (completed == messagePlayer) messagePlayer = null;
            });
            player.prepare();
            player.start();
            if (callSound) callPlayer = player;
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
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "stopAlertSound", "kind", kind);
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

    private void routeOutgoingRingbackToSpeaker() {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    audioManager.setCommunicationDevice(device);
                    return;
                }
            }
        }
        audioManager.setSpeakerphoneOn(true);
    }

    @PluginMethod
    public void getBackgroundCallSupport(PluginCall call) {
        JSObject support = backgroundCallSupport();
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "getBackgroundCallSupport",
            "manufacturer", support.getString("manufacturer"),
            "harmonyCompatible", support.getBool("harmonyCompatible"),
            "batteryOptimizationIgnored", support.getBool("batteryOptimizationIgnored"));
        call.resolve(support);
    }

    @PluginMethod
    public void requestBackgroundCallExemption(PluginCall call) {
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignored = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName());
        android.content.SharedPreferences preferences = getContext().getSharedPreferences("echat_background_calls", Context.MODE_PRIVATE);
        boolean requested = preferences.getBoolean("battery_exemption_requested", false);
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "requestBackgroundCallExemption",
            "force", force,
            "alreadyIgnored", ignored,
            "previouslyRequested", requested);
        if (!ignored && (force || !requested) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            preferences.edit().putBoolean("battery_exemption_requested", true).apply();
            try {
                Intent intent = new Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(intent);
            } catch (Exception ignoredError) {
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignoredAgain) {
                    // Personal center still exposes application/vendor settings.
                }
            }
        }
        call.resolve(backgroundCallSupport());
    }

    @PluginMethod
    public void openBackgroundCallSettings(PluginCall call) {
        boolean opened = false;
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        List<ComponentName> candidates = new ArrayList<>();
        if (manufacturer.contains("huawei")) {
            candidates.add(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            ));
            candidates.add(new ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity"
            ));
        }
        if (manufacturer.contains("honor")) {
            candidates.add(new ComponentName(
                "com.hihonor.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            ));
        }
        for (ComponentName component : candidates) {
            try {
                getActivity().startActivity(new Intent().setComponent(component));
                opened = true;
                break;
            } catch (Exception ignored) {
                // Try the next vendor-specific screen.
            }
        }
        if (!opened) {
            try {
                getActivity().startActivity(new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName())
                ));
                opened = true;
            } catch (Exception ignored) {
                // No compatible settings screen exists.
            }
        }
        JSObject result = new JSObject();
        result.put("opened", opened);
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "openBackgroundCallSettings",
            "opened", opened,
            "manufacturer", Build.MANUFACTURER);
        call.resolve(result);
    }

    private JSObject backgroundCallSupport() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String display = Build.DISPLAY == null ? "" : Build.DISPLAY;
        String fingerprint = Build.FINGERPRINT == null ? "" : Build.FINGERPRINT;
        String platform = (manufacturer + " " + display + " " + fingerprint).toLowerCase(Locale.ROOT);
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("manufacturer", manufacturer);
        result.put("harmonyCompatible", platform.contains("huawei") || platform.contains("honor") || platform.contains("harmony"));
        result.put(
            "batteryOptimizationIgnored",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName())
        );
        return result;
    }

    @PluginMethod
    public void setCallAudioRoute(PluginCall call) {
        boolean speaker = Boolean.TRUE.equals(call.getBoolean("speaker", false));
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "setCallAudioRoute", "speaker", speaker);
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setMicrophoneMute(false);
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
            if (target == null || !applied) {
                audioManager.setSpeakerphoneOn(speaker);
                applied = true;
            }
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
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "endCallAudioSession");
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
        EChatNativeLog.info(getContext(), "android-lifecycle", "MediaPermissions handleOnResume");
        CallListenerService.setAppActive(getContext(), true);
        emitPendingCall(true);
    }

    @Override
    protected void handleOnPause() {
        EChatNativeLog.info(getContext(), "android-lifecycle", "MediaPermissions handleOnPause");
        CallListenerService.setAppActive(getContext(), false);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        EChatNativeLog.info(getContext(), "android-lifecycle", "MediaPermissions handleOnNewIntent",
            "hasCallId", intent != null && intent.hasExtra(CallListenerService.EXTRA_CALL_ID));
        CallListenerService.setAppActive(getContext(), true);
        if (intent != null && intent.hasExtra(CallListenerService.EXTRA_CALL_ID)) {
            CallListenerService.IncomingCallPayload candidate = fromIntent(intent);
            if (!CallListenerService.isCallRecentlyCleared(getContext(), candidate.callId))
                pendingIntentCall = candidate;
            emitPendingCall(false);
        } else emitPendingCall(false);
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        int googleAppId = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("firebaseConfigured", googleAppId != 0);
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "getCapabilities",
            "firebaseConfigured", googleAppId != 0);
        call.resolve(result);
    }

    @PluginMethod
    public void exportNativeRuntimeLog(PluginCall call) {
        try {
            byte[] content = EChatNativeLog.snapshotJson(getContext()).getBytes(StandardCharsets.UTF_8);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, "echat-native-runtime.jsonl");
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, "Download/EChat");
                uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("无法创建 Downloads 文件");
                try (java.io.OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("无法写入 Downloads 文件");
                    output.write(content);
                }
            } else {
                File file = new File(getContext().getCacheDir(), "echat-native-runtime.jsonl");
                try (FileOutputStream output = new FileOutputStream(file, false)) { output.write(content); }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            }
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType("application/json")
                .putExtra(Intent.EXTRA_SUBJECT, "E聊 Android 运行日志")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getActivity() != null) getActivity().startActivity(Intent.createChooser(share, "导出 E聊运行日志"));
            else getContext().startActivity(Intent.createChooser(share, "导出 E聊运行日志").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            EChatNativeLog.info(getContext(), "android-native-bridge-api", "exportNativeRuntimeLog", "success", true, "location", "Downloads/EChat");
            call.resolve();
        } catch (Exception error) {
            EChatNativeLog.error(getContext(), "android-native-bridge-api", "exportNativeRuntimeLog failed", error);
            call.reject("无法导出运行日志", error);
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        boolean cameraGranted = hasSystemPermission(Manifest.permission.CAMERA);
        boolean microphoneGranted = hasSystemPermission(Manifest.permission.RECORD_AUDIO);
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "requestPermissions",
            "cameraRequested", Boolean.TRUE.equals(call.getBoolean("camera", false)),
            "microphoneRequested", Boolean.TRUE.equals(call.getBoolean("microphone", false)),
            "cameraGrantedBefore", cameraGranted,
            "microphoneGrantedBefore", microphoneGranted,
            "activityResumed", getActivity() != null && !getActivity().isFinishing() && !getActivity().isDestroyed());
        List<String> aliases = new ArrayList<>();
        if (Boolean.TRUE.equals(call.getBoolean("camera", false)) && !hasSystemPermission(Manifest.permission.CAMERA)) {
            aliases.add("camera");
        }
        if (Boolean.TRUE.equals(call.getBoolean("microphone", false)) && !hasSystemPermission(Manifest.permission.RECORD_AUDIO)) {
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
        EChatNativeLog.info(getContext(), "android-native-bridge-api", "permissionCallback",
            "cameraGrantedAfter", hasSystemPermission(Manifest.permission.CAMERA),
            "microphoneGrantedAfter", hasSystemPermission(Manifest.permission.RECORD_AUDIO));
        resolveState(call);
    }

    private void resolveState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("camera", hasSystemPermission(Manifest.permission.CAMERA));
        result.put("microphone", hasSystemPermission(Manifest.permission.RECORD_AUDIO));
        call.resolve(result);
    }

    private boolean hasSystemPermission(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
}
