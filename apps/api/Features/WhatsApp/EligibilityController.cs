using System.Security.Cryptography;
using System.Text;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.WhatsApp;

[ApiController, Route("internal/eligibility")]
public class EligibilityController(CrmDbContext db, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(int userId, int leadId, string phone)
    {
        var secret = configuration["WhatsApp:Secret"] ?? "local-development-only-change-me";
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(Request.Headers["x-service-key"].ToString()), Encoding.UTF8.GetBytes(secret))) return Unauthorized();
        var user = await db.Users.FindAsync(userId);
        var lead = await db.Leads.FindAsync(leadId);
        var eligible = user is { Active: true } && lead != null
            && lead.Phone == phone && lead.Status != LeadStatuses.OptOut
            && (user.BranchId == lead.BranchId || (user.IsAdmin && user.BranchId == null))
            && await db.Branches.AnyAsync(x => x.Id == lead.BranchId && x.Active);
        return Ok(new { eligible });
    }
}
