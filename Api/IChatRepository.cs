namespace EChat.Api;

public interface IChatRepository
{
    Task EnsureSeedDataAsync(CancellationToken ct = default);
    Task<UserAccount?> GetUserByAccountAsync(string account, CancellationToken ct = default);
    Task<UserAccount?> GetUserByIdAsync(string id, CancellationToken ct = default);
    Task<bool> TryConsumeInviteAsync(string code, CancellationToken ct = default);
    Task AddUserAsync(UserAccount user, CancellationToken ct = default);
    Task UpdateUserAsync(UserAccount user, CancellationToken ct = default);
    Task AddSessionAsync(RefreshSession session, CancellationToken ct = default);
    Task<RefreshSession?> GetSessionByHashAsync(string hash, CancellationToken ct = default);
    Task RevokeSessionAsync(string id, CancellationToken ct = default);
    Task<FriendRequest> AddFriendRequestAsync(FriendRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<FriendRequest>> GetFriendRequestsAsync(string userId, CancellationToken ct = default);
    Task<FriendRequest?> GetFriendRequestAsync(string id, CancellationToken ct = default);
    Task UpdateFriendRequestAsync(FriendRequest request, CancellationToken ct = default);
    Task UpsertRelationAsync(ContactRelation relation, CancellationToken ct = default);
    Task<ContactRelation?> GetRelationAsync(string userId, string peerId, CancellationToken ct = default);
    Task<IReadOnlyList<ContactRelation>> GetRelationsAsync(string userId, CancellationToken ct = default);
    Task<Conversation> AddConversationAsync(Conversation conversation, CancellationToken ct = default);
    Task UpdateConversationAsync(Conversation conversation, CancellationToken ct = default);
    Task<Conversation?> GetConversationAsync(string id, CancellationToken ct = default);
    Task<Conversation?> FindDirectConversationAsync(string userA, string userB, CancellationToken ct = default);
    Task<IReadOnlyList<Conversation>> GetConversationsAsync(string userId, CancellationToken ct = default);
    Task<ChatMessage> AddMessageIdempotentlyAsync(ChatMessage message, CancellationToken ct = default);
    Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(string conversationId, long afterSequence, int limit, CancellationToken ct = default);
    Task<ChatMessage?> GetMessageAsync(string id, CancellationToken ct = default);
    Task UpdateMessageAsync(ChatMessage message, CancellationToken ct = default);
}
