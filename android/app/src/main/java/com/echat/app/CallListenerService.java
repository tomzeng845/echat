package com.echat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.AlarmManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.microsoft.signalr.HubConnection;
import com.microsoft.signalr.HubConnectionBuilder;
import com.microsoft.signalr.HubConnectionState;
import io.reactivex.rxjava3.core.Single;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class CallListenerService extends Service {
    public static final String ACTION_CONFIGURE = "com.echat.app.action.CONFIGURE_CALL_LISTENER";
    public static final String ACTION_STOP = "com.echat.app.action.STOP_CALL_LISTENER";
    public static final String ACTION_APP_STATE = "com.echat.app.action.CALL_LISTENER_APP_STATE";
    public static final String ACTION_CLEAR = "com.echat.app.action.CLEAR_INCOMING_CALL";
    public static final String ACTION_RESTART = "com.echat.app.action.RESTART_CALL_LISTENER";
    public static final String ACTION_WATCHDOG = "com.echat.app.action.CALL_LISTENER_WATCHDOG";
    public static final String ACTION_INCOMING = "com.echat.app.event.INCOMING_CALL";
    public static final String ACTION_CLEARED = "com.echat.app.event.CALL_CLEARED";
    public static final String EXTRA_HUB_URL = "hubUrl";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_USER_ID = "userId";
    public static final String EXTRA_ACTIVE = "active";
    public static final String EXTRA_CONVERSATION_ID = "conversationId";
    public static final String EXTRA_CALL_ID = "callId";
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_CALLER_ID = "callerId";
    public static final String EXTRA_CALLER_NAME = "callerName";
    public static final String EXTRA_CALLER_AVATAR_URL = "callerAvatarUrl";
    private static final String EXTRA_CLEARED_CALL_ID = "clearedCallId";
    private static final String EXTRA_CLEARED_AT = "clearedAt";

    private static final String PREFS = "echat_call_listener";
    private static final String LISTENER_CHANNEL = "call-listener-v1";
    private static final String CALL_CHANNEL = "calls-v3";
    private static final int LISTENER_NOTIFICATION_ID = 7300;
    private static final int CALL_NOTIFICATION_BASE = 7400;
    private static final int RESTART_REQUEST_ID = 7301;
    private static final int WATCHDOG_REQUEST_ID = 7302;
    private static final long WATCHDOG_INTERVAL_MS = 45_000L;

    private final Handler reconnectHandler = new Handler(Looper.getMainLooper());
    private final AtomicInteger generation = new AtomicInteger();
    private final ConcurrentHashMap<String, Long> recentlyClearedCalls = new ConcurrentHashMap<>();
    private HubConnection hubConnection;
    private MediaPlayer ringtone;
    private int reconnectAttempt;
    private boolean appActive = true;
    private boolean stopping;
    private boolean explicitStopRequested;
    private IncomingCallPayload activeCall;
    private PowerManager.WakeLock wakeLock;

    public static void start(Context context, String hubUrl, String token, String userId) {
        EChatNativeLog.info(context, "android-call-listener-api", "start",
            "hubUrl", EChatNativeLog.safeEndpoint(hubUrl),
            "credentialPresent", token != null && !token.isBlank(),
            "hasUserId", userId != null && !userId.isBlank());
        preferences(context).edit()
            .putString(EXTRA_HUB_URL, hubUrl)
            .putString(EXTRA_TOKEN, token)
            .putString(EXTRA_USER_ID, userId)
            .putBoolean(EXTRA_ACTIVE, true)
            .apply();
        Intent intent = new Intent(context, CallListenerService.class)
            .setAction(ACTION_CONFIGURE)
            .putExtra(EXTRA_HUB_URL, hubUrl)
            .putExtra(EXTRA_TOKEN, token)
            .putExtra(EXTRA_USER_ID, userId);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void restore(Context context) {
        SharedPreferences prefs = preferences(context);
        String hubUrl = prefs.getString(EXTRA_HUB_URL, "");
        String token = prefs.getString(EXTRA_TOKEN, "");
        EChatNativeLog.info(context, "android-call-listener-api", "restore",
            "hubUrl", EChatNativeLog.safeEndpoint(hubUrl),
            "credentialPresent", !token.isEmpty());
        if (hubUrl.isEmpty() || token.isEmpty()) return;
        Intent intent = new Intent(context, CallListenerService.class)
            .setAction(ACTION_RESTART);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stop(Context context) {
        SharedPreferences prefs = preferences(context);
        EChatNativeLog.info(context, "android-call-listener-api", "stop",
            "configured", !prefs.getString(EXTRA_TOKEN, "").isEmpty());
        if (prefs.getString(EXTRA_TOKEN, "").isEmpty()) {
            prefs.edit().clear().apply();
            return;
        }
        context.startService(new Intent(context, CallListenerService.class).setAction(ACTION_STOP));
    }

    public static void setAppActive(Context context, boolean active) {
        SharedPreferences prefs = preferences(context);
        if (prefs.getString(EXTRA_TOKEN, "").isEmpty()) return;
        prefs.edit().putBoolean(EXTRA_ACTIVE, active).apply();
        EChatNativeLog.info(context, "android-call-listener-api", "setAppActive", "active", active);
        ContextCompat.startForegroundService(context,
            new Intent(context, CallListenerService.class)
                .setAction(ACTION_APP_STATE)
                .putExtra(EXTRA_ACTIVE, active)
        );
    }

    public static void clear(Context context, String callId) {
        SharedPreferences prefs = preferences(context);
        if (prefs.getString(EXTRA_TOKEN, "").isEmpty()) return;
        EChatNativeLog.info(context, "android-call-listener-api", "clearCallAlert",
            "hasCallId", callId != null && !callId.isBlank());
        ContextCompat.startForegroundService(context,
            new Intent(context, CallListenerService.class)
                .setAction(ACTION_CLEAR)
                .putExtra(EXTRA_CALL_ID, callId)
        );
    }

    @Override
    public void onCreate() {
        super.onCreate();
        stopping = false;
        explicitStopRequested = false;
        // If Harmony/Android recreates this service while the screen is locked,
        // the last persisted foreground value may still be true. Treat a
        // process restart as background until the foreground WebView explicitly
        // configures the listener again; otherwise an incoming call is received
        // by SignalR but no lock-screen notification is shown.
        appActive = false;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EChat:CallListener");
        wakeLock.setReferenceCounted(false);
        renewWakeLock();
        createChannels();
        startForeground(LISTENER_NOTIFICATION_ID, listenerNotification("正在连接来电服务…"));
        scheduleWatchdog();
        EChatNativeLog.info(this, "android-call-listener", "Service created",
            "sdk", Build.VERSION.SDK_INT,
            "manufacturer", Build.MANUFACTURER,
            "wakeLockHeld", wakeLock != null && wakeLock.isHeld());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        EChatNativeLog.info(this, "android-call-listener-api", "onStartCommand",
            "action", action == null ? "null" : action,
            "flags", flags,
            "startId", startId,
            "appActive", appActive,
            "connectionState", hubConnection == null ? "none" : hubConnection.getConnectionState().name());
        if (ACTION_STOP.equals(action)) {
            stopListener();
            return START_NOT_STICKY;
        }
        if (ACTION_RESTART.equals(action) || ACTION_WATCHDOG.equals(action)) {
            renewWakeLock();
            scheduleWatchdog();
            connect();
            return START_STICKY;
        }
        if (ACTION_APP_STATE.equals(action)) {
            appActive = intent.getBooleanExtra(EXTRA_ACTIVE, true);
            preferences().edit().putBoolean(EXTRA_ACTIVE, appActive).apply();
            EChatNativeLog.info(this, "android-call-listener-state", "App state changed",
                "active", appActive,
                "hasActiveCall", activeCall != null,
                "connectionState", hubConnection == null ? "none" : hubConnection.getConnectionState().name());
            if (appActive) stopBackgroundAlert();
            else if (activeCall != null) showIncomingCall(activeCall);
            return START_STICKY;
        }
        if (ACTION_CLEAR.equals(action)) {
            EChatNativeLog.info(this, "android-call-listener-state", "Clear call action received",
                "hasCallId", intent.hasExtra(EXTRA_CALL_ID),
                "hasActiveCall", activeCall != null,
                "reason", "answering");
            clearCall(intent.getStringExtra(EXTRA_CALL_ID), "answering");
            return START_STICKY;
        }
        if (ACTION_CONFIGURE.equals(action)) {
            String hubUrl = intent.getStringExtra(EXTRA_HUB_URL);
            String token = intent.getStringExtra(EXTRA_TOKEN);
            String userId = intent.getStringExtra(EXTRA_USER_ID);
            if (hubUrl != null && token != null) {
                preferences().edit()
                    .putString(EXTRA_HUB_URL, hubUrl)
                    .putString(EXTRA_TOKEN, token)
                    .putString(EXTRA_USER_ID, userId == null ? "" : userId)
                    .apply();
                appActive = preferences().getBoolean(EXTRA_ACTIVE, false);
                reconnectNow();
            }
        } else {
            connect();
        }
        return START_STICKY;
    }

    private void reconnectNow() {
        reconnectHandler.removeCallbacksAndMessages(null);
        disconnect();
        connect();
    }

    private synchronized void connect() {
        if (explicitStopRequested) return;
        SharedPreferences prefs = preferences();
        String hubUrl = prefs.getString(EXTRA_HUB_URL, "");
        String token = prefs.getString(EXTRA_TOKEN, "");
        if (hubUrl.isEmpty() || token.isEmpty()) {
            EChatNativeLog.warn(this, "android-call-listener-signalr", "Missing persisted listener configuration",
                "hasHubUrl", !hubUrl.isEmpty(), "credentialPresent", !token.isEmpty());
            stopListener();
            return;
        }
        if (hubConnection != null && hubConnection.getConnectionState() != HubConnectionState.DISCONNECTED) {
            EChatNativeLog.info(this, "android-call-listener-signalr", "Connect skipped",
                "state", hubConnection.getConnectionState().name());
            return;
        }

        int currentGeneration = generation.incrementAndGet();
        EChatNativeLog.info(this, "android-call-listener-signalr", "Connect started",
            "generation", currentGeneration,
            "hubUrl", EChatNativeLog.safeEndpoint(hubUrl),
            "appActive", appActive,
            "networkConnected", isNetworkConnected());
        hubConnection = HubConnectionBuilder.create(hubUrl)
            .withAccessTokenProvider(Single.defer(() -> Single.just(preferences().getString(EXTRA_TOKEN, ""))))
            .build();
        hubConnection.setKeepAliveInterval(15_000L);
        hubConnection.setServerTimeout(45_000L);
        hubConnection.on("call.invited", this::handleInvite, IncomingCallPayload.class);
        hubConnection.on("call.accepted", payload -> clearCall(payload.callId, "accepted"), CallStatePayload.class);
        hubConnection.on("call.rejected", payload -> clearCall(payload.callId, "rejected"), CallStatePayload.class);
        hubConnection.on("call.ended", payload -> clearCall(payload.callId, "ended"), CallStatePayload.class);
        hubConnection.on("call.listener.cleared", payload -> clearCall(payload.callId, payload.reason), CallStatePayload.class);
        hubConnection.onClosed(error -> {
            EChatNativeLog.error(this, "android-call-listener-signalr", "Connection closed", error,
                "generation", currentGeneration,
                "currentGeneration", generation.get(),
                "explicitStop", explicitStopRequested,
                "networkConnected", isNetworkConnected());
            if (generation.get() == currentGeneration && !explicitStopRequested) scheduleReconnect();
        });
        hubConnection.start().subscribe(
            () -> {
                if (generation.get() != currentGeneration) return;
                reconnectAttempt = 0;
                updateListenerNotification("来电服务运行中");
                EChatNativeLog.info(this, "android-call-listener-signalr", "Connect succeeded",
                    "generation", currentGeneration,
                    "state", hubConnection == null ? "none" : hubConnection.getConnectionState().name());
            },
            error -> {
                EChatNativeLog.error(this, "android-call-listener-signalr", "Connect failed", error,
                    "generation", currentGeneration,
                    "networkConnected", isNetworkConnected());
                if (generation.get() == currentGeneration && !explicitStopRequested) scheduleReconnect();
            }
        );
    }

    private void scheduleReconnect() {
        long[] delays = { 1_000L, 3_000L, 8_000L, 15_000L, 30_000L, 60_000L };
        long delay = delays[Math.min(reconnectAttempt++, delays.length - 1)];
        EChatNativeLog.warn(this, "android-call-listener-signalr", "Reconnect scheduled",
            "attempt", reconnectAttempt,
            "delayMs", delay,
            "networkConnected", isNetworkConnected());
        updateListenerNotification("连接中断，正在重连…");
        reconnectHandler.removeCallbacksAndMessages(null);
        reconnectHandler.postDelayed(this::connect, delay);
    }

    private void handleInvite(IncomingCallPayload invite) {
        if (invite == null || invite.callId == null || invite.conversationId == null) {
            EChatNativeLog.warn(this, "android-call-listener-event", "Invalid call.invited payload");
            return;
        }
        EChatNativeLog.info(this, "android-call-listener-event", "SignalR event received",
            "method", "call.invited",
            "mode", invite.mode,
            "appActive", appActive,
            "callIdSuffix", suffix(invite.callId));
        if (invite.callerId != null && invite.callerId.equals(preferences().getString(EXTRA_USER_ID, ""))) return;
        if (wasRecentlyCleared(invite.callId)) return;
        if (activeCall != null && invite.callId.equals(activeCall.callId)) return;
        activeCall = invite;
        if (!appActive) {
            savePendingCall(invite);
            Intent event = new Intent(ACTION_INCOMING).setPackage(getPackageName());
            putCallExtras(event, invite);
            sendBroadcast(event);
            showIncomingCall(invite);
        }
    }

    private void showIncomingCall(IncomingCallPayload invite) {
        createChannels();
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("echat_notification_type", "call");
        putCallExtras(open, invite);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            stableNotificationId(invite.callId),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String callerName = invite.callerName == null || invite.callerName.isBlank() ? "E聊来电" : invite.callerName;
        String body = "video".equals(invite.mode) ? "邀请你进行视频通话" : "邀请你进行语音通话";
        int soundId = getResources().getIdentifier("echat_call", "raw", getPackageName());
        Uri soundUri = soundId == 0 ? null : Uri.parse("android.resource://" + getPackageName() + "/" + soundId);
        Notification notification = new NotificationCompat.Builder(this, CALL_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_echat)
            .setColor(0xFF12D6B0)
            .setContentTitle(callerName)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPublicVersion(new NotificationCompat.Builder(this, CALL_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_echat)
                .setContentTitle(callerName)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build())
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setContentIntent(contentIntent)
            .setFullScreenIntent(contentIntent, true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setDefaults(Notification.DEFAULT_ALL)
            .setTimeoutAfter(60_000L)
            .setVibrate(new long[] { 0, 500, 300, 500 })
            .setSound(soundUri)
            .build();
        try {
            getSystemService(NotificationManager.class).notify(stableNotificationId(invite.callId), notification);
            EChatNativeLog.info(this, "android-call-notification", "Incoming call notification posted",
                "mode", invite.mode,
                "callIdSuffix", suffix(invite.callId),
                "notificationId", stableNotificationId(invite.callId),
                "appActive", appActive,
                "notificationsEnabled", notificationsEnabled());
        } catch (Throwable error) {
            EChatNativeLog.error(this, "android-call-notification", "Incoming call notification post failed", error,
                "callIdSuffix", suffix(invite.callId),
                "notificationsEnabled", notificationsEnabled());
        }
        startRingtone();
    }

    private void clearCall(String callId, String reason) {
        if (callId == null || callId.isBlank()) return;
        EChatNativeLog.info(this, "android-call-listener-event", "Call cleared",
            "reason", reason == null ? "ended" : reason,
            "callIdSuffix", suffix(callId));
        boolean duplicateClear = wasRecentlyCleared(callId);
        rememberCleared(callId);
        getSystemService(NotificationManager.class).cancel(stableNotificationId(callId));
        if (activeCall != null && callId.equals(activeCall.callId)) {
            activeCall = null;
            clearPendingCall();
            stopRingtone();
        } else if (callId.equals(preferences().getString(EXTRA_CALL_ID, null))) {
            clearPendingCall();
        }
        if (duplicateClear) return;
        Intent event = new Intent(ACTION_CLEARED).setPackage(getPackageName())
            .putExtra(EXTRA_CALL_ID, callId)
            .putExtra("reason", reason == null ? "ended" : reason);
        sendBroadcast(event);
    }

    private boolean wasRecentlyCleared(String callId) {
        long now = System.currentTimeMillis();
        recentlyClearedCalls.entrySet().removeIf(entry -> now - entry.getValue() > 120_000L);
        Long clearedAt = recentlyClearedCalls.get(callId);
        if (clearedAt != null && now - clearedAt <= 120_000L) return true;
        return isCallRecentlyCleared(this, callId);
    }

    public static boolean isCallRecentlyCleared(Context context, String callId) {
        if (callId == null || callId.isBlank()) return false;
        SharedPreferences prefs = preferences(context);
        long now = System.currentTimeMillis();
        return callId.equals(prefs.getString(EXTRA_CLEARED_CALL_ID, null))
            && now - prefs.getLong(EXTRA_CLEARED_AT, 0L) <= 120_000L;
    }

    private void rememberCleared(String callId) {
        long now = System.currentTimeMillis();
        recentlyClearedCalls.put(callId, now);
        preferences().edit()
            .putString(EXTRA_CLEARED_CALL_ID, callId)
            .putLong(EXTRA_CLEARED_AT, now)
            .apply();
    }

    private void stopBackgroundAlert() {
        stopRingtone();
        if (activeCall != null) getSystemService(NotificationManager.class).cancel(stableNotificationId(activeCall.callId));
    }

    private void startRingtone() {
        stopRingtone();
        try {
            int soundId = getResources().getIdentifier("echat_call", "raw", getPackageName());
            Uri uri = Uri.parse("android.resource://" + getPackageName() + "/" + soundId);
            ringtone = new MediaPlayer();
            ringtone.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            ringtone.setDataSource(this, uri);
            ringtone.setLooping(true);
            ringtone.prepare();
            ringtone.start();
            EChatNativeLog.info(this, "android-call-notification", "Ringtone started");
        } catch (Exception error) {
            EChatNativeLog.error(this, "android-call-notification", "Ringtone failed", error);
            stopRingtone();
        }
    }

    private void stopRingtone() {
        if (ringtone == null) return;
        try {
            if (ringtone.isPlaying()) ringtone.stop();
        } catch (IllegalStateException ignored) {
            // Already stopped.
        }
        ringtone.reset();
        ringtone.release();
        ringtone = null;
    }

    private Notification listenerNotification(String status) {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            LISTENER_NOTIFICATION_ID,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, LISTENER_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_echat)
            .setColor(0xFF12D6B0)
            .setContentTitle("E聊正在接收来电")
            .setContentText(status)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private void updateListenerNotification(String status) {
        getSystemService(NotificationManager.class).notify(LISTENER_NOTIFICATION_ID, listenerNotification(status));
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel listener = new NotificationChannel(LISTENER_CHANNEL, "后台来电服务", NotificationManager.IMPORTANCE_LOW);
        listener.setDescription("保持 E聊来电连接；关闭后后台可能无法收到来电");
        listener.setSound(null, null);
        manager.createNotificationChannel(listener);

        NotificationChannel calls = new NotificationChannel(CALL_CHANNEL, "音视频通话", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("E聊语音与视频来电");
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        calls.setShowBadge(true);
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[] { 0, 500, 300, 500 });
        int soundId = getResources().getIdentifier("echat_call", "raw", getPackageName());
        if (soundId != 0) {
            Uri sound = Uri.parse("android.resource://" + getPackageName() + "/" + soundId);
            calls.setSound(sound, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        }
        manager.createNotificationChannel(calls);
        NotificationChannel current = manager.getNotificationChannel(CALL_CHANNEL);
        EChatNativeLog.info(this, "android-jpush-notification", "Call notification channel status",
            "channelId", CALL_CHANNEL,
            "notificationsEnabled", notificationsEnabled(),
            "importance", current == null ? -1 : current.getImportance(),
            "lockscreenVisibility", current == null ? -1 : current.getLockscreenVisibility(),
            "canBypassDnd", current != null && current.canBypassDnd(),
            "sdk", Build.VERSION.SDK_INT);
    }

    private void savePendingCall(IncomingCallPayload invite) {
        preferences().edit()
            .putString(EXTRA_CONVERSATION_ID, invite.conversationId)
            .putString(EXTRA_CALL_ID, invite.callId)
            .putString(EXTRA_MODE, invite.mode)
            .putString(EXTRA_CALLER_ID, invite.callerId)
            .putString(EXTRA_CALLER_NAME, invite.callerName)
            .putString(EXTRA_CALLER_AVATAR_URL, invite.callerAvatarUrl)
            .apply();
    }

    private void clearPendingCall() {
        preferences().edit()
            .remove(EXTRA_CONVERSATION_ID)
            .remove(EXTRA_CALL_ID)
            .remove(EXTRA_MODE)
            .remove(EXTRA_CALLER_ID)
            .remove(EXTRA_CALLER_NAME)
            .remove(EXTRA_CALLER_AVATAR_URL)
            .apply();
    }

    public static IncomingCallPayload consumePendingCall(Context context) {
        SharedPreferences prefs = preferences(context);
        String callId = prefs.getString(EXTRA_CALL_ID, null);
        if (callId == null) return null;
        if (isCallRecentlyCleared(context, callId)) {
            prefs.edit()
                .remove(EXTRA_CONVERSATION_ID)
                .remove(EXTRA_CALL_ID)
                .remove(EXTRA_MODE)
                .remove(EXTRA_CALLER_ID)
                .remove(EXTRA_CALLER_NAME)
                .remove(EXTRA_CALLER_AVATAR_URL)
                .apply();
            return null;
        }
        IncomingCallPayload result = new IncomingCallPayload();
        result.conversationId = prefs.getString(EXTRA_CONVERSATION_ID, "");
        result.callId = callId;
        result.mode = prefs.getString(EXTRA_MODE, "audio");
        result.callerId = prefs.getString(EXTRA_CALLER_ID, "");
        result.callerName = prefs.getString(EXTRA_CALLER_NAME, "E聊来电");
        result.callerAvatarUrl = prefs.getString(EXTRA_CALLER_AVATAR_URL, "");
        prefs.edit()
            .remove(EXTRA_CONVERSATION_ID)
            .remove(EXTRA_CALL_ID)
            .remove(EXTRA_MODE)
            .remove(EXTRA_CALLER_ID)
            .remove(EXTRA_CALLER_NAME)
            .remove(EXTRA_CALLER_AVATAR_URL)
            .apply();
        return result;
    }

    private static void putCallExtras(Intent intent, IncomingCallPayload invite) {
        intent.putExtra(EXTRA_CONVERSATION_ID, invite.conversationId)
            .putExtra(EXTRA_CALL_ID, invite.callId)
            .putExtra(EXTRA_MODE, invite.mode)
            .putExtra(EXTRA_CALLER_ID, invite.callerId)
            .putExtra(EXTRA_CALLER_NAME, invite.callerName)
            .putExtra(EXTRA_CALLER_AVATAR_URL, invite.callerAvatarUrl);
    }

    private int stableNotificationId(String value) {
        return CALL_NOTIFICATION_BASE + Math.abs(value.hashCode() % 10_000);
    }

    private static SharedPreferences preferences(Context context) {
        Context app = context.getApplicationContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N)
            return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Context device = app.createDeviceProtectedStorageContext();
        try {
            device.moveSharedPreferencesFrom(app, PREFS);
        } catch (Exception error) {
            EChatNativeLog.error(app, "android-call-listener", "Failed to migrate listener preferences", error);
        }
        return device.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences preferences() {
        return preferences(this);
    }

    private synchronized void disconnect() {
        generation.incrementAndGet();
        if (hubConnection != null) {
            HubConnection previous = hubConnection;
            hubConnection = null;
            previous.stop().subscribe(() -> {}, error -> {});
        }
    }

    private void stopListener() {
        explicitStopRequested = true;
        stopping = true;
        reconnectHandler.removeCallbacksAndMessages(null);
        cancelWatchdog();
        stopBackgroundAlert();
        clearPendingCall();
        preferences().edit().clear().apply();
        disconnect();
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        reconnectHandler.removeCallbacksAndMessages(null);
        stopBackgroundAlert();
        disconnect();
        releaseWakeLock();
        boolean configured = !preferences().getString(EXTRA_TOKEN, "").isEmpty();
        EChatNativeLog.warn(this, "android-call-listener", "Service destroyed",
            "explicitStop", explicitStopRequested,
            "configured", configured,
            "networkConnected", isNetworkConnected());
        if (!explicitStopRequested && configured) scheduleRestart(5_000L, ACTION_RESTART, RESTART_REQUEST_ID);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        EChatNativeLog.warn(this, "android-call-listener", "Task removed",
            "explicitStop", explicitStopRequested);
        if (!explicitStopRequested) scheduleRestart(3_000L, ACTION_RESTART, RESTART_REQUEST_ID);
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleRestart(long delayMs, String action, int requestId) {
        if (preferences().getString(EXTRA_TOKEN, "").isEmpty()) return;
        Intent intent = new Intent(this, CallListenerService.class)
            .setAction(action);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? PendingIntent.getForegroundService(this, requestId, intent, pendingFlags)
            : PendingIntent.getService(this, requestId, intent, pendingFlags);
        AlarmManager alarm = (AlarmManager) getSystemService(ALARM_SERVICE);
        long at = System.currentTimeMillis() + delayMs;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } else {
            alarm.set(AlarmManager.RTC_WAKEUP, at, pending);
        }
        EChatNativeLog.info(this, "android-call-listener-watchdog", "Alarm scheduled",
            "action", action,
            "delayMs", delayMs,
            "requestId", requestId);
    }

    private void scheduleWatchdog() {
        if (explicitStopRequested || preferences().getString(EXTRA_TOKEN, "").isEmpty()) return;
        scheduleRestart(WATCHDOG_INTERVAL_MS, ACTION_WATCHDOG, WATCHDOG_REQUEST_ID);
    }

    private void cancelWatchdog() {
        Intent intent = new Intent(this, CallListenerService.class).setAction(ACTION_WATCHDOG);
        int pendingFlags = PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? PendingIntent.getForegroundService(this, WATCHDOG_REQUEST_ID, intent, pendingFlags)
            : PendingIntent.getService(this, WATCHDOG_REQUEST_ID, intent, pendingFlags);
        if (pending != null) {
            ((AlarmManager) getSystemService(ALARM_SERVICE)).cancel(pending);
            pending.cancel();
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private void renewWakeLock() {
        if (wakeLock == null) {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EChat:CallListener");
            wakeLock.setReferenceCounted(false);
        }
        if (wakeLock.isHeld()) wakeLock.release();
        wakeLock.acquire(10 * 60_000L);
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager manager = getSystemService(ConnectivityManager.class);
            Network network = manager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception error) {
            return false;
        }
    }

    private boolean notificationsEnabled() {
        try {
            return getSystemService(NotificationManager.class).areNotificationsEnabled();
        } catch (Exception error) {
            return false;
        }
    }

    private static String suffix(String value) {
        if (value == null || value.isBlank()) return "";
        return value.length() <= 8 ? value : value.substring(value.length() - 8);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static class IncomingCallPayload {
        public String conversationId;
        public String callId;
        public String mode;
        public String callerId;
        public String callerName;
        public String callerAvatarUrl;
    }

    public static class CallStatePayload {
        public String callId;
        public String reason;
    }
}
