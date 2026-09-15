using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/media")]
public sealed class MediaController(
    IChatRepository repository,
    IMediaStorage storage,
    VideoProcessingService videoProcessing,
    ILogger<MediaController> logger) : ControllerBase
{
    private const long MaxSize = 25 * 1024 * 1024;
    private static readonly HashSet<string> BlockedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text/html", "application/xhtml+xml", "image/svg+xml", "application/x-msdownload", "application/x-sh", "application/javascript"
    };

    [HttpPost]
    [RequestSizeLimit(MaxSize + 1024 * 1024)]
    public async Task<ActionResult<MediaAssetView>> Upload(
        [FromForm] IFormFile file,
        [FromForm] MediaPurpose purpose,
        [FromForm] string? conversationId,
        CancellationToken ct)
    {
        if (file.Length is <= 0 or > MaxSize) return BadRequest(new { error = "文件为空或超过 25 MB" });
        if (BlockedTypes.Contains(file.ContentType)) return BadRequest(new { error = "不支持此文件类型" });
        if (purpose == MediaPurpose.Avatar && (file.Length > 5 * 1024 * 1024 || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new { error = "头像必须是 5 MB 以内的图片" });
        if (purpose == MediaPurpose.Chat)
        {
            if (string.IsNullOrWhiteSpace(conversationId)) return BadRequest(new { error = "聊天媒体必须指定会话" });
            var conversation = await repository.GetConversationAsync(conversationId, ct);
            if (conversation is null || !conversation.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null)) return Forbid();
        }

        var safeFileName = Path.GetFileName(file.FileName).Trim();
        if (string.IsNullOrWhiteSpace(safeFileName)) safeFileName = "media";
        var contentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
        var root = Path.Combine(Path.GetTempPath(), "echat-media");
        Directory.CreateDirectory(root);

        if (purpose == MediaPurpose.Chat && contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
        {
            var input = Path.Combine(root, $"input-{Guid.NewGuid():N}{Path.GetExtension(safeFileName)}");
            try
            {
                await using (var inputStream = System.IO.File.Create(input))
                    await file.CopyToAsync(inputStream, ct);

                try
                {
                    // The multipart body must follow the request cancellation while it is being
                    // uploaded. Once the temporary file is complete, however, processing must
                    // not be canceled merely because the mobile client timed out or navigated
                    // away. VideoProcessingService has its own bounded process timeout.
                    var processingCt = CancellationToken.None;
                    if (!videoProcessing.IsAvailable)
                    {
                        logger.LogWarning("FFmpeg/FFprobe unavailable; {Status}; preserving original video upload {FileName}", videoProcessing.Status, safeFileName);
                        var originalWithoutTranscode = await StoreOriginalAsync(file, safeFileName, contentType, conversationId, processingCt);
                        return Ok(View(originalWithoutTranscode));
                    }
                    var processed = await videoProcessing.ProcessAsync(input, root, processingCt);
                    var baseKey = $"echat/{User.UserId()}/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}";
                    var stored = await StoreFileAsync($"{baseKey}.mp4", processed.Mp4Path, "video/mp4", processingCt);
                    var thumb = await StoreFileAsync($"{baseKey}.jpg", processed.ThumbnailPath, "image/jpeg", processingCt);
                    string? hlsKey = null;
                    if (processed.HlsPlaylistPath is not null)
                    {
                        foreach (var segment in processed.HlsSegmentPaths)
                            await StoreFileAsync($"{baseKey}/{Path.GetFileName(segment)}", segment, "video/mp2t", processingCt);
                        hlsKey = $"{baseKey}/index.m3u8";
                        await StoreFileAsync(hlsKey, processed.HlsPlaylistPath, "application/vnd.apple.mpegurl", processingCt);
                    }

                    var asset = await repository.AddMediaAssetAsync(new MediaAsset
                    {
                        OwnerId = User.UserId(), Purpose = purpose, ConversationId = conversationId,
                        StorageKey = stored.StorageKey, LocalPath = stored.LocalPath,
                        FileName = Path.GetFileNameWithoutExtension(safeFileName) + ".mp4",
                        ContentType = "video/mp4", Size = new FileInfo(processed.Mp4Path).Length,
                        ThumbnailStorageKey = thumb.StorageKey, HlsPlaylistStorageKey = hlsKey,
                        HlsSegmentCount = processed.HlsSegmentPaths.Count,
                        DurationSeconds = processed.DurationSeconds, IsTranscoded = true
                    }, processingCt);
                    return Ok(View(asset));
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // FFmpeg is an optimization. Do not lose the chat message if it is unavailable,
                    // the codec is unsupported, or the transcode times out.
                    logger.LogWarning(ex, "Video transcode failed; preserving original upload {FileName} {Bytes} {ConversationId}", safeFileName, file.Length, conversationId);
                }

                var original = await StoreOriginalAsync(file, safeFileName, contentType, conversationId, CancellationToken.None);
                return Ok(View(original));
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, new { error = "视频上传超时，请重试" });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Video upload failed {FileName} {Bytes} {ConversationId}", safeFileName, file.Length, conversationId);
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "视频上传失败，请检查网络后重试" });
            }
            finally
            {
                try { if (System.IO.File.Exists(input)) System.IO.File.Delete(input); } catch { }
            }
        }

        try
        {
            var asset = await StoreOriginalAsync(file, safeFileName, contentType, conversationId, ct, purpose);
            return Ok(View(asset));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Media upload failed {FileName} {Bytes} {Purpose} {ConversationId}", safeFileName, file.Length, purpose, conversationId);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "文件上传失败，请检查网络后重试" });
        }
    }

    private async Task<MediaAsset> StoreOriginalAsync(
        IFormFile file,
        string fileName,
        string contentType,
        string? conversationId,
        CancellationToken ct,
        MediaPurpose purpose = MediaPurpose.Chat)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var storageKey = $"echat/{User.UserId()}/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        await using var content = file.OpenReadStream();
        var stored = await storage.StoreAsync(storageKey, content, contentType, ct);
        return await repository.AddMediaAssetAsync(new MediaAsset
        {
            OwnerId = User.UserId(), Purpose = purpose, ConversationId = conversationId,
            StorageKey = stored.StorageKey, LocalPath = stored.LocalPath,
            FileName = fileName, ContentType = contentType, Size = file.Length, IsTranscoded = false
        }, ct);
    }

    private async Task<StoredMedia> StoreFileAsync(string key, string path, string contentType, CancellationToken ct)
    {
        await using var stream = System.IO.File.OpenRead(path);
        return await storage.StoreAsync(key, stream, contentType, ct);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MediaAssetView>> Metadata(string id, CancellationToken ct)
    {
        var asset = await repository.GetMediaAssetAsync(id, ct);
        if (asset is null) return NotFound();
        if (!await CanAccessAsync(asset, ct)) return Forbid();
        return Ok(View(asset));
    }

    [HttpGet("{id}/content")]
    public async Task<ActionResult> Content(string id, CancellationToken ct)
    {
        var asset = await repository.GetMediaAssetAsync(id, ct);
        if (asset is null) return NotFound();
        if (!await CanAccessAsync(asset, ct)) return Forbid();
        logger.LogInformation("Media content request {AssetId} {ContentType} {Size} range={Range} user={UserId}", id, asset.ContentType, asset.Size, Request.Headers.Range.ToString(), User.UserId());
        Response.Headers.CacheControl = "private,max-age=3600";
        if (!string.IsNullOrWhiteSpace(asset.LocalPath) && System.IO.File.Exists(asset.LocalPath))
            return new FileStreamResult(System.IO.File.OpenRead(asset.LocalPath), asset.ContentType) { EnableRangeProcessing = true, FileDownloadName = IsInline(asset.ContentType) ? null : asset.FileName };
        var signedUrl = await storage.GetSignedReadUrlAsync(asset.StorageKey, ct);
        logger.LogInformation("Media content redirect {AssetId} signedUrl={HasSignedUrl}", id, signedUrl is not null);
        return signedUrl is null ? NotFound() : RedirectPreserveMethod(signedUrl);
    }

    [HttpGet("{id}/thumbnail")]
    public async Task<ActionResult> Thumbnail(string id, CancellationToken ct)
    {
        var asset = await repository.GetMediaAssetAsync(id, ct);
        if (asset is null || asset.ThumbnailStorageKey is null || !await CanAccessAsync(asset, ct)) return NotFound();
        var signedUrl = await storage.GetSignedReadUrlAsync(asset.ThumbnailStorageKey, ct);
        return signedUrl is null ? NotFound() : Redirect(signedUrl);
    }

    [HttpGet("{id}/hls")]
    public async Task<ActionResult> Hls(string id, CancellationToken ct)
    {
        var asset = await repository.GetMediaAssetAsync(id, ct);
        if (asset is null || asset.HlsPlaylistStorageKey is null || !await CanAccessAsync(asset, ct)) return NotFound();
        var prefix = asset.HlsPlaylistStorageKey[..^"index.m3u8".Length];
        var lines = new List<string> { "#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6", "#EXT-X-MEDIA-SEQUENCE:0" };
        for (var index = 0; index < asset.HlsSegmentCount; index++)
        {
            var segmentKey = $"{prefix}segment_{index:00000}.ts";
            var segmentUrl = await storage.GetSignedReadUrlAsync(segmentKey, ct);
            if (segmentUrl is null) return NotFound();
            lines.Add("#EXTINF:6.000,");
            lines.Add(segmentUrl);
        }
        lines.Add("#EXT-X-ENDLIST");
        return Content(string.Join("\n", lines) + "\n", "application/vnd.apple.mpegurl");
    }

    private async Task<bool> CanAccessAsync(MediaAsset asset, CancellationToken ct)
    {
        var userId = User.UserId();
        if (asset.OwnerId == userId) return true;
        if (asset.Purpose == MediaPurpose.Feedback) return User.IsInRole(nameof(UserRole.Admin));
        if (asset.Purpose == MediaPurpose.Chat && !string.IsNullOrWhiteSpace(asset.ConversationId))
        {
            var conversation = await repository.GetConversationAsync(asset.ConversationId, ct);
            return conversation?.Members.Any(x => x.UserId == userId && x.LeftAtSequence is null) == true;
        }
        var relation = await repository.GetRelationAsync(userId, asset.OwnerId, ct);
        var reverse = await repository.GetRelationAsync(asset.OwnerId, userId, ct);
        if (relation?.Status != RelationStatus.Friend || reverse?.Status != RelationStatus.Friend) return false;
        if (asset.Purpose == MediaPurpose.Avatar) return true;
        var moments = await repository.GetMomentsAsync([asset.OwnerId], null, 200, ct);
        var moment = moments.FirstOrDefault(x => x.MediaAssetIds.Contains(asset.Id));
        if (moment is null || moment.Visibility == MomentVisibility.Private) return false;
        return moment.Visibility switch { MomentVisibility.Selected => moment.AudienceUserIds.Contains(userId), MomentVisibility.Excluded => !moment.AudienceUserIds.Contains(userId), _ => true };
    }

    private static bool IsInline(string contentType) => contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) || contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) || contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
    private static MediaAssetView View(MediaAsset asset) => new(asset.Id, asset.FileName, asset.ContentType, asset.Size, asset.Purpose, $"/api/media/{asset.Id}/content", asset.ThumbnailStorageKey is null ? null : $"/api/media/{asset.Id}/thumbnail", asset.HlsPlaylistStorageKey is null ? null : $"/api/media/{asset.Id}/hls", asset.DurationSeconds, asset.IsTranscoded);
}
