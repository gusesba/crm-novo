using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.WhatsApp;

[ApiController, Authorize, Route("api/whatsapp/accounts")]
public class WhatsAppAccountsController(CrmDbContext db, CurrentUser current, WhatsAppClient client) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(int? userId)
    {
        var owner = userId ?? current.Id;
        if (owner != current.Id && (!current.IsAdmin ||
            !await db.Users.AnyAsync(x => x.Id == owner && (current.BranchId == null || x.BranchId == current.BranchId))))
            throw new BusinessException("Acesso não permitido.", 403);
        var accounts = await db.WhatsAppAccounts.AsNoTracking().Where(x => x.UserId == owner)
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Select(x => new { x.Id, x.Name }).ToListAsync();
        return new[] { new { Id = "default", Name = "Principal" } }.Concat(accounts);
    }

    [HttpPost]
    public async Task<object> Create(AccountRequest request)
    {
        var account = new WhatsAppAccount { UserId = current.Id, Name = request.Name.Trim() };
        db.WhatsAppAccounts.Add(account);
        await db.SaveChangesAsync();
        return new { account.Id, account.Name };
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remove(string id)
    {
        if (id == "default") throw new BusinessException("A conta Principal não pode ser removida.");
        var account = await db.WhatsAppAccounts.SingleOrDefaultAsync(x => x.Id == id && x.UserId == current.Id)
            ?? throw new BusinessException("Conta WhatsApp não encontrada.", 404);
        await client.SendGlobal(HttpMethod.Delete, $"sessions/{current.Id}_{account.Id}");
        db.WhatsAppAccounts.Remove(account);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record AccountRequest([Required, MaxLength(80)] string Name);
