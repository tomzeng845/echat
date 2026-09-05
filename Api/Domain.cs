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
public enum MediaPurpose { Chat, Moment }
public enum QrLoginStatus { Pending, Scanned, Approved, Denied, Consumed, Expired }
public enum MomentVisibility { Friends, Private, Selected, Excluded }
public enum MomentReportStatus { Submitted, Resolved, Rejected }
public enum CallRecordStatus { Ringing, Active, Rejected, Ended, Missed, Failed }

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
    public string DeviceId { get; set; } = Guid.NewGuid().ToString("N");
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public string RevokedReason { get; set; } = "";
}

public sealed class QrLoginChallenge
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ScanTokenHash { get; set; } = "";
    public string PollTokenHash { get; set; } = "";
    public string RequestDeviceName { get; set; } = "Web";
    public string RequestDeviceId { get; set; } = "";
    public QrLoginStatus Status { get; set; } = QrLoginStatus.Pending;
    public string? ScannedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
}

public sealed class ContactQrToken
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string TokenHash { get; set; } = "";
    public string OwnerId { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public int UseCount { get; set; }
    public int MaxUses { get; set; } = 100;
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

public sealed class MediaAsset
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public MediaPurpose Purpose { get; set; }
    public string? ConversationId { get; set; }
    public string StorageKey { get; set; } = "";
    public string? LocalPath { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class MomentPost
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string AuthorId { get; set; } = "";
    public string Text { get; set; } = "";
    public List<string> MediaAssetIds { get; set; } = [];
    public MomentVisibility Visibility { get; set; } = MomentVisibility.Friends;
    public List<string> AudienceUserIds { get; set; } = [];
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAtUtc { get; set; }
}

public sealed class MomentLike
{
    [BsonId] public string Id { get; set; } = "";
    public string MomentId { get; set; } = "";
    public string UserId { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class MomentComment
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string MomentId { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAtUtc { get; set; }
}

public sealed class MomentReport
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string MomentId { get; set; } = "";
    public string ReporterId { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Detail { get; set; } = "";
    public MomentReportStatus Status { get; set; } = MomentReportStatus.Submitted;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class CallRecord
{
    [BsonId] public string Id { get; set; } = "";
    public string ConversationId { get; set; } = "";
    public string CallerId { get; set; } = "";
    public string Mode { get; set; } = "audio";
    public CallRecordStatus Status { get; set; } = CallRecordStatus.Ringing;
    public List<string> ParticipantIds { get; set; } = [];
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? AnsweredAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public string EndReason { get; set; } = "";
}

public sealed record RegisterRequest(string Account, string Password, string InviteCode, string DisplayName, bool AgreementAccepted, string DeviceName = "Web", string? DeviceId = null);
public sealed record LoginRequest(string Account, string Password, string DeviceName = "Web", string? DeviceId = null);
public sealed record RefreshRequest(string RefreshToken, string DeviceName = "Web", string? DeviceId = null);
public sealed record TotpVerifyRequest(string PendingToken, string Code, string DeviceName = "Admin Web");
public sealed record PublicKeyRequest(string PublicKeyJwk);
public sealed record AuthResponse(bool Success, string? AccessToken, string? RefreshToken, DateTime? ExpiresAtUtc, UserView? User, bool RequiresTotp = false, string? PendingToken = null, string? Error = null, string? SessionId = null, string? DeviceId = null);
public sealed record UserView(string Id, string Account, string DisplayName, string AvatarUrl, string Signature, string Region, UserRole Role, UserStatus Status);
public sealed record FriendRequestInput(string RequestId, string PeerAccount, string Note = "", string Source = "account");
public sealed record ConversationCreateRequest(string PeerAccount, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record GroupCreateRequest(string Name, IReadOnlyList<string> MemberAccounts, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record SendMessageRequest(string ClientMessageId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm = "AES-GCM-256", string? ReplyToMessageId = null, Dictionary<string, string>? Metadata = null);
public sealed record ConversationView(string Id, ConversationType Type, string Name, string AvatarUrl, long LastSequence, string LastMessagePreview, DateTime? LastMessageAtUtc, int MemberCount, long ReadSequence, bool Muted, bool Pinned, string? KeyEnvelope);
public sealed record MessageView(string Id, string ClientMessageId, string ConversationId, long Sequence, string SenderId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm, string? ReplyToMessageId, IReadOnlyDictionary<string, string> Metadata, MessageState State, DateTime SentAtUtc, DateTime? RecalledAtUtc);
public sealed record MediaAssetView(string Id, string FileName, string ContentType, long Size, MediaPurpose Purpose, string ContentUrl);
public sealed record CreateMomentRequest(string Text, IReadOnlyList<string>? MediaAssetIds = null, MomentVisibility Visibility = MomentVisibility.Friends, IReadOnlyList<string>? AudienceUserIds = null);
public sealed record AddMomentCommentRequest(string Text);
public sealed record MomentLikeView(string UserId, string DisplayName, string AvatarUrl, DateTime CreatedAtUtc);
public sealed record MomentCommentView(string Id, string UserId, string DisplayName, string AvatarUrl, string Text, DateTime CreatedAtUtc);
public sealed record MomentView(string Id, UserView Author, string Text, IReadOnlyList<MediaAssetView> Media, IReadOnlyList<MomentLikeView> Likes, IReadOnlyList<MomentCommentView> Comments, bool LikedByMe, DateTime CreatedAtUtc, MomentVisibility Visibility);
public sealed record ConversationMemberView(string UserId, string DisplayName, string AvatarUrl, MemberRole Role);
public sealed record QrLoginStartRequest(string DeviceName = "Web", string? DeviceId = null);
public sealed record QrLoginStartResponse(string ChallengeId, string PollToken, string QrPayload, DateTime ExpiresAtUtc);
public sealed record QrLoginTokenRequest(string ChallengeId, string Token);
public sealed record QrLoginStatusResponse(QrLoginStatus Status, DateTime ExpiresAtUtc, string? ApprovedDisplayName = null);
public sealed record QrLoginScanResponse(string ChallengeId, string RequestDeviceName, DateTime ExpiresAtUtc, string VerificationCode);
public sealed record QrLoginApproveRequest(string ChallengeId, string ScanToken, bool Approve);
public sealed record ContactQrResponse(string QrPayload, DateTime ExpiresAtUtc);
public sealed record ContactQrRequest(string Token);
public sealed record ContactQrPreview(UserView User, DateTime ExpiresAtUtc);
public sealed record DeviceSessionView(string Id, string DeviceId, string DeviceName, DateTime CreatedAtUtc, DateTime LastSeenAtUtc, bool Current);
public sealed record LogoutRequest(string? RefreshToken = null);
public sealed record MomentReportRequest(string Reason, string Detail = "");
public sealed record CallRecordView(string Id, string ConversationId, string ConversationName, string CallerId, string Mode, CallRecordStatus Status, DateTime StartedAtUtc, DateTime? AnsweredAtUtc, DateTime? EndedAtUtc, string EndReason);
