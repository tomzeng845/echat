using Microsoft.AspNetCore.Identity;

namespace EChat.Api;

public static class RuntimeMode
{
    public static bool IsEphemeralPreview(IConfiguration configuration, IHostEnvironment environment) =>
        environment.IsDevelopment()
        || (string.IsNullOrWhiteSpace(configuration["Mongo:ConnectionString"])
            && string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("MONGODB_URI")));
}

public sealed class AdminBootstrapService(
    IChatRepository repository,
    PasswordHasher<UserAccount> passwordHasher,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<AdminBootstrapService> logger)
{
    public async Task EnsureAsync(CancellationToken ct = default)
    {
        var previewMode = RuntimeMode.IsEphemeralPreview(configuration, environment);
        var account = (configuration["Admin:BootstrapAccount"]
            ?? Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_ACCOUNT")
            ?? "E_Admin").Trim().ToLowerInvariant();
        var password = configuration["Admin:BootstrapPassword"]
            ?? Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_PASSWORD")
            ?? (previewMode ? "Heibai@99" : null);

        if (string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Admin bootstrap skipped: configure ADMIN_BOOTSTRAP_PASSWORD for production");
            return;
        }

        var existing = await repository.GetUserByAccountAsync(account, ct);
        if (existing is not null)
        {
            var changed = false;
            if (existing.Role != UserRole.Admin)
            {
                existing.Role = UserRole.Admin;
                existing.Status = UserStatus.Active;
                changed = true;
                logger.LogWarning("Existing bootstrap account {Account} was promoted to Admin", account);
            }

            if (previewMode)
            {
                var passwordMatches = passwordHasher.VerifyHashedPassword(existing, existing.PasswordHash, password) != PasswordVerificationResult.Failed;
                if (!passwordMatches)
                {
                    existing.PasswordHash = passwordHasher.HashPassword(existing, password);
                    changed = true;
                    logger.LogWarning("Development bootstrap admin {Account} password was restored to the documented preview password", account);
                }
                if (existing.Status != UserStatus.Active || existing.LockoutUntilUtc is not null || existing.FailedLoginAttempts != 0)
                {
                    existing.Status = UserStatus.Active;
                    existing.LockoutUntilUtc = null;
                    existing.FailedLoginAttempts = 0;
                    changed = true;
                }
            }

            if (changed) await repository.UpdateUserAsync(existing, ct);
            return;
        }

        var admin = new UserAccount
        {
            Account = account,
            DisplayName = "E聊管理员",
            Role = UserRole.Admin,
            Status = UserStatus.Active,
            Signature = "E聊系统管理账号",
            AgreementAcceptedAtUtc = DateTime.UtcNow
        };
        admin.PasswordHash = passwordHasher.HashPassword(admin, password);
        try
        {
            await repository.AddUserAsync(admin, ct);
            logger.LogWarning("Preview bootstrap admin {Account} created; configure MongoDB and secure admin credentials before production use", account);
        }
        catch
        {
            if (await repository.GetUserByAccountAsync(account, ct) is null) throw;
            // Another instance created the same bootstrap account concurrently.
        }
    }
}
