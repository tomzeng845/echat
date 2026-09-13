using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/groups")]
public sealed class GroupsController(IChatRepository repository, IHubContext<ChatHub> hub) : ControllerBase
{
    [HttpGet("{id}")]
    public async Task<ActionResult> Info(string id, CancellationToken ct)
    {
        var group = await RequireMember(id, ct);
        if (group is null || group.Type != ConversationType.Group) return Forbid();
        return Ok(new { group.Id, group.Name, group.Announcement, group.Remark, group.RequireJoinApproval, members = await MemberViews(group, ct), joinRequests = group.JoinRequests.Keys });
    }

    [HttpPut("{id}/name")]
    public Task<ActionResult> Name(string id, GroupNameRequest request, CancellationToken ct) => Update(id, request.Name, (group, value) => group.Name = value, ct);

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
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        if (group.Members.Any(x => x.UserId == request.UserId && x.LeftAtSequence is null)) return Conflict(new { error = "用户已经在群内" });
        if (await repository.GetUserByIdAsync(request.UserId, ct) is null) return NotFound(new { error = "用户不存在" });
        group.Members.Add(new ConversationMember { UserId = request.UserId, Role = MemberRole.Member });
        await repository.UpdateConversationAsync(group, ct); await Notify(group, "member-added", ct); return NoContent();
    }

    [HttpPut("{id}/members/role")]
    public async Task<ActionResult> Role(string id, GroupRoleRequest request, CancellationToken ct)
    {
        var group = await RequireOwner(id, ct); if (group is null || request.Role == MemberRole.Owner) return Forbid();
        var member = group.Members.FirstOrDefault(x => x.UserId == request.UserId && x.LeftAtSequence is null); if (member is null) return NotFound();
        member.Role = request.Role; await repository.UpdateConversationAsync(group, ct); await Notify(group, "role-updated", ct); return NoContent();
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
        target.LeftAtSequence = group.LastSequence + 1; await repository.UpdateConversationAsync(group, ct); await Notify(group, "member-removed", ct); return NoContent();
    }

    [HttpPost("{id}/leave")]
    public async Task<ActionResult> Leave(string id, CancellationToken ct)
    {
        var group = await RequireMember(id, ct); if (group is null || group.Type != ConversationType.Group) return Forbid();
        var member = group.Members.First(x => x.UserId == User.UserId()); if (member.Role == MemberRole.Owner) return BadRequest(new { error = "群主请先转让群主后再退出群聊" });
        member.LeftAtSequence = group.LastSequence + 1; await repository.UpdateConversationAsync(group, ct); return NoContent();
    }

    [HttpPost("{id}/join-requests/{userId}/decision")]
    public async Task<ActionResult> Decide(string id, string userId, GroupJoinDecisionRequest request, CancellationToken ct)
    {
        var group = await RequireManager(id, ct); if (group is null) return Forbid();
        if (!group.JoinRequests.Remove(userId)) return NotFound(new { error = "入群申请不存在" });
        if (request.Approve && !group.Members.Any(x => x.UserId == userId && x.LeftAtSequence is null)) group.Members.Add(new ConversationMember { UserId = userId, Role = MemberRole.Member });
        await repository.UpdateConversationAsync(group, ct); await Notify(group, request.Approve ? "join-approved" : "join-rejected", ct); return NoContent();
    }

    private async Task<ActionResult> Update(string id, string value, Action<Conversation, string> apply, CancellationToken ct, bool manager = true)
    {
        var group = manager ? await RequireManager(id, ct) : await RequireMember(id, ct); if (group is null) return Forbid();
        if (value.Trim().Length > (manager ? 2000 : 80)) return BadRequest(new { error = "内容长度无效" }); apply(group, value.Trim()); await repository.UpdateConversationAsync(group, ct); await Notify(group, "group-settings-updated", ct); return NoContent();
    }

    private async Task<Conversation?> RequireMember(string id, CancellationToken ct) { var group = await repository.GetConversationAsync(id, ct); return group is not null && !group.IsDissolved && group.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null) ? group : null; }
    private async Task<Conversation?> RequireManager(string id, CancellationToken ct) { var group = await RequireMember(id, ct); var role = group?.Members.First(x => x.UserId == User.UserId()).Role; return group?.Type == ConversationType.Group && role is MemberRole.Owner or MemberRole.Admin ? group : null; }
    private async Task<Conversation?> RequireOwner(string id, CancellationToken ct) { var group = await RequireMember(id, ct); return group?.Type == ConversationType.Group && group.Members.First(x => x.UserId == User.UserId()).Role == MemberRole.Owner ? group : null; }
    private async Task<IReadOnlyList<ConversationMemberView>> MemberViews(Conversation group, CancellationToken ct) { var list = new List<ConversationMemberView>(); foreach (var member in group.Members.Where(x => x.LeftAtSequence is null)) { var user = await repository.GetUserByIdAsync(member.UserId, ct); if (user is not null) list.Add(new ConversationMemberView(user.Id, user.DisplayName, user.AvatarUrl, member.Role, [])); } return list; }
    private Task Notify(Conversation group, string action, CancellationToken ct) => hub.Clients.Users(group.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = group.Id, action, name = group.Name }, ct);
}
