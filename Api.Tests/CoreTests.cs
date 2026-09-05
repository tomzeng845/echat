using EChat.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
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

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "EChat.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
