using Microsoft.AspNetCore.Authorization;
using System.Globalization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/admin")]
public sealed class AdminModulesController(
    IChatRepository repository,
    PasswordHasher<UserAccount> passwordHasher,
    IMediaStorage mediaStorage,
    IHubContext<ChatHub> hub,
    GeoIpService geoIp) : ControllerBase
{
    private static readonly HashSet<string> EditableModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "system.roles", "system.announcements", "chat.customer-service", "chat.group-monitors",
        "chat.group-speech", "chat.robots", "chat.red-packet-bot", "chat.group-invites"
    };
    private static readonly HashSet<string> RolePermissions = new(StringComparer.OrdinalIgnoreCase)
    {
        "users:read", "users:write", "logs:read", "funds:read", "funds:write", "operators:read",
        "operators:write", "announcements:write", "errors:read", "conversations:read", "groups:write",
        "robots:write", "audit:read"
    };

    [HttpGet("modules/{module}")]
    public async Task<ActionResult> ModuleRecords(string module, [FromQuery] int limit = 200, CancellationToken ct = default)
    {
        if (!EditableModules.Contains(module) && module is not ("account.login-logs" or "account.offline-logs" or "account.feedback" or "account.verifications" or "account.login-ip-decisions" or "fund.subjects" or "fund.adjustments" or "chat.automation-logs" or "system.images" or "system.error-logs" or "chat.bulk-messages" or "system.admin-totp"))
            return NotFound(new { error = "管理模块不存在" });
        return Ok(await repository.GetAdminRecordsAsync(module, Math.Clamp(limit, 1, 500), ct));
    }

    [HttpPost("modules/{module}")]
    public async Task<ActionResult> UpsertModuleRecord(string module, AdminModuleRecordRequest request, CancellationToken ct)
    {
        if (!EditableModules.Contains(module)) return BadRequest(new { error = "此模块不允许通用编辑" });
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { error = "名称不能为空" });
        var data = SanitizeData(request.Data);
        if (module.Equals("system.roles", StringComparison.OrdinalIgnoreCase) && !ValidPermissions(data)) return BadRequest(new { error = "包含未授权的角色权限" });
        var record = await repository.UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = module,
            Name = request.Name.Trim()[..Math.Min(request.Name.Trim().Length, 100)],
            Status = NormalizeStatus(request.Status),
            Data = data
        }, ct);
        await AuditAsync("module.upsert", module, record.Id, record.Name, ct);
        return Ok(record);
    }

    [HttpPut("modules/{module}/{id}")]
    public async Task<ActionResult> UpdateModuleRecord(string module, string id, AdminModuleRecordRequest request, CancellationToken ct)
    {
        if (!EditableModules.Contains(module)) return BadRequest(new { error = "此模块不允许通用编辑" });
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || !record.Module.Equals(module, StringComparison.OrdinalIgnoreCase)) return NotFound(new { error = "记录不存在" });
        record.Name = string.IsNullOrWhiteSpace(request.Name) ? record.Name : request.Name.Trim()[..Math.Min(request.Name.Trim().Length, 100)];
        record.Status = NormalizeStatus(request.Status);
        record.Data = SanitizeData(request.Data);
        if (module.Equals("system.roles", StringComparison.OrdinalIgnoreCase) && !ValidPermissions(record.Data)) return BadRequest(new { error = "包含未授权的角色权限" });
        await repository.UpsertAdminRecordAsync(record, ct);
        await AuditAsync("module.update", module, id, record.Name, ct);
        return Ok(record);
    }

    [HttpDelete("modules/{module}/{id}")]
    public async Task<ActionResult> DeleteModuleRecord(string module, string id, CancellationToken ct)
    {
        if (!EditableModules.Contains(module)) return BadRequest(new { error = "此模块不允许删除" });
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || record.Module != module) return NotFound(new { error = "记录不存在" });
        await repository.DeleteAdminRecordAsync(id, ct);
        await AuditAsync("module.delete", module, id, record.Name, ct);
        return NoContent();
    }

    [HttpGet("login-logs")]
    public async Task<ActionResult> LoginLogs([FromQuery] bool failuresOnly = false, [FromQuery] string scope = "all", [FromQuery] int limit = 200, CancellationToken ct = default)
    {
        var records = await repository.GetAdminRecordsAsync("account.login-logs", Math.Clamp(limit, 1, 500), ct);
        IEnumerable<AdminModuleRecord> result = failuresOnly ? records.Where(x => x.Data.GetValueOrDefault("result") != "success") : records;
        if (scope.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            var adminIds = (await repository.GetUsersAsync(null, null, 500, ct)).Where(x => x.Role != UserRole.User).Select(x => x.Id).ToHashSet();
            result = result.Where(x => adminIds.Contains(x.Data.GetValueOrDefault("userId", "")));
        }
        return Ok(result);
    }

    [HttpGet("login-failure-stats")]
    public async Task<ActionResult> LoginFailureStats(CancellationToken ct)
    {
        var records = await repository.GetAdminRecordsAsync("account.login-logs", 500, ct);
        return Ok(records.Where(x => x.Data.GetValueOrDefault("result") != "success")
            .GroupBy(x => x.Data.GetValueOrDefault("ip", "unknown"))
            .Select(x => new { ip = x.Key, count = x.Count(), accounts = string.Join(", ", x.Select(v => v.Data.GetValueOrDefault("account", "未知")).Distinct().Take(10)), lastAtUtc = x.Max(v => v.CreatedAtUtc), lastReason = x.OrderByDescending(v => v.CreatedAtUtc).First().Data.GetValueOrDefault("reason", "失败") })
            .OrderByDescending(x => x.count).Take(100));
    }

    [HttpPost("feedback/{id}/decision")]
    public async Task<ActionResult> DecideFeedback(string id, AdminFeedbackDecisionRequest request, CancellationToken ct)
    {
        var item = await repository.GetAdminRecordAsync(id, ct);
        if (item is null || item.Module != "account.feedback") return NotFound(new { error = "意见反馈不存在" });
        item.Status = request.Status is "Resolved" or "Rejected" ? request.Status : "Processing";
        item.Data["reply"] = Trim(request.Reply, 500);
        item.Data["handledBy"] = User.Identity?.Name ?? "admin";
        await repository.UpsertAdminRecordAsync(item, ct);
        await AuditAsync("feedback.decision", "feedback", id, $"{item.Status}; {item.Data["reply"]}", ct);
        return Ok(item);
    }

    [HttpPost("feedback/seen")]
    public async Task<ActionResult> MarkFeedbackSeen(AdminFeedbackSeenRequest request, CancellationToken ct)
    {
        var updated = 0;
        foreach (var id in request.Ids.Distinct().Take(200))
        {
            var item = await repository.GetAdminRecordAsync(id, ct);
            if (item is null || item.Module != "account.feedback") continue;
            item.Data["seen"] = "true";
            item.Data["seenAtUtc"] = DateTime.UtcNow.ToString("O");
            item.Data["seenBy"] = User.Identity?.Name ?? "admin";
            await repository.UpsertAdminRecordAsync(item, ct);
            updated++;
        }
        await AuditAsync("feedback.seen", "feedback", "batch", $"updated={updated}", ct);
        return Ok(new { updated });
    }

    [HttpPost("wallet/adjust")]
    public async Task<ActionResult> AdjustWallet(AdminWalletAdjustmentRequest request, CancellationToken ct)
    {
        if (request.Amount == 0 || Math.Abs(request.Amount) > 1_000_000) return BadRequest(new { error = "调整金额需在 ±1,000,000 且不能为 0" });
        var user = await repository.GetUserByAccountAsync(request.Account.Trim().ToLowerInvariant(), ct);
        if (user is null || user.Role != UserRole.User) return NotFound(new { error = "用户不存在" });
        var walletId = $"wallet:{user.Id}";
        var wallet = await repository.GetAdminRecordAsync(walletId, ct) ?? new AdminModuleRecord { Id = walletId, Module = "fund.wallets", Name = user.Account, Data = new Dictionary<string, string> { ["balance"] = "0" } };
        decimal.TryParse(wallet.Data.GetValueOrDefault("balance"), NumberStyles.Number, CultureInfo.InvariantCulture, out var before);
        var after = before + request.Amount;
        if (after < 0) return BadRequest(new { error = "调整后余额不能小于 0" });
        wallet.Data["balance"] = after.ToString("0.00", CultureInfo.InvariantCulture);
        await repository.UpsertAdminRecordAsync(wallet, ct);
        user.AccountBalance = after;
        await repository.UpdateUserAsync(user, ct);
        var transaction = await repository.UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = "fund.adjustments", Name = request.Subject.Trim(), Status = "Completed",
            Data = new Dictionary<string, string>
            {
                ["account"] = user.Account, ["userId"] = user.Id, ["amount"] = request.Amount.ToString("0.00", CultureInfo.InvariantCulture),
                ["balanceBefore"] = before.ToString("0.00", CultureInfo.InvariantCulture), ["balanceAfter"] = after.ToString("0.00", CultureInfo.InvariantCulture), ["note"] = Trim(request.Note, 300)
            }
        }, ct);
        await AuditAsync("wallet.adjust", "user", user.Id, $"{request.Amount:+0.00;-0.00}; {request.Subject}", ct);
        return Ok(transaction);
    }

    [HttpGet("wallets")]
    public async Task<ActionResult> Wallets(CancellationToken ct)
    {
        var users = await repository.GetUsersAsync(null, null, 200, ct);
        var result = new List<object>();
        foreach (var user in users.Where(x => x.Role == UserRole.User))
        {
            var wallet = await repository.GetAdminRecordAsync($"wallet:{user.Id}", ct);
            result.Add(new { user.Id, user.Account, user.DisplayName, balance = wallet?.Data.GetValueOrDefault("balance", user.AccountBalance.ToString("0.00", CultureInfo.InvariantCulture)) ?? user.AccountBalance.ToString("0.00", CultureInfo.InvariantCulture) });
        }
        return Ok(result);
    }

    [HttpGet("operators")]
    public async Task<ActionResult> Operators(CancellationToken ct) => Ok((await repository.GetUsersAsync(null, null, 200, ct)).Where(x => x.Role == UserRole.Admin).Select(SessionService.View));

    [HttpPost("operators")]
    public async Task<ActionResult> CreateOperator(AdminAccountCreateRequest request, CancellationToken ct)
    {
        var account = request.Account.Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(account, "^[a-z][a-z0-9_]{3,19}$")) return BadRequest(new { error = "账号格式无效" });
        if (request.Password.Length is < 8 or > 72) return BadRequest(new { error = "密码长度需为 8–72 位" });
        if (await repository.GetUserByAccountAsync(account, ct) is not null) return Conflict(new { error = "账号已存在" });
        var user = new UserAccount { Account = account, DisplayName = Trim(request.DisplayName, 50), Role = UserRole.Admin };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        await repository.AddUserAsync(user, ct);
        await AuditAsync("operator.create", "user", user.Id, $"{user.Account}; {user.Role}", ct);
        return Ok(SessionService.View(user));
    }

    [HttpGet("conversations")]
    public async Task<ActionResult> Conversations([FromQuery] int limit = 200, CancellationToken ct = default)
    {
        var items = await repository.GetAllConversationsAsync(Math.Clamp(limit, 1, 500), ct);
        return Ok(items.Select(x => new { x.Id, x.Type, x.Name, x.CreatedBy, memberCount = x.Members.Count(v => v.LeftAtSequence is null), x.LastSequence, x.LastMessageAtUtc, x.IsDissolved }));
    }

    [HttpPost("conversations/{id}/action")]
    public async Task<ActionResult> ConversationAction(string id, AdminConversationActionRequest request, CancellationToken ct)
    {
        var item = await repository.GetConversationAsync(id, ct);
        if (item is null) return NotFound(new { error = "会话不存在" });
        if (request.Action == "dissolve" && item.Type == ConversationType.Group) item.IsDissolved = true;
        else if (request.Action == "restore" && item.Type == ConversationType.Group) item.IsDissolved = false;
        else return BadRequest(new { error = "仅支持群聊解散或恢复" });
        await repository.UpdateConversationAsync(item, ct);
        await hub.Clients.Users(item.Members.Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = item.Id, action = request.Action }, ct);
        await AuditAsync($"conversation.{request.Action}", "conversation", id, Trim(request.Note, 300), ct);
        return Ok(new { item.Id, item.IsDissolved });
    }

    [HttpGet("contacts")]
    public ActionResult Contacts() => StatusCode(StatusCodes.Status410Gone, new { error = "通讯录模块已按 V2 需求下线" });

    [HttpPost("bulk-messages")]
    public async Task<ActionResult> BulkMessage(AdminBulkMessageRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Content) || request.Content.Length > 1000) return BadRequest(new { error = "消息内容需为 1–1000 字" });
        var users = (await repository.GetUsersAsync(null, UserStatus.Active, 500, ct)).Where(x => x.Role == UserRole.User).ToList();
        var targets = request.Audience == "selected" ? users.Where(x => request.Accounts?.Contains(x.Account, StringComparer.OrdinalIgnoreCase) == true).ToList() : users.ToList();
        var record = await repository.UpsertAdminRecordAsync(new AdminModuleRecord { Module = "chat.bulk-messages", Name = "群发通知", Status = "Sent", Data = new Dictionary<string, string> { ["content"] = request.Content.Trim(), ["audience"] = request.Audience, ["targetCount"] = targets.Count.ToString() } }, ct);
        await hub.Clients.Users(targets.Select(x => x.Id)).SendAsync("admin.notice", new { id = record.Id, content = request.Content.Trim(), sentAtUtc = DateTime.UtcNow }, ct);
        await AuditAsync("message.bulk", "message", record.Id, $"targets={targets.Count}", ct);
        return Ok(record);
    }

    [HttpPost("tasks/{id}/run")]
    public ActionResult RunTask(string id) => StatusCode(StatusCodes.Status410Gone, new { error = "定时任务模块已按需求下线" });

    [HttpPost("images")]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<ActionResult> UploadImage([FromForm] IFormFile file, CancellationToken ct)
    {
        if (file.Length is <= 0 or > 10 * 1024 * 1024 || !file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) || file.ContentType.Contains("svg", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "仅支持 10 MB 以内的 PNG、JPEG、GIF 或 WebP 图片" });
        var extension = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        var key = $"echat/admin/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{extension}";
        await using var stream = file.OpenReadStream();
        var stored = await mediaStorage.StoreAsync(key, stream, file.ContentType, ct);
        var asset = await repository.AddMediaAssetAsync(new MediaAsset { OwnerId = User.UserId(), Purpose = MediaPurpose.Moment, StorageKey = stored.StorageKey, LocalPath = stored.LocalPath, FileName = Path.GetFileName(file.FileName), ContentType = file.ContentType, Size = file.Length }, ct);
        var record = await repository.UpsertAdminRecordAsync(new AdminModuleRecord { Module = "system.images", Name = asset.FileName, Status = "Active", Data = new Dictionary<string, string> { ["assetId"] = asset.Id, ["contentType"] = asset.ContentType, ["size"] = asset.Size.ToString(), ["url"] = $"/api/media/{asset.Id}/content" } }, ct);
        await AuditAsync("image.upload", "media", asset.Id, asset.FileName, ct);
        return Ok(record);
    }

    [HttpPut("images/{id}")]
    public async Task<ActionResult> UpdateImage(string id, AdminModuleRecordRequest request, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || record.Module != "system.images") return NotFound(new { error = "图片记录不存在" });
        record.Name = string.IsNullOrWhiteSpace(request.Name) ? record.Name : Trim(request.Name, 100);
        record.Data["category"] = Trim(request.Data?.GetValueOrDefault("category"), 50);
        record.Data["tags"] = Trim(request.Data?.GetValueOrDefault("tags"), 200);
        await repository.UpsertAdminRecordAsync(record, ct);
        await AuditAsync("image.update", "media", id, $"{record.Data["category"]};{record.Data["tags"]}", ct);
        return Ok(record);
    }

    [HttpDelete("images/{id}")]
    public async Task<ActionResult> DeleteImage(string id, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || record.Module != "system.images") return NotFound(new { error = "图片记录不存在" });
        await repository.DeleteAdminRecordAsync(id, ct);
        await AuditAsync("image.delete", "media", id, record.Name, ct);
        return NoContent();
    }

    private async Task AuditAsync(string action, string targetType, string targetId, string detail, CancellationToken ct)
    {
        var ip = RequestMetadata.ClientIp(HttpContext);
        await repository.AddAdminAuditAsync(new AdminAuditLog { AdminUserId = User.UserId(), AdminAccount = User.Identity?.Name ?? "admin", Action = action, TargetType = targetType, TargetId = targetId, Detail = Trim(detail, 300), IpAddress = ip, Address = await geoIp.ResolveAddressAsync(ip, ct) }, ct);
    }

    private static Dictionary<string, string> SanitizeData(Dictionary<string, string>? data) => (data ?? []).Take(30).ToDictionary(x => Trim(x.Key, 50), x => Trim(x.Value, 1000));
    private static bool ValidPermissions(IReadOnlyDictionary<string, string> data) =>
        data.GetValueOrDefault("permissions", "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).All(RolePermissions.Contains);
    private static string NormalizeStatus(string value) => string.IsNullOrWhiteSpace(value) ? "Active" : Trim(value, 30);
    private static string Trim(string? value, int max) { var text = value?.Trim() ?? ""; return text[..Math.Min(text.Length, max)]; }
}

[ApiController, Authorize]
[Route("api/feedback")]
public sealed class FeedbackController(IChatRepository repository) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult> Submit(AdminModuleRecordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { error = "反馈内容不能为空" });
        var record = await repository.UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = "account.feedback", Name = request.Name.Trim()[..Math.Min(request.Name.Trim().Length, 100)], Status = "Submitted",
            Data = (request.Data ?? []).Take(20).ToDictionary(x => x.Key, x => x.Value),
        }, ct);
        record.Data["userId"] = User.UserId();
        await repository.UpsertAdminRecordAsync(record, ct);
        return Ok(record);
    }
}
