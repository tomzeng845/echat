using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/contacts")]
public sealed class ContactsController(IChatRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult> List(CancellationToken ct)
    {
        var relations = await repository.GetRelationsAsync(User.UserId(), ct);
        var result = new List<object>();
        foreach (var relation in relations)
        {
            var peer = await repository.GetUserByIdAsync(relation.PeerUserId, ct);
            if (peer is not null) result.Add(new { relation.Status, relation.Remark, user = new UserView(peer.Id, peer.Account, peer.DisplayName, peer.AvatarUrl, peer.Signature, peer.Region, peer.Role, peer.Status) });
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
        return Ok(item);
    }

    [HttpGet("requests")]
    public async Task<ActionResult> Requests(CancellationToken ct) => Ok(await repository.GetFriendRequestsAsync(User.UserId(), ct));

    [HttpPost("requests/{id}/accept")]
    public async Task<ActionResult> Accept(string id, CancellationToken ct)
    {
        var item = await repository.GetFriendRequestAsync(id, ct);
        if (item is null || item.ReceiverId != User.UserId() || item.Status != FriendRequestStatus.Pending) return NotFound(new { error = "好友申请不存在或已处理" });
        item.Status = FriendRequestStatus.Accepted;
        await repository.UpdateFriendRequestAsync(item, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{item.SenderId}:{item.ReceiverId}", UserId = item.SenderId, PeerUserId = item.ReceiverId }, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{item.ReceiverId}:{item.SenderId}", UserId = item.ReceiverId, PeerUserId = item.SenderId }, ct);
        return NoContent();
    }

    [HttpPost("{peerId}/block")]
    public async Task<ActionResult> Block(string peerId, CancellationToken ct)
    {
        var userId = User.UserId();
        if (await repository.GetUserByIdAsync(peerId, ct) is null) return NotFound();
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{userId}:{peerId}", UserId = userId, PeerUserId = peerId, Status = RelationStatus.Blocked }, ct);
        return NoContent();
    }

    [HttpDelete("{peerId}")]
    public async Task<ActionResult> Delete(string peerId, CancellationToken ct)
    {
        var userId = User.UserId();
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{userId}:{peerId}", UserId = userId, PeerUserId = peerId, Status = RelationStatus.Deleted }, ct);
        await repository.UpsertRelationAsync(new ContactRelation { Id = $"{peerId}:{userId}", UserId = peerId, PeerUserId = userId, Status = RelationStatus.Deleted }, ct);
        return NoContent();
    }
}
