using Microsoft.AspNetCore.Identity;

namespace EChat.Api;

public sealed class AdminBootstrapService(
    IChatRepository repository,
    PasswordHasher<UserAccount> passwordHasher,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<AdminBootstrapService> logger)
{
    public async Task EnsureAsync(CancellationToken ct = default)
    {
        var account = (configuration["Admin:BootstrapAccount"]
            ?? Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_ACCOUNT")
            ?? "E_Admin").Trim().ToLowerInvariant();
        var password = configuration["Admin:BootstrapPassword"]
            ?? Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_PASSWORD")
            ?? (environment.IsDevelopment() ? "Heibai@99" : null);

        if (string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Admin bootstrap skipped: configure ADMIN_BOOTSTRAP_PASSWORD for production");
            return;
        }

        var existing = await repository.GetUserByAccountAsync(account, ct);
        if (existing is not null)
        {
            if (existing.Role != UserRole.Admin)
            {
                existing.Role = UserRole.Admin;
                existing.Status = UserStatus.Active;
                await repository.UpdateUserAsync(existing, ct);
                logger.LogWarning("Existing bootstrap account {Account} was promoted to Admin", account);
            }
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
            logger.LogWarning("Development bootstrap admin {Account} created; change the password before production use", account);
        }
        catch
        {
            if (await repository.GetUserByAccountAsync(account, ct) is null) throw;
            // Another instance created the same bootstrap account concurrently.
        }
    }
}
