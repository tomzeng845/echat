namespace EChat.Api;

public sealed record CurfewSettings(bool Enabled, string StartTime, string EndTime, bool BlockRegistration, bool BlockLogin, bool BlockAddFriend, bool BlockGroupMessages, bool BlockDirectMessages, bool BlockCreateGroup, bool BlockOtherOperations);

public sealed class CurfewService(IChatRepository repository)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private CurfewSettings? cached;
    private DateTime cacheExpiresUtc = DateTime.MinValue;

    public async Task<CurfewSettings> GetAsync(CancellationToken ct = default)
    {
        if (cached is not null && cacheExpiresUtc > DateTime.UtcNow) return cached;
        await gate.WaitAsync(ct);
        try
        {
            if (cached is not null && cacheExpiresUtc > DateTime.UtcNow) return cached;
            var record = await repository.GetAdminRecordAsync("config:curfew", ct);
            cached = Parse(record);
            cacheExpiresUtc = DateTime.UtcNow.AddSeconds(10);
            return cached;
        }
        finally { gate.Release(); }
    }

    public async Task<bool> IsBlockedAsync(string operation, CancellationToken ct = default)
    {
        var settings = await GetAsync(ct);
        if (!settings.Enabled || !IsWithinWindow(settings.StartTime, settings.EndTime, DateTime.Now.TimeOfDay)) return false;
        return operation switch
        {
            "register" => settings.BlockRegistration,
            "login" => settings.BlockLogin,
            "add-friend" => settings.BlockAddFriend,
            "group-message" => settings.BlockGroupMessages,
            "direct-message" => settings.BlockDirectMessages,
            "create-group" => settings.BlockCreateGroup,
            _ => settings.BlockOtherOperations
        };
    }

    public void Invalidate() { cacheExpiresUtc = DateTime.MinValue; }

    private static CurfewSettings Parse(AdminModuleRecord? record)
    {
        if (record is null) return new(false, "00:00", "08:00", false, false, false, false, false, false, false);
        var d = record.Data;
        bool Bool(string key) => string.Equals(d.GetValueOrDefault(key), "true", StringComparison.OrdinalIgnoreCase);
        return new(Bool("enabled"), d.GetValueOrDefault("startTime", "00:00"), d.GetValueOrDefault("endTime", "08:00"), Bool("blockRegistration"), Bool("blockLogin"), Bool("blockAddFriend"), Bool("blockGroupMessages"), Bool("blockDirectMessages"), Bool("blockCreateGroup"), Bool("blockOtherOperations"));
    }

    private static bool IsWithinWindow(string start, string end, TimeSpan now)
    {
        if (!TimeSpan.TryParse(start, out var from) || !TimeSpan.TryParse(end, out var to)) return false;
        return from <= to ? now >= from && now < to : now >= from || now < to;
    }
}
