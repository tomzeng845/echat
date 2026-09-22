using System.Text.RegularExpressions;

namespace EChat.Api;

public sealed class ForbiddenWordService(IChatRepository repository, ILogger<ForbiddenWordService> logger)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private IReadOnlyList<string> cachedWords = [];
    private DateTime cacheExpiresUtc = DateTime.MinValue;

    public async Task<string> ReplaceAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var words = await GetWordsAsync(ct);
        foreach (var word in words)
        {
            try { text = Regex.Replace(text, Regex.Escape(word), "***", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant); }
            catch (RegexParseException exception) { logger.LogWarning(exception, "Unable to apply forbidden word {Word}", word); }
        }
        return text;
    }

    public void Invalidate() => cacheExpiresUtc = DateTime.MinValue;

    private async Task<IReadOnlyList<string>> GetWordsAsync(CancellationToken ct)
    {
        if (cacheExpiresUtc > DateTime.UtcNow) return cachedWords;
        await gate.WaitAsync(ct);
        try
        {
            if (cacheExpiresUtc > DateTime.UtcNow) return cachedWords;
            var records = await repository.GetAdminRecordsAsync("system.forbidden-words", 5000, ct);
            cachedWords = records.Where(x => x.Status == "Active").Select(x => x.Data.GetValueOrDefault("word", x.Name).Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).OrderByDescending(x => x.Length).ToList();
            cacheExpiresUtc = DateTime.UtcNow.AddSeconds(30);
            return cachedWords;
        }
        finally { gate.Release(); }
    }
}
