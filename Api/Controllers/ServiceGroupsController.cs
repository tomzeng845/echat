using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/service-groups")]
public sealed class ServiceGroupsController(IChatRepository repository, IHubContext<ChatHub> hub) : ControllerBase
{
    private const string Module = "chat.service-group-templates";

    [HttpGet("templates")]
    public async Task<ActionResult> Templates(CancellationToken ct)
    {
        var records = await repository.GetAdminRecordsAsync(Module, 200, ct);
        return Ok(records.Where(x => x.Status == "Active").Select(ToView));
    }

    [HttpGet("templates/all")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult> AllTemplates(CancellationToken ct) => Ok(await repository.GetAdminRecordsAsync(Module, 200, ct));

    [HttpPost("templates")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult> SaveTemplate(ServiceGroupTemplateRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.NamePattern)) return BadRequest(new { error = "模板名称和群名称规则不能为空" });
        var accounts = request.MemberAccounts.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim().ToLowerInvariant()).Distinct().ToList();
        if (accounts.Count == 0 || accounts.Count > 100) return BadRequest(new { error = "固定成员数量无效" });
        var record = new AdminModuleRecord { Module = Module, Name = request.Name.Trim(), Status = request.Enabled ? "Active" : "Disabled", Data = new Dictionary<string, string> { ["namePattern"] = request.NamePattern.Trim(), ["memberAccounts"] = string.Join(",", accounts) } };
        await repository.UpsertAdminRecordAsync(record, ct);
        return Ok(ToView(record));
    }

    [HttpDelete("templates/{id}")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<ActionResult> DeleteTemplate(string id, CancellationToken ct)
    {
        var record = await repository.GetAdminRecordAsync(id, ct);
        if (record is null || record.Module != Module) return NotFound();
        record.Status = "Disabled";
        await repository.UpsertAdminRecordAsync(record, ct);
        return NoContent();
    }

    [HttpPost("create")]
    public async Task<ActionResult> Create(ServiceGroupCreateRequest request, CancellationToken ct)
    {
        var employeeId = User.UserId();
        var customer = await repository.GetUserByAccountAsync(request.CustomerAccount.Trim().ToLowerInvariant(), ct);
        var template = await repository.GetAdminRecordAsync(request.TemplateId, ct);
        if (customer is null || template is null || template.Module != Module || template.Status != "Active") return BadRequest(new { error = "客户或拉群模板无效" });
        var employee = await repository.GetUserByIdAsync(employeeId, ct);
        var name = template.Data.GetValueOrDefault("namePattern", "{customer}专属服务群").Replace("{customer}", customer.DisplayName).Replace("{account}", customer.Account);
        var accounts = template.Data.GetValueOrDefault("memberAccounts", "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Append(customer.Account).Append(employee?.Account ?? "").Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var members = new List<ConversationMember> { new() { UserId = employeeId, Role = MemberRole.Owner } };
        foreach (var account in accounts)
        {
            var user = await repository.GetUserByAccountAsync(account.ToLowerInvariant(), ct);
            if (user is not null && members.All(x => x.UserId != user.Id)) members.Add(new ConversationMember { UserId = user.Id });
        }
        if (members.Count < 3) return BadRequest(new { error = "模板中的固定成员或客户不存在" });
        var conversation = await repository.AddConversationAsync(new Conversation { Type = ConversationType.Group, Name = name, CreatedBy = employeeId, Members = members, KeyEnvelopes = [] }, ct);
        await hub.Clients.Users(members.Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = conversation.Id, action = "created" }, ct);
        return Ok(new { conversationId = conversation.Id, name, memberCount = members.Count });
    }

    private static object ToView(AdminModuleRecord record) => new { id = record.Id, name = record.Name, enabled = record.Status == "Active", namePattern = record.Data.GetValueOrDefault("namePattern", "{customer}专属服务群"), memberAccounts = record.Data.GetValueOrDefault("memberAccounts", "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) };
}
