using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/admin")]
public sealed class AdminRequirementsController(
    IChatRepository repository,
    TotpService totp,
    AdminSecretProtector protector,
    IHubContext<ChatHub> hub) : ControllerBase
{
    private static readonly string[] PushProviders = ["xiaomi", "huawei", "honor", "oppo", "vivo"];

    [HttpGet("users/{account}/verifications")]
    public async Task<ActionResult> UserVerifications(string account, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null) return NotFound(new { error = "用户不存在" });
        var records = await repository.GetAdminRecordsAsync("account.verifications", 1000, ct);
        return Ok(records.Where(x => x.Data.GetValueOrDefault("userId") == user.Id));
    }

    [HttpPost("users/{account}/verifications")]
    public async Task<ActionResult> SaveVerification(string account, AdminVerificationRequest request, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null) return NotFound(new { error = "用户不存在" });
        var type = request.Type.Equals("Enterprise", StringComparison.OrdinalIgnoreCase) ? "Enterprise" : request.Type.Equals("RealName", StringComparison.OrdinalIgnoreCase) ? "RealName" : "";
        if (type.Length == 0) return BadRequest(new { error = "认证类型必须是 RealName 或 Enterprise" });
        var id = $"verification:{user.Id}:{type.ToLowerInvariant()}";
        var record = await repository.GetAdminRecordAsync(id, ct) ?? new AdminModuleRecord { Id = id, Module = "account.verifications", Name = type == "RealName" ? "个人实名认证" : "企业实名认证" };
        record.Status = "Pending";
        record.Data = new Dictionary<string, string>
        {
            ["userId"] = user.Id, ["account"] = user.Account, ["type"] = type,
            ["realName"] = Limit(request.RealName, 60), ["idNumber"] = Limit(request.IdNumber, 40),
            ["enterpriseName"] = Limit(request.EnterpriseName, 120), ["creditCode"] = Limit(request.CreditCode, 40),
            ["legalRepresentative"] = Limit(request.LegalRepresentative, 60),
            ["materialAssetIds"] = string.Join(',', (request.MaterialAssetIds ?? []).Take(8)), ["note"] = Limit(request.Note, 300),
            ["submittedAtUtc"] = DateTime.UtcNow.ToString("O")
        };
        await repository.UpsertAdminRecordAsync(record, ct);
        await AuditAsync("verification.save", "verification", record.Id, $"{user.Account};{type}", ct);
        return Ok(record);
    }

    [HttpPost("verifications/{id}/decision")]
    public async Task<ActionResult> DecideVerification(string id, AdminVerificationDecisionRequest request, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || record.Module != "account.verifications") return NotFound(new { error = "认证申请不存在" });
        var status = request.Status is "Approved" or "Rejected" or "Closed" ? request.Status : "";
        if (status.Length == 0) return BadRequest(new { error = "状态必须是 Approved、Rejected 或 Closed" });
        if (status == "Rejected" && string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { error = "拒绝时必须填写原因" });
        record.Status = status; record.Data["reason"] = Limit(request.Reason, 300); record.Data["reviewedBy"] = User.Identity?.Name ?? "admin"; record.Data["reviewedAtUtc"] = DateTime.UtcNow.ToString("O");
        await repository.UpsertAdminRecordAsync(record, ct);
        var user = await repository.GetUserByIdAsync(record.Data.GetValueOrDefault("userId", ""), ct);
        if (user is not null)
        {
            var approved = status == "Approved";
            if (record.Data.GetValueOrDefault("type") == "RealName") user.RealNameVerified = approved;
            else user.EnterpriseVerified = approved;
            await repository.UpdateUserAsync(user, ct);
        }
        await AuditAsync("verification.decision", "verification", id, $"{status};{request.Reason}", ct);
        return Ok(record);
    }

    [HttpPost("invites/generate")]
    public async Task<ActionResult> GenerateInvite(CancellationToken ct)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var bytes = RandomNumberGenerator.GetBytes(8); var code = new string(bytes.Select(x => alphabet[x % alphabet.Length]).ToArray());
            if ((await repository.GetInvitesAsync(1000, ct)).All(x => x.Code != code)) return Ok(new { code });
        }
        return StatusCode(503, new { error = "暂时无法生成唯一邀请码" });
    }

    [HttpGet("login-logs/search")]
    public async Task<ActionResult> SearchLoginLogs([FromQuery] AdminLoginLogQuery query, CancellationToken ct)
    {
        var records = await repository.GetAdminRecordsAsync("account.login-logs", 10000, ct);
        IEnumerable<AdminModuleRecord> filtered = records;
        if (!string.IsNullOrWhiteSpace(query.Scope) && query.Scope.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            var ids = (await repository.GetUsersAsync(null, null, 10000, ct)).Where(x => x.Role != UserRole.User).Select(x => x.Id).ToHashSet();
            filtered = filtered.Where(x => ids.Contains(x.Data.GetValueOrDefault("userId", "")));
        }
        if (!string.IsNullOrWhiteSpace(query.Account)) filtered = filtered.Where(x => x.Data.GetValueOrDefault("account", "").Contains(query.Account, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.Ip)) filtered = filtered.Where(x => x.Data.GetValueOrDefault("ip", "").Contains(query.Ip, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.Result)) filtered = filtered.Where(x => x.Data.GetValueOrDefault("result", "").Equals(query.Result, StringComparison.OrdinalIgnoreCase));
        if (query.FromUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc >= query.FromUtc.Value);
        if (query.ToUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc <= query.ToUtc.Value);
        return Ok(Page(filtered.OrderByDescending(x => x.CreatedAtUtc).ToList(), query.Page, query.PageSize));
    }

    [HttpGet("offline-logs/search")]
    public async Task<ActionResult> SearchOfflineLogs([FromQuery] AdminLoginLogQuery query, CancellationToken ct)
    {
        var records = await repository.GetAdminRecordsAsync("account.offline-logs", 10000, ct);
        IEnumerable<AdminModuleRecord> filtered = records;
        if (!string.IsNullOrWhiteSpace(query.Account)) filtered = filtered.Where(x => x.Data.GetValueOrDefault("account", "").Contains(query.Account, StringComparison.OrdinalIgnoreCase));
        if (query.FromUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc >= query.FromUtc.Value);
        if (query.ToUtc.HasValue) filtered = filtered.Where(x => x.CreatedAtUtc <= query.ToUtc.Value);
        return Ok(Page(filtered.OrderByDescending(x => x.CreatedAtUtc).ToList(), query.Page, query.PageSize));
    }

    [HttpGet("login-failure-ips")]
    public async Task<ActionResult> LoginFailureIps([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var failures = (await repository.GetAdminRecordsAsync("account.login-logs", 10000, ct)).Where(x => x.Data.GetValueOrDefault("result") != "success");
        var decisions = (await repository.GetAdminRecordsAsync("account.login-ip-decisions", 1000, ct)).ToDictionary(x => x.Data.GetValueOrDefault("ip", ""), StringComparer.OrdinalIgnoreCase);
        var items = failures.GroupBy(x => x.Data.GetValueOrDefault("ip", "unknown"))
            .Select(g => new { ip = g.Key, count = g.Count(), accounts = string.Join(", ", g.Select(x => x.Data.GetValueOrDefault("account", "未知")).Distinct().Take(20)), lastAtUtc = g.Max(x => x.CreatedAtUtc), lastReason = g.OrderByDescending(x => x.CreatedAtUtc).First().Data.GetValueOrDefault("reason", "失败"), status = decisions.GetValueOrDefault(g.Key)?.Status ?? "Observed", note = decisions.GetValueOrDefault(g.Key)?.Data.GetValueOrDefault("note", "") ?? "" })
            .Where(x => string.IsNullOrWhiteSpace(search) || x.ip.Contains(search, StringComparison.OrdinalIgnoreCase) || x.accounts.Contains(search, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.count).ToList();
        return Ok(Page(items, page, pageSize));
    }

    [HttpPost("login-failure-ips/{ip}/decision")]
    public async Task<ActionResult> DecideIp(string ip, AdminIpDecisionRequest request, CancellationToken ct)
    {
        var status = request.Status is "Blocked" or "Ignored" or "Observed" ? request.Status : "";
        if (status.Length == 0) return BadRequest(new { error = "状态必须是 Blocked、Ignored 或 Observed" });
        var record = new AdminModuleRecord { Id = $"login-ip:{TokenService.Hash(ip)[..20]}", Module = "account.login-ip-decisions", Name = ip, Status = status, Data = new() { ["ip"] = ip, ["note"] = Limit(request.Note, 300) } };
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("login-ip.decision", "ip", ip, status, ct); return Ok(record);
    }

    [HttpGet("feedback/search")]
    public async Task<ActionResult> SearchFeedback([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var records = await repository.GetAdminRecordsAsync("account.feedback", 10000, ct);
        var filtered = string.IsNullOrWhiteSpace(status) ? records : records.Where(x => x.Status.Equals(status, StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(Page(filtered.OrderByDescending(x => x.CreatedAtUtc).ToList(), page, pageSize));
    }

    [HttpGet("fund/subjects")]
    public async Task<ActionResult> FundSubjects(CancellationToken ct) => Ok(await repository.GetAdminRecordsAsync("fund.subjects", 1000, ct));

    [HttpPost("fund/subjects")]
    public async Task<ActionResult> CreateFundSubject(AdminFundSubjectRequest request, CancellationToken ct) => await SaveFundSubject(null, request, ct);

    [HttpPut("fund/subjects/{id}")]
    public async Task<ActionResult> UpdateFundSubject(string id, AdminFundSubjectRequest request, CancellationToken ct) => await SaveFundSubject(id, request, ct);

    [HttpDelete("fund/subjects/{id}")]
    public async Task<ActionResult> DisableFundSubject(string id, CancellationToken ct)
    {
        var subject = await repository.GetAdminRecordAsync(id, ct); if (subject is null || subject.Module != "fund.subjects") return NotFound(new { error = "科目不存在" });
        subject.Status = "Disabled"; subject.Data["enabled"] = "false"; await repository.UpsertAdminRecordAsync(subject, ct); await AuditAsync("fund.subject.disable", "fundSubject", id, subject.Name, ct); return NoContent();
    }

    [HttpPost("fund/adjustments")]
    public async Task<ActionResult> CreateFundAdjustment(AdminFundAdjustmentRequest request, CancellationToken ct)
    {
        if (request.Amount <= 0) return BadRequest(new { error = "金额必须大于 0" });
        var direction = request.Direction is "Increase" or "Decrease" ? request.Direction : ""; if (direction.Length == 0) return BadRequest(new { error = "方向必须是 Increase 或 Decrease" });
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            var existing = await repository.GetAdminRecordAsync($"fund-adjust:{request.IdempotencyKey}", ct); if (existing is not null) return Ok(existing);
        }
        var subject = (await repository.GetAdminRecordsAsync("fund.subjects", 1000, ct)).FirstOrDefault(x => string.Equals(x.Data.GetValueOrDefault("code"), request.SubjectCode, StringComparison.OrdinalIgnoreCase));
        if (subject is null || subject.Status != "Active") return BadRequest(new { error = "额度科目不存在或已停用" });
        var allowed = subject.Data.GetValueOrDefault("direction", "Both"); if (allowed != "Both" && allowed != direction) return BadRequest(new { error = "额度科目不支持此调整方向" });
        decimal.TryParse(subject.Data.GetValueOrDefault("minAmount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var min); decimal.TryParse(subject.Data.GetValueOrDefault("maxAmount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var max);
        if (request.Amount < min || (max > 0 && request.Amount > max)) return BadRequest(new { error = $"金额需在 {min:0.00}–{max:0.00} 范围内" });
        var user = await UserAsync(request.Account, ct); if (user is null) return NotFound(new { error = "用户不存在" });
        var delta = direction == "Increase" ? request.Amount : -request.Amount; var before = user.AccountBalance; var after = before + delta; if (after < 0) return BadRequest(new { error = "调整后余额不能小于 0" });
        user.AccountBalance = after; await repository.UpdateUserAsync(user, ct);
        var id = string.IsNullOrWhiteSpace(request.IdempotencyKey) ? Guid.NewGuid().ToString("N") : $"fund-adjust:{request.IdempotencyKey}";
        var record = new AdminModuleRecord { Id = id, Module = "fund.adjustments", Name = subject.Name, Status = "Completed", Data = new() { ["account"] = user.Account, ["userId"] = user.Id, ["subjectCode"] = request.SubjectCode.ToUpperInvariant(), ["direction"] = direction, ["amount"] = request.Amount.ToString("0.00", CultureInfo.InvariantCulture), ["balanceBefore"] = before.ToString("0.00", CultureInfo.InvariantCulture), ["balanceAfter"] = after.ToString("0.00", CultureInfo.InvariantCulture), ["note"] = Limit(request.Note, 300), ["operator"] = User.Identity?.Name ?? "admin" } };
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("fund.adjust", "user", user.Id, $"{direction} {request.Amount:0.00} {request.SubjectCode}", ct); return Ok(record);
    }

    [HttpGet("fund/adjustments")]
    public async Task<ActionResult> FundAdjustments([FromQuery] string? account, [FromQuery] string? direction, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        IEnumerable<AdminModuleRecord> records = await repository.GetAdminRecordsAsync("fund.adjustments", 10000, ct);
        if (!string.IsNullOrWhiteSpace(account)) records = records.Where(x => x.Data.GetValueOrDefault("account", "").Contains(account, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(direction)) records = records.Where(x => x.Data.GetValueOrDefault("direction", "").Equals(direction, StringComparison.OrdinalIgnoreCase));
        return Ok(Page(records.OrderByDescending(x => x.CreatedAtUtc).ToList(), page, pageSize));
    }

    [HttpGet("fund/transactions")]
    public async Task<ActionResult> FundTransactions([FromQuery] string? search, [FromQuery] decimal? minAmount, [FromQuery] decimal? maxAmount, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        IEnumerable<AdminModuleRecord> records = await repository.GetAdminRecordsAsync("fund.adjustments", 10000, ct);
        if (!string.IsNullOrWhiteSpace(search)) records = records.Where(x => x.Name.Contains(search, StringComparison.OrdinalIgnoreCase) || x.Data.Values.Any(v => v.Contains(search, StringComparison.OrdinalIgnoreCase)));
        if (minAmount.HasValue) records = records.Where(x => decimal.TryParse(x.Data.GetValueOrDefault("amount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) && amount >= minAmount);
        if (maxAmount.HasValue) records = records.Where(x => decimal.TryParse(x.Data.GetValueOrDefault("amount"), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) && amount <= maxAmount);
        return Ok(Page(records.OrderByDescending(x => x.CreatedAtUtc).ToList(), page, pageSize));
    }

    [HttpGet("chat/conversations")]
    public async Task<ActionResult> SearchConversations([FromQuery] AdminConversationQuery query, [FromQuery] bool groupsOnly = false, CancellationToken ct = default)
    {
        var conversations = await repository.GetAllConversationsAsync(1000, ct);
        var users = await repository.GetUsersAsync(null, null, 10000, ct);
        var byId = users.ToDictionary(x => x.Id);
        IEnumerable<Conversation> filtered = conversations;
        if (groupsOnly) filtered = filtered.Where(x => x.Type == ConversationType.Group);
        if (!string.IsNullOrWhiteSpace(query.Status)) filtered = query.Status.Equals("Dissolved", StringComparison.OrdinalIgnoreCase) ? filtered.Where(x => x.IsDissolved) : filtered.Where(x => !x.IsDissolved);
        if (!string.IsNullOrWhiteSpace(query.Search)) filtered = filtered.Where(x => x.Id.Contains(query.Search, StringComparison.OrdinalIgnoreCase) || x.Name.Contains(query.Search, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(query.Account))
        {
            var memberIds = users.Where(x => x.Account.Contains(query.Account, StringComparison.OrdinalIgnoreCase) || x.DisplayName.Contains(query.Account, StringComparison.OrdinalIgnoreCase)).Select(x => x.Id).ToHashSet();
            filtered = filtered.Where(x => x.Members.Any(m => memberIds.Contains(m.UserId)));
        }
        var rows = filtered.OrderByDescending(x => x.LastMessageAtUtc ?? x.CreatedAtUtc).Select(x => new
        {
            x.Id, x.Type, x.Name, x.IsDissolved, x.LastSequence, x.LastMessageAtUtc,
            memberCount = x.Members.Count(m => m.LeftAtSequence is null),
            owner = byId.GetValueOrDefault(x.CreatedBy)?.Account ?? x.CreatedBy,
            members = x.Members.Where(m => m.LeftAtSequence is null).Take(20).Select(m => byId.GetValueOrDefault(m.UserId)?.Account ?? m.UserId).ToList()
        }).ToList();
        return Ok(Page(rows, query.Page, query.PageSize));
    }

    [HttpPost("chat/groups")]
    public async Task<ActionResult> CreateGroup(AdminGroupRequest request, CancellationToken ct)
    {
        var name = Limit(request.Name, 80);
        var ownerAccount = request.OwnerAccount.Trim().ToLowerInvariant();
        var accounts = request.MemberAccounts.Append(ownerAccount).Select(x => x.Trim().ToLowerInvariant()).Where(x => x.Length > 0).Distinct().Take(200).ToList();
        if (name.Length < 2 || accounts.Count < 2) return BadRequest(new { error = "群名称至少 2 字且至少包含 2 个成员" });
        var users = new List<UserAccount>();
        foreach (var account in accounts)
        {
            var member = await repository.GetUserByAccountAsync(account, ct);
            if (member is null || member.Role != UserRole.User || member.Status != UserStatus.Active) return BadRequest(new { error = $"成员 @{account} 不存在或不可用" });
            if (string.IsNullOrWhiteSpace(member.PublicKeyJwk)) return BadRequest(new { error = $"成员 @{account} 尚未发布加密公钥" });
            users.Add(member);
        }
        var owner = users.First(x => x.Account == ownerAccount);
        var key = RandomNumberGenerator.GetBytes(32);
        try
        {
            var conversation = new Conversation
            {
                Type = ConversationType.Group,
                Name = name,
                CreatedBy = owner.Id,
                Members = users.Select(member => new ConversationMember { UserId = member.Id, Role = member.Id == owner.Id ? MemberRole.Owner : MemberRole.Member }).ToList(),
                KeyEnvelopes = users.ToDictionary(member => member.Id, member => EncryptEnvelope(member.PublicKeyJwk, key))
            };
            await repository.AddConversationAsync(conversation, ct);
            await AuditAsync("group.create", "conversation", conversation.Id, $"owner={owner.Account};members={users.Count};server-generated-envelope", ct);
            return Ok(new { conversation.Id, conversation.Name, owner = owner.Account, memberCount = users.Count });
        }
        catch (Exception error) when (error is CryptographicException or JsonException or FormatException)
        {
            return BadRequest(new { error = "成员加密公钥格式无效，无法创建安全群聊" });
        }
        finally { CryptographicOperations.ZeroMemory(key); }
    }

    [HttpPut("chat/groups/{id}")]
    public async Task<ActionResult> UpdateGroup(string id, AdminGroupUpdateRequest request, CancellationToken ct)
    {
        var conversation = await repository.GetConversationAsync(id, ct);
        if (conversation is null || conversation.Type != ConversationType.Group) return NotFound(new { error = "群聊不存在" });
        var name = Limit(request.Name, 80);
        if (name.Length < 2) return BadRequest(new { error = "群名称至少 2 字" });
        conversation.Name = name;
        await repository.UpdateConversationAsync(conversation, ct);
        await AuditAsync("group.update", "conversation", id, name, ct);
        return Ok(new { conversation.Id, conversation.Name });
    }

    [HttpPut("operators/{account}")]
    public async Task<ActionResult> UpdateOperator(string account, AdminOperatorUpdateRequest request, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null || user.Role == UserRole.User) return NotFound(new { error = "管理账号不存在" });
        if (user.Id == User.UserId() && request.Status != UserStatus.Active) return BadRequest(new { error = "不能停用当前管理账号" });
        user.DisplayName = Limit(request.DisplayName, 60); user.Role = UserRole.Admin; user.Status = request.Status;
        await repository.UpdateUserAsync(user, ct); if (request.Status != UserStatus.Active) await repository.RevokeSessionsAsync(user.Id, null, "operator-disabled", ct);
        await AuditAsync("operator.update", "user", user.Id, $"{user.Role};{user.Status}", ct); return Ok(SessionService.View(user));
    }

    [HttpDelete("operators/{account}")]
    public async Task<ActionResult> DeleteOperator(string account, CancellationToken ct)
    {
        var user = await UserAsync(account, ct);
        if (user is null || user.Role != UserRole.Admin) return NotFound(new { error = "管理账号不存在" });
        if (user.Id == User.UserId()) return BadRequest(new { error = "不能删除当前管理账号" });
        user.Status = UserStatus.Disabled;
        await repository.UpdateUserAsync(user, ct);
        await repository.RevokeSessionsAsync(user.Id, null, "operator-deleted", ct);
        await AuditAsync("operator.delete", "user", user.Id, user.Account, ct);
        return NoContent();
    }

    [HttpGet("operators/{account}/totp")]
    public async Task<ActionResult> TotpStatus(string account, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null || user.Role == UserRole.User) return NotFound(new { error = "管理账号不存在" });
        var record = await repository.GetAdminRecordAsync($"totp:{user.Id}", ct); return Ok(new { configured = record?.Status == "Active", status = record?.Status ?? "NotConfigured", updatedAtUtc = record?.UpdatedAtUtc });
    }

    [HttpPost("operators/{account}/totp/enroll")]
    public async Task<ActionResult> EnrollTotp(string account, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null || user.Role == UserRole.User) return NotFound(new { error = "管理账号不存在" });
        var secret = TotpService.GenerateSecret(); var record = new AdminModuleRecord { Id = $"totp:{user.Id}", Module = "system.admin-totp", Name = user.Account, Status = "Pending", Data = new() { ["userId"] = user.Id, ["secretCiphertext"] = protector.Protect(secret) } };
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("operator.totp.enroll", "user", user.Id, "生成待确认密钥", ct);
        return Ok(new { secret, provisioningUri = totp.ProvisioningUri(user.Account, secret), status = record.Status });
    }

    [HttpPost("operators/{account}/totp/confirm")]
    public async Task<ActionResult> ConfirmTotp(string account, AdminTotpConfirmRequest request, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null) return NotFound(new { error = "管理账号不存在" }); var record = await repository.GetAdminRecordAsync($"totp:{user.Id}", ct);
        if (record is null || !record.Data.TryGetValue("secretCiphertext", out var cipher)) return NotFound(new { error = "请先生成密钥" });
        if (!totp.VerifySecret(protector.Unprotect(cipher), request.Code)) return Unauthorized(new { error = "动态验证码不正确" });
        record.Status = "Active"; record.Data["confirmedAtUtc"] = DateTime.UtcNow.ToString("O"); await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("operator.totp.confirm", "user", user.Id, "启用 Google Authenticator", ct); return Ok(new { configured = true });
    }

    [HttpDelete("operators/{account}/totp")]
    public async Task<ActionResult> DisableTotp(string account, CancellationToken ct)
    {
        var user = await UserAsync(account, ct); if (user is null) return NotFound(new { error = "管理账号不存在" }); var record = await repository.GetAdminRecordAsync($"totp:{user.Id}", ct); if (record is null) return NoContent();
        record.Status = "Disabled"; record.Data.Remove("secretCiphertext"); await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("operator.totp.disable", "user", user.Id, "停用 Google Authenticator", ct); return NoContent();
    }

    [HttpGet("push-providers")]
    public async Task<ActionResult> GetPushProviders(CancellationToken ct)
    {
        var records = await repository.GetAdminRecordsAsync("system.push", 100, ct); return Ok(PushProviders.Select(provider =>
        {
            var item = records.FirstOrDefault(x => x.Name == provider); return new { provider, enabled = item?.Status == "Active", appId = item?.Data.GetValueOrDefault("appId", "") ?? "", secretMasked = item is null ? "" : "••••••••", lastTestAtUtc = item?.Data.GetValueOrDefault("lastTestAtUtc", ""), lastTestStatus = item?.Data.GetValueOrDefault("lastTestStatus", "NotTested") ?? "NotTested" };
        }));
    }

    [HttpPut("push-providers/{provider}")]
    public async Task<ActionResult> SavePushProvider(string provider, [FromBody] Dictionary<string, string> request, CancellationToken ct)
    {
        provider = provider.ToLowerInvariant(); if (!PushProviders.Contains(provider)) return BadRequest(new { error = "不支持的厂商" });
        var id = $"push:{provider}"; var record = await repository.GetAdminRecordAsync(id, ct) ?? new AdminModuleRecord { Id = id, Module = "system.push", Name = provider };
        record.Status = request.GetValueOrDefault("enabled") == "true" ? "Active" : "Disabled"; record.Data["appId"] = Limit(request.GetValueOrDefault("appId"), 100);
        if (!string.IsNullOrWhiteSpace(request.GetValueOrDefault("secret"))) record.Data["secretCiphertext"] = protector.Protect(request["secret"]);
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("push.update", "pushProvider", provider, record.Status, ct); return Ok(new { provider, enabled = record.Status == "Active", appId = record.Data.GetValueOrDefault("appId"), secretMasked = record.Data.ContainsKey("secretCiphertext") ? "••••••••" : "" });
    }

    [HttpPost("push-providers/{provider}/test")]
    public async Task<ActionResult> TestPushProvider(string provider, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync($"push:{provider.ToLowerInvariant()}", ct); if (record is null || !record.Data.ContainsKey("secretCiphertext")) return BadRequest(new { error = "请先保存 AppId 和密钥" });
        record.Data["lastTestAtUtc"] = DateTime.UtcNow.ToString("O"); record.Data["lastTestStatus"] = "Configured"; await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("push.test", "pushProvider", provider, "本地配置校验通过；未调用厂商网关", ct); return Ok(new { configured = true, delivered = false, message = "配置校验通过；接入厂商凭据与发送网关后可真实投递" });
    }

    [HttpPost("announcements/{id}/action")]
    public async Task<ActionResult> AnnouncementAction(string id, AdminAnnouncementActionRequest request, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct); if (record is null || record.Module != "system.announcements") return NotFound(new { error = "公告不存在" });
        if (request.Action == "publish") { record.Status = "Published"; record.Data["publishedAtUtc"] = DateTime.UtcNow.ToString("O"); var users = await repository.GetUsersAsync(null, UserStatus.Active, 10000, ct); await hub.Clients.Users(users.Select(x => x.Id)).SendAsync("admin.notice", new { id = record.Id, content = record.Data.GetValueOrDefault("content", record.Name), sentAtUtc = DateTime.UtcNow }, ct); }
        else if (request.Action == "revoke") record.Status = "Revoked"; else return BadRequest(new { error = "操作必须是 publish 或 revoke" });
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync($"announcement.{request.Action}", "announcement", id, record.Name, ct); return Ok(record);
    }

    [HttpPost("error-logs/{id}/resolve")]
    public async Task<ActionResult> ResolveError(string id, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct); if (record is null || record.Module != "system.error-logs") return NotFound(new { error = "报错记录不存在" });
        record.Status = "Resolved"; record.Data["resolvedBy"] = User.Identity?.Name ?? "admin"; record.Data["resolvedAtUtc"] = DateTime.UtcNow.ToString("O"); await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("error.resolve", "errorLog", id, record.Data.GetValueOrDefault("traceId", ""), ct); return Ok(record);
    }

    [HttpGet("conversations/{id}/messages")]
    public async Task<ActionResult> ConversationMessages(string id, [FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var conversation = await repository.GetConversationAsync(id, ct); if (conversation is null) return NotFound(new { error = "会话不存在" });
        var messages = (await repository.GetAllMessagesAsync(10000, ct)).Where(x => x.ConversationId == id).OrderByDescending(x => x.Sequence).Take(Math.Clamp(limit, 1, 200)).OrderBy(x => x.Sequence).ToList();
        var userIds = messages.Select(x => x.SenderId).Concat(conversation.Members.Select(x => x.UserId)).Distinct(); var users = new Dictionary<string, UserAccount>(); foreach (var userId in userIds) { var user = await repository.GetUserByIdAsync(userId, ct); if (user is not null) users[userId] = user; }
        await AuditAsync("conversation.messages.view", "conversation", id, $"count={messages.Count}; ciphertext-only", ct);
        return Ok(new { conversation = new { conversation.Id, conversation.Name, conversation.Type, conversation.IsDissolved }, members = conversation.Members.Select(x => new { x.UserId, account = users.GetValueOrDefault(x.UserId)?.Account, displayName = users.GetValueOrDefault(x.UserId)?.DisplayName, x.Role }), messages = messages.Select(x => new { x.Id, x.Sequence, x.Kind, x.State, x.SentAtUtc, x.SenderId, account = users.GetValueOrDefault(x.SenderId)?.Account, displayName = users.GetValueOrDefault(x.SenderId)?.DisplayName, x.Ciphertext, x.Algorithm, x.Metadata, plaintextAvailable = false }) });
    }

    [HttpPut("contacts/{id}")]
    public ActionResult UpdateContact(string id, AdminContactUpdateRequest request) => StatusCode(StatusCodes.Status410Gone, new { error = "通讯录模块已按 V2 需求下线" });

    [HttpPost("automations/{id}/run")]
    public async Task<ActionResult> RunAutomation(string id, AdminAutomationRunRequest request, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct); if (record is null || record.Module is not ("chat.robots" or "chat.group-speech")) return NotFound(new { error = "自动发言规则不存在" });
        var conversationId = request.ConversationId ?? record.Data.GetValueOrDefault("conversationId", ""); var conversation = await repository.GetConversationAsync(conversationId, ct); if (conversation is null || conversation.Type != ConversationType.Group) return BadRequest(new { error = "目标群聊不存在" });
        var content = record.Data.GetValueOrDefault("content", record.Name); if (string.IsNullOrWhiteSpace(content)) return BadRequest(new { error = "发言内容不能为空" });
        var log = await repository.UpsertAdminRecordAsync(new AdminModuleRecord { Module = "chat.automation-logs", Name = record.Name, Status = "Sent", Data = new() { ["ruleId"] = record.Id, ["conversationId"] = conversation.Id, ["content"] = Limit(content, 1000), ["targetCount"] = conversation.Members.Count(x => x.LeftAtSequence is null).ToString() } }, ct);
        await hub.Clients.Users(conversation.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId)).SendAsync("admin.notice", new { id = log.Id, content = Limit(content, 1000), sentAtUtc = DateTime.UtcNow }, ct);
        await AuditAsync("automation.run", record.Module, record.Id, $"conversation={conversation.Id}", ct); return Ok(log);
    }

    [HttpGet("group-invites")]
    public async Task<ActionResult> GroupInvites(CancellationToken ct) => Ok(await repository.GetAdminRecordsAsync("chat.group-invites", 1000, ct));

    [HttpPost("group-invites")]
    public async Task<ActionResult> SaveGroupInvite(AdminGroupInviteRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim().ToUpperInvariant(); if (!Regex.IsMatch(code, "^[A-Z0-9]{6,16}$")) return BadRequest(new { error = "群邀请码需为 6–16 位大写字母或数字" });
        var conversation = await repository.GetConversationAsync(request.ConversationId, ct); if (conversation is null || conversation.Type != ConversationType.Group) return BadRequest(new { error = "请选择有效群聊" });
        var all = await repository.GetAdminRecordsAsync("chat.group-invites", 1000, ct); var existing = all.FirstOrDefault(x => x.Data.GetValueOrDefault("code") == code);
        var record = existing ?? new AdminModuleRecord { Module = "chat.group-invites" }; record.Name = conversation.Name; record.Status = request.Enabled ? "Active" : "Disabled";
        record.Data = new() { ["code"] = code, ["conversationId"] = conversation.Id, ["groupName"] = conversation.Name, ["maxUses"] = Math.Clamp(request.MaxUses, 1, 100000).ToString(), ["usedCount"] = record.Data.GetValueOrDefault("usedCount", "0"), ["expiresAtUtc"] = request.ExpiresAtUtc?.ToUniversalTime().ToString("O") ?? "" };
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("group-invite.upsert", "conversation", conversation.Id, code, ct); return Ok(record);
    }

    [HttpDelete("group-invites/{id}")]
    public async Task<ActionResult> RevokeGroupInvite(string id, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct); if (record is null || record.Module != "chat.group-invites") return NotFound(new { error = "群邀请码不存在" });
        record.Status = "Revoked"; await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("group-invite.revoke", "groupInvite", id, record.Name, ct); return NoContent();
    }

    private async Task<ActionResult> SaveFundSubject(string? id, AdminFundSubjectRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim().ToUpperInvariant(); if (!Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{2,31}$")) return BadRequest(new { error = "科目编码需为 3–32 位大写字母、数字或下划线" });
        if (request.Direction is not ("Increase" or "Decrease" or "Both")) return BadRequest(new { error = "方向必须是 Increase、Decrease 或 Both" });
        if (request.MinAmount <= 0 || request.MaxAmount < request.MinAmount || request.MaxAmount > 1000000) return BadRequest(new { error = "金额上下限无效" });
        var all = await repository.GetAdminRecordsAsync("fund.subjects", 1000, ct); if (all.Any(x => x.Id != id && string.Equals(x.Data.GetValueOrDefault("code"), code, StringComparison.OrdinalIgnoreCase))) return Conflict(new { error = "科目编码已存在" });
        var record = id is null ? new AdminModuleRecord { Module = "fund.subjects" } : await repository.GetAdminRecordAsync(id, ct); if (record is null || record.Module != "fund.subjects") return NotFound(new { error = "科目不存在" });
        record.Name = Limit(request.Name, 80); record.Status = request.Enabled ? "Active" : "Disabled"; record.Data = new() { ["code"] = code, ["direction"] = request.Direction, ["minAmount"] = request.MinAmount.ToString("0.00", CultureInfo.InvariantCulture), ["maxAmount"] = request.MaxAmount.ToString("0.00", CultureInfo.InvariantCulture), ["enabled"] = request.Enabled.ToString().ToLowerInvariant(), ["remark"] = Limit(request.Remark, 300) };
        await repository.UpsertAdminRecordAsync(record, ct); await AuditAsync("fund.subject.upsert", "fundSubject", record.Id, code, ct); return Ok(record);
    }

    private async Task<UserAccount?> UserAsync(string account, CancellationToken ct) => await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
    private async Task AuditAsync(string action, string targetType, string targetId, string detail, CancellationToken ct) => await repository.AddAdminAuditAsync(new AdminAuditLog { AdminUserId = User.UserId(), AdminAccount = User.Identity?.Name ?? "admin", Action = action, TargetType = targetType, TargetId = targetId, Detail = Limit(detail, 300), IpAddress = RequestMetadata.ClientIp(HttpContext), Address = RequestMetadata.Address(RequestMetadata.ClientIp(HttpContext)) }, ct);
    private static string EncryptEnvelope(string publicKeyJwk, byte[] key)
    {
        using var document = JsonDocument.Parse(publicKeyJwk);
        var root = document.RootElement;
        using var rsa = RSA.Create();
        rsa.ImportParameters(new RSAParameters { Modulus = Base64Url(root.GetProperty("n").GetString() ?? ""), Exponent = Base64Url(root.GetProperty("e").GetString() ?? "") });
        return Convert.ToBase64String(rsa.Encrypt(key, RSAEncryptionPadding.OaepSHA256));
    }
    private static byte[] Base64Url(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(normalized.PadRight(normalized.Length + (4 - normalized.Length % 4) % 4, '='));
    }
    private static string Limit(string? value, int max) { var text = value?.Trim() ?? ""; return text[..Math.Min(text.Length, max)]; }
    private static object Page<T>(IReadOnlyList<T> items, int page, int pageSize) { page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 10, 100); var total = items.Count; return new { items = items.Skip((page - 1) * pageSize).Take(pageSize).ToList(), total, page, pageSize, totalPages = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)) }; }
}

[ApiController, Authorize]
[Route("api/group-invites")]
public sealed class GroupInvitesController(IChatRepository repository) : ControllerBase
{
    [HttpPost("redeem")]
    public async Task<ActionResult> Redeem(GroupInviteRedeemRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim().ToUpperInvariant(); var record = (await repository.GetAdminRecordsAsync("chat.group-invites", 1000, ct)).FirstOrDefault(x => x.Data.GetValueOrDefault("code") == code);
        if (record is null || record.Status != "Active") return BadRequest(new { error = "群邀请码无效或已停用" });
        int.TryParse(record.Data.GetValueOrDefault("usedCount"), out var used); int.TryParse(record.Data.GetValueOrDefault("maxUses"), out var maxUses);
        if (maxUses > 0 && used >= maxUses) return BadRequest(new { error = "群邀请码已达到使用次数" });
        if (DateTime.TryParse(record.Data.GetValueOrDefault("expiresAtUtc"), out var expires) && expires.ToUniversalTime() <= DateTime.UtcNow) return BadRequest(new { error = "群邀请码已过期" });
        var conversation = await repository.GetConversationAsync(record.Data.GetValueOrDefault("conversationId", ""), ct); if (conversation is null || conversation.Type != ConversationType.Group || conversation.IsDissolved) return BadRequest(new { error = "目标群聊不可用" });
        if (conversation.Members.All(x => x.UserId != User.UserId() || x.LeftAtSequence is not null)) conversation.Members.Add(new ConversationMember { UserId = User.UserId(), Role = MemberRole.Member, JoinedAtSequence = conversation.LastSequence });
        await repository.UpdateConversationAsync(conversation, ct); record.Data["usedCount"] = (used + 1).ToString(); await repository.UpsertAdminRecordAsync(record, ct); return Ok(new { conversation.Id, conversation.Name });
    }
}
