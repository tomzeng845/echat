using EChat.Api;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EChat.Api.Tests;

public sealed class CoreTests
{
    [Fact]
    public async Task RepeatedClientMessageId_IsStoredExactlyOnce()
    {
        var repository = new InMemoryChatRepository();
        var conversation = await repository.AddConversationAsync(new Conversation
        {
            Type = ConversationType.Direct,
            Members = [new() { UserId = "u1" }, new() { UserId = "u2" }]
        });

        var results = new List<ChatMessage>();
        for (var index = 0; index < 10; index++)
            results.Add(await repository.AddMessageIdempotentlyAsync(new ChatMessage { ClientMessageId = "same-request", ConversationId = conversation.Id, SenderId = "u1", Ciphertext = "cipher", Nonce = "nonce" }));

        Assert.Single(results.Select(x => x.Id).Distinct());
        Assert.Equal(1, results[0].Sequence);
        Assert.Single(await repository.GetMessagesAsync(conversation.Id, 0, 100));
    }

    [Fact]
    public async Task ConcurrentMessages_ReceiveUniqueIncreasingSequences()
    {
        var repository = new InMemoryChatRepository();
        var conversation = await repository.AddConversationAsync(new Conversation { Type = ConversationType.Group, Members = [new() { UserId = "u1" }] });
        var tasks = Enumerable.Range(0, 30).Select(index => repository.AddMessageIdempotentlyAsync(new ChatMessage { ClientMessageId = $"m-{index}", ConversationId = conversation.Id, SenderId = "u1", Ciphertext = "cipher", Nonce = "nonce" }));
        var messages = await Task.WhenAll(tasks);
        Assert.Equal(Enumerable.Range(1, 30).Select(x => (long)x), messages.Select(x => x.Sequence).OrderBy(x => x));
    }

    [Fact]
    public void Totp_VerifiesCurrentCode_AndRejectsMalformedCode()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Admin:TotpSecret"] = "JBSWY3DPEHPK3PXP" }).Build();
        var service = new TotpService(configuration, new TestHostEnvironment());
        var now = new DateTime(2026, 9, 5, 6, 0, 0, DateTimeKind.Utc);
        Assert.True(service.Verify(service.CurrentCode(now), now));
        Assert.False(service.Verify("12AB56", now));
        Assert.False(service.Verify("000000", now));
    }

    [Fact]
    public void Totp_ProductionWithoutSecret_IsUnavailableWithoutBreakingAuthentication()
    {
        var configuration = new ConfigurationBuilder().Build();
        var environment = new TestHostEnvironment { EnvironmentName = Environments.Production };

        var service = new TotpService(configuration, environment);

        Assert.False(service.IsConfigured);
        Assert.False(service.Verify("123456"));
        Assert.Throws<InvalidOperationException>(() => service.CurrentCode());
    }

    [Fact]
    public async Task Moments_SupportMediaLikesAndComments()
    {
        var repository = new InMemoryChatRepository();
        var asset = await repository.AddMediaAssetAsync(new MediaAsset { OwnerId = "u1", Purpose = MediaPurpose.Moment, StorageKey = "photo", FileName = "photo.jpg", ContentType = "image/jpeg", Size = 12 });
        var moment = await repository.AddMomentAsync(new MomentPost { AuthorId = "u1", Text = "第一条动态", MediaAssetIds = [asset.Id] });
        await repository.UpsertMomentLikeAsync(new MomentLike { Id = $"{moment.Id}:u2", MomentId = moment.Id, UserId = "u2" });
        await repository.AddMomentCommentAsync(new MomentComment { MomentId = moment.Id, UserId = "u2", Text = "欢迎加入朋友圈" });

        var feed = await repository.GetMomentsAsync(["u1"], null, 30);
        Assert.Single(feed);
        Assert.Single(await repository.GetMediaAssetsAsync(feed[0].MediaAssetIds));
        Assert.Single(await repository.GetMomentLikesAsync([moment.Id]));
        Assert.Single(await repository.GetMomentCommentsAsync([moment.Id]));

        await repository.RemoveMomentLikeAsync(moment.Id, "u2");
        Assert.Empty(await repository.GetMomentLikesAsync([moment.Id]));
    }

    [Fact]
    public async Task QrLogin_UsesAtomicOneTimeStateTransitions()
    {
        var repository = new InMemoryChatRepository();
        var challenge = new QrLoginChallenge { ScanTokenHash = "scan", PollTokenHash = "poll", ExpiresAtUtc = DateTime.UtcNow.AddMinutes(2) };
        await repository.AddQrLoginAsync(challenge);

        var scans = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Pending, QrLoginStatus.Scanned, "u1")));
        Assert.Single(scans, x => x);
        Assert.True(await repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Scanned, QrLoginStatus.Approved, "u1"));
        var exchanges = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => repository.TryUpdateQrLoginAsync(challenge.Id, QrLoginStatus.Approved, QrLoginStatus.Consumed, "u1")));
        Assert.Single(exchanges, x => x);
    }

    [Fact]
    public async Task DeviceSessions_CanRevokeAllExceptCurrent()
    {
        var repository = new InMemoryChatRepository();
        await repository.AddSessionAsync(new RefreshSession { Id = "current", UserId = "u1", TokenHash = "a", DeviceId = "d1", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) });
        await repository.AddSessionAsync(new RefreshSession { Id = "other", UserId = "u1", TokenHash = "b", DeviceId = "d2", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) });
        await repository.RevokeSessionsAsync("u1", "current", "test");
        var active = await repository.GetSessionsAsync("u1");
        Assert.Single(active);
        Assert.Equal("current", active[0].Id);
    }

    [Fact]
    public async Task P1ReportsAndCalls_AreIdempotentAndQueryable()
    {
        var repository = new InMemoryChatRepository();
        var first = await repository.AddMomentReportAsync(new MomentReport { MomentId = "m1", ReporterId = "u2", Reason = "垃圾广告" });
        var second = await repository.AddMomentReportAsync(new MomentReport { MomentId = "m1", ReporterId = "u2", Reason = "其他" });
        Assert.Equal(first.Id, second.Id);
        Assert.Single(await repository.GetMomentReportsAsync("u2"));

        await repository.UpsertCallAsync(new CallRecord { Id = "call1", ConversationId = "c1", CallerId = "u1", ParticipantIds = ["u1", "u2"] });
        var call = await repository.GetCallAsync("call1");
        call!.Status = CallRecordStatus.Ended; call.EndedAtUtc = DateTime.UtcNow;
        await repository.UpsertCallAsync(call);
        Assert.Equal(CallRecordStatus.Ended, (await repository.GetCallsAsync("u2")).Single().Status);
    }

    [Fact]
    public async Task AdminBootstrap_IsIdempotent_Hashed_AndQueryable()
    {
        var repository = new InMemoryChatRepository();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Admin:BootstrapAccount"] = "E_Admin",
            ["Admin:BootstrapPassword"] = "Heibai@99"
        }).Build();
        var hasher = new PasswordHasher<UserAccount>();
        var service = new AdminBootstrapService(repository, hasher, configuration, new TestHostEnvironment(), NullLogger<AdminBootstrapService>.Instance);

        await service.EnsureAsync();
        await service.EnsureAsync();

        var admin = await repository.GetUserByAccountAsync("e_admin");
        Assert.NotNull(admin);
        Assert.Equal(UserRole.Admin, admin!.Role);
        Assert.NotEqual("Heibai@99", admin.PasswordHash);
        Assert.NotEqual(PasswordVerificationResult.Failed, hasher.VerifyHashedPassword(admin, admin.PasswordHash, "Heibai@99"));
        Assert.Equal(1, await repository.CountUsersAsync());

        await repository.AddAdminAuditAsync(new AdminAuditLog { AdminUserId = admin.Id, AdminAccount = admin.Account, Action = "test", TargetType = "user", TargetId = admin.Id });
        Assert.Single(await repository.GetAdminAuditsAsync(20));
    }

    [Fact]
    public async Task AdminBootstrap_DevelopmentRestoresExistingPreviewCredentials()
    {
        var repository = new InMemoryChatRepository();
        var hasher = new PasswordHasher<UserAccount>();
        var existing = new UserAccount
        {
            Account = "e_admin",
            DisplayName = "旧账号",
            Role = UserRole.User,
            Status = UserStatus.Disabled,
            LockoutUntilUtc = DateTime.UtcNow.AddHours(1),
            FailedLoginAttempts = 4
        };
        existing.PasswordHash = hasher.HashPassword(existing, "old-password");
        await repository.AddUserAsync(existing);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Admin:BootstrapAccount"] = "E_Admin",
            ["Admin:BootstrapPassword"] = "Heibai@99"
        }).Build();

        await new AdminBootstrapService(repository, hasher, configuration, new TestHostEnvironment(), NullLogger<AdminBootstrapService>.Instance).EnsureAsync();

        var restored = await repository.GetUserByAccountAsync("e_admin");
        Assert.NotNull(restored);
        Assert.Equal(UserRole.Admin, restored!.Role);
        Assert.Equal(UserStatus.Active, restored.Status);
        Assert.Null(restored.LockoutUntilUtc);
        Assert.Equal(0, restored.FailedLoginAttempts);
        Assert.NotEqual(PasswordVerificationResult.Failed, hasher.VerifyHashedPassword(restored, restored.PasswordHash, "Heibai@99"));
    }

    [Fact]
    public async Task AdminBootstrap_EphemeralProductionPreviewCreatesDocumentedAccount()
    {
        var repository = new InMemoryChatRepository();
        var configuration = new ConfigurationBuilder().Build();
        var environment = new TestHostEnvironment { EnvironmentName = Environments.Production };
        var hasher = new PasswordHasher<UserAccount>();

        Assert.True(RuntimeMode.IsEphemeralPreview(configuration, environment));
        await new AdminBootstrapService(repository, hasher, configuration, environment, NullLogger<AdminBootstrapService>.Instance).EnsureAsync();

        var admin = await repository.GetUserByAccountAsync("e_admin");
        Assert.NotNull(admin);
        Assert.NotEqual(PasswordVerificationResult.Failed, hasher.VerifyHashedPassword(admin!, admin!.PasswordHash, "Heibai@99"));
    }

    [Fact]
    public async Task AdminBootstrap_PersistentProductionRequiresExplicitPassword()
    {
        var repository = new InMemoryChatRepository();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Mongo:ConnectionString"] = "mongodb://example.invalid" }).Build();
        var environment = new TestHostEnvironment { EnvironmentName = Environments.Production };

        Assert.False(RuntimeMode.IsEphemeralPreview(configuration, environment));
        await new AdminBootstrapService(repository, new PasswordHasher<UserAccount>(), configuration, environment, NullLogger<AdminBootstrapService>.Instance).EnsureAsync();
        Assert.Null(await repository.GetUserByAccountAsync("e_admin"));
    }

    [Fact]
    public async Task AdminModules_AreSeededQueryableAndMutable()
    {
        var repository = new InMemoryChatRepository();
        await repository.EnsureSeedDataAsync();
        Assert.Equal(2, (await repository.GetAdminRecordsAsync("fund.subjects", 20)).Count);
        Assert.Single(await repository.GetAdminRecordsAsync("system.roles", 20));
        Assert.Empty(await repository.GetAdminRecordsAsync("chat.tasks", 20));
        Assert.Empty(await repository.GetAdminRecordsAsync("system.settings", 20));

        var record = await repository.UpsertAdminRecordAsync(new AdminModuleRecord { Module = "system.roles", Name = "审核员", Data = new() { ["permissions"] = "verification:review" } });
        Assert.Equal("verification:review", (await repository.GetAdminRecordAsync(record.Id))!.Data["permissions"]);
        await repository.DeleteAdminRecordAsync(record.Id);
        Assert.Null(await repository.GetAdminRecordAsync(record.Id));

        await repository.AddSessionAsync(new RefreshSession { UserId = "u1", TokenHash = "all-session", ExpiresAtUtc = DateTime.UtcNow.AddDays(1) });
        await repository.AddConversationAsync(new Conversation { Type = ConversationType.Group, Name = "后台测试群" });
        await repository.UpsertRelationAsync(new ContactRelation { Id = "u1:u2", UserId = "u1", PeerUserId = "u2" });
        Assert.Single(await repository.GetAllSessionsAsync(20));
        Assert.Single(await repository.GetAllConversationsAsync(20));
        Assert.Single(await repository.GetAllRelationsAsync(20));
    }

    [Fact]
    public void AdminSecretProtector_EncryptsAndDecryptsTotpSecret()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Admin:SecretEncryptionKey"] = "test-only-secret-protection-key"
        }).Build();
        var protector = new AdminSecretProtector(configuration);
        var secret = TotpService.GenerateSecret();
        var encrypted = protector.Protect(secret);

        Assert.Matches("^[A-Z2-7]{32}$", secret);
        Assert.DoesNotContain(secret, encrypted);
        Assert.Equal(secret, protector.Unprotect(encrypted));
    }

    [Fact]
    public void RequestMetadata_ParsesDeviceSystemAndAddress()
    {
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Request.Headers.UserAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome/121 Mobile Safari";
        context.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("127.0.0.1");

        var device = RequestMetadata.Device(context);

        Assert.Equal("Mobile", device["deviceType"]);
        Assert.Equal("Android", device["osVersion"]);
        Assert.Equal("浏览器移动设备", device["deviceModel"]);
        Assert.Equal("本机 / 开发环境", RequestMetadata.Address(RequestMetadata.ClientIp(context)));
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "EChat.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
