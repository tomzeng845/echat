using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EChat.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EChat.Api.Tests;

public sealed class ApnsTests
{
    [Fact]
    public async Task Jwt_IsEs256AndCachedForLessThanFiftyMinutes()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Push:Enabled"] = "true",
            ["Push:Apns:TeamId"] = "TEAM123",
            ["Push:Apns:KeyId"] = "KEY123",
            ["Push:Apns:BundleId"] = "com.example.echat",
            ["Push:Apns:PrivateKey"] = key.ExportPkcs8PrivateKeyPem()
        }).Build();
        var service = new ApnsNotificationService(new InMemoryChatRepository(), new StubFactory(), configuration, NullLogger<ApnsNotificationService>.Instance);

        var first = await service.GetJwtAsync();
        var second = await service.GetJwtAsync();
        var parts = first.Split('.');
        var header = JsonDocument.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[0]))).RootElement;

        Assert.Equal(first, second);
        Assert.Equal(3, parts.Length);
        Assert.Equal("ES256", header.GetProperty("alg").GetString());
        Assert.Equal("KEY123", header.GetProperty("kid").GetString());
        Assert.Equal(64, Base64UrlDecode(parts[2]).Length);
    }

    [Fact]
    public async Task SameDeviceSupportsAlertAndVoipPlatformsAndDisableDisablesBoth()
    {
        var repository = new InMemoryChatRepository();
        await repository.UpsertPushDeviceAsync(new PushDevice { UserId = "u1", DeviceId = "iphone-1", Platform = "ios", Token = new string('a', 64) });
        await repository.UpsertPushDeviceAsync(new PushDevice { UserId = "u1", DeviceId = "iphone-1", Platform = "IOS-VOIP", Token = new string('b', 64) });
        Assert.Equal(2, (await repository.GetPushDevicesAsync(["u1"])).Count);
        await repository.DisablePushDeviceAsync("u1", "iphone-1");
        Assert.Empty(await repository.GetPushDevicesAsync(["u1"]));
    }

    [Fact]
    public void PayloadKeepsRoutingDataAndSeparatesAlertFromVoip()
    {
        var data = new Dictionary<string, string> { ["type"] = "call", ["conversationId"] = "c1", ["callId"] = "call-1" };
        var alert = ApnsNotificationService.CreatePayload("标题", "正文", data, false);
        var voip = ApnsNotificationService.CreatePayload("标题", "正文", data, true);
        Assert.Contains("conversationId", alert);
        Assert.Contains("callId", voip);
        Assert.Contains("content-available", voip);
        Assert.DoesNotContain("alert", voip);
        Assert.Equal("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----", ApnsNotificationService.NormalizePrivateKey("-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"));
    }

    [Fact]
    public async Task VoipDeliveryUsesProductionTopicImmediateExpiryAndCallerMetadata()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var repository = new InMemoryChatRepository();
        await repository.UpsertPushDeviceAsync(new PushDevice
        {
            UserId = "receiver",
            DeviceId = "iphone-1",
            Platform = "ios-voip",
            Token = new string('c', 64)
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Push:Enabled"] = "true",
            ["Push:Apns:TeamId"] = "TEAM123",
            ["Push:Apns:KeyId"] = "KEY123",
            ["Push:Apns:BundleId"] = "com.tomzeng845.echat",
            ["Push:Apns:PrivateKey"] = key.ExportPkcs8PrivateKeyPem(),
            ["Push:Apns:UseSandbox"] = "false"
        }).Build();
        var factory = new StubFactory();
        var apns = new ApnsNotificationService(repository, factory, configuration, NullLogger<ApnsNotificationService>.Instance);
        var push = new PushNotificationService(repository, factory, configuration, NullLogger<PushNotificationService>.Instance, apns);
        var callId = "1a8ef958-0aad-4b4d-a37d-d79693e5a14f";

        await push.SendCallInviteAsync(["receiver"], new UserAccount
        {
            Id = "caller",
            DisplayName = "测试好友",
            AvatarUrl = "/api/media/avatar"
        }, "conversation-one", callId, "video");

        Assert.Equal("https://api.push.apple.com/3/device/" + new string('c', 64), factory.Handler.LastUri?.ToString());
        Assert.Equal("com.tomzeng845.echat.voip", factory.Handler.Header("apns-topic"));
        Assert.Equal("voip", factory.Handler.Header("apns-push-type"));
        Assert.Equal("0", factory.Handler.Header("apns-expiration"));
        Assert.Equal(callId, factory.Handler.Header("apns-collapse-id"));
        using var payload = JsonDocument.Parse(factory.Handler.LastBody);
        Assert.Equal("测试好友", payload.RootElement.GetProperty("callerName").GetString());
        Assert.Equal("/api/media/avatar", payload.RootElement.GetProperty("callerAvatarUrl").GetString());
    }

    private static byte[] Base64UrlDecode(string value)
    {
        value = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(value + new string('=', (4 - value.Length % 4) % 4));
    }

    private sealed class StubFactory : IHttpClientFactory
    {
        public StubHandler Handler { get; } = new();
        public HttpClient CreateClient(string name) => new(Handler, disposeHandler: false);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, string> _headers = new(StringComparer.OrdinalIgnoreCase);
        public Uri? LastUri { get; private set; }
        public string LastBody { get; private set; } = "";
        public string? Header(string name) => _headers.GetValueOrDefault(name);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastUri = request.RequestUri;
            LastBody = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            foreach (var header in request.Headers)
                _headers[header.Key] = string.Join(",", header.Value);
            return new HttpResponseMessage(HttpStatusCode.OK);
        }
    }
}
