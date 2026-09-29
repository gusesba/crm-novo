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
    public async Task<object> List() => await db.Groups.Where(x => x.UserId == current.Id)
        .Select(x => new { x.Id, x.Name, count = x.Members.Count(m => db.Leads.Any(l => l.Id == m.LeadId && l.CurrentSellerId == current.Id && (current.BranchId == null || l.BranchId == current.BranchId))) }).ToListAsync();
    [HttpGet("{id:int}")]
    public async Task<object> Get(int id)
    {
        var group = await Find(id);
        var ids = group.Members.Select(x => x.LeadId).ToArray();
        return new { group.Id, group.Name, members = await current.Scope(db.Leads).Where(x => ids.Contains(x.Id) && x.CurrentSellerId == current.Id).ToListAsync() };
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
    private async Task SetMembers(ContactGroup group, GroupRequest r)
    {
        var query = current.Scope(db.Leads).Where(x => x.CurrentSellerId == current.Id);
        if (r.LeadIds != null) query = query.Where(x => r.LeadIds.Contains(x.Id));
        else
        {
            if (r.Status != null) query = query.Where(x => x.Status == r.Status);
            if (r.ServiceId.HasValue) query = query.Where(x => x.ServiceId == r.ServiceId);
        }
        var ids = await query.Select(x => x.Id).ToListAsync();
        if (r.LeadIds != null && ids.Count != r.LeadIds.Distinct().Count()) throw new BusinessException("Há contatos fora da sua carteira.", 403);
        group.Members.RemoveAll(x => !ids.Contains(x.LeadId));
        foreach (var id in ids.Where(id => !group.Members.Any(x => x.LeadId == id))) group.Members.Add(new GroupMember { LeadId = id });
    }
}
public record GroupRequest([Required, MaxLength(160)] string Name, int[]? LeadIds, string? Status, int? ServiceId);
