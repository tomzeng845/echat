using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/p1")]
public sealed class CapabilitiesController(IConfiguration configuration, PushNotificationService pushNotifications) : ControllerBase
{
    [HttpGet("capabilities")]
    public IActionResult Get()
    {
        var turn = !string.IsNullOrWhiteSpace(configuration["Rtc:TurnUrls"] ?? Environment.GetEnvironmentVariable("TURN_URLS")) && !string.IsNullOrWhiteSpace(configuration["Rtc:TurnSecret"] ?? Environment.GetEnvironmentVariable("TURN_SECRET"));
        var sfu = !string.IsNullOrWhiteSpace(configuration["Rtc:SfuUrl"] ?? Environment.GetEnvironmentVariable("SFU_URL"));
        return Ok(new
        {
            qrLogin = "ready",
            qrContacts = "ready",
            deviceSessions = "ready",
            callHistory = "ready",
            momentPrivacy = "ready",
            momentReports = "ready",
            mediaProcessing = "metadata-only",
            push = pushNotifications.Enabled ? "android-fcm-configured" : "android-fcm-ready-needs-credentials",
            turn = turn ? "configured" : "stun-only",
            sfu = sfu ? "configured" : "p2p-up-to-4"
        });
    }
}
