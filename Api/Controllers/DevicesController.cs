using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/devices")]
public sealed class DevicesController(IChatRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DeviceSessionView>>> List(CancellationToken ct)
    {
        var current = User.SessionId();
        var sessions = await repository.GetSessionsAsync(User.UserId(), ct);
        return Ok(sessions.Select(x => new DeviceSessionView(x.Id, x.DeviceId, FriendlyName(x.DeviceName), x.CreatedAtUtc, x.LastSeenAtUtc, x.Id == current)).ToList());
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Revoke(string id, CancellationToken ct)
    {
        var session = (await repository.GetSessionsAsync(User.UserId(), ct)).FirstOrDefault(x => x.Id == id);
        if (session is null) return NotFound();
        session.RevokedReason = "remote-revoke";
        await repository.RevokeSessionAsync(session.Id, ct);
        return NoContent();
    }

    [HttpPost("revoke-others")]
    public async Task<IActionResult> RevokeOthers(CancellationToken ct)
    {
        await repository.RevokeSessionsAsync(User.UserId(), User.SessionId(), "revoke-others", ct);
        return NoContent();
    }

    private static string FriendlyName(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "Web 浏览器";
        if (value.Contains("iPhone", StringComparison.OrdinalIgnoreCase)) return "iPhone · Safari";
        if (value.Contains("Android", StringComparison.OrdinalIgnoreCase)) return "Android 设备";
        if (value.Contains("Windows", StringComparison.OrdinalIgnoreCase)) return "Windows 浏览器";
        if (value.Contains("Macintosh", StringComparison.OrdinalIgnoreCase)) return "Mac 浏览器";
        return value.Length > 48 ? value[..48] : value;
    }
}
