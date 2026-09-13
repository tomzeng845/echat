using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/users")]
public sealed class UsersController(IChatRepository repository, IHubContext<ChatHub> hub) : ControllerBase
{
    [HttpPut("me/profile")]
    public async Task<ActionResult<UserView>> UpdateProfile(UpdateProfileRequest request, CancellationToken ct)
    {
        var displayName = request.DisplayName.Trim();
        var signature = request.Signature.Trim();
        if (displayName.Length is < 1 or > 30) return BadRequest(new { error = "昵称长度需要在 1 到 30 个字符之间" });
        if (signature.Length > 120) return BadRequest(new { error = "个性签名不能超过 120 个字符" });
        var user = await repository.GetUserByIdAsync(User.UserId(), ct);
        if (user is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(request.AvatarAssetId))
        {
            var asset = await repository.GetMediaAssetAsync(request.AvatarAssetId, ct);
            if (asset is null || asset.OwnerId != user.Id || asset.Purpose != MediaPurpose.Avatar || !asset.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { error = "头像文件无效" });
            user.AvatarUrl = $"/api/media/{asset.Id}/content";
        }
        else if (!string.IsNullOrWhiteSpace(request.BuiltinAvatarId))
        {
            var builtinId = request.BuiltinAvatarId.Trim().ToLowerInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(builtinId, @"^builtin-(0[1-9]|1[0-9]|20)$"))
                return BadRequest(new { error = "内置头像编号无效" });
            user.AvatarUrl = $"builtin://{builtinId}";
        }
        user.DisplayName = displayName;
        user.Signature = signature;
        await repository.UpdateUserAsync(user, ct);
        var view = SessionService.View(user);
        var relations = await repository.GetRelationsAsync(user.Id, ct);
        var recipients = relations.Where(item => item.Status == RelationStatus.Friend).Select(item => item.PeerUserId).Append(user.Id).Distinct(StringComparer.Ordinal);
        await Task.WhenAll(recipients.Select(recipientId => hub.Clients.Group($"user:{recipientId}").SendAsync("profile.updated", view, ct)));
        return Ok(view);
    }

    [HttpPut("me/public-key")]
    public async Task<ActionResult> SetPublicKey(PublicKeyRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.PublicKeyJwk) || request.PublicKeyJwk.Length > 4096) return BadRequest(new { error = "公钥格式无效" });
        var deviceId = (request.DeviceId ?? Request.Headers["X-EChat-Device-Id"].FirstOrDefault() ?? "legacy-web").Trim();
        if (deviceId.Length is < 8 or > 128 || deviceId.Any(ch => !char.IsLetterOrDigit(ch) && ch is not '-' and not '_')) return BadRequest(new { error = "设备编号无效" });
        var user = await repository.GetUserByIdAsync(User.UserId(), ct);
        if (user is null) return NotFound();
        user.DevicePublicKeys ??= [];
        if (!string.IsNullOrWhiteSpace(user.PublicKeyJwk) && user.PublicKeyJwk != request.PublicKeyJwk && !user.DevicePublicKeys.Values.Contains(user.PublicKeyJwk))
            user.DevicePublicKeys["legacy"] = user.PublicKeyJwk;
        user.DevicePublicKeys[deviceId] = request.PublicKeyJwk;
        user.PublicKeyJwk = request.PublicKeyJwk;
        await repository.UpdateUserAsync(user, ct);
        return NoContent();
    }

    [HttpGet("{account}/public-key")]
    public async Task<ActionResult> PublicKey(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
        if (user is null || string.IsNullOrWhiteSpace(user.PublicKeyJwk)) return NotFound(new { error = "用户尚未发布加密公钥" });
        user.DevicePublicKeys ??= [];
        var devices = user.DevicePublicKeys.Select(item => (object)new { deviceId = item.Key, publicKeyJwk = item.Value }).ToList();
        if (devices.Count == 0) devices.Add(new { deviceId = "legacy-primary", publicKeyJwk = user.PublicKeyJwk });
        return Ok(new { user.Id, user.Account, user.DisplayName, user.PublicKeyJwk, encryptionDevices = devices });
    }
}
