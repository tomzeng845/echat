package com.echat.app;

import android.content.Context;
import android.net.Uri;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Persistent, cross-process diagnostics for Android/Harmony background-call code. */
public final class EChatNativeLog {
    private static final String FILE_NAME = "echat-native-runtime.jsonl";
    private static final long MAX_FILE_BYTES = 1024L * 1024L;
    private static final int MAX_EXPORTED_ENTRIES = 500;

    private EChatNativeLog() {}

    public static void info(Context context, String scope, String message, Object... details) {
        append(context, "info", scope, message, details);
    }

    public static void warn(Context context, String scope, String message, Object... details) {
        append(context, "warn", scope, message, details);
    }

    public static void error(Context context, String scope, String message, Throwable error, Object... details) {
        JSONObject payload = details(details);
        if (error != null) {
            safePut(payload, "errorType", error.getClass().getName());
            safePut(payload, "errorMessage", safeText(error.getMessage()));
        }
        appendObject(context, "error", scope, message, payload);
    }

    public static String snapshotJson(Context context) {
        JSONArray entries = new JSONArray();
        ArrayDeque<String> lines = new ArrayDeque<>();
        File file = logFile(context);
        if (!file.exists()) return entries.toString();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
            new FileInputStream(file), StandardCharsets.UTF_8
        ))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                lines.addLast(line);
                if (lines.size() > MAX_EXPORTED_ENTRIES) lines.removeFirst();
            }
            for (String value : lines) {
                try {
                    entries.put(new JSONObject(value));
                } catch (Exception ignored) {
                    // Ignore a partial line left by a process termination.
                }
            }
        } catch (Exception error) {
            JSONObject fallback = new JSONObject();
            safePut(fallback, "at", isoNow());
            safePut(fallback, "level", "error");
            safePut(fallback, "scope", "android-native-log");
            safePut(fallback, "message", "Unable to read persistent native log");
            safePut(fallback, "details", details("errorType", error.getClass().getName(), "errorMessage", safeText(error.getMessage())));
            entries.put(fallback);
        }
        return entries.toString();
    }

    public static String safeEndpoint(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try {
            Uri uri = Uri.parse(raw);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            String host = uri.getHost() == null ? "" : uri.getHost();
            int port = uri.getPort();
            String authority = port > 0 ? host + ":" + port : host;
            return scheme + "://" + authority + (uri.getPath() == null ? "" : uri.getPath());
        } catch (Exception ignored) {
            int query = raw.indexOf('?');
            return query >= 0 ? raw.substring(0, query) : raw;
        }
    }

    private static void append(Context context, String level, String scope, String message, Object... values) {
        appendObject(context, level, scope, message, details(values));
    }

    private static void appendObject(Context context, String level, String scope, String message, JSONObject details) {
        if (context == null) return;
        try {
            JSONObject entry = new JSONObject();
            entry.put("at", isoNow());
            entry.put("level", level);
            entry.put("scope", scope == null ? "android-native" : scope);
            entry.put("message", message == null ? "" : message);
            if (details.length() > 0) entry.put("details", details);
            byte[] line = (entry.toString() + "\n").getBytes(StandardCharsets.UTF_8);
            File file = logFile(context);
            if (file.length() > MAX_FILE_BYTES) {
                File previous = new File(file.getParentFile(), FILE_NAME + ".previous");
                if (previous.exists()) previous.delete();
                file.renameTo(previous);
            }
            try (FileOutputStream output = new FileOutputStream(file, true)) {
                output.write(line);
                output.flush();
            }
        } catch (Exception ignored) {
            // Diagnostics must never break call reception.
        }
    }

    private static File logFile(Context context) {
        Context storage = context;
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N)
                storage = context.createDeviceProtectedStorageContext();
        } catch (Exception ignored) {
            storage = context;
        }
        return new File(storage.getFilesDir(), FILE_NAME);
    }

    private static JSONObject details(Object... values) {
        JSONObject result = new JSONObject();
        if (values == null) return result;
        for (int index = 0; index + 1 < values.length; index += 2) {
            String key = String.valueOf(values[index]);
            Object value = values[index + 1];
            String lower = key.toLowerCase(Locale.ROOT);
            if (lower.contains("token") || lower.contains("authorization") || lower.contains("password") || lower.contains("secret")) {
                safePut(result, key, value == null ? "absent" : "[REDACTED]");
            } else {
                safePut(result, key, value == null ? JSONObject.NULL : value);
            }
        }
        return result;
    }

    private static void safePut(JSONObject target, String key, Object value) {
        try {
            target.put(key, value);
        } catch (Exception ignored) {
            // Ignore unsupported diagnostic values.
        }
    }

    private static String safeText(String value) {
        if (value == null) return "";
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
