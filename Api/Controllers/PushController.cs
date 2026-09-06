using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/push")]
public sealed class PushController(IChatRepository repository, PushNotificationService push) : ControllerBase
{
    private static readonly Regex SafeIdentifier = new("^[A-Za-z0-9._:-]{8,256}$", RegexOptions.Compiled);

    [HttpGet("status")]
    public async Task<ActionResult> Status(CancellationToken ct)
    {
        var devices = await repository.GetPushDevicesAsync([User.UserId()], ct);
        return Ok(new
        {
            enabled = push.Enabled,
            provider = push.Provider,
            androidEnabled = push.AndroidEnabled,
            iosEnabled = push.IosEnabled,
            registeredDevices = devices.Count,
            devices = devices.Select(View).ToList()
        });
    }

    [HttpPost("devices")]
    public async Task<ActionResult<PushDeviceView>> Register(RegisterPushDeviceRequest request, CancellationToken ct)
    {
        var deviceId = request.DeviceId.Trim();
        var token = request.Token.Trim();
        if (!SafeIdentifier.IsMatch(deviceId) || token.Length is < 32 or > 4096)
            return BadRequest(new { error = "推送设备信息无效" });
        if (!PushPlatforms.IsSupported(request.Platform))
            return BadRequest(new { error = "当前支持 Android、iOS 和 iOS VoIP 推送设备" });

        var device = await repository.UpsertPushDeviceAsync(new PushDevice
        {
            UserId = User.UserId(),
            DeviceId = deviceId,
            Token = token,
            Platform = PushPlatforms.Normalize(request.Platform),
            AppVersion = request.AppVersion.Trim()[..Math.Min(request.AppVersion.Trim().Length, 40)]
        }, ct);
        return Ok(View(device));
    }

    [HttpDelete("devices/{deviceId}")]
    public async Task<ActionResult> Disable(string deviceId, CancellationToken ct)
    {
        if (!SafeIdentifier.IsMatch(deviceId)) return BadRequest(new { error = "设备编号无效" });
        await repository.DisablePushDeviceAsync(User.UserId(), deviceId, ct);
        return NoContent();
    }

    [HttpPost("test")]
    public async Task<ActionResult> Test(CancellationToken ct)
    {
        if (!push.Enabled) return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "推送服务端凭据尚未配置" });
        await push.SendTestAsync(User.UserId(), ct);
        return Accepted(new { queued = true });
    }

    private static PushDeviceView View(PushDevice device) =>
        new(device.DeviceId, device.Platform, device.AppVersion, device.LastSeenAtUtc, device.Enabled);
}
