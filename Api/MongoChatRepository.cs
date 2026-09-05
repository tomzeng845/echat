using MongoDB.Driver;

namespace EChat.Api;

public sealed class MongoChatRepository : IChatRepository
{
    private readonly IMongoCollection<UserAccount> _users;
    private readonly IMongoCollection<InviteCode> _invites;
    private readonly IMongoCollection<RefreshSession> _sessions;
    private readonly IMongoCollection<FriendRequest> _friendRequests;
    private readonly IMongoCollection<ContactRelation> _relations;
    private readonly IMongoCollection<Conversation> _conversations;
    private readonly IMongoCollection<ChatMessage> _messages;

    public MongoChatRepository(IConfiguration configuration)
    {
        var connection = configuration["Mongo:ConnectionString"] ?? Environment.GetEnvironmentVariable("MONGODB_URI") ?? throw new InvalidOperationException("Mongo connection string missing");
        var databaseName = configuration["Mongo:Database"] ?? Environment.GetEnvironmentVariable("MONGODB_DATABASE") ?? "echat";
        var db = new MongoClient(connection).GetDatabase(databaseName);
        _users = db.GetCollection<UserAccount>("users");
        _invites = db.GetCollection<InviteCode>("inviteCodes");
        _sessions = db.GetCollection<RefreshSession>("refreshSessions");
        _friendRequests = db.GetCollection<FriendRequest>("friendRequests");
        _relations = db.GetCollection<ContactRelation>("contactRelations");
        _conversations = db.GetCollection<Conversation>("conversations");
        _messages = db.GetCollection<ChatMessage>("messages");
    }

    public async Task EnsureSeedDataAsync(CancellationToken ct = default)
    {
        await _users.Indexes.CreateOneAsync(new CreateIndexModel<UserAccount>(Builders<UserAccount>.IndexKeys.Ascending(x => x.Account), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _messages.Indexes.CreateOneAsync(new CreateIndexModel<ChatMessage>(Builders<ChatMessage>.IndexKeys.Ascending(x => x.SenderId).Ascending(x => x.ClientMessageId), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        await _messages.Indexes.CreateOneAsync(new CreateIndexModel<ChatMessage>(Builders<ChatMessage>.IndexKeys.Ascending(x => x.ConversationId).Ascending(x => x.Sequence), new CreateIndexOptions { Unique = true }), cancellationToken: ct);
        var seedCode = Environment.GetEnvironmentVariable("SEED_INVITE_CODE");
        if (!string.IsNullOrWhiteSpace(seedCode))
            await _invites.ReplaceOneAsync(x => x.Code == seedCode, new InviteCode { Code = seedCode, MaxUses = 1000 }, new ReplaceOptions { IsUpsert = true }, ct);
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
    public Task AddUserAsync(UserAccount user, CancellationToken ct = default) => _users.InsertOneAsync(user, cancellationToken: ct);
    public Task UpdateUserAsync(UserAccount user, CancellationToken ct = default) => _users.ReplaceOneAsync(x => x.Id == user.Id, user, cancellationToken: ct);
    public Task AddSessionAsync(RefreshSession session, CancellationToken ct = default) => _sessions.InsertOneAsync(session, cancellationToken: ct);
    public async Task<RefreshSession?> GetSessionByHashAsync(string hash, CancellationToken ct = default) => await _sessions.Find(x => x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > DateTime.UtcNow).FirstOrDefaultAsync(ct);
    public Task RevokeSessionAsync(string id, CancellationToken ct = default) => _sessions.UpdateOneAsync(x => x.Id == id, Builders<RefreshSession>.Update.Set(x => x.RevokedAtUtc, DateTime.UtcNow), cancellationToken: ct);
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
    public async Task<Conversation> AddConversationAsync(Conversation conversation, CancellationToken ct = default) { await _conversations.InsertOneAsync(conversation, cancellationToken: ct); return conversation; }
    public Task UpdateConversationAsync(Conversation conversation, CancellationToken ct = default) => _conversations.ReplaceOneAsync(x => x.Id == conversation.Id, conversation, cancellationToken: ct);
    public async Task<Conversation?> GetConversationAsync(string id, CancellationToken ct = default) => await _conversations.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public async Task<Conversation?> FindDirectConversationAsync(string a, string b, CancellationToken ct = default) => await _conversations.Find(x => x.Type == ConversationType.Direct && x.Members.Any(m => m.UserId == a) && x.Members.Any(m => m.UserId == b)).FirstOrDefaultAsync(ct);
    public async Task<IReadOnlyList<Conversation>> GetConversationsAsync(string userId, CancellationToken ct = default) => await _conversations.Find(x => !x.IsDissolved && x.Members.Any(m => m.UserId == userId && m.LeftAtSequence == null)).SortByDescending(x => x.LastMessageAtUtc).ToListAsync(ct);

    public async Task<ChatMessage> AddMessageIdempotentlyAsync(ChatMessage message, CancellationToken ct = default)
    {
        var existing = await _messages.Find(x => x.SenderId == message.SenderId && x.ClientMessageId == message.ClientMessageId).FirstOrDefaultAsync(ct);
        if (existing is not null) return existing;
        var conversation = await _conversations.FindOneAndUpdateAsync(x => x.Id == message.ConversationId, Builders<Conversation>.Update.Inc(x => x.LastSequence, 1).Set(x => x.LastMessageAtUtc, message.SentAtUtc).Set(x => x.LastMessagePreview, message.Kind == MessageKind.Text ? "加密消息" : $"[{message.Kind}]"), new FindOneAndUpdateOptions<Conversation> { ReturnDocument = ReturnDocument.After }, ct) ?? throw new InvalidOperationException("CONVERSATION_NOT_FOUND");
        message.Sequence = conversation.LastSequence;
        try { await _messages.InsertOneAsync(message, cancellationToken: ct); return message; }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { return await _messages.Find(x => x.SenderId == message.SenderId && x.ClientMessageId == message.ClientMessageId).FirstAsync(ct); }
    }
    public async Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(string conversationId, long afterSequence, int limit, CancellationToken ct = default) => await _messages.Find(x => x.ConversationId == conversationId && x.Sequence > afterSequence).SortBy(x => x.Sequence).Limit(limit).ToListAsync(ct);
    public async Task<ChatMessage?> GetMessageAsync(string id, CancellationToken ct = default) => await _messages.Find(x => x.Id == id).FirstOrDefaultAsync(ct);
    public Task UpdateMessageAsync(ChatMessage message, CancellationToken ct = default) => _messages.ReplaceOneAsync(x => x.Id == message.Id, message, cancellationToken: ct);
}
