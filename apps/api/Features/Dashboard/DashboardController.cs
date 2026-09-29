using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Dashboard;

[ApiController, Authorize(Policy = "admin"), Route("api/dashboard")]
public class DashboardController(CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public async Task<object> Get(int? branchId, int days = 30)
    {
        days = Math.Clamp(days, 7, 365);
        var since = DateTime.UtcNow.Date.AddDays(-days + 1);
        var leads = await current.Scope(db.Leads).AsNoTracking().Where(x => (!branchId.HasValue || x.BranchId == branchId) && x.CreatedAt >= since).ToListAsync();
        var won = leads.Where(x => x.Status == LeadStatuses.Won).ToList();
        var users = await db.Users.Where(x => current.BranchId == null || x.BranchId == current.BranchId).ToDictionaryAsync(x => x.Id, x => x.Name);
        var daily = Enumerable.Range(0, days).Select(i => since.AddDays(i)).Select(day => new
        {
            date = day.ToString("yyyy-MM-dd"), leads = leads.Count(x => x.CreatedAt.Date == day),
            sales = won.Count(x => x.CreatedAt.Date == day)
        });
        return new
        {
            total = leads.Count, sales = won.Count, open = leads.Count(x => x.Status == LeadStatuses.Contact || x.Status == LeadStatuses.Waiting),
            lost = leads.Count(x => x.Status == LeadStatuses.Lost || x.Status == LeadStatuses.OptOut), revenue = won.Sum(x => x.Value),
            conversion = leads.Count == 0 ? 0 : Math.Round(100m * won.Count / leads.Count, 1), daily,
            statuses = LeadStatuses.All.Select(status => new { status, count = leads.Count(x => x.Status == status) }),
            sellers = leads.GroupBy(x => x.CurrentSellerId).Select(g => new { id = g.Key, name = users.GetValueOrDefault(g.Key, "Vendedor"), leads = g.Count(), sales = g.Count(x => x.Status == LeadStatuses.Won), revenue = g.Where(x => x.Status == LeadStatuses.Won).Sum(x => x.Value) }).OrderByDescending(x => x.sales),
            recent = leads.OrderByDescending(x => x.CreatedAt).Take(5)
        };
    }
}
