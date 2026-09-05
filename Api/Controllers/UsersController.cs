using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/users")]
public sealed class UsersController(IChatRepository repository) : ControllerBase
{
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
