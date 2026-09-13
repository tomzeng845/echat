using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController]
[Route("api/qr")]
[EnableRateLimiting("auth")]
public sealed class QrController(IChatRepository repository, SessionService sessions, IHubContext<ChatHub> hub) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login/start")]
    public async Task<ActionResult<QrLoginStartResponse>> StartLogin(QrLoginStartRequest request, CancellationToken ct)
    {
        var scanToken = RandomToken();
        var pollToken = RandomToken();
        var challenge = new QrLoginChallenge
        {
            ScanTokenHash = TokenService.Hash(scanToken),
            PollTokenHash = TokenService.Hash(pollToken),
            RequestDeviceName = TrimDevice(request.DeviceName),
            RequestDeviceId = SessionService.NormalizeDeviceId(request.DeviceId),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(2)
        };
        await repository.AddQrLoginAsync(challenge, ct);
        return Ok(new QrLoginStartResponse(challenge.Id, pollToken, $"echat://login/{challenge.Id}/{scanToken}", challenge.ExpiresAtUtc));
    }

    [Authorize]
    [HttpPost("login/scan")]
    public async Task<ActionResult<QrLoginScanResponse>> ScanLogin(QrLoginTokenRequest request, CancellationToken ct)
    {
        var challenge = await ValidLoginAsync(request, ct);
        if (challenge is null) return BadRequest(new { error = "二维码无效或已过期" });
        if (challenge.Status == QrLoginStatus.Pending)
        {
            if (!await repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Pending, QrLoginStatus.Scanned, User.UserId(), ct)) return Conflict(new { error = "二维码状态已变化，请重新扫描" });
        }
        else if (challenge.Status != QrLoginStatus.Scanned || challenge.ScannedByUserId != User.UserId()) return Conflict(new { error = "二维码已被使用" });
        return Ok(new QrLoginScanResponse(challenge.Id, challenge.RequestDeviceName, challenge.ExpiresAtUtc, VerificationCode(challenge)));
    }

    [Authorize]
    [HttpPost("login/approve")]
    public async Task<IActionResult> ApproveLogin(QrLoginApproveRequest request, CancellationToken ct)
    {
        var challenge = await ValidLoginAsync(new QrLoginTokenRequest(request.ChallengeId, request.ScanToken), ct);
        if (challenge is null || challenge.ScannedByUserId != User.UserId()) return BadRequest(new { error = "二维码无效或已过期" });
        var next = request.Approve ? QrLoginStatus.Approved : QrLoginStatus.Denied;
        if (!await repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Scanned, next, User.UserId(), ct)) return Conflict(new { error = "确认已处理，请刷新二维码" });
        return NoContent();
    }

    [AllowAnonymous]
    [HttpPost("login/status")]
    public async Task<ActionResult<QrLoginStatusResponse>> LoginStatus(QrLoginTokenRequest request, CancellationToken ct)
    {
        var challenge = await repository.GetQrLoginAsync(request.ChallengeId, ct);
        if (challenge is null || !FixedEquals(challenge.PollTokenHash, TokenService.Hash(request.Token))) return BadRequest(new { error = "二维码状态不可用" });
        var status = challenge.ExpiresAtUtc <= DateTime.UtcNow && challenge.Status is not (QrLoginStatus.Consumed or QrLoginStatus.Denied) ? QrLoginStatus.Expired : challenge.Status;
        string? displayName = null;
        if (status is QrLoginStatus.Approved or QrLoginStatus.Consumed && challenge.ScannedByUserId is not null)
            displayName = (await repository.GetUserByIdAsync(challenge.ScannedByUserId, ct))?.DisplayName;
        return Ok(new QrLoginStatusResponse(status, challenge.ExpiresAtUtc, displayName));
    }

    [AllowAnonymous]
    [HttpPost("login/exchange")]
    public async Task<ActionResult<AuthResponse>> ExchangeLogin(QrLoginTokenRequest request, CancellationToken ct)
    {
        var challenge = await repository.GetQrLoginAsync(request.ChallengeId, ct);
        if (challenge is null || !FixedEquals(challenge.PollTokenHash, TokenService.Hash(request.Token)) || challenge.ScannedByUserId is null || challenge.ExpiresAtUtc <= DateTime.UtcNow)
            return BadRequest(new { error = "二维码无效或已过期" });
        if (!await repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Approved, QrLoginStatus.Consumed, challenge.ScannedByUserId, ct)) return Conflict(new { error = "二维码尚未确认或已被使用" });
        var user = await repository.GetUserByIdAsync(challenge.ScannedByUserId, ct);
        if (user is null || user.Status != UserStatus.Active) return Unauthorized(new { error = "账号不可用" });
        return Ok(await sessions.IssueAsync(user, challenge.RequestDeviceName, challenge.RequestDeviceId, ct));
    }

    [Authorize]
    [HttpPost("contact/create")]
    public async Task<ActionResult<ContactQrResponse>> CreateContactQr(CancellationToken ct)
    {
        var raw = RandomToken();
        var item = new ContactQrToken { TokenHash = TokenService.Hash(raw), OwnerId = User.UserId(), ExpiresAtUtc = DateTime.UtcNow.AddDays(7) };
        await repository.AddContactQrAsync(item, ct);
        return Ok(new ContactQrResponse($"echat://contact/{raw}", item.ExpiresAtUtc));
    }

    [Authorize]
    [HttpPost("contact/preview")]
    public async Task<ActionResult<ContactQrPreview>> PreviewContact(ContactQrRequest request, CancellationToken ct)
    {
        var token = await repository.GetContactQrByHashAsync(TokenService.Hash(request.Token), ct);
        if (token is null) return BadRequest(new { error = "名片二维码无效或已过期" });
        var owner = await repository.GetUserByIdAsync(token.OwnerId, ct);
        if (owner is null || owner.Status != UserStatus.Active) return NotFound();
        return Ok(new ContactQrPreview(SessionService.View(owner), token.ExpiresAtUtc));
    }

    [Authorize]
    [HttpPost("contact/redeem")]
    public async Task<ActionResult<FriendRequest>> RedeemContact(ContactQrRequest request, CancellationToken ct)
    {
        var token = await repository.GetContactQrByHashAsync(TokenService.Hash(request.Token), ct);
        if (token is null || !await repository.TryUseContactQrAsync(token.Id, ct)) return BadRequest(new { error = "名片二维码无效或已过期" });
        var senderId = User.UserId();
        if (token.OwnerId == senderId) return BadRequest(new { error = "不能添加自己为好友" });
        var relation = await repository.GetRelationAsync(senderId, token.OwnerId, ct);
        var reverse = await repository.GetRelationAsync(token.OwnerId, senderId, ct);
        if (relation?.Status == RelationStatus.Blocked || reverse?.Status == RelationStatus.Blocked) return Forbid();
        if (relation?.Status == RelationStatus.Friend) return Conflict(new { error = "你们已经是好友" });
        var friendRequest = new FriendRequest { RequestId = $"qr-{token.Id}-{senderId}", SenderId = senderId, ReceiverId = token.OwnerId, Note = "通过二维码添加", Source = "qrcode" };
        var item = await repository.AddFriendRequestAsync(friendRequest, ct);
        var sender = await repository.GetUserByIdAsync(senderId, ct);
        await hub.Clients.Group($"user:{token.OwnerId}").SendAsync("contact.requested", new
        {
            item.Id,
            item.SenderId,
            item.ReceiverId,
            item.Note,
            item.Source,
            item.Status,
            item.CreatedAtUtc,
            sender = sender is null ? null : SessionService.View(sender)
        }, ct);
        return Ok(item);
    }

    [Authorize]
    [HttpPost("group/{conversationId}/create")]
    public async Task<ActionResult> CreateGroupQr(string conversationId, CancellationToken ct)
    {
        var group = await repository.GetConversationAsync(conversationId, ct);
        if (group is null || group.Type != ConversationType.Group || !group.Members.Any(x => x.UserId == User.UserId() && x.LeftAtSequence is null)) return Forbid();
        var raw = RandomToken();
        var token = new ContactQrToken { TokenHash = TokenService.Hash(raw), OwnerId = User.UserId(), ConversationId = conversationId, ExpiresAtUtc = DateTime.UtcNow.AddDays(7), MaxUses = 1000 };
        await repository.AddContactQrAsync(token, ct);
        return Ok(new { qrPayload = $"echat://group/{raw}", expiresAtUtc = token.ExpiresAtUtc, conversationId, groupName = group.Name });
    }

    [Authorize]
    [HttpPost("group/preview")]
    public async Task<ActionResult> PreviewGroupQr(ContactQrRequest request, CancellationToken ct)
    {
        var token = await repository.GetContactQrByHashAsync(TokenService.Hash(request.Token), ct);
        if (token is null || string.IsNullOrWhiteSpace(token.ConversationId)) return BadRequest(new { error = "群二维码无效或已过期" });
        var group = await repository.GetConversationAsync(token.ConversationId, ct);
        if (group is null || group.IsDissolved) return NotFound();
        return Ok(new { token = request.Token, conversationId = group.Id, groupName = group.Name, memberCount = group.Members.Count(x => x.LeftAtSequence is null), announcement = group.Announcement, requireApproval = group.RequireJoinApproval });
    }

    [Authorize]
    [HttpPost("group/join")]
    public async Task<ActionResult> JoinGroupQr(ContactQrRequest request, CancellationToken ct)
    {
        var token = await repository.GetContactQrByHashAsync(TokenService.Hash(request.Token), ct);
        if (token is null || string.IsNullOrWhiteSpace(token.ConversationId) || !await repository.TryUseContactQrAsync(token.Id, ct)) return BadRequest(new { error = "群二维码无效或已过期" });
        var group = await repository.GetConversationAsync(token.ConversationId, ct);
        if (group is null || group.IsDissolved) return NotFound();
        var userId = User.UserId();
        if (group.Members.Any(x => x.UserId == userId && x.LeftAtSequence is null)) return Conflict(new { error = "你已经在群内" });
        if (group.RequireJoinApproval)
        {
            group.JoinRequests[userId] = DateTime.UtcNow;
            await repository.UpdateConversationAsync(group, ct);
            await hub.Clients.Users(group.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId)).SendAsync("group.join-requested", new { conversationId = group.Id, userId }, ct);
            return Ok(new { status = "pending" });
        }
        group.Members.Add(new ConversationMember { UserId = userId });
        await repository.UpdateConversationAsync(group, ct);
        await hub.Clients.Users(group.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId)).SendAsync("conversation.updated", new { conversationId = group.Id, action = "member-added" }, ct);
        return Ok(new { status = "joined", conversationId = group.Id });
    }

    private async Task<QrLoginChallenge?> ValidLoginAsync(QrLoginTokenRequest request, CancellationToken ct)
    {
        var challenge = await repository.GetQrLoginAsync(request.ChallengeId, ct);
        return challenge is not null && challenge.ExpiresAtUtc > DateTime.UtcNow && FixedEquals(challenge.ScanTokenHash, TokenService.Hash(request.Token)) ? challenge : null;
    }

    private static string RandomToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static bool FixedEquals(string left, string right) => CryptographicOperations.FixedTimeEquals(Convert.FromHexString(left), Convert.FromHexString(right));
    private static string VerificationCode(QrLoginChallenge challenge) => challenge.Id[..6].ToUpperInvariant();
    private static string TrimDevice(string value) => string.IsNullOrWhiteSpace(value) ? "Web" : value[..Math.Min(value.Length, 180)];
}
