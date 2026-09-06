using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/calls")]
public sealed class CallsController(IChatRepository repository, TokenService tokens) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CallRecordView>>> List(CancellationToken ct)
    {
        var calls = await repository.GetCallsAsync(User.UserId(), ct);
        var result = new List<CallRecordView>();
        foreach (var call in calls)
        {
            var conversation = await repository.GetConversationAsync(call.ConversationId, ct);
            var name = conversation?.Type == ConversationType.Direct
                ? (await OtherUserNameAsync(conversation, ct) ?? "单聊")
                : conversation?.Name ?? "已删除会话";
            result.Add(new CallRecordView(
                call.Id,
                call.ConversationId,
                name,
                call.CallerId,
                call.Mode,
                call.Status,
                call.StartedAtUtc,
                call.AnsweredAtUtc,
                call.EndedAtUtc,
                call.EndReason,
                call.AnsweringAtUtc?.ContainsKey(User.UserId()) == true
            ));
        }
        return Ok(result);
    }

    [HttpPost("listener-token")]
    public async Task<ActionResult> ListenerToken(CancellationToken ct)
    {
        var sessionId = User.SessionId();
        var user = await repository.GetUserByIdAsync(User.UserId(), ct);
        if (user is null || string.IsNullOrWhiteSpace(sessionId)) return Unauthorized();
        var (token, expiresAtUtc) = tokens.CreateAccessToken(
            user,
            TimeSpan.FromDays(7),
            "call_listener",
            sessionId,
            User.DeviceId()
        );
        return Ok(new { token, expiresAtUtc, userId = user.Id });
    }

    private async Task<string?> OtherUserNameAsync(Conversation? conversation, CancellationToken ct)
    {
        if (conversation is null) return null;
        var peerId = conversation.Members.FirstOrDefault(x => x.UserId != User.UserId())?.UserId;
        return peerId is null ? null : (await repository.GetUserByIdAsync(peerId, ct))?.DisplayName;
    }
}
