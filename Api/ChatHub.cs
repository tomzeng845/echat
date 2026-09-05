using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api;

[Authorize]
public sealed class ChatHub(IChatRepository repository, IConfiguration configuration, PushNotificationService push) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.User!.UserId();
        var conversations = await repository.GetConversationsAsync(userId);
        foreach (var conversation in conversations) await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation:{conversation.Id}");
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        await base.OnConnectedAsync();
    }

    public async Task JoinConversation(string conversationId)
    {
        var conversation = await RequireConversationMemberAsync(conversationId);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation:{conversation.Id}");
    }

    public async Task MarkRead(string conversationId, long sequence)
    {
        var userId = Context.User!.UserId();
        var conversation = await RequireConversationMemberAsync(conversationId);
        var member = conversation.Members.First(x => x.UserId == userId && x.LeftAtSequence is null);
        member.ReadSequence = Math.Max(member.ReadSequence, Math.Min(sequence, conversation.LastSequence));
        await repository.UpdateConversationAsync(conversation);
        await Clients.Group($"conversation:{conversationId}").SendAsync("receipt.updated", new { conversationId, userId, readSequence = member.ReadSequence });
    }

    public async Task CallInvite(string conversationId, string callId, string mode)
    {
        var conversation = await RequireConversationMemberAsync(conversationId);
        if (mode is not ("audio" or "video")) throw new HubException("INVALID_CALL_MODE");
        if (!Guid.TryParse(callId, out _)) throw new HubException("INVALID_CALL_ID");
        var participants = conversation.Members.Where(x => x.LeftAtSequence is null).Select(x => x.UserId).ToList();
        if (participants.Count > 4 && string.IsNullOrWhiteSpace(configuration["Rtc:SfuUrl"] ?? Environment.GetEnvironmentVariable("SFU_URL"))) throw new HubException("SFU_REQUIRED");
        var caller = await repository.GetUserByIdAsync(Context.User!.UserId()) ?? throw new HubException("USER_NOT_FOUND");
        var existing = await repository.GetCallAsync(callId);
        if (existing is null) await repository.UpsertCallAsync(new CallRecord { Id = callId, ConversationId = conversationId, CallerId = caller.Id, Mode = mode, ParticipantIds = participants });
        else if (existing.CallerId != caller.Id || existing.ConversationId != conversationId) throw new HubException("CALL_ID_CONFLICT");
        await Clients.OthersInGroup($"conversation:{conversation.Id}").SendAsync("call.invited", new { conversationId, callId, mode, callerId = caller.Id, callerName = caller.DisplayName, callerAvatarUrl = caller.AvatarUrl });
        _ = push.SendCallInviteAsync(participants.Where(x => x != caller.Id), caller, conversationId, callId, mode, CancellationToken.None);
    }

    public async Task CallAccept(string conversationId, string callId)
    {
        await RequireConversationMemberAsync(conversationId);
        var call = await RequireCallAsync(conversationId, callId);
        if (call.Status == CallRecordStatus.Ringing) { call.Status = CallRecordStatus.Active; call.AnsweredAtUtc ??= DateTime.UtcNow; await repository.UpsertCallAsync(call); }
        var user = await repository.GetUserByIdAsync(Context.User!.UserId()) ?? throw new HubException("USER_NOT_FOUND");
        await Clients.OthersInGroup($"conversation:{conversationId}").SendAsync("call.accepted", new { conversationId, callId, userId = user.Id, displayName = user.DisplayName, avatarUrl = user.AvatarUrl });
    }

    public async Task CallReject(string conversationId, string callId, string callerId, string reason = "declined")
    {
        var conversation = await RequireConversationMemberAsync(conversationId);
        var call = await RequireCallAsync(conversationId, callId);
        if (!conversation.Members.Any(x => x.UserId == callerId && x.LeftAtSequence is null)) throw new HubException("CALLER_NOT_IN_CONVERSATION");
        if (conversation.Type == ConversationType.Direct && call.Status == CallRecordStatus.Ringing) { call.Status = CallRecordStatus.Rejected; call.EndedAtUtc = DateTime.UtcNow; call.EndReason = reason; await repository.UpsertCallAsync(call); }
        await Clients.User(callerId).SendAsync("call.rejected", new { conversationId, callId, userId = Context.User!.UserId(), reason });
    }

    public async Task CallSignal(string conversationId, string callId, string targetUserId, string signalType, string payload)
    {
        var conversation = await RequireConversationMemberAsync(conversationId);
        var call = await RequireCallAsync(conversationId, callId);
        if (!conversation.Members.Any(x => x.UserId == targetUserId && x.LeftAtSequence is null) || !call.ParticipantIds.Contains(targetUserId)) throw new HubException("TARGET_NOT_IN_CALL");
        if (payload.Length > 24_000 || signalType is not ("offer" or "answer" or "ice")) throw new HubException("INVALID_SIGNAL");
        await Clients.User(targetUserId).SendAsync("call.signal", new { conversationId, callId, fromUserId = Context.User!.UserId(), signalType, payload });
    }

    public async Task CallEnd(string conversationId, string callId)
    {
        await RequireConversationMemberAsync(conversationId);
        var call = await RequireCallAsync(conversationId, callId);
        if (call.Status is CallRecordStatus.Ringing or CallRecordStatus.Active) { call.Status = CallRecordStatus.Ended; call.EndedAtUtc = DateTime.UtcNow; call.EndReason = "ended"; await repository.UpsertCallAsync(call); }
        await Clients.OthersInGroup($"conversation:{conversationId}").SendAsync("call.ended", new { conversationId, callId, userId = Context.User!.UserId() });
    }

    private async Task<Conversation> RequireConversationMemberAsync(string conversationId)
    {
        var conversation = await repository.GetConversationAsync(conversationId) ?? throw new HubException("CONVERSATION_NOT_FOUND");
        if (!conversation.Members.Any(x => x.UserId == Context.User!.UserId() && x.LeftAtSequence is null)) throw new HubException("FORBIDDEN");
        return conversation;
    }

    private async Task<CallRecord> RequireCallAsync(string conversationId, string callId)
    {
        var call = await repository.GetCallAsync(callId) ?? throw new HubException("CALL_NOT_FOUND");
        if (call.ConversationId != conversationId || !call.ParticipantIds.Contains(Context.User!.UserId())) throw new HubException("FORBIDDEN");
        return call;
    }
}
