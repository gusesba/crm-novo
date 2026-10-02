using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Groups;

[ApiController, Authorize, Route("api/groups")]
public class GroupsController(CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public async Task<object> List()
    {
        var leads = AccessibleLeads();
        return await db.Groups.Where(x => x.UserId == current.Id)
            .Select(x => new { x.Id, x.Name, count = x.Members.Count(m => leads.Any(l => l.Id == m.LeadId)) }).ToListAsync();
    }
    [HttpGet("leads")]
    public async Task<List<Lead>> Leads(string? status, int? serviceId, int? sellerId, int? branchId, DateTime? createdFrom, DateTime? createdTo, string? search, int? classificationId)
        => await FilterLeads(status, serviceId, sellerId, branchId, createdFrom, createdTo, search, classificationId)
            .AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync();
    [HttpGet("{id:int}")]
    public async Task<object> Get(int id)
    {
        var group = await Find(id);
        var ids = group.Members.Select(x => x.LeadId).ToArray();
        return new { group.Id, group.Name, members = await AccessibleLeads().Where(x => ids.Contains(x.Id)).ToListAsync() };
    }
    [HttpPost]
    public async Task<object> Create(GroupRequest r)
    {
        var group = new ContactGroup { Name = r.Name.Trim(), UserId = current.Id };
        db.Groups.Add(group); await SetMembers(group, r); await db.SaveChangesAsync(); return new { group.Id, group.Name };
    }
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, GroupRequest r)
    {
        var group = await Find(id); group.Name = r.Name.Trim();
        await SetMembers(group, r); await db.SaveChangesAsync(); return NoContent();
    }
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) { db.Groups.Remove(await Find(id)); await db.SaveChangesAsync(); return NoContent(); }
    private async Task<ContactGroup> Find(int id) => await db.Groups.Include(x => x.Members).SingleOrDefaultAsync(x => x.Id == id && x.UserId == current.Id) ?? throw new BusinessException("Grupo não encontrado.", 404);
    private IQueryable<Lead> AccessibleLeads()
    {
        var query = current.Scope(db.Leads);
        return current.IsAdmin ? query : query.Where(x => x.CurrentSellerId == current.Id);
    }
    private IQueryable<Lead> FilterLeads(string? status, int? serviceId, int? sellerId, int? branchId, DateTime? createdFrom, DateTime? createdTo, string? search, int? classificationId)
    {
        if (sellerId.HasValue && !current.IsAdmin) throw new BusinessException("Filtro de vendedor disponível apenas para administradores.", 403);
        if (branchId.HasValue && !(current.IsAdmin && current.BranchId == null)) throw new BusinessException("Filtro de sede disponível apenas para o administrador geral.", 403);
        if (createdFrom > createdTo) throw new BusinessException("A data inicial deve ser anterior ou igual à data final.");
        var query = AccessibleLeads();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
        if (serviceId.HasValue) query = query.Where(x => x.ServiceId == serviceId);
        if (sellerId.HasValue) query = query.Where(x => x.CurrentSellerId == sellerId);
        if (branchId.HasValue) query = query.Where(x => x.BranchId == branchId);
        if (classificationId.HasValue)
            query = query.Where(x => db.LeadClassifications.Any(m => m.LeadId == x.Id && m.ClassificationId == classificationId &&
                db.Classifications.Any(c => c.Id == m.ClassificationId && c.UserId == current.Id)));
        if (createdFrom.HasValue) query = query.Where(x => x.CreatedAt >= createdFrom.Value);
        if (createdTo.HasValue) query = query.Where(x => x.CreatedAt < createdTo.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLowerInvariant();
            query = query.Where(x => x.Name.ToLower().Contains(term) || x.Phone.Contains(term));
        }
        return query;
    }
    private async Task SetMembers(ContactGroup group, GroupRequest r)
    {
        var query = FilterLeads(r.Status, r.ServiceId, r.SellerId, r.BranchId, r.CreatedFrom, r.CreatedTo, r.Search, r.ClassificationId);
        if (r.LeadIds != null) query = query.Where(x => r.LeadIds.Contains(x.Id));
        var ids = await query.Select(x => x.Id).ToListAsync();
        if (r.LeadIds != null && ids.Count != r.LeadIds.Distinct().Count()) throw new BusinessException("Há leads fora do seu escopo.", 403);
        group.Members.RemoveAll(x => !ids.Contains(x.LeadId));
        foreach (var id in ids.Where(id => !group.Members.Any(x => x.LeadId == id))) group.Members.Add(new GroupMember { LeadId = id });
    }
}
public record GroupRequest([Required, MaxLength(160)] string Name, int[]? LeadIds, string? Status, int? ServiceId,
    int? SellerId = null, int? BranchId = null, DateTime? CreatedFrom = null, DateTime? CreatedTo = null, string? Search = null, int? ClassificationId = null);
