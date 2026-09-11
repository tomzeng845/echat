using System.Net.Http.Json;
using System.Text.Json;

namespace EChat.Api;

public sealed record OpenImSessionResponse(
    string UserId,
    string Token,
    int ExpireTimeSeconds,
    string ApiAddress,
    string WebSocketAddress,
    string LiveKitAddress);

public sealed class OpenImService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<OpenImService> logger)
{
    private readonly string apiAddress = (configuration["OpenIM:ApiAddress"]
        ?? Environment.GetEnvironmentVariable("OPENIM_API_ADDRESS")
        ?? "https://im.superseller88.com").TrimEnd('/');
    private readonly string webSocketAddress = configuration["OpenIM:WebSocketAddress"]
        ?? Environment.GetEnvironmentVariable("OPENIM_WS_ADDRESS")
        ?? "wss://im.superseller88.com";
    private readonly string liveKitAddress = configuration["OpenIM:LiveKitAddress"]
        ?? Environment.GetEnvironmentVariable("OPENIM_LIVEKIT_ADDRESS")
        ?? "wss://livekit.superseller88.com";
    private readonly string? adminToken = configuration["OpenIM:AdminToken"]
        ?? Environment.GetEnvironmentVariable("OPENIM_ADMIN_TOKEN");

    public bool Configured => !string.IsNullOrWhiteSpace(adminToken);

    public async Task<OpenImSessionResponse> IssueUserTokenAsync(
        UserAccount user,
        int platformId,
        CancellationToken cancellationToken)
    {
        if (!Configured)
            throw new InvalidOperationException("OpenIM 管理员 token 尚未配置");
        if (platformId is not (1 or 2))
            throw new ArgumentOutOfRangeException(nameof(platformId), "OpenIM platformID 仅支持 iOS=1、Android=2");

        await EnsureUserRegisteredAsync(user, cancellationToken);
        var operationId = $"echat-token-{Guid.NewGuid():N}";
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{apiAddress}/auth/get_user_token")
        {
            Content = JsonContent.Create(new { platformID = platformId, userID = user.Id })
        };
        request.Headers.Add("operationID", operationId);
        request.Headers.Add("token", adminToken);

        using var response = await httpClientFactory.CreateClient("openim").SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<OpenImEnvelope<OpenImTokenData>>(cancellationToken);
        if (!response.IsSuccessStatusCode || payload?.ErrCode != 0 || string.IsNullOrWhiteSpace(payload.Data?.Token))
        {
            var detail = payload?.ErrMsg ?? $"HTTP {(int)response.StatusCode}";
            logger.LogWarning("OpenIM token request failed. operationID={OperationId}, userId={UserId}, detail={Detail}", operationId, user.Id, detail);
            throw new InvalidOperationException($"OpenIM 用户 token 获取失败：{detail}");
        }

        return new OpenImSessionResponse(
            user.Id,
            payload.Data.Token,
            payload.Data.ExpireTimeSeconds,
            apiAddress,
            webSocketAddress,
            liveKitAddress);
    }

    private async Task EnsureUserRegisteredAsync(UserAccount user, CancellationToken cancellationToken)
    {
        var operationId = $"echat-register-{Guid.NewGuid():N}";
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{apiAddress}/user/user_register")
        {
            Content = JsonContent.Create(new
            {
                users = new[]
                {
                    new { userID = user.Id, nickname = user.DisplayName, faceURL = user.AvatarUrl }
                }
            })
        };
        request.Headers.Add("operationID", operationId);
        request.Headers.Add("token", adminToken);

        using var response = await httpClientFactory.CreateClient("openim").SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<OpenImEnvelope<JsonElement>>(cancellationToken);
        if (response.IsSuccessStatusCode && payload?.ErrCode == 0) return;

        var detail = payload?.ErrMsg ?? $"HTTP {(int)response.StatusCode}";
        // Registration is idempotent for this integration: an existing OpenIM user can continue to token issuance.
        if (detail.Contains("exist", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("已存在", StringComparison.OrdinalIgnoreCase)) return;

        logger.LogWarning("OpenIM user registration failed. operationID={OperationId}, userId={UserId}, detail={Detail}", operationId, user.Id, detail);
        throw new InvalidOperationException($"OpenIM 用户同步失败：{detail}");
    }

    private sealed record OpenImEnvelope<T>(int ErrCode, string? ErrMsg, string? ErrDlt, T? Data);
    private sealed record OpenImTokenData(string Token, int ExpireTimeSeconds);
}
