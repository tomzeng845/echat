using System.Collections.Concurrent;

namespace EChat.Api;

public sealed class InMemoryChatRepository : IChatRepository
{
    private readonly ConcurrentDictionary<string, UserAccount> _users = new();
    private readonly ConcurrentDictionary<string, InviteCode> _invites = new();
    private readonly ConcurrentDictionary<string, RefreshSession> _sessions = new();
    private readonly ConcurrentDictionary<string, PushDevice> _pushDevices = new();
    private readonly ConcurrentDictionary<string, QrLoginChallenge> _qrLogins = new();
    private readonly ConcurrentDictionary<string, ContactQrToken> _contactQrs = new();
    private readonly ConcurrentDictionary<string, FriendRequest> _friendRequests = new();
    private readonly ConcurrentDictionary<string, ContactRelation> _relations = new();
    private readonly ConcurrentDictionary<string, Conversation> _conversations = new();
    private readonly ConcurrentDictionary<string, ConversationKeyEnvelopeRecord> _conversationKeys = new();
    private readonly ConcurrentDictionary<string, ChatMessage> _messages = new();
    private readonly ConcurrentDictionary<string, MediaAsset> _mediaAssets = new();
    private readonly ConcurrentDictionary<string, MomentPost> _moments = new();
    private readonly ConcurrentDictionary<string, MomentLike> _momentLikes = new();
    private readonly ConcurrentDictionary<string, MomentComment> _momentComments = new();
    private readonly ConcurrentDictionary<string, MomentReport> _momentReports = new();
    private readonly ConcurrentDictionary<string, CallRecord> _calls = new();
    private readonly ConcurrentDictionary<string, AdminAuditLog> _adminAudits = new();
    private readonly ConcurrentDictionary<string, AdminModuleRecord> _adminRecords = new();
    private readonly ConcurrentDictionary<string, string> _messageIdempotency = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _conversationLocks = new();

    public Task EnsureSeedDataAsync(CancellationToken ct = default)
    {
        _invites.TryAdd("ECHAT2026", new InviteCode { Code = "ECHAT2026", MaxUses = 1000, IsActive = true });
        Seed("seed-fund-credit", "fund.subjects", "人工增加", "code", "MANUAL_CREDIT");
        _adminRecords["seed-fund-credit"].Data["direction"] = "Increase";
        Seed("seed-fund-debit", "fund.subjects", "人工扣减", "code", "MANUAL_DEBIT");
        _adminRecords["seed-fund-debit"].Data["direction"] = "Decrease";
        Seed("seed-role-admin", "system.roles", "超级管理员", "permissions", "*");
        Seed("seed-customer-service", "chat.customer-service", "系统客服", "account", "service");
        return Task.CompletedTask;
    }

    private void Seed(string id, string module, string name, string key, string value) => _adminRecords.TryAdd(id, new AdminModuleRecord { Id = id, Module = module, Name = name, Data = new Dictionary<string, string> { [key] = value } });

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
    public Task<InviteCode> UpsertInviteAsync(InviteCode invite, CancellationToken ct = default) { _invites[invite.Code] = invite; return Task.FromResult(invite); }
    public Task<IReadOnlyList<InviteCode>> GetInvitesAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<InviteCode>>(_invites.Values.OrderByDescending(x => x.IsActive).ThenBy(x => x.Code).Take(limit).ToList());

    public Task AddUserAsync(UserAccount user, CancellationToken ct = default)
    {
        if (_users.Values.Any(x => x.Account.Equals(user.Account, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("ACCOUNT_EXISTS");
        _users[user.Id] = user;
        return Task.CompletedTask;
    }

    public Task UpdateUserAsync(UserAccount user, CancellationToken ct = default) { _users[user.Id] = user; return Task.CompletedTask; }
    public Task<IReadOnlyList<UserAccount>> GetUsersAsync(string? search, UserStatus? status, int limit, CancellationToken ct = default)
    {
        var query = _users.Values.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Account.Contains(search, StringComparison.OrdinalIgnoreCase) || x.DisplayName.Contains(search, StringComparison.OrdinalIgnoreCase));
        if (status.HasValue) query = query.Where(x => x.Status == status.Value);
        return Task.FromResult<IReadOnlyList<UserAccount>>(query.OrderByDescending(x => x.CreatedAtUtc).Take(limit).ToList());
    }
    public Task<long> CountUsersAsync(UserStatus? status = null, CancellationToken ct = default) => Task.FromResult((long)_users.Values.Count(x => !status.HasValue || x.Status == status.Value));
    public Task AddSessionAsync(RefreshSession session, CancellationToken ct = default) { _sessions[session.Id] = session; return Task.CompletedTask; }
    public Task<RefreshSession?> GetSessionByHashAsync(string hash, CancellationToken ct = default) => Task.FromResult(_sessions.Values.FirstOrDefault(x => x.TokenHash == hash && x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow));
    public Task RevokeSessionAsync(string id, CancellationToken ct = default) { if (_sessions.TryGetValue(id, out var item)) item.RevokedAtUtc = DateTime.UtcNow; return Task.CompletedTask; }
    public Task<IReadOnlyList<RefreshSession>> GetSessionsAsync(string userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<RefreshSession>>(_sessions.Values.Where(x => x.UserId == userId && x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow).OrderByDescending(x => x.LastSeenAtUtc).ToList());
    public Task<long> CountActiveSessionsAsync(CancellationToken ct = default) => Task.FromResult((long)_sessions.Values.Count(x => x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow));
    public Task RevokeSessionsAsync(string userId, string? exceptSessionId, string reason, CancellationToken ct = default)
    {
        foreach (var item in _sessions.Values.Where(x => x.UserId == userId && x.Id != exceptSessionId && x.RevokedAtUtc is null)) { item.RevokedAtUtc = DateTime.UtcNow; item.RevokedReason = reason; }
        return Task.CompletedTask;
    }
    public Task<PushDevice> UpsertPushDeviceAsync(PushDevice device, CancellationToken ct = default)
    {
        var key = $"{device.UserId}:{device.DeviceId}";
        var createdAt = _pushDevices.TryGetValue(key, out var existing) ? existing.CreatedAtUtc : device.CreatedAtUtc;
        device.Id = key;
        device.CreatedAtUtc = createdAt;
        device.Enabled = true;
        device.DisabledAtUtc = null;
        device.LastSeenAtUtc = DateTime.UtcNow;
        foreach (var duplicate in _pushDevices.Where(x => x.Key != key && x.Value.Token == device.Token).ToList()) _pushDevices.TryRemove(duplicate.Key, out _);
        _pushDevices[key] = device;
        return Task.FromResult(device);
    }
    public Task<IReadOnlyList<PushDevice>> GetPushDevicesAsync(IEnumerable<string> userIds, CancellationToken ct = default)
    {
        var wanted = userIds.ToHashSet(StringComparer.Ordinal);
        return Task.FromResult<IReadOnlyList<PushDevice>>(_pushDevices.Values.Where(x => wanted.Contains(x.UserId) && x.Enabled).ToList());
    }
    public Task DisablePushDeviceAsync(string userId, string deviceId, CancellationToken ct = default)
    {
        if (_pushDevices.TryGetValue($"{userId}:{deviceId}", out var device)) { device.Enabled = false; device.DisabledAtUtc = DateTime.UtcNow; }
        return Task.CompletedTask;
    }
    public Task DisablePushTokenAsync(string token, CancellationToken ct = default)
    {
        foreach (var device in _pushDevices.Values.Where(x => x.Token == token)) { device.Enabled = false; device.DisabledAtUtc = DateTime.UtcNow; }
        return Task.CompletedTask;
    }
    public Task AddQrLoginAsync(QrLoginChallenge challenge, CancellationToken ct = default) { _qrLogins[challenge.Id] = challenge; return Task.CompletedTask; }
    public Task<QrLoginChallenge?> GetQrLoginAsync(string id, CancellationToken ct = default) => Task.FromResult(_qrLogins.TryGetValue(id, out var item) ? item : null);
    public Task<bool> TryUpdateQrLoginAsync(string id, QrLoginStatus expected, QrLoginStatus next, string? userId = null, CancellationToken ct = default)
    {
        if (!_qrLogins.TryGetValue(id, out var item)) return Task.FromResult(false);
        lock (item)
        {
            if (item.ExpiresAtUtc <= DateTime.UtcNow && item.Status is not (QrLoginStatus.Consumed or QrLoginStatus.Denied)) { item.Status = QrLoginStatus.Expired; return Task.FromResult(false); }
            if (item.Status != expected) return Task.FromResult(false);
            item.Status = next;
            if (userId is not null) item.ScannedByUserId = userId;
            if (next == QrLoginStatus.Consumed) item.ConsumedAtUtc = DateTime.UtcNow;
            return Task.FromResult(true);
        }
    }
    public Task AddContactQrAsync(ContactQrToken token, CancellationToken ct = default) { _contactQrs[token.Id] = token; return Task.CompletedTask; }
    public Task<ContactQrToken?> GetContactQrByHashAsync(string hash, CancellationToken ct = default) => Task.FromResult(_contactQrs.Values.FirstOrDefault(x => x.TokenHash == hash && x.RevokedAtUtc is null && x.ExpiresAtUtc > DateTime.UtcNow && x.UseCount < x.MaxUses));
    public Task<bool> TryUseContactQrAsync(string id, CancellationToken ct = default)
    {
        if (!_contactQrs.TryGetValue(id, out var item)) return Task.FromResult(false);
        lock (item) { if (item.RevokedAtUtc is not null || item.ExpiresAtUtc <= DateTime.UtcNow || item.UseCount >= item.MaxUses) return Task.FromResult(false); item.UseCount++; return Task.FromResult(true); }
    }

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
    public Task<Conversation> AddConversationAsync(Conversation conversation, CancellationToken ct = default)
    {
        _conversations[conversation.Id] = conversation;
        StoreConversationKeyEnvelopes(conversation.Id, Math.Max(1, conversation.KeyVersion), conversation.KeyEnvelopes);
        return Task.FromResult(conversation);
    }
    public Task UpdateConversationAsync(Conversation conversation, CancellationToken ct = default) { _conversations[conversation.Id] = conversation; return Task.CompletedTask; }
    public Task<Conversation?> GetConversationAsync(string id, CancellationToken ct = default) => Task.FromResult(_conversations.TryGetValue(id, out var item) ? item : null);
    public Task UpsertConversationKeyEnvelopesAsync(string conversationId, int keyVersion, IReadOnlyDictionary<string, string> keyEnvelopes, CancellationToken ct = default)
    {
        StoreConversationKeyEnvelopes(conversationId, keyVersion, keyEnvelopes);
        return Task.CompletedTask;
    }
    public Task<IReadOnlyDictionary<string, string>?> GetConversationKeyEnvelopesAsync(string conversationId, int keyVersion, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyDictionary<string, string>?>(_conversationKeys.TryGetValue($"{conversationId}:{keyVersion}", out var item) ? new Dictionary<string, string>(item.KeyEnvelopes) : null);

    private void StoreConversationKeyEnvelopes(string conversationId, int keyVersion, IReadOnlyDictionary<string, string> keyEnvelopes) =>
        _conversationKeys[$"{conversationId}:{keyVersion}"] = new ConversationKeyEnvelopeRecord
        {
            Id = $"{conversationId}:{keyVersion}",
            ConversationId = conversationId,
            KeyVersion = keyVersion,
            KeyEnvelopes = new Dictionary<string, string>(keyEnvelopes)
        };

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
            conversation.LastMessagePreview = message.Kind switch { MessageKind.Text => "加密消息", MessageKind.Emoji => "[表情]", MessageKind.Image => "[图片]", MessageKind.Voice => "[语音]", MessageKind.Video => "[视频]", MessageKind.File => "[文件]", _ => $"[{message.Kind}]" };
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

    public Task<MomentReport> AddMomentReportAsync(MomentReport report, CancellationToken ct = default)
    {
        var existing = _momentReports.Values.FirstOrDefault(x => x.MomentId == report.MomentId && x.ReporterId == report.ReporterId);
        if (existing is not null) return Task.FromResult(existing);
        _momentReports[report.Id] = report; return Task.FromResult(report);
    }
    public Task<IReadOnlyList<MomentReport>> GetMomentReportsAsync(string reporterId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<MomentReport>>(_momentReports.Values.Where(x => x.ReporterId == reporterId).OrderByDescending(x => x.CreatedAtUtc).ToList());
    public Task<IReadOnlyList<MomentReport>> GetAllMomentReportsAsync(MomentReportStatus? status, int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<MomentReport>>(_momentReports.Values.Where(x => !status.HasValue || x.Status == status.Value).OrderByDescending(x => x.CreatedAtUtc).Take(limit).ToList());
    public Task<MomentReport?> GetMomentReportAsync(string id, CancellationToken ct = default) => Task.FromResult(_momentReports.TryGetValue(id, out var item) ? item : null);
    public Task UpdateMomentReportAsync(MomentReport report, CancellationToken ct = default) { _momentReports[report.Id] = report; return Task.CompletedTask; }
    public Task<long> CountMomentReportsAsync(MomentReportStatus? status = null, CancellationToken ct = default) => Task.FromResult((long)_momentReports.Values.Count(x => !status.HasValue || x.Status == status.Value));
    public Task<CallRecord> UpsertCallAsync(CallRecord call, CancellationToken ct = default) { _calls[call.Id] = call; return Task.FromResult(call); }
    public Task<CallRecord?> GetCallAsync(string id, CancellationToken ct = default) => Task.FromResult(_calls.TryGetValue(id, out var item) ? item : null);
    public Task<IReadOnlyList<CallRecord>> GetCallsAsync(string userId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<CallRecord>>(_calls.Values.Where(x => x.ParticipantIds.Contains(userId)).OrderByDescending(x => x.StartedAtUtc).Take(100).ToList());
    public Task<long> CountConversationsAsync(CancellationToken ct = default) => Task.FromResult((long)_conversations.Values.Count(x => !x.IsDissolved));
    public Task<long> CountMessagesAsync(CancellationToken ct = default) => Task.FromResult((long)_messages.Count);
    public Task AddAdminAuditAsync(AdminAuditLog audit, CancellationToken ct = default) { _adminAudits[audit.Id] = audit; return Task.CompletedTask; }
    public Task<IReadOnlyList<AdminAuditLog>> GetAdminAuditsAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<AdminAuditLog>>(_adminAudits.Values.OrderByDescending(x => x.CreatedAtUtc).Take(limit).ToList());
    public Task<AdminModuleRecord> UpsertAdminRecordAsync(AdminModuleRecord record, CancellationToken ct = default) { record.UpdatedAtUtc = DateTime.UtcNow; _adminRecords[record.Id] = record; return Task.FromResult(record); }
    public Task<AdminModuleRecord?> GetAdminRecordAsync(string id, CancellationToken ct = default) => Task.FromResult(_adminRecords.TryGetValue(id, out var item) ? item : null);
    public Task<IReadOnlyList<AdminModuleRecord>> GetAdminRecordsAsync(string module, int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<AdminModuleRecord>>(_adminRecords.Values.Where(x => x.Module == module).OrderByDescending(x => x.UpdatedAtUtc).Take(limit).ToList());
    public Task DeleteAdminRecordAsync(string id, CancellationToken ct = default) { _adminRecords.TryRemove(id, out _); return Task.CompletedTask; }
    public Task<IReadOnlyList<RefreshSession>> GetAllSessionsAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<RefreshSession>>(_sessions.Values.OrderByDescending(x => x.LastSeenAtUtc).Take(limit).ToList());
    public Task<IReadOnlyList<Conversation>> GetAllConversationsAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Conversation>>(_conversations.Values.OrderByDescending(x => x.LastMessageAtUtc ?? x.CreatedAtUtc).Take(limit).ToList());
    public Task<IReadOnlyList<ChatMessage>> GetAllMessagesAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<ChatMessage>>(_messages.Values.OrderByDescending(x => x.SentAtUtc).Take(limit).ToList());
    public Task<IReadOnlyList<ContactRelation>> GetAllRelationsAsync(int limit, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<ContactRelation>>(_relations.Values.OrderByDescending(x => x.UpdatedAtUtc).Take(limit).ToList());
}
