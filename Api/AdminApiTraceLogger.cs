using System.Diagnostics;
using System.Text;

namespace EChat.Api;

public sealed class AdminApiTraceLogger
{
    private readonly string _directory;
    private readonly long _maxBytes;
    private readonly object _gate = new();

    public AdminApiTraceLogger(string directory, long maxBytes = 200L * 1024L * 1024L)
    {
        _directory = directory;
        _maxBytes = maxBytes;
        Directory.CreateDirectory(_directory);
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
            try
            {
                Directory.CreateDirectory(_directory);
                var path = Path.Combine(_directory, "admin-api-trace.log");
                if (File.Exists(path) && new FileInfo(path).Length + Encoding.UTF8.GetByteCount(line) > _maxBytes)
                {
                    var archive = Path.Combine(_directory, $"admin-api-trace-{DateTime.UtcNow:yyyyMMdd-HHmmss}.log");
                    File.Move(path, archive, true);
                }
                File.AppendAllText(path, line, Encoding.UTF8);
            }
            catch (Exception writeError)
            {
                Console.Error.WriteLine($"Admin API trace write failed: {writeError.Message}");
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
