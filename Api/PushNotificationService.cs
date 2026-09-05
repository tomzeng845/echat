using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;

namespace EChat.Api;

public sealed class PushNotificationService(
    IChatRepository repository,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<PushNotificationService> logger)
{
    private const string MessagingScope = "https://www.googleapis.com/auth/firebase.messaging";
    private readonly SemaphoreSlim _credentialLock = new(1, 1);
    private GoogleCredential? _credential;

    private string ProjectId => configuration["Push:Fcm:ProjectId"]
        ?? Environment.GetEnvironmentVariable("FCM_PROJECT_ID")
        ?? "";

    private string ServiceAccountJson => configuration["Push:Fcm:ServiceAccountJson"]
        ?? Environment.GetEnvironmentVariable("FCM_SERVICE_ACCOUNT_JSON")
        ?? "";

    public bool Enabled => configuration.GetValue("Push:Enabled", true)
        && !string.IsNullOrWhiteSpace(ProjectId)
        && (!string.IsNullOrWhiteSpace(ServiceAccountJson)
            || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS")));

    public string Provider => "Firebase Cloud Messaging";

    public async Task SendMessageAsync(Conversation conversation, ChatMessage message, CancellationToken ct = default)
    {
        if (!Enabled) return;
        var sender = await repository.GetUserByIdAsync(message.SenderId, ct);
        if (sender is null) return;
        var recipients = conversation.Members
            .Where(x => x.LeftAtSequence is null && !x.Muted && x.UserId != message.SenderId)
            .Select(x => x.UserId)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        var body = message.Kind switch
        {
            MessageKind.Image => "发来一张图片",
            MessageKind.Voice => "发来一条语音",
            MessageKind.Video => "发来一段视频",
            MessageKind.File => "发来一个文件",
            _ => "发来一条加密消息"
        };
        await SendToUsersAsync(recipients, sender.DisplayName, body, new Dictionary<string, string>
        {
            ["type"] = "message",
            ["conversationId"] = conversation.Id,
            ["messageId"] = message.Id,
            ["kind"] = message.Kind.ToString(),
            ["sequence"] = message.Sequence.ToString(System.Globalization.CultureInfo.InvariantCulture)
        }, ct, highPriority: true);
    }

    public async Task SendFriendRequestAsync(string userId, UserAccount sender, FriendRequest request, CancellationToken ct = default) =>
        await SendToUsersAsync([userId], "新的好友申请", $"{sender.DisplayName} 请求添加你为好友", new Dictionary<string, string>
        {
            ["type"] = "contact-request",
            ["requestId"] = request.Id,
            ["senderId"] = sender.Id
        }, ct, highPriority: true);

    public async Task SendCallInviteAsync(IEnumerable<string> userIds, UserAccount caller, string conversationId, string callId, string mode, CancellationToken ct = default) =>
        await SendToUsersAsync(userIds, caller.DisplayName, mode == "video" ? "邀请你进行视频通话" : "邀请你进行语音通话", new Dictionary<string, string>
        {
            ["type"] = "call",
            ["conversationId"] = conversationId,
            ["callId"] = callId,
            ["mode"] = mode,
            ["callerId"] = caller.Id
        }, ct, highPriority: true);

    public async Task SendTestAsync(string userId, CancellationToken ct = default) =>
        await SendToUsersAsync([userId], "E聊通知测试", "Android 消息推送已连接", new Dictionary<string, string> { ["type"] = "test" }, ct);

    private async Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        IReadOnlyDictionary<string, string> data,
        CancellationToken ct,
        bool highPriority = false)
    {
        if (!Enabled) return;
        var devices = await repository.GetPushDevicesAsync(userIds, ct);
        if (devices.Count == 0) return;
        await Task.WhenAll(devices.Select(device => SendToDeviceSafelyAsync(device, title, body, data, highPriority, ct)));
    }

    private async Task SendToDeviceSafelyAsync(
        PushDevice device,
        string title,
        string body,
        IReadOnlyDictionary<string, string> data,
        bool highPriority,
        CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(6));
            var credential = await GetCredentialAsync(timeout.Token);
            var accessToken = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: timeout.Token);
            using var request = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{Uri.EscapeDataString(ProjectId)}/messages:send");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            var payload = new
            {
                message = new
                {
                    token = device.Token,
                    notification = new { title, body },
                    data,
                    android = new
                    {
                        priority = highPriority ? "high" : "normal",
                        notification = new
                        {
                            channel_id = highPriority ? "calls" : "messages",
                            sound = "default",
                            tag = data.TryGetValue("conversationId", out var conversationId) ? $"conversation-{conversationId}" : "echat"
                        }
                    }
                }
            };
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await httpClientFactory.CreateClient("fcm").SendAsync(request, timeout.Token);
            if (response.IsSuccessStatusCode) return;
            var error = await response.Content.ReadAsStringAsync(timeout.Token);
            if ((int)response.StatusCode is 400 or 404 && (error.Contains("UNREGISTERED", StringComparison.OrdinalIgnoreCase) || error.Contains("registration-token-not-registered", StringComparison.OrdinalIgnoreCase)))
                await repository.DisablePushTokenAsync(device.Token, CancellationToken.None);
            logger.LogWarning("FCM delivery failed with {StatusCode}: {Error}", (int)response.StatusCode, error.Length > 500 ? error[..500] : error);
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("FCM delivery timed out for device {DeviceId}", device.DeviceId);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "FCM delivery failed for device {DeviceId}", device.DeviceId);
        }
    }

    private async Task<GoogleCredential> GetCredentialAsync(CancellationToken ct)
    {
        if (_credential is not null) return _credential;
        await _credentialLock.WaitAsync(ct);
        try
        {
            if (_credential is not null) return _credential;
            var credential = string.IsNullOrWhiteSpace(ServiceAccountJson)
                ? await GoogleCredential.GetApplicationDefaultAsync(ct)
                : CredentialFactory.FromJson<ServiceAccountCredential>(ServiceAccountJson).ToGoogleCredential();
            _credential = credential.CreateScoped(MessagingScope);
            return _credential;
        }
        finally
        {
            _credentialLock.Release();
        }
    }
}
