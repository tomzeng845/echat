using MongoDB.Bson.Serialization.Attributes;

namespace EChat.Api;

public enum UserRole { User, Reviewer, Operator, Admin }
public enum UserStatus { Active, Restricted, Disabled, PendingDeletion }
public enum RelationStatus { Friend, Blocked, Deleted }
public enum FriendRequestStatus { Pending, Accepted, Rejected, Revoked, Expired }
public enum ConversationType { Direct, Group, System }
public enum MemberRole { Owner, Admin, Member }
public enum MessageKind { Text, Emoji, Image, Voice, Video, File, System }
public enum MessageState { Accepted, Recalled }

public sealed class UserAccount
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Account { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string AvatarUrl { get; set; } = "";
    public string Signature { get; set; } = "";
    public string Region { get; set; } = "";
    public string PublicKeyJwk { get; set; } = "";
    public UserRole Role { get; set; } = UserRole.User;
    public UserStatus Status { get; set; } = UserStatus.Active;
    public string AgreementVersion { get; set; } = "2026-09";
    public DateTime AgreementAcceptedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockoutUntilUtc { get; set; }
}

public sealed class InviteCode
{
    [BsonId] public string Code { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int MaxUses { get; set; } = 1;
    public int UsedCount { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
}

public sealed class RefreshSession
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public string DeviceName { get; set; } = "Web";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}

public sealed class FriendRequest
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string RequestId { get; set; } = "";
    public string SenderId { get; set; } = "";
    public string ReceiverId { get; set; } = "";
    public string Note { get; set; } = "";
    public string Source { get; set; } = "account";
    public FriendRequestStatus Status { get; set; } = FriendRequestStatus.Pending;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class ContactRelation
{
    [BsonId] public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string PeerUserId { get; set; } = "";
    public RelationStatus Status { get; set; } = RelationStatus.Friend;
    public string Remark { get; set; } = "";
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class ConversationMember
{
    public string UserId { get; set; } = "";
    public MemberRole Role { get; set; } = MemberRole.Member;
    public long JoinedAtSequence { get; set; }
    public long? LeftAtSequence { get; set; }
    public long DeliveredSequence { get; set; }
    public long ReadSequence { get; set; }
    public bool Muted { get; set; }
    public bool Pinned { get; set; }
}

public sealed class Conversation
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public ConversationType Type { get; set; }
    public string Name { get; set; } = "";
    public string AvatarUrl { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public List<ConversationMember> Members { get; set; } = [];
    public Dictionary<string, string> KeyEnvelopes { get; set; } = [];
    public long LastSequence { get; set; }
    public string LastMessagePreview { get; set; } = "暂无消息";
    public DateTime? LastMessageAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsDissolved { get; set; }
}

public sealed class ChatMessage
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ClientMessageId { get; set; } = "";
    public string ConversationId { get; set; } = "";
    public long Sequence { get; set; }
    public string SenderId { get; set; } = "";
    public MessageKind Kind { get; set; } = MessageKind.Text;
    public string Ciphertext { get; set; } = "";
    public string Nonce { get; set; } = "";
    public string Algorithm { get; set; } = "AES-GCM-256";
    public string? ReplyToMessageId { get; set; }
    public Dictionary<string, string> Metadata { get; set; } = [];
    public MessageState State { get; set; } = MessageState.Accepted;
    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RecalledAtUtc { get; set; }
}

public sealed record RegisterRequest(string Account, string Password, string InviteCode, string DisplayName, bool AgreementAccepted, string DeviceName = "Web");
public sealed record LoginRequest(string Account, string Password, string DeviceName = "Web");
public sealed record RefreshRequest(string RefreshToken, string DeviceName = "Web");
public sealed record TotpVerifyRequest(string PendingToken, string Code, string DeviceName = "Admin Web");
public sealed record PublicKeyRequest(string PublicKeyJwk);
public sealed record AuthResponse(bool Success, string? AccessToken, string? RefreshToken, DateTime? ExpiresAtUtc, UserView? User, bool RequiresTotp = false, string? PendingToken = null, string? Error = null);
public sealed record UserView(string Id, string Account, string DisplayName, string AvatarUrl, string Signature, string Region, UserRole Role, UserStatus Status);
public sealed record FriendRequestInput(string RequestId, string PeerAccount, string Note = "", string Source = "account");
public sealed record ConversationCreateRequest(string PeerAccount, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record GroupCreateRequest(string Name, IReadOnlyList<string> MemberAccounts, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record SendMessageRequest(string ClientMessageId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm = "AES-GCM-256", string? ReplyToMessageId = null, Dictionary<string, string>? Metadata = null);
public sealed record ConversationView(string Id, ConversationType Type, string Name, string AvatarUrl, long LastSequence, string LastMessagePreview, DateTime? LastMessageAtUtc, int MemberCount, long ReadSequence, bool Muted, bool Pinned, string? KeyEnvelope);
public sealed record MessageView(string Id, string ClientMessageId, string ConversationId, long Sequence, string SenderId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm, string? ReplyToMessageId, IReadOnlyDictionary<string, string> Metadata, MessageState State, DateTime SentAtUtc, DateTime? RecalledAtUtc);
