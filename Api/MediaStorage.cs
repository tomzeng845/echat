using System.Net.Http.Headers;
using System.Text.Json;

namespace EChat.Api;

public sealed record StoredMedia(string StorageKey, string? LocalPath);

public interface IMediaStorage
{
    Task<StoredMedia> StoreAsync(string key, Stream content, string contentType, CancellationToken ct = default);
    Task<string?> GetSignedReadUrlAsync(string key, CancellationToken ct = default);
}

public sealed class MediaStorage(IHttpClientFactory httpClientFactory, IHostEnvironment environment, IConfiguration configuration) : IMediaStorage
{
    private readonly string? _forgeUrl = configuration["BUILT_IN_FORGE_API_URL"] ?? Environment.GetEnvironmentVariable("BUILT_IN_FORGE_API_URL");
    private readonly string? _forgeKey = configuration["BUILT_IN_FORGE_API_KEY"] ?? Environment.GetEnvironmentVariable("BUILT_IN_FORGE_API_KEY");
    private readonly string _localRoot = Path.Combine(environment.ContentRootPath, ".media");

    public async Task<StoredMedia> StoreAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        if (!string.IsNullOrWhiteSpace(_forgeUrl) && !string.IsNullOrWhiteSpace(_forgeKey))
        {
            var uploadUrl = await GetPresignedUrlAsync("put", key, ct);
            using var request = new HttpRequestMessage(HttpMethod.Put, uploadUrl);
            request.Content = new StreamContent(content);
            request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
            using var response = await httpClientFactory.CreateClient("media-storage").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();
            return new StoredMedia(key, null);
        }

        Directory.CreateDirectory(_localRoot);
        var localPath = Path.Combine(_localRoot, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key))).ToLowerInvariant());
        await using var output = File.Create(localPath);
        await content.CopyToAsync(output, ct);
        return new StoredMedia(key, localPath);
    }

    public async Task<string?> GetSignedReadUrlAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_forgeUrl) || string.IsNullOrWhiteSpace(_forgeKey)) return null;
        return await GetPresignedUrlAsync("get", key, ct);
    }

    private async Task<string> GetPresignedUrlAsync(string operation, string key, CancellationToken ct)
    {
        var endpoint = $"{_forgeUrl!.TrimEnd('/')}/v1/storage/presign/{operation}?path={Uri.EscapeDataString(key)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _forgeKey);
        using var response = await httpClientFactory.CreateClient("media-storage").SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Storage presign failed ({(int)response.StatusCode}): {body}");
        using var document = JsonDocument.Parse(body);
        return document.RootElement.GetProperty("url").GetString() ?? throw new InvalidOperationException("Storage returned an empty URL");
    }
}
