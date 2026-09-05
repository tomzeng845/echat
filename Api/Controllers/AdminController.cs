using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace EChat.Api.Controllers;

[ApiController, Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/admin")]
public sealed class AdminController(IChatRepository repository, PasswordHasher<UserAccount> passwordHasher, TotpService totp, GeoIpService geoIp, IHostEnvironment environment, IConfiguration configuration) : ControllerBase
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
            version = "0.8.6",
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
                messagePayload = "client-side AES-GCM ciphertext",
                geoIp = new { enabled = geoIp.Enabled, provider = geoIp.Provider, cachedEntries = geoIp.CachedEntries }
            }
        });
    }

    [HttpGet("users")]
    public async Task<ActionResult<AdminUserPage>> Users([FromQuery] AdminUserQuery query, CancellationToken ct) => Ok(await SearchUsersAsync(query, ct));

    [HttpGet("users/{account}")]
    public async Task<ActionResult> UserByAccount(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        var sessions = await repository.GetSessionsAsync(user.Id, ct);
        return Ok(ToView(user, sessions));
    }

    [HttpPost("users")]
    public async Task<ActionResult<AdminUserView>> CreateUser(AdminUserCreateRequest request, CancellationToken ct)
    {
        UserAccount? user;
        try { user = await CreateUserCoreAsync(request, ct); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
        if (user is null) return Conflict(new { error = "账号已存在" });
        await AuditAsync("user.create", "user", user.Id, $"后台开户 {user.Account}", ct);
        return Ok(ToView(user, []));
    }

    [HttpPost("users/batch")]
    public async Task<ActionResult> BatchCreateUsers(AdminUserBatchCreateRequest request, CancellationToken ct)
    {
        if (request.Users is null || request.Users.Count is < 1 or > 200) return BadRequest(new { error = "单次批量新增需为 1–200 个账号" });
        var created = new List<string>();
        var skipped = new List<string>();
        foreach (var item in request.Users)
        {
            try
            {
                var user = await CreateUserCoreAsync(item, ct);
                if (user is null) skipped.Add(item.Account); else created.Add(user.Account);
            }
            catch (ArgumentException) { skipped.Add(item.Account); }
        }
        await AuditAsync("user.batch-create", "user", "batch", $"created={created.Count}; skipped={skipped.Count}", ct);
        return Ok(new { created, skipped });
    }

    [HttpGet("users/export")]
    public async Task<IActionResult> ExportUsers([FromQuery] AdminUserQuery query, CancellationToken ct)
    {
        query.Page = 1; query.PageSize = 10000;
        var page = await SearchUsersAsync(query, ct);
        static string Cell(object? value)
        {
            var text = Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? "";
            if (text.Length > 0 && "=+-@".Contains(text[0])) text = "'" + text;
            return '"' + text.Replace("\"", "\"\"") + '"';
        }
        var csv = new StringBuilder("\uFEFF用户ID,用户账号,昵称,手机号,风险1,风险2,账户余额,冻结金额,在线状态,账号锁定,登录锁定,注销状态,实名认证,企业认证,注册来源,邀请码来源,注册时间,最后在线时间,最后登录IP,最后在线IP,最后节点IP,登录失败次数\r\n");
        foreach (var user in page.Items)
            csv.AppendLine(string.Join(',', new object?[] { user.Id, user.Account, user.DisplayName, user.MobilePhone, user.RiskLevel1, user.RiskLevel2, user.AccountBalance, user.FrozenBalance, user.Online, user.AccountLocked, user.LoginLocked, user.CancellationEnabled, user.RealNameVerified, user.EnterpriseVerified, user.RegistrationSource, user.InviteSource, user.CreatedAtUtc.ToString("O"), user.LastSeenAtUtc.ToString("O"), user.LastLoginIp, user.LastOnlineIp, user.LastNodeIp, user.FailedLoginAttempts }.Select(Cell)));
        await AuditAsync("user.export", "user", "csv", $"rows={page.Items.Count}", ct);
        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"echat-users-{DateTime.UtcNow:yyyyMMddHHmmss}.csv");
    }

    [HttpPut("users/{account}/profile")]
    public async Task<ActionResult<AdminUserView>> UpdateUserProfile(string account, AdminUserProfileRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        if (request.DisplayName is not null) user.DisplayName = Trim(request.DisplayName, 60);
        if (request.MobilePhone is not null) user.MobilePhone = Trim(request.MobilePhone, 30);
        if (request.InviteSource is not null) user.InviteSource = Trim(request.InviteSource, 60);
        if (request.LoginIpRestriction is not null) user.LoginIpRestriction = Trim(request.LoginIpRestriction, 500);
        await repository.UpdateUserAsync(user, ct);
        await AuditAsync("user.profile", "user", user.Id, "修改昵称、手机号、邀请码来源或登录 IP", ct);
        return Ok(ToView(user, await repository.GetSessionsAsync(user.Id, ct)));
    }

    [HttpPut("users/{account}/security")]
    public async Task<ActionResult<AdminUserView>> UpdateUserSecurity(string account, AdminUserSecurityRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        if (user.Id == User.UserId() && (request.AccountLocked == true || request.LoginLocked == true || request.CancellationEnabled == true)) return BadRequest(new { error = "不能锁定或注销当前管理账号" });
        if (request.AccountLocked.HasValue) user.AccountLocked = request.AccountLocked.Value;
        if (request.LoginLocked.HasValue) user.LoginLocked = request.LoginLocked.Value;
        if (request.BankCardLocked.HasValue) user.BankCardLocked = request.BankCardLocked.Value;
        if (request.CancellationEnabled.HasValue)
        {
            user.CancellationEnabled = request.CancellationEnabled.Value;
            user.Status = request.CancellationEnabled.Value ? UserStatus.PendingDeletion : UserStatus.Active;
        }
        if (request.RedFlagged.HasValue) user.RedFlagged = request.RedFlagged.Value;
        if (request.RealNameVerified.HasValue) user.RealNameVerified = request.RealNameVerified.Value;
        if (request.EnterpriseVerified.HasValue) user.EnterpriseVerified = request.EnterpriseVerified.Value;
        if (request.RiskLevel1.HasValue) user.RiskLevel1 = Math.Clamp(request.RiskLevel1.Value, 0, 100);
        if (request.RiskLevel2.HasValue) user.RiskLevel2 = Math.Clamp(request.RiskLevel2.Value, 0, 100);
        await repository.UpdateUserAsync(user, ct);
        if (user.AccountLocked || user.LoginLocked || user.CancellationEnabled)
        {
            await repository.RevokeSessionsAsync(user.Id, null, "admin-security", ct);
            await AddOfflineLogAsync(user, "用户安全状态变更", ct);
        }
        await AuditAsync("user.security", "user", user.Id, TrimDetail(request.Reason), ct);
        return Ok(ToView(user, await repository.GetSessionsAsync(user.Id, ct)));
    }

    [HttpPut("users/{account}/password")]
    public async Task<ActionResult> ResetUserPassword(string account, AdminUserPasswordRequest request, CancellationToken ct)
    {
        if (request.Password.Length is < 8 or > 72) return BadRequest(new { error = "密码长度需为 8–72 位" });
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        user.LoginPasswordChangedAtUtc = DateTime.UtcNow;
        user.FailedLoginAttempts = 0; user.LockoutUntilUtc = null;
        await repository.UpdateUserAsync(user, ct);
        await repository.RevokeSessionsAsync(user.Id, null, "password-reset", ct);
        await AddOfflineLogAsync(user, "登录密码已重置", ct);
        await AuditAsync("user.password-reset", "user", user.Id, "管理员重置登录密码", ct);
        return NoContent();
    }

    [HttpPost("users/{account}/duplicate")]
    public async Task<ActionResult<AdminUserView>> DuplicateUser(string account, AdminUserCreateRequest request, CancellationToken ct)
    {
        var source = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (source is null || source.Role != UserRole.User) return NotFound(new { error = "源用户不存在" });
        UserAccount? created;
        try { created = await CreateUserCoreAsync(request with { DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? source.DisplayName + " 副本" : request.DisplayName }, ct); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
        if (created is null) return Conflict(new { error = "新账号已存在" });
        created.Role = source.Role; created.RiskLevel1 = source.RiskLevel1; created.RiskLevel2 = source.RiskLevel2;
        await repository.UpdateUserAsync(created, ct);
        await AuditAsync("user.duplicate", "user", created.Id, $"source={source.Account}", ct);
        return Ok(ToView(created, []));
    }

    [HttpGet("users/{account}/same-ip")]
    public async Task<ActionResult> SameIpUsers(string account, CancellationToken ct)
    {
        var source = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (source is null || source.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        if (string.IsNullOrWhiteSpace(source.LastLoginIp)) return Ok(Array.Empty<object>());
        var users = await repository.GetUsersAsync(null, null, 10000, ct);
        return Ok(users.Where(x => x.Role == UserRole.User && x.Id != source.Id && x.LastLoginIp == source.LastLoginIp).Select(x => new { x.Id, x.Account, x.DisplayName, x.LastLoginIp }));
    }

    [HttpGet("users/{account}/invite-options")]
    public async Task<ActionResult> UserInviteOptions(string account, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        var invites = (await repository.GetInvitesAsync(500, ct))
            .Where(x => x.Code.Length == 8)
            .OrderByDescending(x => x.IsActive)
            .ThenBy(x => x.Code)
            .Select(x => new { x.Code, x.IsActive, x.UsedCount, x.MaxUses, x.ExpiresAtUtc });
        return Ok(new { user.Account, currentCode = user.InviteSource, invites });
    }

    [HttpPut("users/{account}/invite-code")]
    public async Task<ActionResult> UpdateUserInvite(string account, AdminUserInviteRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        var code = request.Code.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9]{8}$")) return BadRequest(new { error = "邀请码必须为 8 位大写字母或数字" });
        var invite = (await repository.GetInvitesAsync(500, ct)).FirstOrDefault(x => x.Code == code);
        if (invite is null) return BadRequest(new { error = "邀请码不存在，请先在邀请码设置中创建" });
        user.InviteSource = code;
        await repository.UpdateUserAsync(user, ct);
        await AuditAsync("user.invite-code", "user", user.Id, $"code={code}", ct);
        return Ok(new { user.Account, code });
    }

    [HttpPost("users/{account}/status")]
    public async Task<ActionResult> SetUserStatus(string account, AdminUserStatusRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(NormalizeAccount(account), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
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
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
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
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z0-9]{8}$")) return BadRequest(new { error = "邀请码必须为 8 位大写字母或数字" });
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

    private async Task<AdminUserPage> SearchUsersAsync(AdminUserQuery query, CancellationToken ct)
    {
        var users = await repository.GetUsersAsync(null, null, 10000, ct);
        var activeSessions = (await repository.GetAllSessionsAsync(20000, ct))
            .Where(x => x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow)
            .GroupBy(x => x.UserId).ToDictionary(x => x.Key, x => (IReadOnlyList<RefreshSession>)x.ToList());
        IEnumerable<UserAccount> filtered = users.Where(x => x.Role == UserRole.User);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            filtered = filtered.Where(x => x.Id.Contains(term, StringComparison.OrdinalIgnoreCase) || x.Account.Contains(term, StringComparison.OrdinalIgnoreCase) || x.DisplayName.Contains(term, StringComparison.OrdinalIgnoreCase) || x.MobilePhone.Contains(term, StringComparison.OrdinalIgnoreCase));
        }
        if (query.Status.HasValue) filtered = filtered.Where(x => x.Status == query.Status.Value);
        if (query.Online.HasValue) filtered = filtered.Where(x => activeSessions.ContainsKey(x.Id) == query.Online.Value);
        if (query.HasMobile.HasValue) filtered = filtered.Where(x => !string.IsNullOrWhiteSpace(x.MobilePhone) == query.HasMobile.Value);
        if (query.RealNameVerified.HasValue) filtered = filtered.Where(x => x.RealNameVerified == query.RealNameVerified.Value);
        if (query.EnterpriseVerified.HasValue) filtered = filtered.Where(x => x.EnterpriseVerified == query.EnterpriseVerified.Value);
        if (query.TodayOnline.HasValue) filtered = filtered.Where(x => x.LastSeenAtUtc.Date == DateTime.UtcNow.Date == query.TodayOnline.Value);
        if (query.AccountLocked.HasValue) filtered = filtered.Where(x => x.AccountLocked == query.AccountLocked.Value);
        if (query.LoginLocked.HasValue) filtered = filtered.Where(x => x.LoginLocked == query.LoginLocked.Value);
        if (query.CancellationEnabled.HasValue) filtered = filtered.Where(x => x.CancellationEnabled == query.CancellationEnabled.Value);
        if (query.RedFlagged.HasValue) filtered = filtered.Where(x => x.RedFlagged == query.RedFlagged.Value);
        if (!string.IsNullOrWhiteSpace(query.RegistrationSource)) filtered = filtered.Where(x => x.RegistrationSource.Equals(query.RegistrationSource, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.LastLoginIp)) filtered = filtered.Where(x => x.LastLoginIp.Contains(query.LastLoginIp.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.LastOnlineIp)) filtered = filtered.Where(x => x.LastOnlineIp.Contains(query.LastOnlineIp.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.LastNodeIp)) filtered = filtered.Where(x => x.LastNodeIp.Contains(query.LastNodeIp.Trim(), StringComparison.OrdinalIgnoreCase));
        if (query.RegisteredFromUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc >= query.RegisteredFromUtc.Value);
        if (query.RegisteredToUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc <= query.RegisteredToUtc.Value);
        if (query.LastSeenFromUtc.HasValue) filtered = filtered.Where(x => x.LastSeenAtUtc >= query.LastSeenFromUtc.Value);
        if (query.LastSeenToUtc.HasValue) filtered = filtered.Where(x => x.LastSeenAtUtc <= query.LastSeenToUtc.Value);
        if (query.FailedLoginMin.HasValue) filtered = filtered.Where(x => x.FailedLoginAttempts >= query.FailedLoginMin.Value);
        if (query.FailedLoginMax.HasValue) filtered = filtered.Where(x => x.FailedLoginAttempts <= query.FailedLoginMax.Value);

        var ordered = filtered.OrderByDescending(x => x.CreatedAtUtc).ToList();
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 10, 10000);
        var items = ordered.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => ToView(x, activeSessions.GetValueOrDefault(x.Id) ?? [])).ToList();
        return new AdminUserPage(items, ordered.Count, page, pageSize, Math.Max(1, (int)Math.Ceiling(ordered.Count / (double)pageSize)));
    }

    private async Task<UserAccount?> CreateUserCoreAsync(AdminUserCreateRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Account)) throw new ArgumentException("账号不能为空");
        var account = NormalizeAccount(request.Account);
        if (!System.Text.RegularExpressions.Regex.IsMatch(account, "^[a-z][a-z0-9_]{3,19}$")) throw new ArgumentException("账号需以字母开头，并由 4–20 位字母、数字或下划线组成");
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length is < 8 or > 72) throw new ArgumentException("密码长度需为 8–72 位");
        if (await repository.GetUserByAccountAsync(account, ct) is not null) return null;
        var user = new UserAccount
        {
            Account = account,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? account : Trim(request.DisplayName, 60),
            MobilePhone = Trim(request.MobilePhone, 30),
            Role = UserRole.User,
            RegistrationSource = "后台开户",
            InviteSource = Trim(request.InviteSource, 60),
            AgreementVersion = "admin-created",
            AgreementAcceptedAtUtc = DateTime.UtcNow
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        await repository.AddUserAsync(user, ct);
        return user;
    }

    private static AdminUserView ToView(UserAccount user, IReadOnlyList<RefreshSession> sessions) => new()
    {
        Id = user.Id, Account = user.Account, DisplayName = user.DisplayName, MobilePhone = user.MobilePhone,
        Role = user.Role, Status = user.Status, RiskLevel1 = user.RiskLevel1, RiskLevel2 = user.RiskLevel2,
        AccountBalance = user.AccountBalance, FrozenBalance = user.FrozenBalance, ActiveSessions = sessions.Count,
        Online = sessions.Count > 0, AccountLocked = user.AccountLocked, LoginLocked = user.LoginLocked,
        BankCardLocked = user.BankCardLocked, CancellationEnabled = user.CancellationEnabled,
        RealNameVerified = user.RealNameVerified, EnterpriseVerified = user.EnterpriseVerified, RedFlagged = user.RedFlagged,
        RegistrationSource = user.RegistrationSource, InviteSource = user.InviteSource, LoginIpRestriction = user.LoginIpRestriction,
        CreatedAtUtc = user.CreatedAtUtc, LastSeenAtUtc = user.LastSeenAtUtc, LastLoginAtUtc = user.LastLoginAtUtc,
        LoginPasswordChangedAtUtc = user.LoginPasswordChangedAtUtc, LockoutUntilUtc = user.LockoutUntilUtc,
        FailedLoginAttempts = user.FailedLoginAttempts, LastLoginAddress = user.LastLoginAddress,
        LastLoginIp = user.LastLoginIp, LastOnlineIp = user.LastOnlineIp, LastNodeIp = user.LastNodeIp
    };

    private async Task AuditAsync(string action, string targetType, string targetId, string detail, CancellationToken ct)
    {
        var adminUserId = User.UserId();
        var admin = await repository.GetUserByIdAsync(adminUserId, ct);
        var ip = RequestMetadata.ClientIp(HttpContext);
        await repository.AddAdminAuditAsync(new AdminAuditLog
        {
            AdminUserId = adminUserId,
            AdminAccount = admin?.Account ?? "admin",
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            Detail = TrimDetail(detail),
            IpAddress = ip,
            Address = await geoIp.ResolveAddressAsync(ip, ct)
        }, ct);
    }

    private async Task<AdminModuleRecord> AddOfflineLogAsync(UserAccount user, string reason, CancellationToken ct)
    {
        var ip = RequestMetadata.ClientIp(HttpContext);
        return await repository.UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = "account.offline-logs", Name = "管理员下线用户", Status = "Offline",
            Data = new Dictionary<string, string> { ["userId"] = user.Id, ["account"] = user.Account, ["reason"] = reason, ["admin"] = User.Identity?.Name ?? "admin", ["ip"] = ip, ["address"] = await geoIp.ResolveAddressAsync(ip, ct) }
        }, ct);
    }

    private static string NormalizeAccount(string value) => value.Trim().ToLowerInvariant();
    private static string Trim(string? value, int maxLength)
    {
        var text = value?.Trim() ?? "";
        return text[..Math.Min(text.Length, maxLength)];
    }
    private static string TrimDetail(string? value) => string.IsNullOrWhiteSpace(value) ? "" : value.Trim()[..Math.Min(value.Trim().Length, 300)];
}
