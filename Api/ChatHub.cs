using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api;

[Authorize]
public sealed class ChatHub(IChatRepository repository) : Hub
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
        var conversation = await repository.GetConversationAsync(conversationId) ?? throw new HubException("CONVERSATION_NOT_FOUND");
        if (!conversation.Members.Any(x => x.UserId == Context.User!.UserId() && x.LeftAtSequence is null)) throw new HubException("FORBIDDEN");
        await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation:{conversationId}");
    }

    public async Task MarkRead(string conversationId, long sequence)
    {
        var userId = Context.User!.UserId();
        var conversation = await repository.GetConversationAsync(conversationId) ?? throw new HubException("CONVERSATION_NOT_FOUND");
        var member = conversation.Members.FirstOrDefault(x => x.UserId == userId && x.LeftAtSequence is null) ?? throw new HubException("FORBIDDEN");
        member.ReadSequence = Math.Max(member.ReadSequence, Math.Min(sequence, conversation.LastSequence));
        await repository.UpdateConversationAsync(conversation);
        await Clients.Group($"conversation:{conversationId}").SendAsync("receipt.updated", new { conversationId, userId, readSequence = member.ReadSequence });
    }
}
