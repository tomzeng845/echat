using System.Diagnostics;

namespace EChat.Api;

public sealed record ProcessedVideo(
    string Mp4Path,
    string ThumbnailPath,
    string? HlsPlaylistPath,
    IReadOnlyList<string> HlsSegmentPaths,
    double DurationSeconds,
    string DirectoryPath);

public sealed class VideoProcessingService(IConfiguration configuration, ILogger<VideoProcessingService> logger)
{
    private readonly string _ffmpeg = configuration["Media:FFmpegPath"] ?? "ffmpeg";
    private readonly string _ffprobe = configuration["Media:FFprobePath"] ?? "ffprobe";

    public async Task<ProcessedVideo> ProcessAsync(string inputPath, string workRoot, CancellationToken ct)
    {
        var directory = Path.Combine(workRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var mp4 = Path.Combine(directory, "video.mp4");
        var thumb = Path.Combine(directory, "thumbnail.jpg");
        var hlsPlaylist = Path.Combine(directory, "index.m3u8");
        var duration = await ProbeDurationAsync(inputPath, ct);

        await RunAsync($"-y -i {Q(inputPath)} -vf \"scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,format=yuv420p\" -c:v libx264 -profile:v main -level 4.0 -preset veryfast -b:v 2M -maxrate 2.5M -bufsize 4M -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart {Q(mp4)}", directory, ct);
        await RunAsync($"-y -ss 00:00:00.500 -i {Q(mp4)} -frames:v 1 -vf \"scale=640:-2\" -q:v 3 {Q(thumb)}", directory, ct);

        string? playlist = null;
        var segments = Array.Empty<string>();
        if (duration >= 30)
        {
            await RunAsync($"-y -i {Q(mp4)} -c copy -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename {Q(Path.Combine(directory, "segment_%05d.ts"))} {Q(hlsPlaylist)}", directory, ct);
            playlist = hlsPlaylist;
            segments = Directory.GetFiles(directory, "segment_*.ts").OrderBy(x => x).ToArray();
        }

        logger.LogInformation("Video processed duration={Duration} mp4={Mp4} thumbnail={Thumbnail} hls={Hls}", duration, mp4, thumb, playlist is not null);
        return new ProcessedVideo(mp4, thumb, playlist, segments, duration, directory);
    }

    private async Task<double> ProbeDurationAsync(string input, CancellationToken ct)
    {
        var output = await RunAsync($"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {Q(input)}", Path.GetDirectoryName(input)!, ct, _ffprobe);
        return double.TryParse(output.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private async Task<string> RunAsync(string arguments, string workingDirectory, CancellationToken ct, string? executable = null)
    {
        var psi = new ProcessStartInfo(executable ?? _ffmpeg, arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("无法启动 FFmpeg");
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        if (process.ExitCode != 0) throw new InvalidOperationException($"视频处理失败: {stderr}");
        return string.IsNullOrWhiteSpace(stdout) ? stderr : stdout;
    }

    private static string Q(string value) => $"\"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
}
