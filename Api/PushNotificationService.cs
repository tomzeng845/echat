using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;

namespace EChat.Api;

public sealed class PushNotificationService(
    IChatRepository repository,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<PushNotificationService> logger,
    ApnsNotificationService apns)
{
    private const string MessagingScope = "https://www.googleapis.com/auth/firebase.messaging";
    private readonly SemaphoreSlim _credentialLock = new(1, 1);
    private GoogleCredential? _credential;

    private string ProjectId => configuration["Push:Fcm:ProjectId"] ?? Environment.GetEnvironmentVariable("FCM_PROJECT_ID") ?? "";
    private string ServiceAccountJson => configuration["Push:Fcm:ServiceAccountJson"] ?? Environment.GetEnvironmentVariable("FCM_SERVICE_ACCOUNT_JSON") ?? "";
    private bool PushEnabled => configuration.GetValue("Push:Enabled", true);
    public bool AndroidEnabled => PushEnabled && !string.IsNullOrWhiteSpace(ProjectId) && (!string.IsNullOrWhiteSpace(ServiceAccountJson) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS")));
    public bool IosEnabled => PushEnabled && apns.Enabled;
    public bool Enabled => AndroidEnabled || IosEnabled;
    public string Provider => AndroidEnabled && IosEnabled ? "FCM + APNs" : IosEnabled ? "Apple Push Notification service" : "Firebase Cloud Messaging";

    public async Task SendMessageAsync(Conversation conversation, ChatMessage message, CancellationToken ct = default)
    {
        var sender = await repository.GetUserByIdAsync(message.SenderId, ct);
        if (sender is null) return;
        var recipients = conversation.Members.Where(x => x.LeftAtSequence is null && !x.Muted && x.UserId != message.SenderId).Select(x => x.UserId).Distinct(StringComparer.Ordinal).ToList();
        var body = message.Kind switch { MessageKind.Emoji => "发来一个表情", MessageKind.Image => "发来一张图片", MessageKind.Voice => "发来一条语音", MessageKind.Video => "发来一段视频", MessageKind.File => "发来一个文件", _ => "发来一条消息" };
        await SendToUsersAsync(recipients, sender.DisplayName, body, new Dictionary<string, string> { ["type"] = "message", ["conversationId"] = conversation.Id, ["messageId"] = message.Id, ["kind"] = message.Kind.ToString(), ["sequence"] = message.Sequence.ToString(System.Globalization.CultureInfo.InvariantCulture) }, ct, highPriority: true);
    }

    public Task SendFriendRequestAsync(string userId, UserAccount sender, FriendRequest request, CancellationToken ct = default) =>
        SendToUsersAsync([userId], "新的好友申请", $"{sender.DisplayName} 请求添加你为好友", new Dictionary<string, string> { ["type"] = "contact-request", ["requestId"] = request.Id, ["senderId"] = sender.Id }, ct, highPriority: true);

    public Task SendCallInviteAsync(IEnumerable<string> userIds, UserAccount caller, string conversationId, string callId, string mode, CancellationToken ct = default) =>
        SendToUsersAsync(userIds, caller.DisplayName, mode == "video" ? "邀请你进行视频通话" : "邀请你进行语音通话", new Dictionary<string, string> { ["type"] = "call", ["conversationId"] = conversationId, ["callId"] = callId, ["mode"] = mode, ["callerId"] = caller.Id, ["callerName"] = caller.DisplayName, ["callerAvatarUrl"] = caller.AvatarUrl }, ct, highPriority: true);

    public async Task SendCallEndedAsync(IEnumerable<string> userIds, string callId, CancellationToken ct = default)
    {
        if (!IosEnabled) return;
        var devices = await repository.GetPushDevicesAsync(userIds, ct);
        var data = new Dictionary<string, string> { ["type"] = "call", ["action"] = "end", ["callId"] = callId };
        await Task.WhenAll(SelectCallPushDevices(devices).Select(x => apns.SendAsync(x, "", "", data, ct)));
    }

    public Task SendTestAsync(string userId, CancellationToken ct = default) =>
        SendToUsersAsync([userId], "E聊通知测试", "推送服务已连接", new Dictionary<string, string> { ["type"] = "test" }, ct);

    private async Task SendToUsersAsync(IEnumerable<string> userIds, string title, string body, IReadOnlyDictionary<string, string> data, CancellationToken ct, bool highPriority = false)
    {
        if (!Enabled) return;
        var devices = await repository.GetPushDevicesAsync(userIds, ct);
        if (devices.Count == 0) return;
        var selectedDevices = data.TryGetValue("type", out var type) && type == "call"
            ? SelectCallPushDevices(devices)
            : devices;
        await Task.WhenAll(selectedDevices.Select(device => SendToDeviceSafelyAsync(device, title, body, data, highPriority, ct)));
    }

    private static IReadOnlyList<PushDevice> SelectCallPushDevices(IReadOnlyList<PushDevice> devices)
    {
        var voipDeviceIds = devices
            .Where(x => x.Platform == "ios-voip")
            .Select(x => $"{x.UserId}:{x.DeviceId}")
            .ToHashSet(StringComparer.Ordinal);
        return devices
            .Where(x => x.Platform != "ios" || !voipDeviceIds.Contains($"{x.UserId}:{x.DeviceId}"))
            .ToList();
    }

    private Task SendToDeviceSafelyAsync(PushDevice device, string title, string body, IReadOnlyDictionary<string, string> data, bool highPriority, CancellationToken ct) =>
        device.Platform switch
        {
            "android" => AndroidEnabled ? SendFcmAsync(device, title, body, data, highPriority, ct) : Task.CompletedTask,
            "ios" => IosEnabled ? apns.SendAsync(device, title, body, data, ct) : Task.CompletedTask,
            "ios-voip" => IosEnabled && data.TryGetValue("type", out var voipType) && voipType == "call" ? apns.SendAsync(device, title, body, data, ct) : Task.CompletedTask,
            _ => Task.CompletedTask
        };

    private async Task SendFcmAsync(PushDevice device, string title, string body, IReadOnlyDictionary<string, string> data, bool highPriority, CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            var credential = await GetCredentialAsync(timeout.Token);
            var accessToken = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: timeout.Token);
            var isCall = data.TryGetValue("type", out var notificationType) && notificationType == "call";
            using var request = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{Uri.EscapeDataString(ProjectId)}/messages:send");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            var payload = new { message = new { token = device.Token, notification = new { title, body }, data, android = new { priority = highPriority ? "high" : "normal", notification = new { channel_id = isCall ? "calls-v2" : "messages-v2", sound = isCall ? "echat_call" : "echat_message", tag = isCall && data.TryGetValue("callId", out var callId) ? $"call-{callId}" : data.TryGetValue("conversationId", out var conversationId) ? $"conversation-{conversationId}" : "echat" } } } };
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await httpClientFactory.CreateClient("fcm").SendAsync(request, timeout.Token);
            if (response.IsSuccessStatusCode) return;
            var error = await response.Content.ReadAsStringAsync(timeout.Token);
            if ((int)response.StatusCode is 400 or 404 && (error.Contains("UNREGISTERED", StringComparison.OrdinalIgnoreCase) || error.Contains("registration-token-not-registered", StringComparison.OrdinalIgnoreCase))) await repository.DisablePushTokenAsync(device.Token, CancellationToken.None);
            logger.LogWarning("FCM delivery failed with {StatusCode}: {Error}", (int)response.StatusCode, error.Length > 500 ? error[..500] : error);
        }
        catch (OperationCanceledException) { logger.LogWarning("FCM delivery timed out for device {DeviceId}", device.DeviceId); }
        catch (Exception exception) { logger.LogWarning(exception, "FCM delivery failed for device {DeviceId}", device.DeviceId); }
    }

    private async Task<GoogleCredential> GetCredentialAsync(CancellationToken ct)
    {
        if (_credential is not null) return _credential;
        await _credentialLock.WaitAsync(ct);
        try
        {
            if (_credential is not null) return _credential;
            var credential = string.IsNullOrWhiteSpace(ServiceAccountJson) ? await GoogleCredential.GetApplicationDefaultAsync(ct) : CredentialFactory.FromJson<ServiceAccountCredential>(ServiceAccountJson).ToGoogleCredential();
            _credential = credential.CreateScoped(MessagingScope);
            return _credential;
        }
        finally { _credentialLock.Release(); }
    }
}
