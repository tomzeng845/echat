package com.echat.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.AspectRatioFrameLayout;

public class NativeVideoPlayerActivity extends Activity {
    public static final String EXTRA_VIDEO_URL = "VIDEO_URL";
    private ExoPlayer player;
    private PlayerView playerView;
    private String videoUrl;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        EChatNativeLog.info(this, "android-video-player", "Native player Activity onCreate");
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        try {
            setContentView(R.layout.activity_native_video_player);
            playerView = findViewById(R.id.native_player_view);
            playerView.setVisibility(View.VISIBLE);
            playerView.setAlpha(1f);
            playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
            playerView.setShutterBackgroundColor(Color.TRANSPARENT);
            playerView.setKeepContentOnPlayerReset(true);
            playerView.setControllerAutoShow(false);
            playerView.setControllerHideOnTouch(true);
            playerView.hideController();
            EChatNativeLog.info(this, "android-video-player", "Native player layout ready");
            playerView.post(() -> EChatNativeLog.info(this, "android-video-player",
                "Native player view measured",
                "width", playerView.getWidth(),
                "height", playerView.getHeight(),
                "isShown", playerView.isShown()));
            openVideo(getIntent(), "onCreate");
        } catch (RuntimeException error) {
            EChatNativeLog.error(this, "android-video-player", "Native player Activity initialization failed", error);
            finish();
        }
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
                public void onRenderedFirstFrame() {
                    playerView.setVisibility(View.VISIBLE);
                    playerView.setAlpha(1f);
                    playerView.setShutterBackgroundColor(Color.TRANSPARENT);
                    playerView.hideController();
                    EChatNativeLog.info(NativeVideoPlayerActivity.this, "android-video-player",
                        "ExoPlayer first video frame rendered and PlayerView shown",
                        "viewWidth", playerView.getWidth(),
                        "viewHeight", playerView.getHeight(),
                        "viewVisibility", playerView.getVisibility());
                }

                @Override
                public void onVideoSizeChanged(androidx.media3.common.VideoSize videoSize) {
                    EChatNativeLog.info(NativeVideoPlayerActivity.this, "android-video-player",
                        "ExoPlayer video size changed",
                        "width", videoSize.width,
                        "height", videoSize.height,
                        "pixelWidthHeightRatio", videoSize.pixelWidthHeightRatio);
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
        boolean finishing = isFinishing();
        boolean changingConfigurations = isChangingConfigurations();
        EChatNativeLog.info(this, "android-video-player", "Native player Activity onStop",
            "isFinishing", finishing,
            "isChangingConfigurations", changingConfigurations,
            "hasPlayer", player != null);
        if (finishing && !changingConfigurations) {
            releasePlayer("user finished player Activity");
        } else if (player != null) {
            player.setPlayWhenReady(false);
            EChatNativeLog.info(this, "android-video-player",
                "Native player paused without release during lifecycle stop",
                "currentPositionMs", player.getCurrentPosition(),
                "bufferedPositionMs", player.getBufferedPosition());
        }
        super.onStop();
    }

    @Override
    protected void onStart() {
        super.onStart();
        EChatNativeLog.info(this, "android-video-player", "Native player Activity onStart",
            "hasPlayer", player != null);
        if (player != null) player.setPlayWhenReady(true);
    }

    @Override
    protected void onDestroy() {
        releasePlayer("Activity destroyed");
        EChatNativeLog.info(this, "android-video-player", "Native player Activity onDestroy");
        super.onDestroy();
    }
}
