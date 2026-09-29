using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.WhatsApp;

[ApiController, Authorize, Route("api/whatsapp")]
public class WhatsAppController(WhatsAppClient client, CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet("status")] public Task<JsonElement> Status() => client.Send(current.Id, HttpMethod.Get, "status");
    [HttpPost("connect")] public Task<JsonElement> Connect() => client.Send(current.Id, HttpMethod.Post, "connect");
    [HttpPost("disconnect")] public Task<JsonElement> Disconnect() => client.Send(current.Id, HttpMethod.Post, "disconnect");
    [HttpGet("chats")]
    public async Task<object> Chats(int? userId)
    {
        var historyUser = await HistoryUser(userId);
        var chats = await client.Send(historyUser, HttpMethod.Get, "chats");
        var leadNames = await current.Scope(db.Leads.AsNoTracking())
            .Where(x => x.ChatUserId == historyUser && x.ChatId != null)
            .ToDictionaryAsync(x => x.ChatId!, x => x.Name);
        return chats.EnumerateArray().Select(chat =>
        {
            var id = chat.GetProperty("id").GetString()!;
            var whatsappName = chat.GetProperty("name").GetString();
            var number = id.Split('@')[0];
            return new
            {
                id,
                name = leadNames.GetValueOrDefault(id) ??
                    (!string.IsNullOrWhiteSpace(whatsappName) && !whatsappName.Contains('@') ? whatsappName : number),
                lastText = chat.GetProperty("lastText").GetString(),
                updatedAt = chat.GetProperty("updatedAt").GetInt64(),
                archived = chat.GetProperty("archived").GetInt32() != 0,
                pinnedAt = chat.GetProperty("pinnedAt").GetInt64()
            };
        });
    }
    [HttpGet("profile-picture")]
    public async Task<IActionResult> ProfilePicture([Required] string chatId, int? userId)
    {
        var file = await client.Download(await HistoryUser(userId), $"profile-picture?chatId={Uri.EscapeDataString(chatId)}");
        Response.Headers.CacheControl = "private, max-age=3600";
        return File(file.Data, file.ContentType);
    }
    [HttpGet("messages")]
    public async Task<JsonElement> Messages(string chatId, int? userId, long? before, string? beforeId) => await client.Send(await HistoryUser(userId), HttpMethod.Get,
        $"messages?chatId={Uri.EscapeDataString(chatId)}{(before.HasValue ? "&before=" + before : "")}{(beforeId != null ? "&beforeId=" + Uri.EscapeDataString(beforeId) : "")}");
    [HttpGet("media/{id}")]
    public async Task<JsonElement> Media(string id, int? userId) => await client.Send(await HistoryUser(userId), HttpMethod.Get, $"media/{Uri.EscapeDataString(id)}");
    [HttpPost("send"), RequestSizeLimit(24_000_000)]
    public async Task<JsonElement> Send(SendRequest r)
    {
        await EnsureCanMessage(r.ChatId);
        return await client.Send(current.Id, HttpMethod.Post, "send", r);
    }
    [HttpPut("messages/{id}")]
    public async Task<JsonElement> Edit(string id, EditRequest r)
    {
        await EnsureCanMessage(r.ChatId);
        return await client.Send(current.Id, HttpMethod.Put, $"messages/{Uri.EscapeDataString(id)}", r);
    }
    [HttpPost("messages/{id}/react")]
    public async Task<JsonElement> React(string id, ReactionRequest r)
    {
        await EnsureCanMessage(r.ChatId);
        return await client.Send(current.Id, HttpMethod.Post, $"messages/{Uri.EscapeDataString(id)}/react", r);
    }
    [HttpPost("messages/{id}/forward")]
    public async Task<JsonElement> Forward(string id, ForwardRequest r)
    {
        await EnsureCanMessage(r.ChatId);
        return await client.Send(current.Id, HttpMethod.Post, $"messages/{Uri.EscapeDataString(id)}/forward", r);
    }
    [HttpDelete("messages/{id}")]
    public async Task<JsonElement> DeleteMessage(string id, DeleteMessageRequest r)
    {
        await EnsureCanMessage(r.ChatId);
        return await client.Send(current.Id, HttpMethod.Delete, $"messages/{Uri.EscapeDataString(id)}", r);
    }
    [HttpGet("campaigns")]
    public Task<JsonElement> Campaigns([Range(1, int.MaxValue)] int page = 1, [Range(1, 50)] int pageSize = 6) =>
        client.Send(current.Id, HttpMethod.Get, $"campaigns?page={page}&pageSize={pageSize}");
    [HttpGet("campaigns/{id}/deliveries")]
    public Task<JsonElement> CampaignDeliveries(string id, [Range(1, int.MaxValue)] int page = 1,
        [Range(1, 100)] int pageSize = 10, string? status = null) =>
        client.Send(current.Id, HttpMethod.Get,
            $"campaigns/{Uri.EscapeDataString(id)}/deliveries?page={page}&pageSize={pageSize}{(status != null ? "&status=" + Uri.EscapeDataString(status) : "")}");
    [HttpPost("campaigns"), RequestSizeLimit(24_000_000)]
    public async Task<JsonElement> Campaign(CampaignRequest r)
    {
        if (r.Messages is not { Length: > 0 and <= 10 } || r.Messages.Any(x => string.IsNullOrWhiteSpace(x.Text) && x.Attachment == null))
            throw new BusinessException("Adicione de 1 a 10 mensagens com texto ou anexo.");
        if (r.Messages.Sum(x => x.Attachment?.Data.Length ?? 0) > 22_400_000)
            throw new BusinessException("Os anexos da sequência devem somar no máximo 16 MB.");
        if (r.IntervalVarianceSeconds > r.IntervalSeconds - 3)
            throw new BusinessException("A variação deve manter o intervalo mínimo em 3 segundos.");
        var query = current.Scope(db.Leads).Where(x => x.CurrentSellerId == current.Id && x.Status != LeadStatuses.OptOut);
        if (r.LeadIds != null) query = query.Where(x => r.LeadIds.Contains(x.Id));
        if (r.Status != null) query = query.Where(x => x.Status == r.Status);
        if (r.ServiceId.HasValue) query = query.Where(x => x.ServiceId == r.ServiceId);
        if (r.GroupId.HasValue)
        {
            if (!await db.Groups.AnyAsync(x => x.Id == r.GroupId && x.UserId == current.Id)) throw new BusinessException("Grupo não encontrado.", 404);
            query = query.Where(x => db.GroupMembers.Any(m => m.GroupId == r.GroupId && m.LeadId == x.Id));
        }
        var recipients = await query.Select(x => new { leadId = x.Id, phone = x.Phone, name = x.Name }).Take(501).ToListAsync();
        if (recipients.Count is 0 or > 500) throw new BusinessException("Selecione entre 1 e 500 destinatários elegíveis da sua carteira.");
        return await client.Send(current.Id, HttpMethod.Post, "campaigns", new { r.Name, r.Messages, r.IntervalSeconds, r.IntervalVarianceSeconds, r.PauseEvery, r.PauseSeconds, recipients });
    }
    [HttpPost("campaigns/{id}/cancel")]
    public Task<JsonElement> Cancel(string id) => client.Send(current.Id, HttpMethod.Post, $"campaigns/{Uri.EscapeDataString(id)}/cancel");

    private async Task<int> HistoryUser(int? id)
    {
        if (id == null || id == current.Id) return current.Id;
        if (!current.IsAdmin) throw new BusinessException("Acesso não permitido.", 403);
        if (!await db.Users.AnyAsync(x => x.Id == id && (current.BranchId == null || x.BranchId == current.BranchId))) throw new BusinessException("Usuário fora do escopo.", 403);
        return id.Value;
    }
    private async Task EnsureCanMessage(string chatId)
    {
        if (!chatId.EndsWith("@s.whatsapp.net")) throw new BusinessException("Selecione uma conversa individual com telefone identificado.");
        var phone = LeadRules.NormalizePhone(chatId.Split('@')[0]);
        var leads = await current.Scope(db.Leads).Where(x => x.Phone == phone).ToListAsync();
        if (leads.Any(x => x.Status == LeadStatuses.OptOut)) throw new BusinessException("Este contato está marcado como Não Enviar Mais.", 403);
        if (leads.Count > 0 && !leads.Any(x => x.CurrentSellerId == current.Id)) throw new BusinessException("O contato pertence à carteira de outro vendedor.", 403);
    }
}
public record AttachmentRequest(string Name, string Mime, string Data, bool VoiceNote = false, bool AsDocument = false);
public record ContactRequest(string Name, string Phone);
public record SendRequest([Required] string ChatId, [MaxLength(10000)] string? Text, AttachmentRequest? Attachment, ContactRequest? Contact, string? ReplyTo);
public record EditRequest([Required] string ChatId, [Required, MaxLength(10000)] string Text);
public record ReactionRequest([Required] string ChatId, [MaxLength(8)] string Emoji);
public record ForwardRequest([Required] string ChatId);
public record DeleteMessageRequest([Required] string ChatId, bool ForEveryone);
public record CampaignMessageRequest([MaxLength(10000)] string? Text, AttachmentRequest? Attachment);
public record CampaignRequest([Required, MaxLength(160)] string Name, CampaignMessageRequest[] Messages,
    int[]? LeadIds, int? GroupId, string? Status, int? ServiceId,
    [Range(3, 3600)] int IntervalSeconds = 10, [Range(0, 1800)] int IntervalVarianceSeconds = 3,
    [Range(1, 500)] int PauseEvery = 20, [Range(0, 3600)] int PauseSeconds = 60);
