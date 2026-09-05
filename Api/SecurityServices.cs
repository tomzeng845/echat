using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace EChat.Api;

public sealed class TokenService(IConfiguration configuration)
{
    private readonly string _issuer = configuration["Jwt:Issuer"] ?? "EChat";
    private readonly string _audience = configuration["Jwt:Audience"] ?? "EChat.Client";
    private readonly byte[] _key = SHA256.HashData(Encoding.UTF8.GetBytes(configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_SECRET") ?? "development-only-echat-signing-key-change-me-2026"));

    public (string token, DateTime expires) CreateAccessToken(UserAccount user, TimeSpan? lifetime = null, string scope = "app")
    {
        var expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromMinutes(15));
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id), new Claim(JwtRegisteredClaimNames.UniqueName, user.Account),
            new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim(ClaimTypes.Role, user.Role.ToString()), new Claim("scope", scope), new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };
        var credentials = new SigningCredentials(new SymmetricSecurityKey(_key), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(_issuer, _audience, claims, expires: expires, signingCredentials: credentials);
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    public ClaimsPrincipal? ValidateToken(string token, string requiredScope)
    {
        try
        {
            var principal = new JwtSecurityTokenHandler().ValidateToken(token, ValidationParameters(), out _);
            return principal.FindFirstValue("scope") == requiredScope ? principal : null;
        }
        catch { return null; }
    }

    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(_key),
        ValidateIssuer = true, ValidIssuer = _issuer, ValidateAudience = true, ValidAudience = _audience,
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), NameClaimType = ClaimTypes.Name, RoleClaimType = ClaimTypes.Role
    };

    public static (string raw, string hash) CreateRefreshToken()
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        return (raw, Hash(raw));
    }

    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

public sealed class TotpService(IConfiguration configuration, IHostEnvironment environment)
{
    private readonly string? _secret = configuration["Admin:TotpSecret"]
        ?? Environment.GetEnvironmentVariable("ADMIN_TOTP_SECRET")
        ?? (environment.IsDevelopment() ? "JBSWY3DPEHPK3PXP" : null);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_secret);

    public bool Verify(string code, DateTime? nowUtc = null)
    {
        if (!IsConfigured) return false;
        if (string.IsNullOrWhiteSpace(code) || code.Length != 6 || !code.All(char.IsDigit)) return false;
        var counter = new DateTimeOffset(nowUtc ?? DateTime.UtcNow).ToUnixTimeSeconds() / 30;
        for (var drift = -1; drift <= 1; drift++) if (Compute(counter + drift) == code) return true;
        return false;
    }

    public string CurrentCode(DateTime? nowUtc = null) => IsConfigured
        ? Compute(new DateTimeOffset(nowUtc ?? DateTime.UtcNow).ToUnixTimeSeconds() / 30)
        : throw new InvalidOperationException("ADMIN_TOTP_SECRET is not configured");

    private string Compute(long counter)
    {
        Span<byte> input = stackalloc byte[8];
        for (var i = 7; i >= 0; i--) { input[i] = (byte)(counter & 0xff); counter >>= 8; }
        using var hmac = new HMACSHA1(Base32Decode(_secret!));
        var hash = hmac.ComputeHash(input.ToArray());
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
        return (binary % 1_000_000).ToString("D6");
    }

    private static byte[] Base32Decode(string value)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new List<byte>(); var buffer = 0; var bits = 0;
        foreach (var c in value.ToUpperInvariant().Where(c => c != '=' && !char.IsWhiteSpace(c)))
        {
            var index = alphabet.IndexOf(c); if (index < 0) throw new FormatException("Invalid TOTP secret");
            buffer = (buffer << 5) | index; bits += 5;
            if (bits >= 8) { bits -= 8; output.Add((byte)(buffer >> bits)); buffer &= (1 << bits) - 1; }
        }
        return output.ToArray();
    }
}

public static class ClaimsExtensions
{
    public static string UserId(this ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new UnauthorizedAccessException();
}
