using MongoDB.Driver;

namespace EChat.Api;

public sealed class MongoChatRepository : IChatRepository
{
    private readonly IMongoCollection<UserAccount> _users;
    private readonly IMongoCollection<InviteCode> _invites;
    private readonly IMongoCollection<RefreshSession> _sessions;
    private readonly IMongoCollection<PushDevice> _pushDevices;
    private readonly IMongoCollection<QrLoginChallenge> _qrLogins;
    private readonly IMongoCollection<ContactQrToken> _contactQrs;
    private readonly IMongoCollection<FriendRequest> _friendRequests;
    private readonly IMongoCollection<ContactRelation> _relations;
    private readonly IMongoCollection<Conversation> _conversations;
    private readonly IMongoCollection<ConversationKeyEnvelopeRecord> _conversationKeys;
    private readonly IMongoCollection<ChatMessage> _messages;
    private readonly IMongoCollection<MediaAsset> _mediaAssets;
    private readonly IMongoCollection<MomentPost> _moments;
    private readonly IMongoCollection<MomentLike> _momentLikes;
    private readonly IMongoCollection<MomentComment> _momentComments;
    private readonly IMongoCollection<MomentReport> _momentReports;
    private readonly IMongoCollection<CallRecord> _calls;
    private readonly IMongoCollection<AdminAuditLog> _adminAudits;
    private readonly IMongoCollection<AdminModuleRecord> _adminRecords;

    public MongoChatRepository(IConfiguration configuration)
    {
        var connection = Environment.GetEnvironmentVariable("MONGODB_URI") ?? configuration["Mongo:ConnectionString"] ?? throw new InvalidOperationException("Mongo connection string missing");
        var databaseName = Environment.GetEnvironmentVariable("MONGODB_DATABASE") ?? configuration["Mongo:Database"] ?? "echat";
        var db = new MongoClient(connection).GetDatabase(databaseName);
        _users = db.GetCollection<UserAccount>("users");
        _invites = db.GetCollection<InviteCode>("inviteCodes");
        _sessions = db.GetCollection<RefreshSession>("refreshSessions");
        _pushDevices = db.GetCollection<PushDevice>("pushDevices");
        _qrLogins = db.GetCollection<QrLoginChallenge>("qrLogins");
        _contactQrs = db.GetCollection<ContactQrToken>("contactQrs");
        _friendRequests = db.GetCollection<FriendRequest>("friendRequests");
        _relations = db.GetCollection<ContactRelation>("contactRelations");
        _conversations = db.GetCollection<Conversation>("conversations");
        _conversationKeys = db.GetCollection<ConversationKeyEnvelopeRecord>("conversationKeyEnvelopes");
        _messages = db.GetCollection<ChatMessage>("messages");
        _mediaAssets = db.GetCollection<MediaAsset>("mediaAssets");
        _moments = db.GetCollection<MomentPost>("moments");
        _momentLikes = db.GetCollection<MomentLike>("momentLikes");
        _momentComments = db.GetCollection<MomentComment>("momentComments");
        _momentReports = db.GetCollection<MomentReport>("momentReports");
        _calls = db.GetCollection<CallRecord>("calls");
        _adminAudits = db.GetCollection<AdminAuditLog>("adminAudits");
        _adminRecords = db.GetCollection<AdminModuleRecord>("adminModuleRecords");
    }

    public async Task EnsureSeedDataAsync(CancellationToken ct = default)
    {
        await _users.Indexes.CreateOneAsync(new CreateIndexModel<UserAccount>(Builders<UserAccount>.IndexKeys.Ascending(x => x.Account), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _messages.Indexes.CreateOneAsync(new CreateIndexModel<ChatMessage>(Builders<ChatMessage>.IndexKeys.Ascending(x => x.SenderId).Ascending(x => x.ClientMessageId), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _messages.Indexes.CreateOneAsync(new CreateIndexModel<ChatMessage>(Builders<ChatMessage>.IndexKeys.Ascending(x => x.ConversationId).Ascending(x => x.Sequence), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _conversationKeys.Indexes.CreateOneAsync(new CreateIndexModel<ConversationKeyEnvelopeRecord>(Builders<ConversationKeyEnvelopeRecord>.IndexKeys.Ascending(x => x.ConversationId).Ascending(x => x.KeyVersion), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _moments.Indexes.CreateOneAsync(new CreateIndexModel<MomentPost>(Builders<MomentPost>.IndexKeys.Descending(x => x.CreatedAtUtc)), cancellationToken: ct);
        await _momentLikes.Indexes.CreateOneAsync(new CreateIndexModel<MomentLike>(Builders<MomentLike>.IndexKeys.Ascending(x => x.MomentId).Ascending(x => x.UserId), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _momentComments.Indexes.CreateOneAsync(new CreateIndexModel<MomentComment>(Builders<MomentComment>.IndexKeys.Ascending(x => x.MomentId).Ascending(x => x.CreatedAtUtc)), cancellationToken: ct);
        await _sessions.Indexes.CreateOneAsync(new CreateIndexModel<RefreshSession>(Builders<RefreshSession>.IndexKeys.Ascending(x => x.TokenHash), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await MigratePushDeviceIndexesAsync(ct);
        await _pushDevices.Indexes.CreateManyAsync([
            new CreateIndexModel<PushDevice>(Builders<PushDevice>.IndexKeys.Ascending(x => x.UserId).Ascending(x => x.DeviceId).Ascending(x => x.Platform), new CreateIndexOptions { Unique = true, Name = "user_device_platform_unique" }),
            new CreateIndexModel<PushDevice>(Builders<PushDevice>.IndexKeys.Ascending(x => x.Token).Ascending(x => x.Platform), new CreateIndexOptions { Unique = true, Name = "token_platform_unique" })
        ], ct);
        await _qrLogins.Indexes.CreateOneAsync(new CreateIndexModel<QrLoginChallenge>(Builders<QrLoginChallenge>.IndexKeys.Ascending(x => x.ScanTokenHash), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _contactQrs.Indexes.CreateOneAsync(new CreateIndexModel<ContactQrToken>(Builders<ContactQrToken>.IndexKeys.Ascending(x => x.TokenHash), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _momentReports.Indexes.CreateOneAsync(new CreateIndexModel<MomentReport>(Builders<MomentReport>.IndexKeys.Ascending(x => x.MomentId).Ascending(x => x.ReporterId), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _calls.Indexes.CreateOneAsync(new CreateIndexModel<CallRecord>(Builders<CallRecord>.IndexKeys.Descending(x => x.StartedAtUtc)), cancellationToken: ct);
        await _adminAudits.Indexes.CreateOneAsync(new CreateIndexModel<AdminAuditLog>(Builders<AdminAuditLog>.IndexKeys.Descending(x => x.CreatedAtUtc)), cancellationToken: ct);
        await _adminRecords.Indexes.CreateOneAsync(new CreateIndexModel<AdminModuleRecord>(Builders<AdminModuleRecord>.IndexKeys.Ascending(x => x.Module).Descending(x => x.UpdatedAtUtc)), cancellationToken: ct);
        var seedCode = Environment.GetEnvironmentVariable("SEED_INVITE_CODE");
        if (!string.IsNullOrWhiteSpace(seedCode))
            await _invites.ReplaceOneAsync(x => x.Code == seedCode, new InviteCode { Code = seedCode, MaxUses = 1000 }, new ReplaceOptions { IsUpsert = true }, ct);
        var moduleSeeds = new[]
        {
            new AdminModuleRecord { Id = "seed-fund-credit", Module = "fund.subjects", Name = "人工增加", Data = new() { ["code"] = "MANUAL_CREDIT", ["direction"] = "Increase" } },
            new AdminModuleRecord { Id = "seed-fund-debit", Module = "fund.subjects", Name = "人工扣减", Data = new() { ["code"] = "MANUAL_DEBIT", ["direction"] = "Decrease" } },
            new AdminModuleRecord { Id = "seed-role-admin", Module = "system.roles", Name = "超级管理员", Data = new() { ["permissions"] = "*" } },
            new AdminModuleRecord { Id = "seed-role-operation", Module = "system.roles", Name = "运营管理员", Data = new() { ["permissions"] = "users:read,users:write,logs:read,announcements:write,conversations:read,groups:write,robots:write" } },
            new AdminModuleRecord { Id = "seed-role-finance", Module = "system.roles", Name = "财务管理员", Data = new() { ["permissions"] = "funds:read,funds:write" } },
            new AdminModuleRecord { Id = "seed-role-auditor", Module = "system.roles", Name = "审计员", Data = new() { ["permissions"] = "logs:read,errors:read,conversations:read,audit:read" } },
            new AdminModuleRecord { Id = "seed-role-service", Module = "system.roles", Name = "客服", Data = new() { ["permissions"] = "users:read,logs:read,conversations:read" } },
            new AdminModuleRecord { Id = "seed-customer-service", Module = "chat.customer-service", Name = "系统客服", Data = new() { ["account"] = "service" } },
        };
        foreach (var seed in moduleSeeds)
            await _adminRecords.UpdateOneAsync(x => x.Id == seed.Id, Builders<AdminModuleRecord>.Update.SetOnInsert(x => x.Id, seed.Id).SetOnInsert(x => x.Module, seed.Module).SetOnInsert(x => x.Name, seed.Name).SetOnInsert(x => x.Status, seed.Status).SetOnInsert(x => x.Data, seed.Data).SetOnInsert(x => x.CreatedAtUtc, seed.CreatedAtUtc).SetOnInsert(x => x.UpdatedAtUtc, seed.UpdatedAtUtc), new UpdateOptions { IsUpsert = true }, ct);
        var fixedRoles = moduleSeeds.Where(x => x.Module == "system.roles").ToArray();
        foreach (var role in fixedRoles)
            await _adminRecords.UpdateOneAsync(x => x.Id == role.Id, Builders<AdminModuleRecord>.Update.Set(x => x.Module, role.Module).Set(x => x.Name, role.Name), cancellationToken: ct);
        await _adminRecords.DeleteManyAsync(
            Builders<AdminModuleRecord>.Filter.Eq(x => x.Module, "system.roles") &
            Builders<AdminModuleRecord>.Filter.Nin(x => x.Id, fixedRoles.Select(x => x.Id)),
            ct);
    }

    private async Task MigratePushDeviceIndexesAsync(CancellationToken ct)
    {
        using var cursor = await _pushDevices.Indexes.ListAsync(ct);
        foreach (var index in await cursor.ToListAsync(ct))
        {
            var name = index.GetValue("name", "").AsString;
            var keys = index.GetValue("key", new MongoDB.Bson.BsonDocument()).AsBsonDocument;
            if (name == "user_device_platform_unique" || name == "_id_") continue;
            if (index.GetValue("unique", false).ToBoolean() && ((keys.ElementCount == 2 && keys.Contains("UserId") && keys.Contains("DeviceId")) || (keys.ElementCount == 1 && keys.Contains("Token"))))
                await _pushDevices.Indexes.DropOneAsync(name, ct);
        }
        foreach (var device in await _pushDevices.Find(FilterDefinition<PushDevice>.Empty).ToListAsync(ct))
        {
            var originalId = device.Id;
            var platform = PushPlatforms.Normalize(device.Platform);
            var desiredId = $"{device.UserId}:{device.DeviceId}:{platform}";
            if (originalId == desiredId && device.Platform == platform) continue;
            device.Id = desiredId;
            device.Platform = platform;
            var existing = await _pushDevices.Find(x => x.Id == desiredId).FirstOrDefaultAsync(ct);
            if (originalId == desiredId || existing is null)
                await _pushDevices.ReplaceOneAsync(x => x.Id == desiredId, device, new ReplaceOptions { IsUpsert = true }, ct);
            if (originalId != desiredId)
                await _pushDevices.DeleteOneAsync(x => x.Id == originalId, ct);
        }
    }

    public async Task<UserAccount?> GetUserByAccountAsync(string account, CancellationToken ct = default) => await _users.Find(x => x.Account == account.ToLowerInvariant()).FirstOrDefaultAsync(ct);
    public async Task<UserAccount?> GetUserByIdAsync(string id, CancellationToken ct = default) => await _users.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<bool> TryConsumeInviteAsync(string code, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var filter = Builders<InviteCode>.Filter.Eq(x => x.Code, code.ToUpperInvariant()) & Builders<InviteCode>.Filter.Eq(x => x.IsActive, true) & Builders<InviteCode>.Filter.Where(x => x.UsedCount < x.MaxUses && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > now));
        var updated = await _invites.FindOneAndUpdateAsync(filter, Builders<InviteCode>.Update.Inc(x => x.UsedCount, 1), new FindOneAndUpdateOptions<InviteCode> { ReturnDocument = ReturnDocument.After }, ct);
        return updated is not null;
    }
    public async Task<InviteCode> UpsertInviteAsync(InviteCode invite, CancellationToken ct = default) { await _invites.ReplaceOneAsync(x => x.Code == invite.Code, invite, new ReplaceOptions { IsUpsert = true }, ct); return invite; }
    public async Task<IReadOnlyList<InviteCode>> GetInvitesAsync(int limit, CancellationToken ct = default) => await _invites.Find(FilterDefinition<InviteCode>.Empty).SortByDescending(x => x.IsActive).ThenBy(x => x.Code).Limit(limit).ToListAsync(ct);
    public Task AddUserAsync(UserAccount user, CancellationToken ct = default) => _users.InsertOneAsync(user, cancellationToken: ct);
    public Task UpdateUserAsync(UserAccount user, CancellationToken ct = default) => _users.ReplaceOneAsync(x => x.Id == user.Id, user, cancellationToken: ct);
    public async Task<IReadOnlyList<UserAccount>> GetUsersAsync(string? search, UserStatus? status, int limit, CancellationToken ct = default)
    {
        var filter = FilterDefinition<UserAccount>.Empty;
        if (!string.IsNullOrWhiteSpace(search)) filter &= Builders<UserAccount>.Filter.Regex(x => x.Account, new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(search), "i")) | Builders<UserAccount>.Filter.Regex(x => x.DisplayName, new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(search), "i"));
        if (status.HasValue) filter &= Builders<UserAccount>.Filter.Eq(x => x.Status, status.Value);
        return await _users.Find(filter).SortByDescending(x => x.CreatedAtUtc).Limit(limit).ToListAsync(ct);
    }
    public Task<long> CountUsersAsync(UserStatus? status = null, CancellationToken ct = default) => _users.CountDocumentsAsync(status.HasValue ? Builders<UserAccount>.Filter.Eq(x => x.Status, status.Value) : FilterDefinition<UserAccount>.Empty, cancellationToken: ct);
    public Task AddSessionAsync(RefreshSession session, CancellationToken ct = default) => _sessions.InsertOneAsync(session, cancellationToken: ct);
    public async Task<RefreshSession?> GetSessionByHashAsync(string hash, CancellationToken ct = default) => await _sessions.Find(x => x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow).FirstOrDefaultAsync(ct);
    public Task RevokeSessionAsync(string id, CancellationToken ct = default) => _sessions.UpdateOneAsync(x => x.Id == id, Builders<RefreshSession>.Update.Set(x => x.RevokedAtUtc, DateTime.UtcNow), cancellationToken: ct);
    public async Task<IReadOnlyList<RefreshSession>> GetSessionsAsync(string userId, CancellationToken ct = default) => await _sessions.Find(x => x.UserId == userId && x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow).SortByDescending(x => x.LastSeenAtUtc).ToListAsync(ct);
    public Task<long> CountActiveSessionsAsync(CancellationToken ct = default) => _sessions.CountDocumentsAsync(x => x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow, cancellationToken: ct);
    public Task RevokeSessionsAsync(string userId, string? exceptSessionId, string reason, CancellationToken ct = default)
    {
        var filter = Builders<RefreshSession>.Filter.Eq(x => x.UserId, userId) & Builders<RefreshSession>.Filter.Eq(x => x.RevokedAtUtc, null);
        if (!string.IsNullOrWhiteSpace(exceptSessionId)) filter &= Builders<RefreshSession>.Filter.Ne(x => x.Id, exceptSessionId);
        return _sessions.UpdateManyAsync(filter, Builders<RefreshSession>.Update.Set(x => x.RevokedAtUtc, DateTime.UtcNow).Set(x => x.RevokedReason, reason), cancellationToken: ct);
    }
    public async Task<PushDevice> UpsertPushDeviceAsync(PushDevice device, CancellationToken ct = default)
    {
        device.Platform = PushPlatforms.Normalize(device.Platform);
        device.Id = $"{device.UserId}:{device.DeviceId}:{device.Platform}";
        device.Enabled = true;
        device.DisabledAtUtc = null;
        device.LastSeenAtUtc = DateTime.UtcNow;
        await _pushDevices.DeleteManyAsync(x => x.Token == device.Token && x.Platform == device.Platform && x.Id != device.Id, ct);
        await _pushDevices.ReplaceOneAsync(x => x.Id == device.Id, device, new ReplaceOptions { IsUpsert = true }, ct);
        return device;
    }
    public async Task<IReadOnlyList<PushDevice>> GetPushDevicesAsync(IEnumerable<string> userIds, CancellationToken ct = default) =>
        await _pushDevices.Find(Builders<PushDevice>.Filter.In(x => x.UserId, userIds) & Builders<PushDevice>.Filter.Eq(x => x.Enabled, true)).ToListAsync(ct);
    public Task DisablePushDeviceAsync(string userId, string deviceId, CancellationToken ct = default) =>
        _pushDevices.UpdateManyAsync(x => x.UserId == userId && x.DeviceId == deviceId, Builders<PushDevice>.Update.Set(x => x.Enabled, false).Set(x => x.DisabledAtUtc, DateTime.UtcNow), cancellationToken: ct);
    public Task DisablePushTokenAsync(string token, CancellationToken ct = default) =>
        _pushDevices.UpdateManyAsync(x => x.Token == token, Builders<PushDevice>.Update.Set(x => x.Enabled, false).Set(x => x.DisabledAtUtc, DateTime.UtcNow), cancellationToken: ct);
    public Task AddQrLoginAsync(QrLoginChallenge challenge, CancellationToken ct = default) => _qrLogins.InsertOneAsync(challenge, cancellationToken: ct);
    public async Task<QrLoginChallenge?> GetQrLoginAsync(string id, CancellationToken ct = default) => await _qrLogins.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<bool> TryUpdateQrLoginAsync(string id, QrLoginStatus expected, QrLoginStatus next, string? userId = null, CancellationToken ct = default)
    {
        var filter = Builders<QrLoginChallenge>.Filter.Eq(x => x.Id, id) & Builders<QrLoginChallenge>.Filter.Eq(x => x.Status, expected) & Builders<QrLoginChallenge>.Filter.Gt(x => x.ExpiresAtUtc, DateTime.UtcNow);
        var update = Builders<QrLoginChallenge>.Update.Set(x => x.Status, next);
        if (userId is not null) update = update.Set(x => x.ScannedByUserId, userId);
        if (next == QrLoginStatus.Consumed) update = update.Set(x => x.ConsumedAtUtc, DateTime.UtcNow);
        return (await _qrLogins.UpdateOneAsync(filter, update, cancellationToken: ct)).ModifiedCount == 1;
    }
    public Task AddContactQrAsync(ContactQrToken token, CancellationToken ct = default) => _contactQrs.InsertOneAsync(token, cancellationToken: ct);
    public async Task<ContactQrToken?> GetContactQrByHashAsync(string hash, CancellationToken ct = default) => await _contactQrs.Find(x => x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow && x.UseCount < x.MaxUses).FirstOrDefaultAsync(ct);
    public async Task<bool> TryUseContactQrAsync(string id, CancellationToken ct = default)
    {
        var filter = Builders<ContactQrToken>.Filter.Eq(x => x.Id, id) & Builders<ContactQrToken>.Filter.Eq(x => x.RevokedAtUtc, null) & Builders<ContactQrToken>.Filter.Gt(x => x.ExpiresAtUtc, DateTime.UtcNow) & Builders<ContactQrToken>.Filter.Where(x => x.UseCount < x.MaxUses);
        return (await _contactQrs.UpdateOneAsync(filter, Builders<ContactQrToken>.Update.Inc(x => x.UseCount, 1), cancellationToken: ct)).ModifiedCount == 1;
    }
    public async Task<FriendRequest> AddFriendRequestAsync(FriendRequest request, CancellationToken ct = default)
    {
        var existing = await _friendRequests.Find(x => x.SenderId == request.SenderId && x.RequestId == request.RequestId).FirstOrDefaultAsync(ct);
        if (existing is not null) return existing;
        await _friendRequests.InsertOneAsync(request, cancellationToken: ct); return request;
    }
    public async Task<IReadOnlyList<FriendRequest>> GetFriendRequestsAsync(string userId, CancellationToken ct = default) => await _friendRequests.Find(x => x.ReceiverId == userId).SortByDescending(x => x.CreatedAtUtc).ToListAsync(ct);
    public async Task<FriendRequest?> GetFriendRequestAsync(string id, CancellationToken ct = default) => await _friendRequests.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateFriendRequestAsync(FriendRequest request, CancellationToken ct = default) => _friendRequests.ReplaceOneAsync(x => x.Id == request.Id, request, cancellationToken: ct);
    public Task UpsertRelationAsync(ContactRelation relation, CancellationToken ct = default) => _relations.ReplaceOneAsync(x => x.Id == relation.Id, relation, new ReplaceOptions { IsUpsert = true }, ct);
    public async Task<ContactRelation?> GetRelationAsync(string userId, string peerId, CancellationToken ct = default) => await _relations.Find(x => x.UserId == userId && x.PeerUserId == peerId).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<ContactRelation>> GetRelationsAsync(string userId, CancellationToken ct = default) => await _relations.Find(x => x.UserId == userId && x.Status != RelationStatus.Deleted).ToListAsync(ct);
    public async Task<Conversation> AddConversationAsync(Conversation conversation, CancellationToken ct = default)
    {
        await _conversations.InsertOneAsync(conversation, cancellationToken: ct);
        await UpsertConversationKeyEnvelopesAsync(conversation.Id, Math.Max(1, conversation.KeyVersion), conversation.KeyEnvelopes, ct);
        return conversation;
    }
    public Task UpdateConversationAsync(Conversation conversation, CancellationToken ct = default) => _conversations.ReplaceOneAsync(x => x.Id == conversation.Id, conversation, cancellationToken: ct);
    public async Task<Conversation?> GetConversationAsync(string id, CancellationToken ct = default) => await _conversations.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpsertConversationKeyEnvelopesAsync(string conversationId, int keyVersion, IReadOnlyDictionary<string, string> keyEnvelopes, CancellationToken ct = default)
    {
        var id = $"{conversationId}:{keyVersion}";
        var record = new ConversationKeyEnvelopeRecord
        {
            Id = id,
            ConversationId = conversationId,
            KeyVersion = keyVersion,
            KeyEnvelopes = new Dictionary<string, string>(keyEnvelopes)
        };
        return _conversationKeys.ReplaceOneAsync(x => x.Id == id, record, new ReplaceOptions { IsUpsert = true }, ct);
    }
    public async Task<IReadOnlyDictionary<string, string>?> GetConversationKeyEnvelopesAsync(string conversationId, int keyVersion, CancellationToken ct = default)
    {
        var record = await _conversationKeys.Find(x => x.ConversationId == conversationId && x.KeyVersion == keyVersion).FirstOrDefaultAsync(ct);
        return record?.KeyEnvelopes;
    }
    public async Task<Conversation?> FindDirectConversationAsync(string a, string b, CancellationToken ct = default) => await _conversations.Find(x => x.Type == ConversationType.Direct && x.Members.Any(m => m.UserId == a) && x.Members.Any(m => m.UserId == b)).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<Conversation>> GetConversationsAsync(string userId, CancellationToken ct = default) => await _conversations.Find(x => !x.IsDissolved && x.Members.Any(m => m.UserId == userId && m.LeftAtSequence == null)).SortByDescending(x => x.LastMessageAtUtc).ToListAsync(ct);

    public async Task<ChatMessage> AddMessageIdempotentlyAsync(ChatMessage message, CancellationToken ct = default)
    {
        var existing = await _messages.Find(x => x.SenderId == message.SenderId && x.ClientMessageId == message.ClientMessageId).FirstOrDefaultAsync(ct);
        if (existing is not null) return existing;
        var plainPreview = (message.Content ?? "").Replace('\r', ' ').Replace('\n', ' ').Trim();
        if (plainPreview.Length > 60) plainPreview = plainPreview[..60] + "…";
        var preview = message.Kind switch
        {
            MessageKind.Text => string.Equals(message.Algorithm, "PLAINTEXT", StringComparison.OrdinalIgnoreCase) ? plainPreview : "[历史加密消息]",
            MessageKind.Emoji => "[表情]",
            MessageKind.Image => "[图片]",
            MessageKind.Voice => "[语音]",
            MessageKind.Video => "[视频]",
            MessageKind.File => "[文件]",
            _ => $"[{message.Kind}]"
        };
        var conversation = await _conversations.FindOneAndUpdateAsync(x => x.Id == message.ConversationId, Builders<Conversation>.Update.Inc(x => x.LastSequence, 1).Set(x => x.LastMessageAtUtc, message.SentAtUtc).Set(x => x.LastMessagePreview, preview), new FindOneAndUpdateOptions<Conversation> { ReturnDocument = ReturnDocument.After }, ct) ?? throw new InvalidOperationException("CONVERSATION_NOT_FOUND");
        message.Sequence = conversation.LastSequence;
        try { await _messages.InsertOneAsync(message, cancellationToken: ct); return message; }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { return await _messages.Find(x => x.SenderId == message.SenderId && x.ClientMessageId == message.ClientMessageId).FirstAsync(ct); }
    }
    public async Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(string conversationId, long afterSequence, int limit, CancellationToken ct = default) => await _messages.Find(x => x.ConversationId == conversationId && x.Sequence > afterSequence).SortBy(x => x.Sequence).Limit(limit).ToListAsync(ct);
    public async Task<ChatMessage?> GetMessageAsync(string id, CancellationToken ct = default) => await _messages.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateMessageAsync(ChatMessage message, CancellationToken ct = default) => _messages.ReplaceOneAsync(x => x.Id == message.Id, message, cancellationToken: ct);

    public async Task<MediaAsset> AddMediaAssetAsync(MediaAsset asset, CancellationToken ct = default) { await _mediaAssets.InsertOneAsync(asset, cancellationToken: ct); return asset; }
    public async Task<MediaAsset?> GetMediaAssetAsync(string id, CancellationToken ct = default) => await _mediaAssets.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<MediaAsset>> GetMediaAssetsAsync(IEnumerable<string> ids, CancellationToken ct = default) => await _mediaAssets.Find(Builders<MediaAsset>.Filter.In(x => x.Id, ids)).ToListAsync(ct);
    public async Task<MomentPost> AddMomentAsync(MomentPost moment, CancellationToken ct = default) { await _moments.InsertOneAsync(moment, cancellationToken: ct); return moment; }
    public async Task<MomentPost?> GetMomentAsync(string id, CancellationToken ct = default) => await _moments.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateMomentAsync(MomentPost moment, CancellationToken ct = default) => _moments.ReplaceOneAsync(x => x.Id == moment.Id, moment, cancellationToken: ct);
    public async Task<IReadOnlyList<MomentPost>> GetMomentsAsync(IEnumerable<string> authorIds, DateTime? beforeUtc, int limit, CancellationToken ct = default)
    {
        var filter = Builders<MomentPost>.Filter.In(x => x.AuthorId, authorIds) & Builders<MomentPost>.Filter.Eq(x => x.DeletedAtUtc, null);
        if (beforeUtc.HasValue) filter &= Builders<MomentPost>.Filter.Lt(x => x.CreatedAtUtc, beforeUtc.Value);
        return await _moments.Find(filter).SortByDescending(x => x.CreatedAtUtc).Limit(limit).ToListAsync(ct);
    }
    public async Task<MomentLike> UpsertMomentLikeAsync(MomentLike like, CancellationToken ct = default) { await _momentLikes.ReplaceOneAsync(x => x.Id == like.Id, like, new ReplaceOptions { IsUpsert = true }, ct); return like; }
    public Task RemoveMomentLikeAsync(string momentId, string userId, CancellationToken ct = default) => _momentLikes.DeleteOneAsync(x => x.MomentId == momentId && x.UserId == userId, ct);
    public async Task<IReadOnlyList<MomentLike>> GetMomentLikesAsync(IEnumerable<string> momentIds, CancellationToken ct = default) => await _momentLikes.Find(Builders<MomentLike>.Filter.In(x => x.MomentId, momentIds)).SortBy(x => x.CreatedAtUtc).ToListAsync(ct);
    public async Task<MomentComment> AddMomentCommentAsync(MomentComment comment, CancellationToken ct = default) { await _momentComments.InsertOneAsync(comment, cancellationToken: ct); return comment; }
    public async Task<MomentComment?> GetMomentCommentAsync(string id, CancellationToken ct = default) => await _momentComments.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateMomentCommentAsync(MomentComment comment, CancellationToken ct = default) => _momentComments.ReplaceOneAsync(x => x.Id == comment.Id, comment, cancellationToken: ct);
    public async Task<IReadOnlyList<MomentComment>> GetMomentCommentsAsync(IEnumerable<string> momentIds, CancellationToken ct = default) => await _momentComments.Find(Builders<MomentComment>.Filter.In(x => x.MomentId, momentIds) & Builders<MomentComment>.Filter.Eq(x => x.DeletedAtUtc, null)).SortBy(x => x.CreatedAtUtc).ToListAsync(ct);
    public async Task<MomentReport> AddMomentReportAsync(MomentReport report, CancellationToken ct = default)
    {
        return await _momentReports.FindOneAndUpdateAsync(x => x.MomentId == report.MomentId && x.ReporterId == report.ReporterId, Builders<MomentReport>.Update.SetOnInsert(x => x.Id, report.Id).SetOnInsert(x => x.Reason, report.Reason).SetOnInsert(x => x.Detail, report.Detail).SetOnInsert(x => x.Status, report.Status).SetOnInsert(x => x.CreatedAtUtc, report.CreatedAtUtc), new FindOneAndUpdateOptions<MomentReport> { IsUpsert = true, ReturnDocument = ReturnDocument.After }, ct);
    }
    public async Task<IReadOnlyList<MomentReport>> GetMomentReportsAsync(string reporterId, CancellationToken ct = default) => await _momentReports.Find(x => x.ReporterId == reporterId).SortByDescending(x => x.CreatedAtUtc).ToListAsync(ct);
    public async Task<IReadOnlyList<MomentReport>> GetAllMomentReportsAsync(MomentReportStatus? status, int limit, CancellationToken ct = default) => await _momentReports.Find(status.HasValue ? Builders<MomentReport>.Filter.Eq(x => x.Status, status.Value) : FilterDefinition<MomentReport>.Empty).SortByDescending(x => x.CreatedAtUtc).Limit(limit).ToListAsync(ct);
    public async Task<MomentReport?> GetMomentReportAsync(string id, CancellationToken ct = default) => await _momentReports.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateMomentReportAsync(MomentReport report, CancellationToken ct = default) => _momentReports.ReplaceOneAsync(x => x.Id == report.Id, report, cancellationToken: ct);
    public Task<long> CountMomentReportsAsync(MomentReportStatus? status = null, CancellationToken ct = default) => _momentReports.CountDocumentsAsync(status.HasValue ? Builders<MomentReport>.Filter.Eq(x => x.Status, status.Value) : FilterDefinition<MomentReport>.Empty, cancellationToken: ct);
    public async Task<CallRecord> UpsertCallAsync(CallRecord call, CancellationToken ct = default) { await _calls.ReplaceOneAsync(x => x.Id == call.Id, call, new ReplaceOptions { IsUpsert = true }, ct); return call; }
    public async Task<CallRecord?> GetCallAsync(string id, CancellationToken ct = default) => await _calls.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<CallRecord>> GetCallsAsync(string userId, CancellationToken ct = default) => await _calls.Find(x => x.ParticipantIds.Contains(userId)).SortByDescending(x => x.StartedAtUtc).Limit(100).ToListAsync(ct);
    public Task<long> CountConversationsAsync(CancellationToken ct = default) => _conversations.CountDocumentsAsync(x => !x.IsDissolved, cancellationToken: ct);
    public Task<long> CountMessagesAsync(CancellationToken ct = default) => _messages.CountDocumentsAsync(FilterDefinition<ChatMessage>.Empty, cancellationToken: ct);
    public Task AddAdminAuditAsync(AdminAuditLog audit, CancellationToken ct = default) => _adminAudits.InsertOneAsync(audit, cancellationToken: ct);
    public async Task<IReadOnlyList<AdminAuditLog>> GetAdminAuditsAsync(int limit, CancellationToken ct = default) => await _adminAudits.Find(FilterDefinition<AdminAuditLog>.Empty).SortByDescending(x => x.CreatedAtUtc).Limit(limit).ToListAsync(ct);
    public async Task<AdminModuleRecord> UpsertAdminRecordAsync(AdminModuleRecord record, CancellationToken ct = default) { record.UpdatedAtUtc = DateTime.UtcNow; await _adminRecords.ReplaceOneAsync(x => x.Id == record.Id, record, new ReplaceOptions { IsUpsert = true }, ct); return record; }
    public async Task<AdminModuleRecord?> GetAdminRecordAsync(string id, CancellationToken ct = default) => await _adminRecords.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<AdminModuleRecord>> GetAdminRecordsAsync(string module, int limit, CancellationToken ct = default) => await _adminRecords.Find(x => x.Module == module).SortByDescending(x => x.UpdatedAtUtc).Limit(limit).ToListAsync(ct);
    public Task DeleteAdminRecordAsync(string id, CancellationToken ct = default) => _adminRecords.DeleteOneAsync(x => x.Id == id, ct);
    public async Task<IReadOnlyList<RefreshSession>> GetAllSessionsAsync(int limit, CancellationToken ct = default) => await _sessions.Find(FilterDefinition<RefreshSession>.Empty).SortByDescending(x => x.LastSeenAtUtc).Limit(limit).ToListAsync(ct);
    public async Task<IReadOnlyList<Conversation>> GetAllConversationsAsync(int limit, CancellationToken ct = default) => await _conversations.Find(FilterDefinition<Conversation>.Empty).SortByDescending(x => x.LastMessageAtUtc).Limit(limit).ToListAsync(ct);
    public async Task<IReadOnlyList<ChatMessage>> GetAllMessagesAsync(int limit, CancellationToken ct = default) => await _messages.Find(FilterDefinition<ChatMessage>.Empty).SortByDescending(x => x.SentAtUtc).Limit(limit).ToListAsync(ct);
    public async Task<IReadOnlyList<ContactRelation>> GetAllRelationsAsync(int limit, CancellationToken ct = default) => await _relations.Find(FilterDefinition<ContactRelation>.Empty).SortByDescending(x => x.UpdatedAtUtc).Limit(limit).ToListAsync(ct);
}
