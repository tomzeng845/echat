using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IChatRepository repository, PasswordHasher<UserAccount> passwordHasher, TokenService tokens, TotpService totp, AdminSecretProtector protector, SessionService sessions, GeoIpService geoIp, IHostEnvironment environment, IConfiguration configuration) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var account = request.Account.Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(account, "^[a-z][a-z0-9_]{3,19}$")) return BadRequest(Fail("账号需以字母开头，并由 4–20 位字母、数字或下划线组成"));
        if (request.Password.Length is < 8 or > 72) return BadRequest(Fail("密码长度需为 8–72 位"));
        if (!request.AgreementAccepted) return BadRequest(Fail("请先同意服务协议和隐私政策"));
        if (await repository.GetUserByAccountAsync(account, ct) is not null) return Conflict(Fail("账号已存在"));
        if (!await repository.TryConsumeInviteAsync(request.InviteCode.Trim().ToUpperInvariant(), ct)) return BadRequest(Fail("邀请码无效、已过期或已用完"));

        var user = new UserAccount
        {
            Account = account,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? account : request.DisplayName.Trim(),
            AgreementAcceptedAtUtc = DateTime.UtcNow,
            RegistrationSource = "邀请注册",
            InviteSource = request.InviteCode.Trim().ToUpperInvariant()
        };
        var currentIp = CurrentIp();
        user.LastSeenAtUtc = DateTime.UtcNow;
        user.LastLoginAtUtc = DateTime.UtcNow;
        user.LastLoginIp = currentIp;
        user.LastOnlineIp = currentIp;
        user.LastLoginAddress = await geoIp.ResolveAddressAsync(currentIp, ct);
        user.LastNodeIp = Environment.GetEnvironmentVariable("HOSTNAME") ?? "api-node";
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        try { await repository.AddUserAsync(user, ct); }
        catch (InvalidOperationException) { return Conflict(Fail("账号已存在")); }
        var response = await sessions.IssueAsync(user, request.DeviceName, request.DeviceId, ct);
        await LogLoginAsync(user.Account, request.DeviceName, "success", "注册登录成功", user.Id, ct);
        return Ok(response);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await repository.GetUserByAccountAsync(request.Account.Trim().ToLowerInvariant(), ct);
        if (user is null) { await LogLoginAsync(request.Account, request.DeviceName, "failed", "账号不存在", null, ct); return Unauthorized(Fail("账号或密码错误")); }
        if (user.Status is UserStatus.Disabled or UserStatus.PendingDeletion || user.CancellationEnabled) { await LogLoginAsync(user.Account, request.DeviceName, "failed", "账号已停用或注销", user.Id, ct); return StatusCode(StatusCodes.Status403Forbidden, Fail("账号当前不可登录")); }
        if (user.AccountLocked || user.LoginLocked) { await LogLoginAsync(user.Account, request.DeviceName, "failed", "账号或登录已锁定", user.Id, ct); return StatusCode(StatusCodes.Status403Forbidden, Fail("账号登录已被管理员锁定")); }
        var currentIp = CurrentIp();
        if (!IpAllowed(user.LoginIpRestriction, currentIp)) { await LogLoginAsync(user.Account, request.DeviceName, "failed", "来源 IP 不在允许列表", user.Id, ct); return StatusCode(StatusCodes.Status403Forbidden, Fail("当前网络不允许登录此账号")); }
        if (user.LockoutUntilUtc > DateTime.UtcNow) { await LogLoginAsync(user.Account, request.DeviceName, "failed", "账号锁定", user.Id, ct); return StatusCode(StatusCodes.Status429TooManyRequests, Fail("登录尝试过多，请稍后再试")); }

        var verified = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verified == PasswordVerificationResult.Failed)
        {
            user.FailedLoginAttempts++;
            if (user.FailedLoginAttempts >= 5) { user.LockoutUntilUtc = DateTime.UtcNow.AddMinutes(Math.Min(30, user.FailedLoginAttempts)); user.FailedLoginAttempts = 0; }
            await repository.UpdateUserAsync(user, ct);
            await LogLoginAsync(user.Account, request.DeviceName, "failed", "密码错误", user.Id, ct);
            return Unauthorized(Fail("账号或密码错误"));
        }

        user.FailedLoginAttempts = 0; user.LockoutUntilUtc = null; user.LastSeenAtUtc = DateTime.UtcNow;
        user.LastLoginAtUtc = DateTime.UtcNow;
        user.LastLoginIp = currentIp;
        user.LastOnlineIp = currentIp;
        user.LastLoginAddress = await geoIp.ResolveAddressAsync(currentIp, ct);
        user.LastNodeIp = Environment.GetEnvironmentVariable("HOSTNAME") ?? "api-node";
        if (verified == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        await repository.UpdateUserAsync(user, ct);

        if (user.Role == UserRole.Admin)
        {
            var adminTotpDisabled = configuration.GetValue<bool>("Security:DisableAdminTotp")
                || string.Equals(Environment.GetEnvironmentVariable("ADMIN_DISABLE_TOTP"), "true", StringComparison.OrdinalIgnoreCase);
            if (!adminTotpDisabled && !RuntimeMode.IsEphemeralPreview(configuration, environment))
            {
                var credential = await repository.GetAdminRecordAsync($"totp:{user.Id}", ct);
                if (credential?.Status != "Active" && !totp.IsConfigured) return StatusCode(StatusCodes.Status503ServiceUnavailable, Fail("管理员动态验证码服务尚未配置"));
                var deviceId = SessionService.NormalizeDeviceId(request.DeviceId);
                var (pending, expires) = tokens.CreateAccessToken(user, TimeSpan.FromMinutes(5), "admin_pending", deviceId: deviceId);
                await LogLoginAsync(user.Account, request.DeviceName, "pending", "等待动态验证码", user.Id, ct);
                return Ok(new AuthResponse(true, null, null, expires, View(user), true, pending, DeviceId: deviceId));
            }
        }
        var response = await sessions.IssueAsync(user, request.DeviceName, request.DeviceId, ct);
        await LogLoginAsync(user.Account, request.DeviceName, "success", "密码登录成功", user.Id, ct);
        return Ok(response);
    }

    [HttpPost("totp")]
    public async Task<ActionResult<AuthResponse>> VerifyTotp(TotpVerifyRequest request, CancellationToken ct)
    {
        var principal = tokens.ValidateToken(request.PendingToken, "admin_pending");
        if (principal is null) { await LogLoginAsync("admin", request.DeviceName, "failed", "动态验证码会话无效", null, ct); return Unauthorized(Fail("动态验证码无效或已过期")); }
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var user = await repository.GetUserByIdAsync(userId, ct);
        if (user is null || user.Role != UserRole.Admin) return Unauthorized(Fail("管理员身份无效"));
        var credential = await repository.GetAdminRecordAsync($"totp:{user.Id}", ct);
        var valid = credential is not null
            ? credential.Status == "Active" && credential.Data.TryGetValue("secretCiphertext", out var ciphertext)
                && totp.VerifySecret(protector.Unprotect(ciphertext), request.Code)
            : totp.Verify(request.Code);
        if (!valid) { await LogLoginAsync(user.Account, request.DeviceName, "failed", "动态验证码错误", user.Id, ct); return Unauthorized(Fail("动态验证码无效或已过期")); }
        var response = await sessions.IssueAsync(user, request.DeviceName, request.DeviceId ?? principal.DeviceId(), ct);
        await LogLoginAsync(user.Account, request.DeviceName, "success", "TOTP 登录成功", user.Id, ct);
        return Ok(response);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var session = await repository.GetSessionByHashAsync(TokenService.Hash(request.RefreshToken), ct);
        if (session is null) return Unauthorized(Fail("登录状态已失效"));
        var user = await repository.GetUserByIdAsync(session.UserId, ct);
        if (user is null || user.Status != UserStatus.Active || user.AccountLocked || user.LoginLocked || user.CancellationEnabled) return Unauthorized(Fail("账号不可用"));
        await repository.RevokeSessionAsync(session.Id, ct);
        return Ok(await sessions.IssueAsync(user, request.DeviceName, request.DeviceId ?? session.DeviceId, ct));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserView>> Me(CancellationToken ct)
    {
        var user = await repository.GetUserByIdAsync(User.UserId(), ct);
        return user is null ? NotFound() : Ok(View(user));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var sessionId = User.SessionId();
        if (!string.IsNullOrWhiteSpace(sessionId)) await repository.RevokeSessionAsync(sessionId, ct);
        var ip = RequestMetadata.ClientIp(HttpContext);
        var data = RequestMetadata.Device(HttpContext);
        data["userId"] = User.UserId(); data["account"] = User.Identity?.Name ?? ""; data["sessionId"] = sessionId ?? ""; data["ip"] = ip; data["address"] = await geoIp.ResolveAddressAsync(ip, ct);
        await repository.UpsertAdminRecordAsync(new AdminModuleRecord { Module = "account.offline-logs", Name = "用户退出", Status = "Offline", Data = data }, ct);
        return NoContent();
    }

    private async Task<AdminModuleRecord> LogLoginAsync(string account, string device, string result, string reason, string? userId, CancellationToken ct)
    {
        var ip = RequestMetadata.ClientIp(HttpContext);
        var data = RequestMetadata.Device(HttpContext);
        data["account"] = account.Trim().ToLowerInvariant(); data["userId"] = userId ?? ""; data["device"] = device; data["result"] = result; data["reason"] = reason; data["ip"] = ip; data["address"] = await geoIp.ResolveAddressAsync(ip, ct);
        return await repository.UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = "account.login-logs", Name = result == "success" ? "登录成功" : result == "pending" ? "等待二次验证" : "登录失败", Status = result, Data = data
        }, ct);
    }

    private static AuthResponse Fail(string error) => new(false, null, null, null, null, Error: error);
    private static UserView View(UserAccount user) => SessionService.View(user);
    private string CurrentIp() => RequestMetadata.ClientIp(HttpContext);
    private static bool IpAllowed(string restriction, string currentIp) => string.IsNullOrWhiteSpace(restriction)
        || restriction.Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(value => string.Equals(value, currentIp, StringComparison.OrdinalIgnoreCase));
}
