using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Leads;

[ApiController, Authorize, Route("api/classifications")]
public class ClassificationsController(CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public Task<List<LeadClassification>> List() => db.Classifications.AsNoTracking()
        .Where(x => x.UserId == current.Id).OrderBy(x => x.Name).ThenBy(x => x.Id).ToListAsync();

    [HttpPost]
    public async Task<LeadClassification> Create(ClassificationRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) throw new BusinessException("Informe o nome da classificação.");
        var classification = new LeadClassification { UserId = current.Id, Name = r.Name.Trim(), Color = r.Color.ToLowerInvariant() };
        db.Classifications.Add(classification);
        await db.SaveChangesAsync();
        return classification;
    }

    [HttpGet("/api/leads/{id:int}/classifications")]
    public async Task<List<LeadClassification>> ForLead(int id)
    {
        await EnsureLead(id);
        return await db.Classifications.AsNoTracking().Where(x => x.UserId == current.Id &&
            db.LeadClassifications.Any(m => m.LeadId == id && m.ClassificationId == x.Id))
            .OrderBy(x => x.Name).ThenBy(x => x.Id).ToListAsync();
    }

    [HttpPut("/api/leads/{id:int}/classifications")]
    public async Task<IActionResult> Assign(int id, AssignClassificationsRequest r)
    {
        await EnsureLead(id);
        var ids = r.ClassificationIds.Distinct().ToArray();
        if (await db.Classifications.CountAsync(x => ids.Contains(x.Id) && x.UserId == current.Id) != ids.Length)
            throw new BusinessException("Classificação não encontrada.", 404);
        var previous = await db.LeadClassifications.Where(m => m.LeadId == id &&
            db.Classifications.Any(c => c.Id == m.ClassificationId && c.UserId == current.Id)).ToListAsync();
        db.LeadClassifications.RemoveRange(previous.Where(m => !ids.Contains(m.ClassificationId)));
        db.LeadClassifications.AddRange(ids.Where(classificationId => !previous.Any(m => m.ClassificationId == classificationId))
            .Select(classificationId => new LeadClassificationMember { LeadId = id, ClassificationId = classificationId }));
        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task EnsureLead(int id)
    {
        if (!await current.Scope(db.Leads).AnyAsync(x => x.Id == id))
            throw new BusinessException("Lead não encontrado.", 404);
    }
}

public record ClassificationRequest([Required, MaxLength(80)] string Name,
    [Required, RegularExpression("^#[0-9a-fA-F]{6}$")] string Color);
public record AssignClassificationsRequest([Required, MaxLength(100)] int[] ClassificationIds);
