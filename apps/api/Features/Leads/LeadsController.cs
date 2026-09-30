using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Leads;

[ApiController, Authorize, Route("api/leads")]
public class LeadsController(CrmDbContext db, CurrentUser current, LeadService service, WhatsAppClient whatsapp) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? status, int? serviceId, int? sellerId, int? branchId, bool mine = false, bool sales = false, int page = 1, int pageSize = 20)
    {
        var query = current.Scope(db.Leads.AsNoTracking());
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(term) || x.Phone.Contains(term));
        }
        if (status != null) query = query.Where(x => x.Status == status);
        if (sales) query = query.Where(x => x.Status == LeadStatuses.Won);
        if (mine) query = query.Where(x => x.CurrentSellerId == current.Id);
        if (serviceId.HasValue) query = query.Where(x => x.ServiceId == serviceId);
        if (sellerId.HasValue) query = query.Where(x => x.CurrentSellerId == sellerId);
        if (branchId.HasValue) query = query.Where(x => x.BranchId == branchId);
        pageSize = Math.Clamp(pageSize, 1, 100); page = Math.Max(page, 1);
        return new { items = await query.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(), total = await query.CountAsync(), page, pageSize };
    }
    [HttpGet("{id:int}")] public Task<Lead> Get(int id) => service.Find(id);
    [HttpPost] public Task<Lead> Create(LeadRequest r) => service.Save(null, r);
    [HttpPut("{id:int}")] public Task<Lead> Update(int id, LeadRequest r) => service.Save(id, r);
    [HttpDelete("{id:int}"), Authorize(Policy = "admin")]
    public async Task<IActionResult> Delete(int id)
    {
        db.Leads.Remove(await service.Find(id));
        await db.SaveChangesAsync();
        return NoContent();
    }
    [HttpPost("transfer"), Authorize(Policy = "admin")]
    public async Task<IActionResult> Transfer(TransferRequest r) { await service.Transfer(r); return NoContent(); }
    [HttpPost("{id:int}/link")]
    public async Task<Lead> Link(int id, LinkRequest r)
    {
        var lead = await service.Find(id);
        if (lead.CurrentSellerId != current.Id) throw new BusinessException("Somente o vendedor atual pode vincular a conversa.", 403);
        if (lead.ChatId != null && (lead.ChatId != r.ChatId || lead.ChatUserId != current.Id)) throw new BusinessException("Este lead já está vinculado a outra conversa.", 409);
        if (r.ChatId != lead.Phone + "@s.whatsapp.net") throw new BusinessException("O telefone da conversa não corresponde ao lead.");
        lead.ChatId = r.ChatId; lead.ChatUserId = current.Id; lead.Revision++;
        await db.SaveChangesAsync();
        return lead;
    }
    [HttpPost("{id:int}/conversation")]
    public async Task<object> Conversation(int id, ConversationRequest r)
    {
        var lead = await service.Find(id);
        if (lead.CurrentSellerId != current.Id) throw new BusinessException("Somente o vendedor atual pode vincular a conversa.", 403);
        if (lead.Status == LeadStatuses.OptOut) throw new BusinessException("Este contato está marcado como Não Enviar Mais.", 403);
        if (lead.Revision != r.Revision) throw new BusinessException("O lead foi alterado por outro usuário. Atualize a página.", 409);
        if (lead.ChatId == lead.Phone + "@s.whatsapp.net" && lead.ChatUserId == current.Id)
            return new { phone = lead.Phone, chatId = lead.ChatId, requiresConfirmation = false, exists = true };
        var result = await whatsapp.Send(current.Id, HttpMethod.Post, "resolve-phone", new { phone = lead.Phone });
        if (result.ValueKind == System.Text.Json.JsonValueKind.Null) throw new BusinessException("O número original e suas variantes não foram encontrados no WhatsApp.", 404);
        var phone = result.GetProperty("phone").GetString()!;
        var chatId = result.GetProperty("chatId").GetString()!;
        var requiresConfirmation = result.GetProperty("requiresConfirmation").GetBoolean();
        var exists = result.TryGetProperty("exists", out var existing) && existing.GetBoolean();
        if (requiresConfirmation && r.AcceptedPhone != phone)
            return new { phone, chatId, requiresConfirmation = true, exists };
        if (exists && phone == lead.Phone)
            return new { phone, chatId, requiresConfirmation = false, exists = true };
        if (lead.ChatId != null && (lead.ChatId != chatId || lead.ChatUserId != current.Id)) throw new BusinessException("Este lead já está vinculado a outra conversa.", 409);
        if (await db.Leads.AnyAsync(x => x.Id != id && ((x.BranchId == lead.BranchId && x.Phone == phone) || (x.ChatUserId == current.Id && x.ChatId == chatId))))
            throw new BusinessException("Já existe um lead com este telefone ou vinculado a esta conversa.", 409);
        lead.Phone = phone; lead.ChatId = chatId; lead.ChatUserId = current.Id;
        lead.UpdatedAt = DateTime.UtcNow; lead.Revision++;
        await db.SaveChangesAsync();
        return new { phone, chatId, requiresConfirmation = false, exists };
    }
}
public record ConversationRequest(int Revision, string? AcceptedPhone);
