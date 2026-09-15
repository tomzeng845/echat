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
    private readonly string _ffmpeg = ResolveExecutable(configuration["Media:FFmpegPath"], "ffmpeg");
    private readonly string _ffprobe = ResolveExecutable(configuration["Media:FFprobePath"], "ffprobe");
    private readonly int _timeoutSeconds = Math.Clamp(configuration.GetValue("Media:ProcessingTimeoutSeconds", 120), 30, 900);

    public bool IsAvailable => File.Exists(_ffmpeg) && File.Exists(_ffprobe);
    public string Status => $"ffmpeg={_ffmpeg}; ffprobe={_ffprobe}; available={IsAvailable}";

    public async Task<ProcessedVideo> ProcessAsync(string inputPath, string workRoot, CancellationToken ct)
    {
        logger.LogInformation("Video processing started input={Input} status={Status} timeoutSeconds={Timeout}", inputPath, Status, _timeoutSeconds);
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
        logger.LogInformation("Video tool starting executable={Executable} timeoutSeconds={Timeout}", executable ?? _ffmpeg, _timeoutSeconds);
        var psi = new ProcessStartInfo(executable ?? _ffmpeg, arguments)
        {
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var process = Process.Start(psi) ?? throw new InvalidOperationException("无法启动 FFmpeg");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(_timeoutSeconds));
        try
        {
            var stdoutTask = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0) throw new InvalidOperationException($"视频处理失败: {stderr}");
            return string.IsNullOrWhiteSpace(stdout) ? stderr : stdout;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException($"视频处理超过 {_timeoutSeconds} 秒，已终止 FFmpeg 进程");
        }
        catch
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { }
            throw;
        }
    }

    private static string Q(string value) => $"\"{value.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";

    private static bool CanResolveExecutable(string executable)
    {
        if (Path.IsPathRooted(executable)) return File.Exists(executable);
        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        var extensions = OperatingSystem.IsWindows()
            ? new[] { ".exe", ".cmd", ".bat", "" }
            : new[] { "" };
        return path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(directory => extensions.Select(extension => Path.Combine(directory, executable + extension)))
            .SelectMany(paths => paths)
            .Any(File.Exists);
    }

    private static string ResolveExecutable(string? configured, string name)
    {
        var value = string.IsNullOrWhiteSpace(configured) ? name : configured.Trim().Trim('"');
        if (Path.IsPathRooted(value) && File.Exists(value)) return value;
        if (CanResolveExecutable(value))
        {
            var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            var extension = OperatingSystem.IsWindows() && !Path.HasExtension(value) ? ".exe" : "";
            var found = path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
                .Select(directory => Path.Combine(directory, value + extension))
                .FirstOrDefault(File.Exists);
            if (found is not null) return found;
        }

        if (OperatingSystem.IsWindows())
        {
            var candidates = new[]
            {
                $@"C:\ffmpeg\bin\{name}.exe",
                $@"C:\Program Files\ffmpeg\bin\{name}.exe",
                $@"C:\Program Files (x86)\ffmpeg\bin\{name}.exe",
                $@"C:\ProgramData\chocolatey\bin\{name}.exe"
            };
            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate)) return candidate;
            }
            var packageRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "WinGet", "Packages");
            if (Directory.Exists(packageRoot))
            {
                var match = Directory.GetDirectories(packageRoot, "Gyan.FFmpeg*", SearchOption.TopDirectoryOnly)
                    .SelectMany(directory => Directory.GetFiles(directory, $"{name}.exe", SearchOption.AllDirectories))
                    .FirstOrDefault();
                if (match is not null) return match;
            }
        }
        return value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? value : value + (OperatingSystem.IsWindows() ? ".exe" : "");
    }
}
