package com.echat.app;

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
    private String videoUrl;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        setContentView(R.layout.activity_native_video_player);

        videoUrl = getIntent().getStringExtra(EXTRA_VIDEO_URL);
        if (videoUrl == null || videoUrl.isBlank()) {
            EChatNativeLog.error(this, "android-video-player", "Native player opened without URL",
                new IllegalArgumentException("VIDEO_URL is empty"));
            finish();
            return;
        }
        EChatNativeLog.info(this, "android-video-player", "Native ExoPlayer opened",
            "urlScheme", Uri.parse(videoUrl).getScheme(),
            "urlLength", videoUrl.length());

        PlayerView playerView = findViewById(R.id.native_player_view);
        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                EChatNativeLog.info(NativeVideoPlayerActivity.this, "android-video-player",
                    "ExoPlayer playback state",
                    "state", state,
                    "bufferedPositionMs", player.getBufferedPosition(),
                    "currentPositionMs", player.getCurrentPosition());
            }

            @Override
            public void onIsLoadingChanged(boolean isLoading) {
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
        player.setMediaItem(MediaItem.fromUri(Uri.parse(videoUrl)));
        player.setPlayWhenReady(true);
        player.prepare();
    }

    @Override
    protected void onStop() {
        if (player != null) {
            EChatNativeLog.info(this, "android-video-player", "Native ExoPlayer released",
                "currentPositionMs", player.getCurrentPosition(),
                "bufferedPositionMs", player.getBufferedPosition());
            player.release();
            player = null;
        }
        super.onStop();
    }
}
