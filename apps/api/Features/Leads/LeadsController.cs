using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Leads;

[ApiController, Authorize, Route("api/leads")]
public class LeadsController(CrmDbContext db, CurrentUser current, LeadService service) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? status, int? serviceId, int? sellerId, int? branchId, bool mine = false, bool sales = false, int page = 1, int pageSize = 20)
    {
        var query = current.Scope(db.Leads.AsNoTracking());
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(x => x.Name.Contains(search) || x.Phone.Contains(search));
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
}
