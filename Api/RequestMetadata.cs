using System.Net;
using System.Text.RegularExpressions;

namespace EChat.Api;

public static class RequestMetadata
{
    public static string ClientIp(HttpContext context)
    {
        var forwarded = context.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',').FirstOrDefault()?.Trim();
        var ip = string.IsNullOrWhiteSpace(forwarded)
            ? context.Connection.RemoteIpAddress?.ToString() ?? "unknown"
            : forwarded;
        return NormalizeIp(ip);
    }

    public static string Address(string ip)
    {
        ip = NormalizeIp(ip);
        if (string.IsNullOrWhiteSpace(ip) || ip == "unknown") return "未知地址";
        if (!IPAddress.TryParse(ip, out var parsed)) return "未知地址";
        if (IPAddress.IsLoopback(parsed)) return "本机 / 开发环境";
        if (parsed.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            var bytes = parsed.GetAddressBytes();
            if (bytes[0] == 10 || bytes[0] == 127 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31))
                return "内网地址";
        }
        return $"公网 IP · {ip}";
    }

    private static string NormalizeIp(string ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return "unknown";
        if (!IPAddress.TryParse(ip.Trim(), out var parsed)) return ip.Trim();
        return parsed.IsIPv4MappedToIPv6 ? parsed.MapToIPv4().ToString() : parsed.ToString();
    }

    public static Dictionary<string, string> Device(HttpContext context)
    {
        var ua = context.Request.Headers.UserAgent.ToString();
        var deviceType = Regex.IsMatch(ua, "Mobile|Android|iPhone|iPad", RegexOptions.IgnoreCase) ? "Mobile" : "Desktop";
        var osVersion = ua.Contains("Windows", StringComparison.OrdinalIgnoreCase) ? "Windows"
            : ua.Contains("Android", StringComparison.OrdinalIgnoreCase) ? "Android"
            : ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) ? "iOS/iPadOS"
            : ua.Contains("Mac OS", StringComparison.OrdinalIgnoreCase) ? "macOS"
            : ua.Contains("Linux", StringComparison.OrdinalIgnoreCase) ? "Linux" : "Unknown";
        var model = deviceType == "Mobile" ? "浏览器移动设备" : "浏览器桌面设备";
        var appVersion = context.Request.Headers["X-EChat-Version"].FirstOrDefault() ?? "Web";
        return new Dictionary<string, string>
        {
            ["deviceType"] = deviceType,
            ["deviceModel"] = model,
            ["osVersion"] = osVersion,
            ["appVersion"] = appVersion[..Math.Min(appVersion.Length, 40)],
            ["userAgent"] = ua[..Math.Min(ua.Length, 300)]
        };
    }
}
