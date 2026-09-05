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
        var user = await repository.GetUserByIdAsync(User.UserId(), ct);
        if (user is null) return NotFound();
        user.PublicKeyJwk = request.PublicKeyJwk;
        await repository.UpdateUserAsync(user, ct);
        return NoContent();
    }

    [HttpGet("{account}/public-key")]
    public async Task<ActionResult> PublicKey(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
        if (user is null || string.IsNullOrWhiteSpace(user.PublicKeyJwk)) return NotFound(new { error = "用户尚未发布加密公钥" });
        return Ok(new { user.Id, user.Account, user.DisplayName, user.PublicKeyJwk });
    }
}
