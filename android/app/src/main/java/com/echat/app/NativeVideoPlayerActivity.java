package com.echat.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

public class NativeVideoPlayerActivity extends AppCompatActivity {
    public static final String EXTRA_VIDEO_URL = "VIDEO_URL";
    private ExoPlayer player;
    private PlayerView playerView;
    private String videoUrl;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        setContentView(R.layout.activity_native_video_player);
        playerView = findViewById(R.id.native_player_view);
        openVideo(getIntent(), "onCreate");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        releasePlayer("switch to next video");
        openVideo(intent, "onNewIntent");
    }

    private void openVideo(Intent intent, String source) {
        String requestedUrl = intent == null ? null : intent.getStringExtra(EXTRA_VIDEO_URL);
        if (requestedUrl == null || requestedUrl.isBlank()) {
            EChatNativeLog.error(this, "android-video-player", "Native player opened without URL",
                new IllegalArgumentException("VIDEO_URL is empty"));
            finish();
            return;
        }
        videoUrl = requestedUrl;
        Uri uri = Uri.parse(videoUrl);
        EChatNativeLog.info(this, "android-video-player", "Native ExoPlayer opened",
            "source", source,
            "urlScheme", uri.getScheme(),
            "urlLength", videoUrl.length());

        try {
            player = new ExoPlayer.Builder(this).build();
            playerView.setPlayer(player);
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (player == null) return;
                    EChatNativeLog.info(NativeVideoPlayerActivity.this, "android-video-player",
                        "ExoPlayer playback state",
                        "state", state,
                        "bufferedPositionMs", player.getBufferedPosition(),
                        "currentPositionMs", player.getCurrentPosition());
                }

                @Override
                public void onIsLoadingChanged(boolean isLoading) {
                    if (player == null) return;
                    EChatNativeLog.info(NativeVideoPlayerActivity.this, "android-video-player",
                        "ExoPlayer loading changed", "isLoading", isLoading,
                        "bufferedPositionMs", player.getBufferedPosition());
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    EChatNativeLog.error(NativeVideoPlayerActivity.this, "android-video-player",
                        "ExoPlayer playback failed", error);
                }
            });
            player.setMediaItem(MediaItem.fromUri(uri));
            player.setPlayWhenReady(true);
            player.prepare();
            EChatNativeLog.info(this, "android-video-player", "ExoPlayer prepare requested");
        } catch (RuntimeException error) {
            EChatNativeLog.error(this, "android-video-player", "ExoPlayer initialization failed", error);
            releasePlayer("initialization failure");
            finish();
        }
    }

    private void releasePlayer(String reason) {
        if (player != null) {
            EChatNativeLog.info(this, "android-video-player", "Native ExoPlayer released",
                "reason", reason,
                "currentPositionMs", player.getCurrentPosition(),
                "bufferedPositionMs", player.getBufferedPosition());
            player.stop();
            player.release();
            player = null;
        }
        if (playerView != null) playerView.setPlayer(null);
    }

    @Override
    protected void onStop() {
        releasePlayer("Activity stopped / conversation exited");
        super.onStop();
    }
}

