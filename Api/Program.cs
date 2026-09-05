using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using EChat.Api;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);
var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var platformPort) ? platformPort : 2099;
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers().AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSignalR().AddJsonProtocol(options => options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<PasswordHasher<UserAccount>>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<TotpService>();
builder.Services.AddSingleton<AdminSecretProtector>();
builder.Services.AddSingleton<SessionService>();
builder.Services.AddSingleton<AdminBootstrapService>();
builder.Services.AddHttpClient("media-storage", client => client.Timeout = TimeSpan.FromMinutes(3));
builder.Services.AddSingleton<IMediaStorage, MediaStorage>();

var mongoConfigured = !string.IsNullOrWhiteSpace(builder.Configuration["Mongo:ConnectionString"]) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("MONGODB_URI"));
if (mongoConfigured) builder.Services.AddSingleton<IChatRepository, MongoChatRepository>();
else builder.Services.AddSingleton<IChatRepository, InMemoryChatRepository>();

var tokenService = new TokenService(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = tokenService.ValidationParameters();
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            if (context.HttpContext.Request.Path.StartsWithSegments("/hubs/chat"))
                context.Token = context.Request.Query["access_token"];
            return Task.CompletedTask;
        },
        OnTokenValidated = async context =>
        {
            if (context.Principal?.FindFirst("scope")?.Value != "app") return;
            var sessionId = context.Principal.SessionId();
            if (string.IsNullOrWhiteSpace(sessionId)) return;
            var repository = context.HttpContext.RequestServices.GetRequiredService<IChatRepository>();
            var active = await repository.GetSessionsAsync(context.Principal.UserId(), context.HttpContext.RequestAborted);
            var user = await repository.GetUserByIdAsync(context.Principal.UserId(), context.HttpContext.RequestAborted);
            if (!active.Any(x => x.Id == sessionId) || user is null || user.Status != UserStatus.Active || user.AccountLocked || user.LoginLocked || user.CancellationEnabled) context.Fail("SESSION_REVOKED");
        }
    };
});
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.AllowAnyHeader().AllowAnyMethod().SetIsOriginAllowed(_ => builder.Environment.IsDevelopment()).AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetSlidingWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new SlidingWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 4, QueueLimit = 0 }));
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 240, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();
await app.Services.GetRequiredService<IChatRepository>().EnsureSeedDataAsync();
await app.Services.GetRequiredService<AdminBootstrapService>().EnsureAsync();

app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiException").LogError(error, "Unhandled API error for {Method} {Path}", context.Request.Method, context.Request.Path);
    try
    {
        await context.RequestServices.GetRequiredService<IChatRepository>().UpsertAdminRecordAsync(new AdminModuleRecord
        {
            Module = "system.error-logs", Name = error?.GetType().Name ?? "UnhandledError", Status = "Open",
            Data = new Dictionary<string, string>(RequestMetadata.Device(context))
            {
                ["method"] = context.Request.Method,
                ["path"] = context.Request.Path,
                ["message"] = error?.Message ?? "未知错误",
                ["traceId"] = context.TraceIdentifier,
                ["userId"] = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "",
                ["ip"] = RequestMetadata.ClientIp(context),
                ["address"] = RequestMetadata.Address(RequestMetadata.ClientIp(context))
            }
        }, context.RequestAborted);
    }
    catch { /* the primary exception response must still be returned */ }
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/json; charset=utf-8";
    await context.Response.WriteAsJsonAsync(new { success = false, error = "服务器暂时无法完成请求", traceId = context.TraceIdentifier });
}));

app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss: https:; media-src 'self' blob:; frame-ancestors 'none';";
    await next();
});
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = ctx.File.Name == "index.html" ? "no-cache" : "public,max-age=31536000,immutable" });
app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");
app.MapGet("/api/health", (IConfiguration configuration, IHostEnvironment environment) => Results.Ok(new
{
    name = "E聊 API",
    version = "0.7.0",
    status = "healthy",
    previewAdminEnabled = RuntimeMode.IsEphemeralPreview(configuration, environment),
    utcNow = DateTime.UtcNow
}));
app.MapFallbackToFile("index.html");

await app.StartAsync();
Console.WriteLine($"E聊 development service ready, port {port}");
await app.WaitForShutdownAsync();

public partial class Program { }
