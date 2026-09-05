using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/admin")]
public sealed class AdminController(IChatRepository repository, TotpService totp, IHostEnvironment environment, IConfiguration configuration) : ControllerBase
{
    [HttpGet("overview")]
    public async Task<ActionResult> Overview(CancellationToken ct)
    {
        var totalUsersTask = repository.CountUsersAsync(null, ct);
        var activeUsersTask = repository.CountUsersAsync(UserStatus.Active, ct);
        var restrictedUsersTask = repository.CountUsersAsync(UserStatus.Restricted, ct);
        var disabledUsersTask = repository.CountUsersAsync(UserStatus.Disabled, ct);
        var sessionsTask = repository.CountActiveSessionsAsync(ct);
        var conversationsTask = repository.CountConversationsAsync(ct);
        var messagesTask = repository.CountMessagesAsync(ct);
        var reportsTask = repository.CountMomentReportsAsync(MomentReportStatus.Submitted, ct);
        await Task.WhenAll(totalUsersTask, activeUsersTask, restrictedUsersTask, disabledUsersTask, sessionsTask, conversationsTask, messagesTask, reportsTask);

        return Ok(new
        {
            service = "E聊 API",
            version = "0.5.0",
            status = "healthy",
            storage = Environment.GetEnvironmentVariable("MONGODB_URI") is null ? "in-memory-preview" : "mongodb",
            utcNow = DateTime.UtcNow,
            metrics = new
            {
                users = totalUsersTask.Result,
                activeUsers = activeUsersTask.Result,
                restrictedUsers = restrictedUsersTask.Result,
                disabledUsers = disabledUsersTask.Result,
                activeSessions = sessionsTask.Result,
                conversations = conversationsTask.Result,
                messages = messagesTask.Result,
                pendingReports = reportsTask.Result
            },
            security = new
            {
                totpConfigured = totp.IsConfigured,
                developmentPasswordLogin = RuntimeMode.IsEphemeralPreview(configuration, environment),
                transport = "TLS required in production",
                messagePayload = "client-side AES-GCM ciphertext"
            }
        });
    }

    [HttpGet("users")]
    public async Task<ActionResult> Users([FromQuery] string? search, [FromQuery] UserStatus? status, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var users = await repository.GetUsersAsync(search?.Trim(), status, Math.Clamp(limit, 1, 200), ct);
        var result = new List<AdminUserView>();
        foreach (var user in users)
        {
            var sessions = await repository.GetSessionsAsync(user.Id, ct);
            result.Add(new AdminUserView(user.Id, user.Account, user.DisplayName, user.Role, user.Status, user.CreatedAtUtc, user.LastSeenAtUtc, sessions.Count, user.LockoutUntilUtc));
        }
        return Ok(result);
    }

    [HttpGet("users/{account}")]
    public async Task<ActionResult> UserByAccount(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null) return NotFound(new { error = "用户不存在" });
        var sessions = await repository.GetSessionsAsync(user.Id, ct);
        return Ok(new AdminUserView(user.Id, user.Account, user.DisplayName, user.Role, user.Status, user.CreatedAtUtc, user.LastSeenAtUtc, sessions.Count, user.LockoutUntilUtc));
    }

    [HttpPost("users/{account}/status")]
    public async Task<ActionResult> SetUserStatus(string account, AdminUserStatusRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null) return NotFound(new { error = "用户不存在" });
        if (user.Id == User.UserId() && request.Status != UserStatus.Active) return BadRequest(new { error = "不能停用当前管理账号" });

        var previous = user.Status;
        user.Status = request.Status;
        user.FailedLoginAttempts = 0;
        user.LockoutUntilUtc = null;
        await repository.UpdateUserAsync(user, ct);
        if (request.Status != UserStatus.Active)
        {
            await repository.RevokeSessionsAsync(user.Id, null, $"admin:{request.Status}", ct);
            await AddOfflineLogAsync(user, $"状态变更为 {request.Status}", ct);
        }
        await AuditAsync("user.status", "user", user.Id, $"{previous} -> {request.Status}; {TrimDetail(request.Reason)}", ct);
        return Ok(new { user.Account, user.Status });
    }

    [HttpPost("users/{account}/restrict")]
    public Task<ActionResult> Restrict(string account, CancellationToken ct) => SetUserStatus(account, new AdminUserStatusRequest(UserStatus.Restricted, "兼容接口限制"), ct);

    [HttpPost("users/{account}/sessions/revoke")]
    public async Task<ActionResult> RevokeUserSessions(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null) return NotFound(new { error = "用户不存在" });
        if (user.Id == User.UserId()) return BadRequest(new { error = "请勿从此入口撤销当前管理会话" });
        await repository.RevokeSessionsAsync(user.Id, null, "admin-revoked", ct);
        await AddOfflineLogAsync(user, "管理员强制退出全部设备", ct);
        await AuditAsync("user.sessions.revoke", "user", user.Id, "撤销全部活跃设备会话", ct);
        return NoContent();
    }

    [HttpGet("invites")]
    public async Task<ActionResult> Invites([FromQuery] int limit = 100, CancellationToken ct = default) => Ok(await repository.GetInvitesAsync(Math.Clamp(limit, 1, 200), ct));

    [HttpPost("invites")]
    public async Task<ActionResult> UpsertInvite(AdminInviteRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9_-]{4,32}$")) return BadRequest(new { error = "邀请码需为 4–32 位字母、数字、下划线或短横线" });
        if (request.MaxUses is < 1 or > 100000) return BadRequest(new { error = "可用次数需为 1–100000" });
        if (request.ExpiresAtUtc.HasValue && request.ExpiresAtUtc <= DateTime.UtcNow) return BadRequest(new { error = "过期时间必须晚于当前时间" });

        var existing = (await repository.GetInvitesAsync(200, ct)).FirstOrDefault(x => x.Code == code);
        var invite = existing ?? new InviteCode { Code = code };
        invite.MaxUses = Math.Max(request.MaxUses, invite.UsedCount);
        invite.ExpiresAtUtc = request.ExpiresAtUtc;
        invite.IsActive = request.IsActive;
        await repository.UpsertInviteAsync(invite, ct);
        await AuditAsync("invite.upsert", "invite", code, $"maxUses={invite.MaxUses}; active={invite.IsActive}", ct);
        return Ok(invite);
    }

    [HttpGet("reports")]
    public async Task<ActionResult> Reports([FromQuery] MomentReportStatus? status, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var reports = await repository.GetAllMomentReportsAsync(status, Math.Clamp(limit, 1, 200), ct);
        var result = new List<object>();
        foreach (var report in reports)
        {
            var reporter = await repository.GetUserByIdAsync(report.ReporterId, ct);
            var moment = await repository.GetMomentAsync(report.MomentId, ct);
            var author = moment is null ? null : await repository.GetUserByIdAsync(moment.AuthorId, ct);
            result.Add(new
            {
                report.Id,
                report.MomentId,
                report.Reason,
                report.Detail,
                report.Status,
                report.CreatedAtUtc,
                reporter = reporter is null ? null : new { reporter.Account, reporter.DisplayName },
                author = author is null ? null : new { author.Account, author.DisplayName },
                momentText = moment?.Text ?? "动态已不存在"
            });
        }
        return Ok(result);
    }

    [HttpPost("reports/{id}/decision")]
    public async Task<ActionResult> DecideReport(string id, AdminReportDecisionRequest request, CancellationToken ct)
    {
        if (request.Status is not (MomentReportStatus.Resolved or MomentReportStatus.Rejected)) return BadRequest(new { error = "处置状态只能是 Resolved 或 Rejected" });
        var report = await repository.GetMomentReportAsync(id, ct);
        if (report is null) return NotFound(new { error = "举报不存在" });
        report.Status = request.Status;
        await repository.UpdateMomentReportAsync(report, ct);
        await AuditAsync("report.decision", "momentReport", report.Id, $"{request.Status}; {TrimDetail(request.Note)}", ct);
        return Ok(new { report.Id, report.Status });
    }

    [HttpGet("audit")]
    public async Task<ActionResult> Audit([FromQuery] int limit = 100, CancellationToken ct = default) => Ok(await repository.GetAdminAuditsAsync(Math.Clamp(limit, 1, 200), ct));

    private async Task AuditAsync(string action, string targetType, string targetId, string detail, CancellationToken ct)
    {
        var adminUserId = User.UserId();
        var admin = await repository.GetUserByIdAsync(adminUserId, ct);
        await repository.AddAdminAuditAsync(new AdminAuditLog
        {
            AdminUserId = adminUserId,
            AdminAccount = admin?.Account ?? "admin",
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            Detail = TrimDetail(detail),
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"
        }, ct);
    }

    private Task<AdminModuleRecord> AddOfflineLogAsync(UserAccount user, string reason, CancellationToken ct) => repository.UpsertAdminRecordAsync(new AdminModuleRecord
    {
        Module = "account.offline-logs", Name = "管理员下线用户", Status = "Offline",
        Data = new Dictionary<string, string> { ["userId"] = user.Id, ["account"] = user.Account, ["reason"] = reason, ["admin"] = User.Identity?.Name ?? "admin", ["ip"] = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown" }
    }, ct);

    private static string NormalizeAccount(string value) => value.Trim().ToLowerInvariant();
    private static string TrimDetail(string? value) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim()[..Math.Min(value.Trim().Length, 300)];
}
