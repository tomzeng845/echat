using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/media")]
public sealed class MediaController(IChatRepository repository, IMediaStorage storage) : ControllerBase
{
    private const long MaxSize = 25 * 1024 * 1024;
    private static readonly HashSet<string> BlockedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text/html", "application/xhtml+xml", "image/svg+xml", "application/x-msdownload", "application/x-sh", "application/javascript"
    };

    [HttpPost]
    [RequestSizeLimit(MaxSize + 1024 * 1024)]
    public async Task<ActionResult<MediaAssetView>> Upload([FromForm] IFormFile file, [FromForm] MediaPurpose purpose, [FromForm] string? conversationId, CancellationToken ct)
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
        var extension = Path.GetExtension(safeFileName).ToLowerInvariant();
        var storageKey = $"echat/{User.UserId()}/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        await using var content = file.OpenReadStream();
        var stored = await storage.StoreAsync(storageKey, content, string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType, ct);
        var asset = await repository.AddMediaAssetAsync(new MediaAsset
        {
            OwnerId = User.UserId(), Purpose = purpose, ConversationId = conversationId, StorageKey = stored.StorageKey, LocalPath = stored.LocalPath,
            FileName = safeFileName, ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType, Size = file.Length
        }, ct);
        return Ok(View(asset));
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
        Response.Headers.CacheControl = "private,max-age=3600";
        if (!string.IsNullOrWhiteSpace(asset.LocalPath) && System.IO.File.Exists(asset.LocalPath))
            return new FileStreamResult(System.IO.File.OpenRead(asset.LocalPath), asset.ContentType) { EnableRangeProcessing = true, FileDownloadName = IsInline(asset.ContentType) ? null : asset.FileName };
        var signedUrl = await storage.GetSignedReadUrlAsync(asset.StorageKey, ct);
        return signedUrl is null ? NotFound() : RedirectPreserveMethod(signedUrl);
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
    private static MediaAssetView View(MediaAsset asset) => new(asset.Id, asset.FileName, asset.ContentType, asset.Size, asset.Purpose, $"/api/media/{asset.Id}/content");
}
