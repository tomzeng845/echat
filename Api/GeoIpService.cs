using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace EChat.Api;

public sealed record GeoIpResult(
    string Ip,
    string Address,
    string Country,
    string Region,
    string City,
    string Isp,
    string Source,
    bool Resolved);

public sealed class GeoIpService(IHttpClientFactory httpClientFactory, IConfiguration configuration, ILogger<GeoIpService> logger)
{
    private sealed record CacheValue(GeoIpResult Result, DateTime ExpiresAtUtc);

    private readonly ConcurrentDictionary<string, CacheValue> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);
    private readonly string _urlTemplate = configuration["GeoIp:UrlTemplate"] ?? "https://ipwho.is/{ip}?lang=zh-CN";
    private readonly TimeSpan _successTtl = TimeSpan.FromHours(Math.Clamp(configuration.GetValue("GeoIp:CacheHours", 24), 1, 168));
    private readonly TimeSpan _failureTtl = TimeSpan.FromMinutes(Math.Clamp(configuration.GetValue("GeoIp:FailureCacheMinutes", 5), 1, 60));
    private readonly TimeSpan _timeout = TimeSpan.FromMilliseconds(Math.Clamp(configuration.GetValue("GeoIp:TimeoutMs", 6000), 500, 8000));

    public bool Enabled => configuration.GetValue("GeoIp:Enabled", true);
    public string Provider => Enabled ? HostOf(_urlTemplate) : "disabled";
    public int CachedEntries => _cache.Count;

    public async Task<GeoIpResult> ResolveAsync(string ip, CancellationToken ct = default)
    {
        var fallback = Fallback(ip);
        if (!Enabled || !IsPublicIp(ip)) return fallback;
        if (_cache.TryGetValue(ip, out var cached) && cached.ExpiresAtUtc > DateTime.UtcNow) return cached.Result;

        var gate = _locks.GetOrAdd(ip, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (_cache.TryGetValue(ip, out cached) && cached.ExpiresAtUtc > DateTime.UtcNow) return cached.Result;
            var result = await LookupAsync(ip, ct);
            _cache[ip] = new CacheValue(result, DateTime.UtcNow.Add(result.Resolved ? _successTtl : _failureTtl));
            return result;
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<string> ResolveAddressAsync(string ip, CancellationToken ct = default) => (await ResolveAsync(ip, ct)).Address;

    private async Task<GeoIpResult> LookupAsync(string ip, CancellationToken ct)
    {
        try
        {
            var url = _urlTemplate.Replace("{ip}", Uri.EscapeDataString(ip), StringComparison.Ordinal);
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && !uri.IsLoopback))
            {
                logger.LogWarning("GeoIP URL must use HTTPS: {Url}", url);
                return Fallback(ip);
            }

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(_timeout);
            using var response = await httpClientFactory.CreateClient("geoip").GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode) return Fallback(ip);
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: timeout.Token);
            var root = document.RootElement;
            if (!root.TryGetProperty("success", out var success) || !success.GetBoolean()) return Fallback(ip);

            var country = Text(root, "country");
            var region = Text(root, "region");
            var city = Text(root, "city");
            var isp = root.TryGetProperty("connection", out var connection) ? Text(connection, "isp") : "";
            var parts = new[] { country, region, city }.Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (parts.Length == 0) return Fallback(ip);
            return new GeoIpResult(ip, string.Join(" · ", parts), country, region, city, isp, HostOf(_urlTemplate), true);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning("GeoIP lookup timed out for {Ip}", ip);
            return Fallback(ip);
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or InvalidOperationException)
        {
            logger.LogWarning(error, "GeoIP lookup failed for {Ip}", ip);
            return Fallback(ip);
        }
    }

    private static string Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()?.Trim() ?? "" : "";

    private static GeoIpResult Fallback(string ip)
    {
        var address = RequestMetadata.Address(ip);
        return new GeoIpResult(ip, address, "", "", "", "", "fallback", false);
    }

    internal static bool IsPublicIp(string ip)
    {
        if (!IPAddress.TryParse(ip, out var parsed)) return false;
        if (IPAddress.IsLoopback(parsed) || parsed.Equals(IPAddress.Any) || parsed.Equals(IPAddress.IPv6Any)) return false;
        if (parsed.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = parsed.GetAddressBytes();
            return !(bytes[0] == 10 || bytes[0] == 127 || bytes[0] == 0 || (bytes[0] == 100 && bytes[1] is >= 64 and <= 127)
                || (bytes[0] == 169 && bytes[1] == 254) || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
                || (bytes[0] == 192 && bytes[1] == 168) || bytes[0] >= 224);
        }
        if (parsed.AddressFamily == AddressFamily.InterNetworkV6)
            return !(parsed.IsIPv6LinkLocal || parsed.IsIPv6Multicast || parsed.IsIPv6SiteLocal || parsed.GetAddressBytes()[0] is 0xfc or 0xfd);
        return false;
    }

    private static string HostOf(string template) => Uri.TryCreate(template.Replace("{ip}", "8.8.8.8", StringComparison.Ordinal), UriKind.Absolute, out var uri) ? uri.Host : "invalid";
}
