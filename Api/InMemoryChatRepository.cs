using System.Collections.Concurrent;

namespace EChat.Api;

public sealed class InMemoryChatRepository : IChatRepository
{
    private readonly ConcurrentDictionary<string, UserAccount> _users = new();
    private readonly ConcurrentDictionary<string, InviteCode> _invites = new();
    private readonly ConcurrentDictionary<string, RefreshSession> _sessions = new();
    private readonly ConcurrentDictionary<string, FriendRequest> _friendRequests = new();
    private readonly ConcurrentDictionary<string, ContactRelation> _relations = new();
    private readonly ConcurrentDictionary<string, Conversation> _conversations = new();
    private readonly ConcurrentDictionary<string, ChatMessage> _messages = new();
    private readonly ConcurrentDictionary<string, MediaAsset> _mediaAssets = new();
    private readonly ConcurrentDictionary<string, MomentPost> _moments = new();
    private readonly ConcurrentDictionary<string, MomentLike> _momentLikes = new();
    private readonly ConcurrentDictionary<string, MomentComment> _momentComments = new();
    private readonly ConcurrentDictionary<string, string> _messageIdempotency = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _conversationLocks = new();

    public Task EnsureSeedDataAsync(CancellationToken ct = default)
    {
        _invites.TryAdd("ECHAT2026", new InviteCode { Code = "ECHAT2026", MaxUses = 1000, IsActive = true });
        return Task.CompletedTask;
    }

    public Task<UserAccount?> GetUserByAccountAsync(string account, CancellationToken ct = default) =>
        Task.FromResult(_users.Values.FirstOrDefault(x => x.Account.Equals(account, StringComparison.OrdinalIgnoreCase)));

    public Task<UserAccount?> GetUserByIdAsync(string id, CancellationToken ct = default) =>
        Task.FromResult(_users.TryGetValue(id, out var user) ? user : null);

    public Task<bool> TryConsumeInviteAsync(string code, CancellationToken ct = default)
    {
        if (!_invites.TryGetValue(code.ToUpperInvariant(), out var invite)) return Task.FromResult(false);
        lock (invite)
        {
            if (!invite.IsActive || invite.UsedCount >= invite.MaxUses || invite.ExpiresAtUtc < DateTime.UtcNow) return Task.FromResult(false);
            invite.UsedCount++;
            return Task.FromResult(true);
        }
    }

    public Task AddUserAsync(UserAccount user, CancellationToken ct = default)
    {
        if (_users.Values.Any(x => x.Account.Equals(user.Account, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("ACCOUNT_EXISTS");
        _users[user.Id] = user;
        return Task.CompletedTask;
    }

    public Task UpdateUserAsync(UserAccount user, CancellationToken ct = default) { _users[user.Id] = user; return Task.CompletedTask; }
    public Task AddSessionAsync(RefreshSession session, CancellationToken ct = default) { _sessions[session.Id] = session; return Task.CompletedTask; }
    public Task<RefreshSession?> GetSessionByHashAsync(string hash, CancellationToken ct = default) => Task.FromResult(_sessions.Values.FirstOrDefault(x => x.TokenHash == hash && x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow));
    public Task RevokeSessionAsync(string id, CancellationToken ct = default) { if (_sessions.TryGetValue(id, out var item)) item.RevokedAtUtc = DateTime.UtcNow; return Task.CompletedTask; }

    public Task<FriendRequest> AddFriendRequestAsync(FriendRequest request, CancellationToken ct = default)
    {
        var existing = _friendRequests.Values.FirstOrDefault(x => x.SenderId == request.SenderId && x.RequestId == request.RequestId);
        if (existing is not null) return Task.FromResult(existing);
        _friendRequests[request.Id] = request;
        return Task.FromResult(request);
    }

    public Task<IReadOnlyList<FriendRequest>> GetFriendRequestsAsync(string userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<FriendRequest>>(_friendRequests.Values.Where(x => x.ReceiverId == userId).OrderByDescending(x => x.CreatedAtUtc).ToList());
    public Task<FriendRequest?> GetFriendRequestAsync(string id, CancellationToken ct = default) => Task.FromResult(_friendRequests.TryGetValue(id, out var item) ? item : null);
    public Task UpdateFriendRequestAsync(FriendRequest request, CancellationToken ct = default) { _friendRequests[request.Id] = request; return Task.CompletedTask; }
    public Task UpsertRelationAsync(ContactRelation relation, CancellationToken ct = default) { _relations[relation.Id] = relation; return Task.CompletedTask; }
    public Task<ContactRelation?> GetRelationAsync(string userId, string peerId, CancellationToken ct = default) => Task.FromResult(_relations.TryGetValue($"{userId}:{peerId}", out var item) ? item : null);
    public Task<IReadOnlyList<ContactRelation>> GetRelationsAsync(string userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<ContactRelation>>(_relations.Values.Where(x => x.UserId == userId && x.Status != RelationStatus.Deleted).ToList());
    public Task<Conversation> AddConversationAsync(Conversation conversation, CancellationToken ct = default) { _conversations[conversation.Id] = conversation; return Task.FromResult(conversation); }
    public Task UpdateConversationAsync(Conversation conversation, CancellationToken ct = default) { _conversations[conversation.Id] = conversation; return Task.CompletedTask; }
    public Task<Conversation?> GetConversationAsync(string id, CancellationToken ct = default) => Task.FromResult(_conversations.TryGetValue(id, out var item) ? item : null);

    public Task<Conversation?> FindDirectConversationAsync(string userA, string userB, CancellationToken ct = default) =>
        Task.FromResult(_conversations.Values.FirstOrDefault(x => x.Type == ConversationType.Direct && x.Members.Count == 2 && x.Members.Any(m => m.UserId == userA) && x.Members.Any(m => m.UserId == userB)));

    public Task<IReadOnlyList<Conversation>> GetConversationsAsync(string userId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Conversation>>(_conversations.Values.Where(x => !x.IsDissolved && x.Members.Any(m => m.UserId == userId && m.LeftAtSequence is null)).OrderByDescending(x => x.LastMessageAtUtc ?? x.CreatedAtUtc).ToList());

    public async Task<ChatMessage> AddMessageIdempotentlyAsync(ChatMessage message, CancellationToken ct = default)
    {
        var key = $"{message.SenderId}:{message.ClientMessageId}";
        if (_messageIdempotency.TryGetValue(key, out var existingId)) return _messages[existingId];
        var gate = _conversationLocks.GetOrAdd(message.ConversationId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (_messageIdempotency.TryGetValue(key, out existingId)) return _messages[existingId];
            if (!_conversations.TryGetValue(message.ConversationId, out var conversation)) throw new InvalidOperationException("CONVERSATION_NOT_FOUND");
            message.Sequence = ++conversation.LastSequence;
            conversation.LastMessagePreview = message.Kind switch { MessageKind.Text => "加密消息", MessageKind.Image => "[图片]", MessageKind.Voice => "[语音]", MessageKind.Video => "[视频]", MessageKind.File => "[文件]", _ => $"[{message.Kind}]" };
            conversation.LastMessageAtUtc = message.SentAtUtc;
            _messages[message.Id] = message;
            _messageIdempotency[key] = message.Id;
            return message;
        }
        finally { gate.Release(); }
    }

    public Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(string conversationId, long afterSequence, int limit, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<ChatMessage>>(_messages.Values.Where(x => x.ConversationId == conversationId && x.Sequence > afterSequence).OrderBy(x => x.Sequence).Take(limit).ToList());
    public Task<ChatMessage?> GetMessageAsync(string id, CancellationToken ct = default) => Task.FromResult(_messages.TryGetValue(id, out var item) ? item : null);
    public Task UpdateMessageAsync(ChatMessage message, CancellationToken ct = default) { _messages[message.Id] = message; return Task.CompletedTask; }

    public Task<MediaAsset> AddMediaAssetAsync(MediaAsset asset, CancellationToken ct = default) { _mediaAssets[asset.Id] = asset; return Task.FromResult(asset); }
    public Task<MediaAsset?> GetMediaAssetAsync(string id, CancellationToken ct = default) => Task.FromResult(_mediaAssets.TryGetValue(id, out var item) ? item : null);
    public Task<IReadOnlyList<MediaAsset>> GetMediaAssetsAsync(IEnumerable<string> ids, CancellationToken ct = default)
    {
        var wanted = ids.ToHashSet(StringComparer.Ordinal);
        return Task.FromResult<IReadOnlyList<MediaAsset>>(_mediaAssets.Values.Where(x => wanted.Contains(x.Id)).ToList());
    }

    public Task<MomentPost> AddMomentAsync(MomentPost moment, CancellationToken ct = default) { _moments[moment.Id] = moment; return Task.FromResult(moment); }
    public Task<MomentPost?> GetMomentAsync(string id, CancellationToken ct = default) => Task.FromResult(_moments.TryGetValue(id, out var item) ? item : null);
    public Task UpdateMomentAsync(MomentPost moment, CancellationToken ct = default) { _moments[moment.Id] = moment; return Task.CompletedTask; }
    public Task<IReadOnlyList<MomentPost>> GetMomentsAsync(IEnumerable<string> authorIds, DateTime? beforeUtc, int limit, CancellationToken ct = default)
    {
        var authors = authorIds.ToHashSet(StringComparer.Ordinal);
        var before = beforeUtc ?? DateTime.MaxValue;
        return Task.FromResult<IReadOnlyList<MomentPost>>(_moments.Values.Where(x => authors.Contains(x.AuthorId) && x.DeletedAtUtc is null && x.CreatedAtUtc < before).OrderByDescending(x => x.CreatedAtUtc).Take(limit).ToList());
    }

    public Task<MomentLike> UpsertMomentLikeAsync(MomentLike like, CancellationToken ct = default) { _momentLikes[like.Id] = like; return Task.FromResult(like); }
    public Task RemoveMomentLikeAsync(string momentId, string userId, CancellationToken ct = default) { _momentLikes.TryRemove($"{momentId}:{userId}", out _); return Task.CompletedTask; }
    public Task<IReadOnlyList<MomentLike>> GetMomentLikesAsync(IEnumerable<string> momentIds, CancellationToken ct = default)
    {
        var wanted = momentIds.ToHashSet(StringComparer.Ordinal);
        return Task.FromResult<IReadOnlyList<MomentLike>>(_momentLikes.Values.Where(x => wanted.Contains(x.MomentId)).OrderBy(x => x.CreatedAtUtc).ToList());
    }

    public Task<MomentComment> AddMomentCommentAsync(MomentComment comment, CancellationToken ct = default) { _momentComments[comment.Id] = comment; return Task.FromResult(comment); }
    public Task<MomentComment?> GetMomentCommentAsync(string id, CancellationToken ct = default) => Task.FromResult(_momentComments.TryGetValue(id, out var item) ? item : null);
    public Task UpdateMomentCommentAsync(MomentComment comment, CancellationToken ct = default) { _momentComments[comment.Id] = comment; return Task.CompletedTask; }
    public Task<IReadOnlyList<MomentComment>> GetMomentCommentsAsync(IEnumerable<string> momentIds, CancellationToken ct = default)
    {
        var wanted = momentIds.ToHashSet(StringComparer.Ordinal);
        return Task.FromResult<IReadOnlyList<MomentComment>>(_momentComments.Values.Where(x => wanted.Contains(x.MomentId) && x.DeletedAtUtc is null).OrderBy(x => x.CreatedAtUtc).ToList());
    }
}
