using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/contacts")]
public sealed class ContactsController(IChatRepository repository, IHubContext<ChatHub> hub, PushNotificationService push) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult> List(CancellationToken ct)
    {
        var relations = await repository.GetRelationsAsync(User.UserId(), ct);
        var result = new List<object>();
        foreach (var relation in relations)
        {
            var peer = await repository.GetUserByIdAsync(relation.PeerUserId, ct);
            if (peer is not null) result.Add(new { relation.Status, relation.Remark, user = View(peer) });
        }
        return Ok(result);
    }

    [HttpPost("requests")]
    public async Task<ActionResult> RequestFriend(FriendRequestInput input, CancellationToken ct)
    {
        var senderId = User.UserId();
        var peer = await repository.GetUserByAccountAsync(input.PeerAccount.Trim().ToLowerInvariant(), ct);
        if (peer is null || peer.Id == senderId) return BadRequest(new { error = "无法添加该账号" });
        var blocked = await repository.GetRelationAsync(peer.Id, senderId, ct);
        if (blocked?.Status == RelationStatus.Blocked) return StatusCode(403, new { error = "暂时无法发送好友申请" });
        var item = await repository.AddFriendRequestAsync(new FriendRequest { RequestId = input.RequestId, SenderId = senderId, ReceiverId = peer.Id, Note = input.Note.Trim(), Source = input.Source }, ct);
        var sender = await repository.GetUserByIdAsync(senderId, ct);
        var view = RequestView(item, sender);
        await hub.Clients.Group($"user:{peer.Id}").SendAsync("contact.requested", view, ct);
        if (sender is not null) _ = push.SendFriendRequestAsync(peer.Id, sender, item, CancellationToken.None);
        return Ok(view);
    }

    [HttpGet("requests")]
    public async Task<ActionResult> Requests(CancellationToken ct)
    {
        var items = await repository.GetFriendRequestsAsync(User.UserId(), ct);
        var result = new List<object>();
        foreach (var item in items)
            result.Add(RequestView(item, await repository.GetUserByIdAsync(item.SenderId, ct)));
        return Ok(result);
    }

    [HttpPost("requests/{id}/accept")]
    public async Task<ActionResult> Accept(string id, CancellationToken ct)
    {
        var receiverId = User.UserId();
        var item = await repository.GetFriendRequestAsync(id, ct);
        if (item is null || item.ReceiverId != receiverId || item.Status != FriendRequestStatus.Pending) return NotFound(new { error = "好友申请不存在或已处理" });
        item.Status = FriendRequestStatus.Accepted;
        await repository.UpdateFriendRequestAsync(item, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{item.SenderId}:{item.ReceiverId}", UserId = item.SenderId, PeerUserId = item.ReceiverId }, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{item.ReceiverId}:{item.SenderId}", UserId = item.ReceiverId, PeerUserId = item.SenderId }, ct);

        var sender = await repository.GetUserByIdAsync(item.SenderId, ct);
        var receiver = await repository.GetUserByIdAsync(receiverId, ct);
        await Task.WhenAll(
            hub.Clients.Group($"user:{item.SenderId}").SendAsync("contact.updated", new { status = RelationStatus.Friend, peer = receiver is null ? null : View(receiver), requestId = item.Id }, ct),
            hub.Clients.Group($"user:{receiverId}").SendAsync("contact.updated", new { status = RelationStatus.Friend, peer = sender is null ? null : View(sender), requestId = item.Id }, ct)
        );
        return NoContent();
    }

    [HttpPost("{peerId}/block")]
    public async Task<ActionResult> Block(string peerId, CancellationToken ct)
    {
        var userId = User.UserId();
        if (await repository.GetUserByIdAsync(peerId, ct) is null) return NotFound();
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{userId}:{peerId}", UserId = userId, PeerUserId = peerId, Status = RelationStatus.Blocked }, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{peerId}:{userId}", UserId = peerId, PeerUserId = userId, Status = RelationStatus.Deleted }, ct);
        await NotifyContactUpdated(userId, peerId, RelationStatus.Blocked, ct);
        return NoContent();
    }

    [HttpDelete("{peerId}")]
    public async Task<ActionResult> Delete(string peerId, CancellationToken ct)
    {
        var userId = User.UserId();
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{userId}:{peerId}", UserId = userId, PeerUserId = peerId, Status = RelationStatus.Deleted }, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{peerId}:{userId}", UserId = peerId, PeerUserId = userId, Status = RelationStatus.Deleted }, ct);
        await NotifyContactUpdated(userId, peerId, RelationStatus.Deleted, ct);
        return NoContent();
    }

    private async Task NotifyContactUpdated(string userId, string peerId, RelationStatus status, CancellationToken ct)
    {
        await Task.WhenAll(
            hub.Clients.Group($"user:{userId}").SendAsync("contact.updated", new { status, peerId }, ct),
            hub.Clients.Group($"user:{peerId}").SendAsync("contact.updated", new { status, peerId = userId }, ct)
        );
    }

    private static object RequestView(FriendRequest item, UserAccount? sender) => new
    {
        item.Id,
        item.SenderId,
        item.ReceiverId,
        item.Note,
        item.Source,
        item.Status,
        item.CreatedAtUtc,
        sender = sender is null ? null : View(sender)
    };

    private static UserView View(UserAccount user) => new(user.Id, user.Account, user.DisplayName, user.AvatarUrl, user.Signature, user.Region, user.Role, user.Status);
}
