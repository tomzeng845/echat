using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/groups")]
public sealed class GroupsController(IChatRepository repository, IHubContext<ChatHub> hub, ILogger<GroupsController> logger) : ControllerBase
{
    [HttpGet("{id}")]
    public async Task<ActionResult> Info(string id, CancellationToken ct)
    {
        var group = await RequireMember(id, ct);
        if (group is null || group.Type != ConversationType.Group) return Forbid();
        await EnsureGroupMemberRecords(group, ct);
        var memberCount = await repository.CountGroupMembersAsync(id, null, ct);
        var firstPage = await repository.GetGroupMembersAsync(id, null, 0, GroupLimits.MaxPageSize, ct);
        return Ok(new { group.Id, group.Name, group.AvatarUrl, group.Announcement, group.Remark, group.RequireJoinApproval, group.AllowMemberAddFriend, group.MuteAll, group.DisableRecall, group.DisableNameChange, group.HideMemberCount, group.HistoryVisibleToNewMembers, memberCount = group.HideMemberCount ? 0 : memberCount, members = await MemberViews(firstPage, ct), membersPageSize = GroupLimits.MaxPageSize, joinRequests = group.JoinRequests.Keys });
    }

    [HttpPut("{id}/name")]
    public Task<ActionResult> Name(string id, GroupNameRequest request, CancellationToken ct) => Update(id, request.Name, (group, value) => { if (!group.DisableNameChange) group.Name = value; }, ct);

    [HttpPut("{id}/settings")]
    public async Task<ActionResult> Settings(string id, GroupSettingsRequest request, CancellationToken ct)
    {
        var group = await RequireOwner(id, ct); if (group is null) return Forbid();
        if (request.AllowMemberAddFriend.HasValue) group.AllowMemberAddFriend = request.AllowMemberAddFriend.Value;
        if (request.MuteAll.HasValue) group.MuteAll = request.MuteAll.Value;
        if (request.DisableRecall.HasValue) group.DisableRecall = request.DisableRecall.Value;
        if (request.DisableNameChange.HasValue) group.DisableNameChange = request.DisableNameChange.Value;
        if (request.HideMemberCount.HasValue) group.HideMemberCount = request.HideMemberCount.Value;
        if (request.HistoryVisibleToNewMembers.HasValue) group.HistoryVisibleToNewMembers = request.HistoryVisibleToNewMembers.Value;
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-settings-updated", ct); return Ok(group);
    }

    [HttpPut("{id}/announcement")]
    public Task<ActionResult> Announcement(string id, GroupAnnouncementRequest request, CancellationToken ct) => Update(id, request.Announcement, (group, value) => group.Announcement = value, ct);

    [HttpPut("{id}/remark")]
    public Task<ActionResult> Remark(string id, GroupRemarkRequest request, CancellationToken ct) => Update(id, request.Remark, (group, value) => group.Remark = value, ct, false);

    [HttpPut("{id}/join-approval")]
    public async Task<ActionResult> JoinApproval(string id, GroupJoinApprovalRequest request, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        group.RequireJoinApproval = request.RequireApproval; await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-settings-updated", ct); return NoContent();
    }

    [HttpPost("{id}/members")]
    public async Task<ActionResult> AddMember(string id, GroupMemberRequest request, CancellationToken ct)
    {
        var group = await RequireMember(id, ct); if (group is null || group.Type != ConversationType.Group) return Forbid();
        if (await repository.CountGroupMembersAsync(id, null, ct) >= GroupLimits.MaxMembers) return Conflict(new { error = "群成员已达到5000人上限" });
        if (group.Members.Any(x => x.UserId == request.UserId && x.LeftAtSequence is null)) return Conflict(new { error = "用户已经在群内" });
        if (await repository.GetUserByIdAsync(request.UserId, ct) is null) return NotFound(new { error = "用户不存在" });
        group.Members.Add(new ConversationMember { UserId = request.UserId, Role = MemberRole.Member });
        await repository.UpsertGroupMemberAsync(new GroupMemberRecord { ConversationId = id, UserId = request.UserId, Role = MemberRole.Member }, ct);
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "member-added", ct); return NoContent();
    }

    [HttpGet("{id}/members/page")]
    public async Task<ActionResult<GroupMemberPage>> MembersPage(string id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null, CancellationToken ct = default)
    {
        var group = await RequireMember(id, ct); if (group is null || group.Type != ConversationType.Group) return Forbid();
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, GroupLimits.MaxPageSize);
        await EnsureGroupMemberRecords(group, ct);
        var total = await repository.CountGroupMembersAsync(id, search, ct);
        var records = await repository.GetGroupMembersAsync(id, search, (page - 1) * pageSize, pageSize, ct);
        var items = await MemberViews(records, ct);
        return Ok(new GroupMemberPage(items, total, page, pageSize, (int)Math.Ceiling(total / (double)pageSize)));
    }

    [HttpPut("{id}/members/role")]
    public async Task<ActionResult> Role(string id, GroupRoleRequest request, CancellationToken ct)
    {
        var group = await RequireOwner(id, ct); if (group is null || request.Role == MemberRole.Owner) return Forbid();
        var member = group.Members.FirstOrDefault(x => x.UserId == request.UserId && x.LeftAtSequence is null); if (member is null) return NotFound();
        member.Role = request.Role;
        if (await repository.GetGroupMemberAsync(id, request.UserId, ct) is { } record) { record.Role = request.Role; await repository.UpsertGroupMemberAsync(record, ct); }
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "role-updated", ct); return NoContent();
    }

    [HttpPut("{id}/members/mute")]
    public async Task<ActionResult> MuteMembers(string id, GroupMuteRequest request, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        var actor = group.Members.First(x => x.UserId == User.UserId());
        var ids = request.UserIds.Distinct(StringComparer.Ordinal).ToList();
        if (ids.Count is 0 or > GroupLimits.MaxBatchInvite) return BadRequest(new { error = $"禁言成员数量必须为1-{GroupLimits.MaxBatchInvite}" });
        var targets = group.Members.Where(x => ids.Contains(x.UserId) && x.LeftAtSequence is null).ToList();
        if (targets.Count != ids.Count || targets.Any(x => x.Role == MemberRole.Owner || (x.Role == MemberRole.Admin && actor.Role != MemberRole.Owner)))
            return Forbid();
        foreach (var target in targets) target.Muted = request.Muted;
        foreach (var target in targets)
            if (await repository.GetGroupMemberAsync(id, target.UserId, ct) is { } record) { record.Muted = request.Muted; await repository.UpsertGroupMemberAsync(record, ct); }
        await repository.UpdateConversationAsync(group, ct);
        await Notify(group, request.Muted ? "members-muted" : "members-unmuted", ct);
        return NoContent();
    }

    [HttpPut("{id}/mute-all")]
    public async Task<ActionResult> MuteAll(string id, GroupMuteRequest request, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        group.MuteAll = request.Muted; await repository.UpdateConversationAsync(group, ct); await Notify(group, request.Muted ? "group-muted" : "group-unmuted", ct); return NoContent();
    }

    [HttpPut("{id}/blacklist/{userId}")]
    public async Task<ActionResult> Blacklist(string id, string userId, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        if (!group.BlacklistedUserIds.Contains(userId)) group.BlacklistedUserIds.Add(userId);
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-blacklist-updated", ct); return NoContent();
    }

    [HttpDelete("{id}/blacklist/{userId}")]
    public async Task<ActionResult> RemoveBlacklist(string id, string userId, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        group.BlacklistedUserIds.RemoveAll(x => x == userId); await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-blacklist-updated", ct); return NoContent();
    }

    [HttpPost("{id}/transfer-owner")]
    public async Task<ActionResult> TransferOwner(string id, GroupMemberRequest request, CancellationToken ct)
    {
        var group = await RequireOwner(id, ct); if (group is null) return Forbid();
        var oldOwner = group.Members.First(x => x.UserId == User.UserId()); var next = group.Members.FirstOrDefault(x => x.UserId == request.UserId && x.LeftAtSequence is null); if (next is null) return NotFound();
        oldOwner.Role = MemberRole.Admin; next.Role = MemberRole.Owner; group.CreatedBy = next.UserId; await repository.UpdateConversationAsync(group, ct); await Notify(group, "owner-transferred", ct); return NoContent();
    }

    [HttpDelete("{id}/members/{userId}")]
    public async Task<ActionResult> Remove(string id, string userId, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        var actor = group.Members.First(x => x.UserId == User.UserId()); var target = group.Members.FirstOrDefault(x => x.UserId == userId && x.LeftAtSequence is null);
        if (target is null || target.Role == MemberRole.Owner || (target.Role == MemberRole.Admin && actor.Role != MemberRole.Owner)) return Forbid();
        target.LeftAtSequence = group.LastSequence + 1;
        await repository.RemoveGroupMemberAsync(id, userId, target.LeftAtSequence.Value, ct);
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "member-removed", ct); return NoContent();
    }

    [HttpPost("{id}/leave")]
    public async Task<ActionResult> Leave(string id, CancellationToken ct)
    {
        var group = await RequireMember(id, ct); if (group is null || group.Type != ConversationType.Group) return Forbid();
        var member = group.Members.First(x => x.UserId == User.UserId()); if (member.Role == MemberRole.Owner) return BadRequest(new { error = "群主请先转让群主后再退出群聊" });
        member.LeftAtSequence = group.LastSequence + 1;
        await repository.RemoveGroupMemberAsync(id, User.UserId(), member.LeftAtSequence.Value, ct);
        await repository.UpdateConversationAsync(group, ct); return NoContent();
    }

    [HttpPost("{id}/dissolve")]
    public async Task<ActionResult> Dissolve(string id, CancellationToken ct)
    {
        logger.LogInformation("Group dissolve requested: conversationId={ConversationId}, userId={UserId}", id, User.UserId());
        var group = await RequireManager(id, ct); if (group is null)
        {
            logger.LogWarning("Group dissolve denied: conversationId={ConversationId}, userId={UserId}", id, User.UserId());
            return Forbid();
        }
        group.IsDissolved = true;
        await repository.UpdateConversationAsync(group, ct);
        try
        {
            await Notify(group, "dissolved", CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Group dissolve notification failed after persistence: conversationId={ConversationId}", id);
        }
        logger.LogInformation("Group dissolved successfully: conversationId={ConversationId}, userId={UserId}", id, User.UserId());
        return Ok(new { dissolved = true, conversationId = group.Id });
    }

    // Compatibility alias for clients and reverse proxies that expose the
    // destructive group operation as DELETE.
    [HttpDelete("{id}/dissolve")]
    public Task<ActionResult> DissolveDelete(string id, CancellationToken ct) => Dissolve(id, ct);

    [HttpPost("{id}/join-requests/{userId}/decision")]
    public async Task<ActionResult> Decide(string id, string userId, GroupJoinDecisionRequest request, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        if (!group.JoinRequests.Remove(userId)) return NotFound(new { error = "入群申请不存在" });
        if (request.Approve && !group.Members.Any(x => x.UserId == userId && x.LeftAtSequence is null))
        {
            if (await repository.CountGroupMembersAsync(id, null, ct) >= GroupLimits.MaxMembers) return Conflict(new { error = "群成员已达到5000人上限" });
            group.Members.Add(new ConversationMember { UserId = userId, Role = MemberRole.Member });
            await repository.UpsertGroupMemberAsync(new GroupMemberRecord { ConversationId = id, UserId = userId, Role = MemberRole.Member }, ct);
        }
        await repository.UpdateConversationAsync(group, ct); await Notify(group, request.Approve ? "join-approved" : "join-rejected", ct); return NoContent();
    }

    private async Task<ActionResult> Update(string id, string value, Action<Conversation, string> apply, CancellationToken ct, bool manager = true)
    {
        var group = manager ? await RequireManager(id, ct) : await RequireMember(id, ct); if (group is null) return Forbid();
        if (value.Trim().Length > (manager ? 2000 : 80)) return BadRequest(new { error = "内容长度无效" }); apply(group, value.Trim()); await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-settings-updated", ct); return NoContent();
    }

    private async Task<Conversation?> RequireMember(string id, CancellationToken ct) { var group = await repository.GetConversationAsync(id, ct); if (group is null || group.IsDissolved || !group.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null)) { if (group?.Type != ConversationType.Group) return null; var external = await repository.GetGroupMemberAsync(id, User.UserId(), ct); return external is { LeftAtSequence: null } ? group : null; } return group; }
    private async Task<Conversation?> RequireManager(string id, CancellationToken ct) { var group = await RequireMember(id, ct); if (group?.Type != ConversationType.Group) return null; var role = group.Members.FirstOrDefault(x => x.UserId == User.UserId())?.Role ?? (await repository.GetGroupMemberAsync(id, User.UserId(), ct))?.Role; return role is MemberRole.Owner or MemberRole.Admin ? group : null; }
    private async Task<Conversation?> RequireOwner(string id, CancellationToken ct) { var group = await RequireMember(id, ct); if (group?.Type != ConversationType.Group) return null; var role = group.Members.FirstOrDefault(x => x.UserId == User.UserId())?.Role ?? (await repository.GetGroupMemberAsync(id, User.UserId(), ct))?.Role; return role == MemberRole.Owner ? group : null; }
    private async Task EnsureGroupMemberRecords(Conversation group, CancellationToken ct) { if (group.Type != ConversationType.Group || await repository.CountGroupMembersAsync(group.Id, null, ct) > 0) return; foreach (var member in group.Members.Where(x => x.LeftAtSequence is null)) await repository.UpsertGroupMemberAsync(new GroupMemberRecord { ConversationId = group.Id, UserId = member.UserId, Role = member.Role, JoinedAtSequence = member.JoinedAtSequence, Muted = member.Muted, Pinned = member.Pinned }, ct); }
    private async Task<IReadOnlyList<ConversationMemberView>> MemberViews(IReadOnlyList<GroupMemberRecord> records, CancellationToken ct) { var list = new List<ConversationMemberView>(); foreach (var member in records) { var user = await repository.GetUserByIdAsync(member.UserId, ct); if (user is not null) list.Add(new ConversationMemberView(user.Id, user.Account, user.DisplayName, user.AvatarUrl, member.Role, member.Muted, [])); } return list; }
    private Task Notify(Conversation group, string action, CancellationToken ct) => hub.Clients.Users(group.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = group.Id, action, name = group.Name }, ct);
}
