using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace EChat.Api.Controllers;

[ApiController, Authorize]
[Route("api/moments")]
public sealed class MomentsController(IChatRepository repository, IHubContext<ChatHub> hub) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MomentView>>> Feed([FromQuery] DateTime? before, [FromQuery] int limit = 30, CancellationToken ct = default)
    {
        var userId = User.UserId();
        var relations = await repository.GetRelationsAsync(userId, ct);
        var authors = relations.Where(x => x.Status == RelationStatus.Friend).Select(x => x.PeerUserId).Append(userId).Distinct().ToList();
        var moments = await repository.GetMomentsAsync(authors, before, Math.Clamp(limit, 1, 50), ct);
        return Ok(await BuildViewsAsync(moments, userId, ct));
    }

    [HttpPost]
    public async Task<ActionResult<MomentView>> Create(CreateMomentRequest request, CancellationToken ct)
    {
        var text = request.Text?.Trim() ?? "";
        var mediaIds = request.MediaAssetIds?.Distinct().Take(10).ToList() ?? [];
        if (text.Length > 2000 || (text.Length == 0 && mediaIds.Count == 0) || mediaIds.Count > 9) return BadRequest(new { error = "动态内容为空、过长或图片超过 9 张" });
        var media = await repository.GetMediaAssetsAsync(mediaIds, ct);
        if (media.Count != mediaIds.Count || media.Any(x => x.OwnerId != User.UserId() || x.Purpose != MediaPurpose.Moment)) return BadRequest(new { error = "动态媒体无效" });
        var moment = await repository.AddMomentAsync(new MomentPost { AuthorId = User.UserId(), Text = text, MediaAssetIds = mediaIds }, ct);
        var audience = (await repository.GetRelationsAsync(User.UserId(), ct)).Where(x => x.Status == RelationStatus.Friend).Select(x => x.PeerUserId).Append(User.UserId());
        await hub.Clients.Users(audience).SendAsync("moment.updated", new { momentId = moment.Id, action = "created" }, ct);
        return Ok((await BuildViewsAsync([moment], User.UserId(), ct))[0]);
    }

    [HttpPost("{id}/like")]
    public async Task<ActionResult> Like(string id, CancellationToken ct)
    {
        var moment = await VisibleMomentAsync(id, ct); if (moment is null) return NotFound();
        await repository.UpsertMomentLikeAsync(new MomentLike { Id = $"{id}:{User.UserId()}", MomentId = id, UserId = User.UserId() }, ct);
        await NotifyAudienceAsync(moment, "liked", ct);
        return NoContent();
    }

    [HttpDelete("{id}/like")]
    public async Task<ActionResult> Unlike(string id, CancellationToken ct)
    {
        var moment = await VisibleMomentAsync(id, ct); if (moment is null) return NotFound();
        await repository.RemoveMomentLikeAsync(id, User.UserId(), ct);
        await NotifyAudienceAsync(moment, "unliked", ct);
        return NoContent();
    }

    [HttpPost("{id}/comments")]
    public async Task<ActionResult<MomentCommentView>> Comment(string id, AddMomentCommentRequest request, CancellationToken ct)
    {
        var moment = await VisibleMomentAsync(id, ct); if (moment is null) return NotFound();
        var text = request.Text?.Trim() ?? "";
        if (text.Length is < 1 or > 500) return BadRequest(new { error = "评论长度必须为 1–500 字" });
        var comment = await repository.AddMomentCommentAsync(new MomentComment { MomentId = id, UserId = User.UserId(), Text = text }, ct);
        await NotifyAudienceAsync(moment, "commented", ct);
        var user = await repository.GetUserByIdAsync(User.UserId(), ct) ?? throw new InvalidOperationException("USER_NOT_FOUND");
        return Ok(new MomentCommentView(comment.Id, user.Id, user.DisplayName, user.AvatarUrl, comment.Text, comment.CreatedAtUtc));
    }

    [HttpDelete("{id}/comments/{commentId}")]
    public async Task<ActionResult> DeleteComment(string id, string commentId, CancellationToken ct)
    {
        var moment = await VisibleMomentAsync(id, ct); if (moment is null) return NotFound();
        var comment = await repository.GetMomentCommentAsync(commentId, ct);
        if (comment is null || comment.MomentId != id || (comment.UserId != User.UserId() && moment.AuthorId != User.UserId())) return Forbid();
        comment.DeletedAtUtc = DateTime.UtcNow;
        await repository.UpdateMomentCommentAsync(comment, ct);
        await NotifyAudienceAsync(moment, "comment-deleted", ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(string id, CancellationToken ct)
    {
        var moment = await repository.GetMomentAsync(id, ct);
        if (moment is null || moment.AuthorId != User.UserId()) return NotFound();
        moment.DeletedAtUtc = DateTime.UtcNow;
        await repository.UpdateMomentAsync(moment, ct);
        await NotifyAudienceAsync(moment, "deleted", ct);
        return NoContent();
    }

    private async Task<MomentPost?> VisibleMomentAsync(string id, CancellationToken ct)
    {
        var moment = await repository.GetMomentAsync(id, ct);
        if (moment is null || moment.DeletedAtUtc is not null) return null;
        if (moment.AuthorId == User.UserId()) return moment;
        return (await repository.GetRelationAsync(User.UserId(), moment.AuthorId, ct))?.Status == RelationStatus.Friend ? moment : null;
    }

    private async Task NotifyAudienceAsync(MomentPost moment, string action, CancellationToken ct)
    {
        var audience = (await repository.GetRelationsAsync(moment.AuthorId, ct)).Where(x => x.Status == RelationStatus.Friend).Select(x => x.PeerUserId).Append(moment.AuthorId);
        await hub.Clients.Users(audience).SendAsync("moment.updated", new { momentId = moment.Id, action }, ct);
    }

    private async Task<List<MomentView>> BuildViewsAsync(IReadOnlyList<MomentPost> moments, string viewerId, CancellationToken ct)
    {
        var ids = moments.Select(x => x.Id).ToList();
        var likes = await repository.GetMomentLikesAsync(ids, ct);
        var comments = await repository.GetMomentCommentsAsync(ids, ct);
        var media = await repository.GetMediaAssetsAsync(moments.SelectMany(x => x.MediaAssetIds).Distinct(), ct);
        var userIds = moments.Select(x => x.AuthorId).Concat(likes.Select(x => x.UserId)).Concat(comments.Select(x => x.UserId)).Distinct();
        var users = new Dictionary<string, UserAccount>();
        foreach (var id in userIds)
        {
            var user = await repository.GetUserByIdAsync(id, ct);
            if (user is not null) users[id] = user;
        }
        return moments.Where(x => users.ContainsKey(x.AuthorId)).Select(moment =>
        {
            var author = users[moment.AuthorId];
            var momentLikes = likes.Where(x => x.MomentId == moment.Id && users.ContainsKey(x.UserId)).Select(x => new MomentLikeView(x.UserId, users[x.UserId].DisplayName, users[x.UserId].AvatarUrl, x.CreatedAtUtc)).ToList();
            var momentComments = comments.Where(x => x.MomentId == moment.Id && users.ContainsKey(x.UserId)).Select(x => new MomentCommentView(x.Id, x.UserId, users[x.UserId].DisplayName, users[x.UserId].AvatarUrl, x.Text, x.CreatedAtUtc)).ToList();
            var momentMedia = moment.MediaAssetIds.Select(id => media.FirstOrDefault(x => x.Id == id)).Where(x => x is not null).Select(x => new MediaAssetView(x!.Id, x.FileName, x.ContentType, x.Size, x.Purpose, $"/api/media/{x.Id}/content")).ToList();
            return new MomentView(moment.Id, new UserView(author.Id, author.Account, author.DisplayName, author.AvatarUrl, author.Signature, author.Region, author.Role, author.Status), moment.Text, momentMedia, momentLikes, momentComments, momentLikes.Any(x => x.UserId == viewerId), moment.CreatedAtUtc);
        }).ToList();
    }
}
