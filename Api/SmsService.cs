using System.Net.Http.Json;
using System.Security.Cryptography;

namespace EChat.Api;

public sealed record SmsSendResult(bool Success, string Code, string Provider, string Error, DateTime ExpiresAtUtc);

public sealed class SmsService(
    IChatRepository repository,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<SmsService> logger)
{
    public async Task<SmsSendResult> SendRegistrationCodeAsync(string phone, string requestIp, CancellationToken ct)
    {
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var expires = DateTime.UtcNow.AddMinutes(5);
        var provider = configuration["Sms:Provider"] ?? "custom";
        var content = $"您的E聊验证码是{code}，请在5分钟内完成验证。";
        var success = false;
        var error = "";
        try
        {
            var endpoint = configuration["Sms:Endpoint"];
            if (string.IsNullOrWhiteSpace(endpoint))
            {
                error = "短信服务未配置";
            }
            else
            {
                var client = httpClientFactory.CreateClient("sms");
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = JsonContent.Create(new { mobile = phone, code, content, provider }) };
                var apiKey = configuration["Sms:ApiKey"];
                if (!string.IsNullOrWhiteSpace(apiKey)) request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {apiKey}");
                using var response = await client.SendAsync(request, ct);
                success = response.IsSuccessStatusCode;
                if (!success) error = $"短信平台返回 {(int)response.StatusCode}";
            }
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            error = exception.Message;
            logger.LogWarning(exception, "短信验证码发送失败 phone={Phone} provider={Provider}", phone, provider);
        }
        var record = new AdminModuleRecord
        {
            Id = $"sms:{Guid.NewGuid():N}", Module = "account.sms-sends", Name = phone,
            Status = success ? "Success" : "Failed",
            Data = new Dictionary<string, string>
            {
                ["phone"] = phone, ["content"] = content, ["provider"] = provider,
                ["type"] = "注册验证码", ["purpose"] = "register", ["success"] = success ? "true" : "false",
                ["codeHash"] = TokenService.Hash(code), ["expiresAtUtc"] = expires.ToString("O"),
                ["ip"] = requestIp, ["error"] = error
            }
        };
        await repository.UpsertAdminRecordAsync(record, ct);
        return new SmsSendResult(success, code, provider, error, expires);
    }
}
