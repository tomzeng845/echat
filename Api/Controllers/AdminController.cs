using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/admin")]
public sealed class AdminController(IChatRepository repository) : ControllerBase
{
    [HttpGet("overview")]
    public IActionResult Overview() => Ok(new
    {
        service = "E聊 API",
        status = "healthy",
        storage = Environment.GetEnvironmentVariable("MONGODB_URI") is null ? "in-memory-preview" : "mongodb",
        utcNow = DateTime.UtcNow,
        security = new { totp = true, transport = "TLS required in production", messagePayload = "client-side AES-GCM ciphertext" }
    });

    [HttpGet("users/{account}")]
    public async Task<ActionResult> UserByAccount(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
        if (user is null) return NotFound();
        return Ok(new { user.Id, user.Account, user.DisplayName, user.Role, user.Status, user.CreatedAtUtc, user.LastSeenAtUtc });
    }

    [HttpPost("users/{account}/restrict")]
    public async Task<ActionResult> Restrict(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
        if (user is null) return NotFound();
        user.Status = UserStatus.Restricted;
        await repository.UpdateUserAsync(user, ct);
        return NoContent();
    }
}
