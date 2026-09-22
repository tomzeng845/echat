using System.Diagnostics;
using System.Text;

namespace EChat.Api;

public sealed class AdminApiTraceLogger
{
    private readonly string[] _directories;
    private readonly long _maxBytes;
    private readonly object _gate = new();

    public AdminApiTraceLogger(string directory, long maxBytes = 200L * 1024L * 1024L)
    {
        var commonDataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "EChat", "Logs");
        _directories = new[] { directory, commonDataDirectory }
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        _maxBytes = maxBytes;
        foreach (var target in _directories)
        {
            try
            {
                Directory.CreateDirectory(target);
                File.AppendAllText(Path.Combine(target, "api-startup.log"), $"{DateTimeOffset.UtcNow:O} API logger initialized; base={AppContext.BaseDirectory}{Environment.NewLine}", Encoding.UTF8);
                break;
            }
            catch
            {
                // Try the next writable directory.
            }
        }
    }

    public void Write(HttpContext context, long elapsedMs, Exception? error = null)
    {
        var request = context.Request;
        var response = context.Response;
        var forwardedFor = request.Headers["X-Forwarded-For"].FirstOrDefault() ?? "";
        var remoteIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var authorization = request.Headers.Authorization.ToString();
        var hasBearer = authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
        var line = string.Join(" | ", new[]
        {
            DateTimeOffset.UtcNow.ToString("O"),
            $"method={request.Method}",
            $"path={request.Path}{request.QueryString}",
            $"status={response.StatusCode}",
            $"contentType={response.ContentType ?? ""}",
            $"elapsedMs={elapsedMs}",
            $"remoteIp={remoteIp}",
            $"forwardedFor={forwardedFor}",
            $"host={request.Host}",
            $"scheme={request.Scheme}",
            $"hasBearer={hasBearer}",
            $"traceId={context.TraceIdentifier}",
            $"endpoint={context.GetEndpoint()?.DisplayName ?? "none"}",
            $"error={error?.GetType().Name ?? ""}:{error?.Message ?? ""}"
        }) + Environment.NewLine;

        lock (_gate)
        {
            foreach (var directory in _directories)
            {
                try
                {
                    Directory.CreateDirectory(directory);
                    var path = Path.Combine(directory, "admin-api-trace.log");
                    if (File.Exists(path) && new FileInfo(path).Length + Encoding.UTF8.GetByteCount(line) > _maxBytes)
                    {
                        var archive = Path.Combine(directory, $"admin-api-trace-{DateTime.UtcNow:yyyyMMdd-HHmmss}.log");
                        File.Move(path, archive, true);
                    }
                    File.AppendAllText(path, line, Encoding.UTF8);
                    return;
                }
                catch (Exception writeError)
                {
                    Console.Error.WriteLine($"Admin API trace write failed at {directory}: {writeError.Message}");
                }
            }
        }
    }
}

public sealed class AdminApiTraceMiddleware(RequestDelegate next, AdminApiTraceLogger trace)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var started = Stopwatch.GetTimestamp();
        Exception? error = null;
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            error = exception;
            throw;
        }
        finally
        {
            var elapsedMs = (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            trace.Write(context, elapsedMs, error);
        }
    }
}

public static class AdminApiTraceMiddlewareExtensions
{
    public static IApplicationBuilder UseAdminApiTrace(this IApplicationBuilder app)
        => app.UseMiddleware<AdminApiTraceMiddleware>();
}
