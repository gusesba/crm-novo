using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;
using Crm.Api.Features.Leads;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Appointments;

[ApiController, Authorize, Route("api/appointments")]
public class AppointmentsController(CrmDbContext db, CurrentUser current, LeadService leads) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(int? leadId, int? branchId, bool mine = false, bool includeCompleted = false, int page = 1, int pageSize = 20)
    {
        var query = from a in db.Appointments.AsNoTracking()
                    join l in current.Scope(db.Leads) on a.LeadId equals l.Id
                    where (!leadId.HasValue || l.Id == leadId) && (!branchId.HasValue || l.BranchId == branchId)
                        && (!mine || l.CurrentSellerId == current.Id)
                        && (includeCompleted || !a.Completed)
                    select new { a.Id, a.LeadId, a.DueAt, a.Note, a.Completed, leadName = l.Name, l.Phone, l.CurrentSellerId, l.BranchId };
        pageSize = Math.Clamp(pageSize, 1, 100); page = Math.Max(page, 1);
        return new
        {
            items = await query.OrderBy(x => x.DueAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(),
            total = await query.CountAsync(),
            page,
            pageSize
        };
    }
    [HttpPost]
    public async Task<Appointment> Create(AppointmentRequest r)
    {
        var lead = await leads.Find(r.LeadId); current.EnsureEdit(lead);
        if (r.DueAt == default) throw new BusinessException("Informe a data do retorno.");
        var item = new Appointment { LeadId = r.LeadId, DueAt = r.DueAt.ToUniversalTime(), Note = r.Note };
        db.Appointments.Add(item); await db.SaveChangesAsync(); return item;
    }
    [HttpPut("{id:int}")]
    public async Task<Appointment> Update(int id, AppointmentUpdate r)
    {
        var item = await db.Appointments.FindAsync(id) ?? throw new BusinessException("Agendamento não encontrado.", 404);
        current.EnsureEdit(await leads.Find(item.LeadId));
        if (r.DueAt == default) throw new BusinessException("Informe a data do retorno.");
        item.DueAt = r.DueAt.ToUniversalTime(); item.Note = r.Note; item.Completed = r.Completed;
        await db.SaveChangesAsync(); return item;
    }
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await db.Appointments.FindAsync(id) ?? throw new BusinessException("Agendamento não encontrado.", 404);
        current.EnsureEdit(await leads.Find(item.LeadId));
        db.Appointments.Remove(item); await db.SaveChangesAsync(); return NoContent();
    }
}
public record AppointmentRequest(int LeadId, DateTime DueAt, [MaxLength(2000)] string? Note);
public record AppointmentUpdate(DateTime DueAt, [MaxLength(2000)] string? Note, bool Completed);
