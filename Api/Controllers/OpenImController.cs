using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController]
[Route("api/openim")]
[Authorize]
public sealed class OpenImController(IChatRepository repository, OpenImService openIm) : ControllerBase
{
    [HttpGet("session")]
    public async Task<ActionResult<OpenImSessionResponse>> GetSession(
        [FromQuery] string platform = "ios",
        CancellationToken cancellationToken = default)
    {
        var user = await repository.GetUserByIdAsync(User.UserId(), cancellationToken);
        if (user is null || user.Status != UserStatus.Active)
            return Unauthorized(new { success = false, error = "账号不可用" });

        var platformId = platform.Trim().ToLowerInvariant() switch
        {
            "ios" => 1,
            "android" => 2,
            _ => 0
        };
        if (platformId == 0)
            return BadRequest(new { success = false, error = "platform 仅支持 ios 或 android" });
        if (!openIm.Configured)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { success = false, error = "OpenIM 服务尚未配置管理员 token" });

        try
        {
            return Ok(await openIm.IssueUserTokenAsync(user, platformId, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { success = false, error = exception.Message });
        }
    }
}
