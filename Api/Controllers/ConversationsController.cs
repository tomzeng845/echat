using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/conversations")]
public sealed class ConversationsController(IChatRepository repository, IHubContext<ChatHub> hub) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ConversationView>>> List(CancellationToken ct)
    {
        var userId = User.UserId();
        var conversations = await repository.GetConversationsAsync(userId, ct);
        var result = new List<ConversationView>();
        foreach (var item in conversations)
        {
            var member = item.Members.First(x => x.UserId == userId);
            var name = item.Name;
            var avatar = item.AvatarUrl;
            if (item.Type == ConversationType.Direct)
            {
                var peerId = item.Members.First(x => x.UserId != userId).UserId;
                var peer = await repository.GetUserByIdAsync(peerId, ct);
                name = peer?.DisplayName ?? "未知用户"; avatar = peer?.AvatarUrl ?? "";
            }
            item.KeyEnvelopes.TryGetValue(userId, out var keyEnvelope);
            result.Add(new ConversationView(item.Id, item.Type, name, avatar, item.LastSequence, item.LastMessagePreview, item.LastMessageAtUtc, item.Members.Count(x => x.LeftAtSequence is null), member.ReadSequence, member.Muted, member.Pinned, keyEnvelope));
        }
        return Ok(result);
    }

    [HttpPost("direct")]
    public async Task<ActionResult<ConversationView>> CreateDirect(ConversationCreateRequest request, CancellationToken ct)
    {
        var userId = User.UserId();
        var peer = await repository.GetUserByAccountAsync(request.PeerAccount.Trim().ToLowerInvariant(), ct);
        if (peer is null || peer.Id == userId) return BadRequest(new { error = "联系人无效" });
        var relation = await repository.GetRelationAsync(userId, peer.Id, ct);
        if (relation?.Status != RelationStatus.Friend) return StatusCode(403, new { error = "只有好友可以创建会话" });
        var existing = await repository.FindDirectConversationAsync(userId, peer.Id, ct);
        var item = existing ?? await repository.AddConversationAsync(new Conversation { Type = ConversationType.Direct, CreatedBy = userId, Members = [new() { UserId = userId }, new() { UserId = peer.Id }], KeyEnvelopes = request.KeyEnvelopes ?? [] }, ct);
        item.KeyEnvelopes.TryGetValue(userId, out var keyEnvelope);
        return Ok(new ConversationView(item.Id, item.Type, peer.DisplayName, peer.AvatarUrl, item.LastSequence, item.LastMessagePreview, item.LastMessageAtUtc, 2, item.Members.First(x => x.UserId == userId).ReadSequence, false, false, keyEnvelope));
    }

    [HttpPost("groups")]
    public async Task<ActionResult<ConversationView>> CreateGroup(GroupCreateRequest request, CancellationToken ct)
    {
        var userId = User.UserId();
        if (string.IsNullOrWhiteSpace(request.Name) || request.MemberAccounts.Count is < 2 or > 499) return BadRequest(new { error = "群名称或成员数量无效" });
        var members = new List<ConversationMember> { new() { UserId = userId, Role = MemberRole.Owner } };
        foreach (var account in request.MemberAccounts.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var peer = await repository.GetUserByAccountAsync(account.Trim().ToLowerInvariant(), ct);
            if (peer is not null && peer.Id != userId && (await repository.GetRelationAsync(userId, peer.Id, ct))?.Status == RelationStatus.Friend)
                members.Add(new ConversationMember { UserId = peer.Id });
        }
        if (members.Count < 3) return BadRequest(new { error = "至少选择两位好友" });
        var item = await repository.AddConversationAsync(new Conversation { Type = ConversationType.Group, Name = request.Name.Trim(), CreatedBy = userId, Members = members, KeyEnvelopes = request.KeyEnvelopes ?? [] }, ct);
        await hub.Clients.Users(members.Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = item.Id, action = "created" }, ct);
        item.KeyEnvelopes.TryGetValue(userId, out var keyEnvelope);
        return Ok(new ConversationView(item.Id, item.Type, item.Name, item.AvatarUrl, 0, item.LastMessagePreview, null, members.Count, 0, false, false, keyEnvelope));
    }

    [HttpGet("{id}/messages")]
    public async Task<ActionResult<IReadOnlyList<MessageView>>> Messages(string id, [FromQuery] long after = 0, [FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        var member = conversation.Members.First(x => x.UserId == User.UserId());
        var safeAfter = Math.Max(after, member.JoinedAtSequence - 1);
        var messages = await repository.GetMessagesAsync(id, safeAfter, Math.Clamp(limit, 1, 100), ct);
        return Ok(messages.Select(View).ToList());
    }

    [HttpPost("{id}/messages")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<MessageView>> Send(string id, SendMessageRequest request, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        if (string.IsNullOrWhiteSpace(request.ClientMessageId) || string.IsNullOrWhiteSpace(request.Ciphertext) || request.Ciphertext.Length > 50_000) return BadRequest(new { error = "消息格式无效或内容过大" });
        var message = await repository.AddMessageIdempotentlyAsync(new ChatMessage { ClientMessageId = request.ClientMessageId, ConversationId = id, SenderId = User.UserId(), Kind = request.Kind, Ciphertext = request.Ciphertext, Nonce = request.Nonce, Algorithm = request.Algorithm, ReplyToMessageId = request.ReplyToMessageId, Metadata = request.Metadata ?? [] }, ct);
        var view = View(message);
        await hub.Clients.Group($"conversation:{id}").SendAsync("message.created", view, ct);
        return Ok(view);
    }

    [HttpPost("{id}/messages/{messageId}/recall")]
    public async Task<ActionResult> Recall(string id, string messageId, CancellationToken ct)
    {
        if (await RequireMemberAsync(id, ct) is null) return Forbid();
        var message = await repository.GetMessageAsync(messageId, ct);
        if (message is null || message.ConversationId != id || message.SenderId != User.UserId()) return NotFound();
        if (DateTime.UtcNow - message.SentAtUtc > TimeSpan.FromMinutes(2)) return BadRequest(new { error = "已超过 2 分钟撤回时限" });
        message.State = MessageState.Recalled; message.RecalledAtUtc = DateTime.UtcNow; message.Ciphertext = ""; message.Nonce = "";
        await repository.UpdateMessageAsync(message, ct);
        await hub.Clients.Group($"conversation:{id}").SendAsync("message.updated", View(message), ct);
        return NoContent();
    }

    [HttpPost("{id}/read/{sequence:long}")]
    public async Task<ActionResult> MarkRead(string id, long sequence, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        var userId = User.UserId();
        var member = conversation.Members.First(x => x.UserId == userId);
        member.ReadSequence = Math.Max(member.ReadSequence, Math.Min(sequence, conversation.LastSequence));
        await repository.UpdateConversationAsync(conversation, ct);
        await hub.Clients.Group($"conversation:{id}").SendAsync("receipt.updated", new { conversationId = id, userId, readSequence = member.ReadSequence }, ct);
        return NoContent();
    }

    private async Task<Conversation?> RequireMemberAsync(string id, CancellationToken ct)
    {
        var item = await repository.GetConversationAsync(id, ct);
        return item is not null && !item.IsDissolved && item.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null) ? item : null;
    }

    private static MessageView View(ChatMessage m) => new(m.Id, m.ClientMessageId, m.ConversationId, m.Sequence, m.SenderId, m.Kind, m.Ciphertext, m.Nonce, m.Algorithm, m.ReplyToMessageId, m.Metadata, m.State, m.SentAtUtc, m.RecalledAtUtc);
}
