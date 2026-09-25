using System.Text;

namespace EChat.Api;

public sealed class LoginDiagnosticLogger
{
    private readonly string[] _directories;
    private readonly long _maxBytes;
    private readonly object _gate = new();

    public LoginDiagnosticLogger(string directory, long maxBytes = 200L * 1024L * 1024L)
    {
        var commonDataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "EChat", "Logs");
        _directories = new[] { directory, commonDataDirectory }
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        _maxBytes = maxBytes;
    }

    public void Write(HttpContext context, string stage, string account, string result, string detail, UserAccount? user = null)
    {
        var line = string.Join(" | ", new[]
        {
            DateTimeOffset.UtcNow.ToString("O"),
            $"stage={stage}",
            $"account={Sanitize(account)}",
            $"result={Sanitize(result)}",
            $"detail={Sanitize(detail)}",
            $"userFound={(user is not null)}",
            $"userId={Sanitize(user?.Id ?? "")}",
            $"tenantId={Sanitize(user?.TenantId ?? "")}",
            $"userStatus={Sanitize(user?.Status.ToString() ?? "")}",
            $"role={Sanitize(user?.Role.ToString() ?? "")}",
            $"traceId={Sanitize(context.TraceIdentifier)}",
            $"path={Sanitize(context.Request.Path)}",
            $"remoteIp={Sanitize(context.Connection.RemoteIpAddress?.ToString() ?? "unknown")}"
        }) + Environment.NewLine;

        lock (_gate)
        {
            foreach (var directory in _directories)
            {
                try
                {
                    Directory.CreateDirectory(directory);
                    var path = Path.Combine(directory, "login-diagnostics.log");
                    var bytes = Encoding.UTF8.GetByteCount(line);
                    if (File.Exists(path) && new FileInfo(path).Length + bytes > _maxBytes)
                    {
                        var archive = Path.Combine(directory, $"login-diagnostics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.log");
                        File.Move(path, archive, true);
                    }
                    File.AppendAllText(path, line, Encoding.UTF8);
                    return;
                }
                catch
                {
                    // Try the common data directory if the application directory is not writable.
                }
            }
        }
    }

    private static string Sanitize(string value) => value.Replace("\r", " ").Replace("\n", " ").Replace("|", "/");
}
