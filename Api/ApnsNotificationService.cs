using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EChat.Api;

/// <summary>Apple Push Notification service HTTP/2 token-authenticated sender.</summary>
public sealed class ApnsNotificationService(
    IChatRepository repository,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<ApnsNotificationService> logger)
{
    private readonly SemaphoreSlim _keyLock = new(1, 1);
    private ECDsa? _signingKey;
    private string? _cachedJwt;
    private DateTime _jwtExpiresAtUtc;

    private string TeamId => Get("Push:Apns:TeamId", "APNS_TEAM_ID");
    private string KeyId => Get("Push:Apns:KeyId", "APNS_KEY_ID");
    private string BundleId => Get("Push:Apns:BundleId", "APNS_BUNDLE_ID");
    private string PrivateKey => NormalizePrivateKey(Get("Push:Apns:PrivateKey", "APNS_PRIVATE_KEY"));
    private bool UseSandbox => bool.TryParse(Get("Push:Apns:UseSandbox", "APNS_USE_SANDBOX"), out var value) && value;

    public bool Enabled => configuration.GetValue("Push:Enabled", true)
        && !string.IsNullOrWhiteSpace(TeamId)
        && !string.IsNullOrWhiteSpace(KeyId)
        && !string.IsNullOrWhiteSpace(BundleId)
        && !string.IsNullOrWhiteSpace(PrivateKey)
        && CanImportKey(PrivateKey);

    public static string NormalizePrivateKey(string value) => value.Trim().Trim('"').Replace("\\n", "\n", StringComparison.Ordinal);

    public static string CreatePayload(string title, string body, IReadOnlyDictionary<string, string> data, bool voip)
    {
        var aps = voip
            ? new Dictionary<string, object?> { ["content-available"] = 1 }
            : new Dictionary<string, object?> { ["alert"] = new Dictionary<string, string> { ["title"] = title, ["body"] = body }, ["sound"] = "default" };
        var payload = new Dictionary<string, object?> { ["aps"] = aps };
        foreach (var pair in data) payload[pair.Key] = pair.Value;
        return JsonSerializer.Serialize(payload);
    }

    public async Task SendAsync(PushDevice device, string title, string body, IReadOnlyDictionary<string, string> data, CancellationToken ct = default)
    {
        if (!Enabled || device.Platform is not ("ios" or "ios-voip")) return;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            var voip = device.Platform == "ios-voip";
            using var request = new HttpRequestMessage(HttpMethod.Post, UseSandbox ? "https://api.sandbox.push.apple.com/3/device/" + device.Token : "https://api.push.apple.com/3/device/" + device.Token);
            request.Version = new Version(2, 0);
            request.VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher;
            request.Headers.TryAddWithoutValidation("authorization", "bearer " + await GetJwtAsync(timeout.Token));
            request.Headers.TryAddWithoutValidation("apns-topic", voip ? BundleId + ".voip" : BundleId);
            request.Headers.TryAddWithoutValidation("apns-push-type", voip ? "voip" : "alert");
            request.Headers.TryAddWithoutValidation("apns-priority", "10");
            if (voip)
            {
                request.Headers.TryAddWithoutValidation("apns-expiration", "0");
                if (data.TryGetValue("callId", out var callId) && callId.Length <= 64)
                    request.Headers.TryAddWithoutValidation("apns-collapse-id", callId);
            }
            request.Content = new StringContent(CreatePayload(title, body, data, voip), Encoding.UTF8, "application/json");
            using var response = await httpClientFactory.CreateClient("apns").SendAsync(request, timeout.Token);
            var responseBody = await response.Content.ReadAsStringAsync(timeout.Token);
            if (response.IsSuccessStatusCode) return;
            if (response.StatusCode == HttpStatusCode.Gone || responseBody.Contains("BadDeviceToken", StringComparison.OrdinalIgnoreCase) || responseBody.Contains("Unregistered", StringComparison.OrdinalIgnoreCase))
                await repository.DisablePushTokenAsync(device.Token, CancellationToken.None);
            logger.LogWarning("APNs delivery failed with {StatusCode}: {Error}", (int)response.StatusCode, responseBody.Length > 500 ? responseBody[..500] : responseBody);
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("APNs delivery timed out for device {DeviceId}", device.DeviceId);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "APNs delivery failed for device {DeviceId}", device.DeviceId);
        }
    }

    public async Task<string> GetJwtAsync(CancellationToken ct = default)
    {
        if (_cachedJwt is not null && DateTime.UtcNow < _jwtExpiresAtUtc) return _cachedJwt;
        await _keyLock.WaitAsync(ct);
        try
        {
            if (_cachedJwt is not null && DateTime.UtcNow < _jwtExpiresAtUtc) return _cachedJwt;
            _signingKey ??= ECDsa.Create();
            _signingKey.ImportFromPem(PrivateKey);
            var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "ES256", kid = KeyId }));
            var issuedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var claims = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { iss = TeamId, iat = issuedAt }));
            var signingInput = header + "." + claims;
            var rawSignature = _signingKey.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256);
            var signature = Base64Url(rawSignature.Length == 64 ? rawSignature : DerToJose(rawSignature, 32));
            _cachedJwt = signingInput + "." + signature;
            _jwtExpiresAtUtc = DateTime.UtcNow.AddMinutes(49);
            return _cachedJwt;
        }
        finally { _keyLock.Release(); }
    }

    internal static byte[] DerToJose(byte[] der, int componentSize)
    {
        if (der.Length < 8 || der[0] != 0x30) throw new CryptographicException("Invalid ECDSA DER signature");
        var offset = 1;
        var sequenceLength = ReadDerLength(der, ref offset);
        if (sequenceLength > der.Length - offset || der[offset++] != 0x02) throw new CryptographicException("Invalid ECDSA DER signature");
        var rLength = ReadDerLength(der, ref offset);
        if (rLength > der.Length - offset) throw new CryptographicException("Invalid ECDSA DER signature");
        var r = der.AsSpan(offset, rLength); offset += rLength;
        if (offset >= der.Length || der[offset++] != 0x02) throw new CryptographicException("Invalid ECDSA DER signature");
        var sLength = ReadDerLength(der, ref offset);
        if (sLength > der.Length - offset) throw new CryptographicException("Invalid ECDSA DER signature");
        var s = der.AsSpan(offset, sLength);
        var output = new byte[componentSize * 2];
        CopyInteger(r, output.AsSpan(0, componentSize));
        CopyInteger(s, output.AsSpan(componentSize, componentSize));
        return output;
    }

    private static int ReadDerLength(byte[] value, ref int offset)
    {
        if (offset >= value.Length) throw new CryptographicException("Invalid DER length");
        var first = value[offset++];
        if ((first & 0x80) == 0) return first;
        var count = first & 0x7f;
        if (count is 0 or > 4 || offset + count > value.Length) throw new CryptographicException("Invalid DER length");
        var length = 0;
        for (var i = 0; i < count; i++) length = (length << 8) | value[offset++];
        return length;
    }

    private static void CopyInteger(ReadOnlySpan<byte> integer, Span<byte> destination)
    {
        while (integer.Length > 1 && integer[0] == 0) integer = integer[1..];
        if (integer.Length > destination.Length) throw new CryptographicException("ECDSA component is too large");
        integer.CopyTo(destination[(destination.Length - integer.Length)..]);
    }

    private static string Base64Url(ReadOnlySpan<byte> value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static bool CanImportKey(string pem) { try { using var key = ECDsa.Create(); key.ImportFromPem(pem); return true; } catch { return false; } }
    private string Get(string key, string environment)
    {
        var configured = configuration[key];
        return string.IsNullOrWhiteSpace(configured) ? Environment.GetEnvironmentVariable(environment) ?? "" : configured;
    }
}
