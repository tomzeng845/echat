using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/rtc")]
public sealed class RtcController(IConfiguration configuration) : ControllerBase
{
    [HttpGet("config")]
    public IActionResult Config()
    {
        var servers = new List<object> { new { urls = new[] { configuration["Rtc:StunUrl"] ?? "stun:stun.l.google.com:19302" } } };
        var turnUrls = (configuration["Rtc:TurnUrls"] ?? Environment.GetEnvironmentVariable("TURN_URLS"))?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];
        var turnSecret = configuration["Rtc:TurnSecret"] ?? Environment.GetEnvironmentVariable("TURN_SECRET");
        if (turnUrls.Length > 0 && !string.IsNullOrWhiteSpace(turnSecret))
        {
            var expires = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds();
            var username = $"{expires}:{User.UserId()}";
            using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(turnSecret));
            var credential = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(username)));
            servers.Add(new { urls = turnUrls, username, credential });
        }
        var sfuUrl = configuration["Rtc:SfuUrl"] ?? Environment.GetEnvironmentVariable("SFU_URL");
        return Ok(new { iceServers = servers, mode = string.IsNullOrWhiteSpace(sfuUrl) ? "p2p" : "sfu-ready", turnConfigured = turnUrls.Length > 0 && !string.IsNullOrWhiteSpace(turnSecret), sfuConfigured = !string.IsNullOrWhiteSpace(sfuUrl), maxP2pParticipants = 4 });
    }
}
