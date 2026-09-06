using MongoDB.Bson.Serialization.Attributes;

namespace EChat.Api;
public static class PushPlatforms
{
    public const string Android = "android";
    public const string Ios = "ios";
    public const string IosVoip = "ios-voip";
    public static string Normalize(string? platform) => platform?.Trim().ToLowerInvariant() switch { Ios => Ios, IosVoip => IosVoip, _ => Android };
    public static bool IsSupported(string? platform) => platform?.Trim().ToLowerInvariant() is Android or Ios or IosVoip;
}
public enum UserRole { User, Reviewer, Operator, Admin }
public enum UserStatus { Active, Restricted, Disabled, PendingDeletion }
public enum RelationStatus { Friend, Blocked, Deleted }
public enum FriendRequestStatus { Pending, Accepted, Rejected, Revoked, Expired }
public enum ConversationType { Direct, Group, System }
public enum MemberRole { Owner, Admin, Member }
public enum MessageKind { Text, Emoji, Image, Voice, Video, File, System }
public enum MessageState { Accepted, Recalled }
public enum MediaPurpose { Chat, Moment, Feedback }
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
    public string MobilePhone { get; set; } = "";
    public string PublicKeyJwk { get; set; } = "";
    public Dictionary<string, string> DevicePublicKeys { get; set; } = [];
    public UserRole Role { get; set; } = UserRole.User;
    public UserStatus Status { get; set; } = UserStatus.Active;
    public int RiskLevel1 { get; set; }
    public int RiskLevel2 { get; set; }
    public decimal AccountBalance { get; set; }
    public decimal FrozenBalance { get; set; }
    public bool AccountLocked { get; set; }
    public bool LoginLocked { get; set; }
    public bool BankCardLocked { get; set; }
    public bool CancellationEnabled { get; set; }
    public bool RealNameVerified { get; set; }
    public bool EnterpriseVerified { get; set; }
    public bool RedFlagged { get; set; }
    public string RegistrationSource { get; set; } = "邀请注册";
    public string InviteSource { get; set; } = "";
    public string LoginIpRestriction { get; set; } = "";
    public DateTime? LoginPasswordChangedAtUtc { get; set; }
    public DateTime? LastLoginAtUtc { get; set; }
    public string LastLoginAddress { get; set; } = "";
    public string LastLoginIp { get; set; } = "";
    public string LastOnlineIp { get; set; } = "";
    public string LastNodeIp { get; set; } = "";
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

public sealed class PushDevice
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string Token { get; set; } = "";
    public string Platform { get; set; } = "android";
    public string AppVersion { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DisabledAtUtc { get; set; }
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
    public int KeyVersion { get; set; } = 1;
    public long LastSequence { get; set; }
    public string LastMessagePreview { get; set; } = "暂无消息";
    public DateTime? LastMessageAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsDissolved { get; set; }
}

public sealed class ConversationKeyEnvelopeRecord
{
    [BsonId] public string Id { get; set; } = "";
    public string ConversationId { get; set; } = "";
    public int KeyVersion { get; set; } = 1;
    public Dictionary<string, string> KeyEnvelopes { get; set; } = [];
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
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
    public string Content { get; set; } = "";
    public int KeyVersion { get; set; } = 1;
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
    public Dictionary<string, DateTime> AnsweringAtUtc { get; set; } = [];
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? AnsweredAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public string EndReason { get; set; } = "";
}

public sealed class AdminAuditLog
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string AdminUserId { get; set; } = "";
    public string AdminAccount { get; set; } = "";
    public string Action { get; set; } = "";
    public string TargetType { get; set; } = "";
    public string TargetId { get; set; } = "";
    public string Detail { get; set; } = "";
    public string IpAddress { get; set; } = "";
    public string Address { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AdminModuleRecord
{
    [BsonId] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Module { get; set; } = "";
    public string Name { get; set; } = "";
    public string Status { get; set; } = "Active";
    public Dictionary<string, string> Data { get; set; } = [];
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record RegisterRequest(string Account, string Password, string InviteCode, string DisplayName, bool AgreementAccepted, string DeviceName = "Web", string? DeviceId = null);
public sealed record LoginRequest(string Account, string Password, string DeviceName = "Web", string? DeviceId = null);
public sealed record RefreshRequest(string RefreshToken, string DeviceName = "Web", string? DeviceId = null);
public sealed record TotpVerifyRequest(string PendingToken, string Code, string DeviceName = "Admin Web", string? DeviceId = null);
public sealed record PublicKeyRequest(string PublicKeyJwk, string? DeviceId = null);
public sealed record AuthResponse(bool Success, string? AccessToken, string? RefreshToken, DateTime? ExpiresAtUtc, UserView? User, bool RequiresTotp = false, string? PendingToken = null, string? Error = null, string? SessionId = null, string? DeviceId = null);
public sealed record UserView(string Id, string Account, string DisplayName, string AvatarUrl, string Signature, string Region, UserRole Role, UserStatus Status);
public sealed record FriendRequestInput(string RequestId, string PeerAccount, string Note = "", string Source = "account");
public sealed record ConversationCreateRequest(string PeerAccount, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record GroupCreateRequest(string Name, IReadOnlyList<string> MemberAccounts, Dictionary<string, string>? KeyEnvelopes = null);
public sealed record SendMessageRequest(string ClientMessageId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm = "AES-GCM-256", int KeyVersion = 1, string? ReplyToMessageId = null, Dictionary<string, string>? Metadata = null, string? Content = null);
public sealed record RotateConversationKeyRequest(int KeyVersion, Dictionary<string, string> KeyEnvelopes);
public sealed record ConversationView(string Id, ConversationType Type, string Name, string AvatarUrl, long LastSequence, string LastMessagePreview, DateTime? LastMessageAtUtc, int MemberCount, long ReadSequence, bool Muted, bool Pinned, int KeyVersion, string? KeyEnvelope, string? PeerId = null);
public sealed record MessageView(string Id, string ClientMessageId, string ConversationId, long Sequence, string SenderId, MessageKind Kind, string Ciphertext, string Nonce, string Algorithm, int KeyVersion, string? ReplyToMessageId, IReadOnlyDictionary<string, string> Metadata, MessageState State, DateTime SentAtUtc, DateTime? RecalledAtUtc, string Content);
public sealed record MediaAssetView(string Id, string FileName, string ContentType, long Size, MediaPurpose Purpose, string ContentUrl);
public sealed record CreateMomentRequest(string Text, IReadOnlyList<string>? MediaAssetIds = null, MomentVisibility Visibility = MomentVisibility.Friends, IReadOnlyList<string>? AudienceUserIds = null);
public sealed record AddMomentCommentRequest(string Text);
public sealed record MomentLikeView(string UserId, string DisplayName, string AvatarUrl, DateTime CreatedAtUtc);
public sealed record MomentCommentView(string Id, string UserId, string DisplayName, string AvatarUrl, string Text, DateTime CreatedAtUtc);
public sealed record MomentView(string Id, UserView Author, string Text, IReadOnlyList<MediaAssetView> Media, IReadOnlyList<MomentLikeView> Likes, IReadOnlyList<MomentCommentView> Comments, bool LikedByMe, DateTime CreatedAtUtc, MomentVisibility Visibility);
public sealed record EncryptionDeviceView(string DeviceId, string PublicKeyJwk);
public sealed record ConversationMemberView(string UserId, string DisplayName, string AvatarUrl, MemberRole Role, IReadOnlyList<EncryptionDeviceView> EncryptionDevices);
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
public sealed record RegisterPushDeviceRequest(string DeviceId, string Token, string Platform = "android", string AppVersion = "");
public sealed record PushDeviceView(string DeviceId, string Platform, string AppVersion, DateTime LastSeenAtUtc, bool Enabled);
public sealed record LogoutRequest(string? RefreshToken = null);
public sealed record MomentReportRequest(string Reason, string Detail = "");
public sealed record CallRecordView(string Id, string ConversationId, string ConversationName, string CallerId, string Mode, CallRecordStatus Status, DateTime StartedAtUtc, DateTime? AnsweredAtUtc, DateTime? EndedAtUtc, string EndReason, bool Answering);
public sealed class AdminUserView
{
    public string Id { get; set; } = "";
    public string Account { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string MobilePhone { get; set; } = "";
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; }
    public int RiskLevel1 { get; set; }
    public int RiskLevel2 { get; set; }
    public decimal AccountBalance { get; set; }
    public decimal FrozenBalance { get; set; }
    public int ActiveSessions { get; set; }
    public bool Online { get; set; }
    public bool AccountLocked { get; set; }
    public bool LoginLocked { get; set; }
    public bool BankCardLocked { get; set; }
    public bool CancellationEnabled { get; set; }
    public bool RealNameVerified { get; set; }
    public bool EnterpriseVerified { get; set; }
    public bool RedFlagged { get; set; }
    public string RegistrationSource { get; set; } = "";
    public string InviteSource { get; set; } = "";
    public string LoginIpRestriction { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime LastSeenAtUtc { get; set; }
    public DateTime? LastLoginAtUtc { get; set; }
    public DateTime? LoginPasswordChangedAtUtc { get; set; }
    public DateTime? LockoutUntilUtc { get; set; }
    public int FailedLoginAttempts { get; set; }
    public string LastLoginAddress { get; set; } = "";
    public string LastLoginIp { get; set; } = "";
    public string LastOnlineIp { get; set; } = "";
    public string LastNodeIp { get; set; } = "";
}
public sealed record AdminUserPage(IReadOnlyList<AdminUserView> Items, long Total, int Page, int PageSize, int TotalPages);
public sealed class AdminUserQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? Search { get; set; }
    public UserStatus? Status { get; set; }
    public UserRole? Role { get; set; }
    public bool? Online { get; set; }
    public bool? HasMobile { get; set; }
    public bool? RealNameVerified { get; set; }
    public bool? EnterpriseVerified { get; set; }
    public bool? TodayOnline { get; set; }
    public bool? AccountLocked { get; set; }
    public bool? LoginLocked { get; set; }
    public bool? CancellationEnabled { get; set; }
    public bool? RedFlagged { get; set; }
    public string? RegistrationSource { get; set; }
    public string? LastLoginIp { get; set; }
    public string? LastOnlineIp { get; set; }
    public string? LastNodeIp { get; set; }
    public DateTime? RegisteredFromUtc { get; set; }
    public DateTime? RegisteredToUtc { get; set; }
    public DateTime? LastSeenFromUtc { get; set; }
    public DateTime? LastSeenToUtc { get; set; }
    public int? FailedLoginMin { get; set; }
    public int? FailedLoginMax { get; set; }
}
public sealed record AdminUserStatusRequest(UserStatus Status, string Reason = "");
public sealed record AdminUserCreateRequest(string Account, string Password, string DisplayName, string MobilePhone = "", string InviteSource = "后台开户", UserRole Role = UserRole.User);
public sealed record AdminUserBatchCreateRequest(IReadOnlyList<AdminUserCreateRequest> Users);
public sealed record AdminUserProfileRequest(string? DisplayName = null, string? MobilePhone = null, string? InviteSource = null, string? LoginIpRestriction = null);
public sealed record AdminUserSecurityRequest(bool? AccountLocked = null, bool? LoginLocked = null, bool? BankCardLocked = null, bool? CancellationEnabled = null, bool? RedFlagged = null, bool? RealNameVerified = null, bool? EnterpriseVerified = null, int? RiskLevel1 = null, int? RiskLevel2 = null, string Reason = "");
public sealed record AdminUserPasswordRequest(string Password);
public sealed record AdminUserInviteRequest(string Code);
public sealed record AdminInviteRequest(string Code, int MaxUses = 1, DateTime? ExpiresAtUtc = null, bool IsActive = true);
public sealed record AdminReportDecisionRequest(MomentReportStatus Status, string Note = "");
public sealed record AdminModuleRecordRequest(string Name, string Status = "Active", Dictionary<string, string>? Data = null);
public sealed record AdminFeedbackDecisionRequest(string Status, string Reply = "");
public sealed record AdminFeedbackSeenRequest(IReadOnlyList<string> Ids);
public sealed record AdminWalletAdjustmentRequest(string Account, decimal Amount, string Subject, string Note = "");
public sealed record AdminAccountCreateRequest(string Account, string Password, string DisplayName, UserRole Role = UserRole.Operator);
public sealed record AdminConversationActionRequest(string Action, string Note = "");
public sealed record AdminBulkMessageRequest(string Audience, string Content, IReadOnlyList<string>? Accounts = null);
public sealed record AdminVerificationRequest(string Type, string RealName = "", string IdNumber = "", string EnterpriseName = "", string CreditCode = "", string LegalRepresentative = "", IReadOnlyList<string>? MaterialAssetIds = null, string Note = "");
public sealed record AdminVerificationDecisionRequest(string Status, string Reason = "");
public sealed record AdminLoginLogQuery(string? Scope = null, string? Account = null, string? Ip = null, string? Result = null, DateTime? FromUtc = null, DateTime? ToUtc = null, int Page = 1, int PageSize = 20);
public sealed record AdminIpDecisionRequest(string Status, string Note = "");
public sealed record AdminFundSubjectRequest(string Code, string Name, string Direction, decimal MinAmount, decimal MaxAmount, bool Enabled = true, string Remark = "");
public sealed record AdminFundAdjustmentRequest(string Account, string SubjectCode, string Direction, decimal Amount, string Note = "", string? IdempotencyKey = null);
public sealed record AdminOperatorUpdateRequest(string DisplayName, UserRole Role, UserStatus Status);
public sealed record AdminTotpConfirmRequest(string Code);
public sealed record AdminAnnouncementActionRequest(string Action);
public sealed record AdminContactUpdateRequest(RelationStatus Status, string Remark = "");
public sealed record AdminAutomationRunRequest(string? ConversationId = null);
public sealed record AdminGroupInviteRequest(string Code, string ConversationId, int MaxUses = 100, DateTime? ExpiresAtUtc = null, bool Enabled = true);
public sealed record AdminConversationQuery(string? Search = null, string? Account = null, string? Status = null, int Page = 1, int PageSize = 20);
public sealed record AdminGroupRequest(string Name, string OwnerAccount, IReadOnlyList<string> MemberAccounts);
public sealed record AdminGroupUpdateRequest(string Name);
public sealed record GroupInviteRedeemRequest(string Code);
