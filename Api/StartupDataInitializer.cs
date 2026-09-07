namespace EChat.Api;

/// <summary>
/// Runs MongoDB indexes, seed data and administrator bootstrap after the web host has
/// started. Database outages must not prevent the Windows Service from reporting
/// SERVICE_RUNNING to the Service Control Manager.
/// </summary>
public sealed class StartupDataInitializer(
    IChatRepository repository,
    AdminBootstrapService adminBootstrap,
    ILogger<StartupDataInitializer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let Kestrel complete its startup handshake before attempting network I/O.
        await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);

        var attempt = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            attempt++;
            try
            {
                using var initializationTimeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                initializationTimeout.CancelAfter(TimeSpan.FromSeconds(30));

                logger.LogInformation("Starting database initialization attempt {Attempt}", attempt);
                await repository.EnsureSeedDataAsync(initializationTimeout.Token);
                await adminBootstrap.EnsureAsync(initializationTimeout.Token);
                logger.LogInformation("Database initialization completed successfully");
                return;
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning("Database initialization attempt {Attempt} timed out after 30 seconds; the API remains available and will retry", attempt);
            }
            catch (Exception error)
            {
                logger.LogError(error, "Database initialization attempt {Attempt} failed; the API remains available and will retry", attempt);
            }

            var delay = TimeSpan.FromSeconds(Math.Min(60, Math.Max(5, attempt * 5)));
            logger.LogInformation("Next database initialization attempt in {DelaySeconds} seconds", delay.TotalSeconds);
            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }
}
