using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/conversations")]
public sealed class ConversationsController(IChatRepository repository, IHubContext<ChatHub> hub, PushNotificationService push, ILogger<ConversationsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ConversationView>>> List(CancellationToken ct)
    {
        var userId = User.UserId();
        var deviceId = CurrentDeviceId();
        var conversations = await repository.GetConversationsAsync(userId, ct);
        var result = new List<ConversationView>();
        foreach (var item in conversations)
        {
            if (item.KeyVersion < 1) item.KeyVersion = 1;
            var member = item.Members.First(x => x.UserId == userId);
            var name = item.Name;
            var avatar = item.AvatarUrl;
            string? peerId = null;
            if (item.Type == ConversationType.Direct)
            {
                peerId = item.Members.First(x => x.UserId != userId).UserId;
                var peer = await repository.GetUserByIdAsync(peerId, ct);
                name = peer?.DisplayName ?? "未知用户"; avatar = peer?.AvatarUrl ?? "";
            }
            var keyEnvelope = EnvelopeFor(item, userId, deviceId);
            result.Add(new ConversationView(item.Id, item.Type, name, avatar, item.LastSequence, item.LastMessagePreview, item.LastMessageAtUtc, item.Members.Count(x => x.LeftAtSequence is null), member.ReadSequence, member.Muted, member.Pinned, item.KeyVersion, keyEnvelope, peerId));
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
        var created = existing is null;
        var item = existing ?? await repository.AddConversationAsync(new Conversation { Type = ConversationType.Direct, CreatedBy = userId, Members = [new() { UserId = userId }, new() { UserId = peer.Id }], KeyEnvelopes = request.KeyEnvelopes ?? [] }, ct);
        if (item.KeyVersion < 1) item.KeyVersion = 1;
        if (created)
        {
            var welcome = await repository.AddMessageIdempotentlyAsync(new ChatMessage
            {
                ClientMessageId = $"friend-welcome:{item.Id}",
                ConversationId = item.Id,
                SenderId = userId,
                Kind = MessageKind.System,
                Algorithm = "PLAINTEXT",
                KeyVersion = 0,
                Content = "我们已经是好友了，现在可以开始聊天吧"
            }, ct);
            _ = BroadcastMessageAsync(item.Id, View(welcome), item.Members.Select(member => member.UserId).ToList());
            await Task.WhenAll(
                hub.Clients.Group($"user:{userId}").SendAsync("conversation.updated", new { conversationId = item.Id, action = "created" }, ct),
                hub.Clients.Group($"user:{peer.Id}").SendAsync("conversation.updated", new { conversationId = item.Id, action = "created" }, ct));
        }
        var keyEnvelope = EnvelopeFor(item, userId, CurrentDeviceId());
        return Ok(new ConversationView(item.Id, item.Type, peer.DisplayName, peer.AvatarUrl, item.LastSequence, item.LastMessagePreview, item.LastMessageAtUtc, 2, item.Members.First(x => x.UserId == userId).ReadSequence, false, false, item.KeyVersion, keyEnvelope, peer.Id));
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
        var keyEnvelope = EnvelopeFor(item, userId, CurrentDeviceId());
        return Ok(new ConversationView(item.Id, item.Type, item.Name, item.AvatarUrl, 0, item.LastMessagePreview, null, members.Count, 0, false, false, item.KeyVersion, keyEnvelope, null));
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

    [HttpGet("{id}/members")]
    public async Task<ActionResult<IReadOnlyList<ConversationMemberView>>> Members(string id, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        var result = new List<ConversationMemberView>();
        foreach (var member in conversation.Members.Where(x => x.LeftAtSequence is null))
        {
            var account = await repository.GetUserByIdAsync(member.UserId, ct);
            if (account is null) continue;
            account.DevicePublicKeys ??= [];
            var devices = account.DevicePublicKeys
                .Where(item => !string.IsNullOrWhiteSpace(item.Value))
                .Select(item => new EncryptionDeviceView(item.Key, item.Value))
                .ToList();
            if (!string.IsNullOrWhiteSpace(account.PublicKeyJwk) && devices.All(item => item.PublicKeyJwk != account.PublicKeyJwk))
                devices.Add(new EncryptionDeviceView("legacy-primary", account.PublicKeyJwk));
            result.Add(new ConversationMemberView(account.Id, account.DisplayName, account.AvatarUrl, member.Role, devices));
        }
        return Ok(result);
    }

    [HttpGet("{id}/keys/{keyVersion:int}")]
    public async Task<ActionResult> KeyEnvelope(string id, int keyVersion, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        if (keyVersion < 1 || keyVersion > conversation.KeyVersion) return NotFound(new { error = "会话密钥版本不存在" });
        var envelopes = keyVersion == conversation.KeyVersion
            ? conversation.KeyEnvelopes
            : await repository.GetConversationKeyEnvelopesAsync(id, keyVersion, ct);
        if (envelopes is null) return NotFound(new { error = "该历史密钥版本尚未保存" });
        var envelope = EnvelopeFor(envelopes, User.UserId(), CurrentDeviceId());
        return envelope is null
            ? NotFound(new { error = "当前设备没有该版本的密钥信封" })
            : Ok(new { conversationId = id, keyVersion, keyEnvelope = envelope });
    }

    [HttpPut("{id}/key")]
    public async Task<ActionResult> RotateKey(string id, RotateConversationKeyRequest request, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        if (request.KeyVersion != conversation.KeyVersion + 1 || request.KeyEnvelopes.Count is 0 or > 2000)
            return Conflict(new { error = "会话密钥版本已变化，请刷新后重试" });
        var activeMemberIds = conversation.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId).ToHashSet();
        if (request.KeyEnvelopes.Any(item => item.Value.Length is < 32 or > 8192 || !activeMemberIds.Any(userId => item.Key == userId || item.Key.StartsWith(userId + ":", StringComparison.Ordinal))))
            return BadRequest(new { error = "会话密钥信封无效" });
        if (activeMemberIds.Any(userId => !request.KeyEnvelopes.Keys.Any(key => key == userId || key.StartsWith(userId + ":", StringComparison.Ordinal))))
            return BadRequest(new { error = "会话成员密钥信封不完整" });
        await repository.UpsertConversationKeyEnvelopesAsync(conversation.Id, conversation.KeyVersion, conversation.KeyEnvelopes, ct);
        conversation.KeyVersion = request.KeyVersion;
        conversation.KeyEnvelopes = new Dictionary<string, string>(request.KeyEnvelopes);
        await repository.UpdateConversationAsync(conversation, ct);
        await repository.UpsertConversationKeyEnvelopesAsync(conversation.Id, conversation.KeyVersion, conversation.KeyEnvelopes, ct);
        await hub.Clients.Users(activeMemberIds).SendAsync("conversation.updated", new { conversationId = id, action = "key-rotated", keyVersion = conversation.KeyVersion }, ct);
        return NoContent();
    }

    [HttpPost("{id}/messages")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<MessageView>> Send(string id, SendMessageRequest request, CancellationToken ct)
    {
        var conversation = await RequireMemberAsync(id, ct); if (conversation is null) return Forbid();
        var plaintext = string.Equals(request.Algorithm, "PLAINTEXT", StringComparison.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(request.ClientMessageId)) return BadRequest(new { error = "消息编号不能为空" });
        if (plaintext)
        {
            if (string.IsNullOrWhiteSpace(request.Content) || request.Content.Length > 50_000) return BadRequest(new { error = "消息内容为空或过大" });
        }
        else if (string.IsNullOrWhiteSpace(request.Ciphertext) || request.Ciphertext.Length > 50_000)
            return BadRequest(new { error = "历史加密消息格式无效或内容过大" });
        var keyVersion = plaintext ? 0 : Math.Max(1, request.KeyVersion);
        if (!plaintext && keyVersion != conversation.KeyVersion) return Conflict(new { error = "会话密钥已更新，请刷新后重试" });
        if (request.Kind is MessageKind.Image or MessageKind.Voice or MessageKind.Video or MessageKind.File)
        {
            if (request.Metadata is null || !request.Metadata.TryGetValue("assetId", out var assetId)) return BadRequest(new { error = "富媒体消息缺少媒体资产" });
            var asset = await repository.GetMediaAssetAsync(assetId, ct);
            if (asset is null || asset.OwnerId != User.UserId() || asset.Purpose != MediaPurpose.Chat || asset.ConversationId != id) return BadRequest(new { error = "媒体资产无效" });
        }
        var message = await repository.AddMessageIdempotentlyAsync(new ChatMessage { ClientMessageId = request.ClientMessageId, ConversationId = id, SenderId = User.UserId(), Kind = request.Kind, Content = plaintext ? request.Content ?? "" : "", Ciphertext = plaintext ? "" : request.Ciphertext, Nonce = plaintext ? "" : request.Nonce, Algorithm = plaintext ? "PLAINTEXT" : request.Algorithm, KeyVersion = keyVersion, ReplyToMessageId = request.ReplyToMessageId, Metadata = request.Metadata ?? [] }, ct);
        var view = View(message);
        var memberUserIds = conversation.Members
            .Where(member => member.LeftAtSequence is null)
            .Select(member => member.UserId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        _ = BroadcastMessageAsync(id, view, memberUserIds);
        _ = push.SendMessageAsync(conversation, message, CancellationToken.None);
        return Ok(view);
    }

    private async Task BroadcastMessageAsync(string conversationId, MessageView view, IReadOnlyList<string> memberUserIds)
    {
        try
        {
            await Task.WhenAll(memberUserIds.Select(memberUserId =>
                hub.Clients.Group($"user:{memberUserId}")
                    .SendAsync("message.created", view, CancellationToken.None)));
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "实时消息广播失败，messageId={MessageId} conversationId={ConversationId}", view.Id, conversationId);
        }
    }

    [HttpPost("{id}/messages/{messageId}/recall")]
    public async Task<ActionResult> Recall(string id, string messageId, CancellationToken ct)
    {
        if (await RequireMemberAsync(id, ct) is null) return Forbid();
        var message = await repository.GetMessageAsync(messageId, ct);
        if (message is null || message.ConversationId != id || message.SenderId != User.UserId()) return NotFound();
        if (DateTime.UtcNow - message.SentAtUtc > TimeSpan.FromMinutes(2)) return BadRequest(new { error = "已超过 2 分钟撤回时限" });
        message.State = MessageState.Recalled; message.RecalledAtUtc = DateTime.UtcNow; message.Content = ""; message.Ciphertext = ""; message.Nonce = "";
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
        if (item is not null && item.KeyVersion < 1) item.KeyVersion = 1;
        return item is not null && !item.IsDissolved && item.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null) ? item : null;
    }

    private string? CurrentDeviceId() => Request.Headers["X-EChat-Device-Id"].FirstOrDefault();

    private static string? EnvelopeFor(Conversation conversation, string userId, string? deviceId)
        => EnvelopeFor(conversation.KeyEnvelopes, userId, deviceId);

    private static string? EnvelopeFor(IReadOnlyDictionary<string, string> keyEnvelopes, string userId, string? deviceId)
    {
        if (!string.IsNullOrWhiteSpace(deviceId) && keyEnvelopes.TryGetValue($"{userId}:{deviceId}", out var deviceEnvelope)) return deviceEnvelope;
        return keyEnvelopes.TryGetValue(userId, out var legacyEnvelope) ? legacyEnvelope : null;
    }

    private static MessageView View(ChatMessage m) => new(m.Id, m.ClientMessageId, m.ConversationId, m.Sequence, m.SenderId, m.Kind, m.Ciphertext, m.Nonce, m.Algorithm, string.Equals(m.Algorithm, "PLAINTEXT", StringComparison.OrdinalIgnoreCase) ? 0 : Math.Max(1, m.KeyVersion), m.ReplyToMessageId, m.Metadata, m.State, m.SentAtUtc, m.RecalledAtUtc, m.Content ?? "");
}
