using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api;

[ApiController, Authorize]
[Route("api/diagnostics")]
public sealed class DiagnosticsController : ControllerBase
{
    private readonly ILogger<DiagnosticsController> _logger;

    public DiagnosticsController(ILogger<DiagnosticsController> logger)
    {
        _logger = logger;
    }

    [HttpPost("mobile-log")]
    [RequestSizeLimit(1024 * 1024)]
    public async Task<IActionResult> UploadMobileLog([FromBody] MobileLogUploadRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.EntriesJson))
            return BadRequest(new { error = "日志内容为空" });

        var userId = User.UserId();
        var safeUserId = string.Concat(userId.Where(char.IsLetterOrDigit));
        if (string.IsNullOrWhiteSpace(safeUserId)) return Unauthorized();

        var root = Path.Combine(AppContext.BaseDirectory, "diagnostic-logs", safeUserId);
        Directory.CreateDirectory(root);
        var uploadId = $"{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}";
        var filePath = Path.Combine(root, uploadId + ".jsonl");
        await System.IO.File.WriteAllTextAsync(filePath, request.EntriesJson, ct);

        _logger.LogInformation("Mobile runtime log uploaded. UserId={UserId}, DeviceId={DeviceId}, File={File}", userId, request.DeviceId, filePath);
        return Ok(new
        {
            uploaded = true,
            uploadId,
            bytes = new FileInfo(filePath).Length,
            receivedAtUtc = DateTime.UtcNow,
            message = "日志已上传服务器"
        });
    }
}

public sealed record MobileLogUploadRequest(string EntriesJson, string? DeviceId, string? AppVersion, string? Platform);
