using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.WhatsApp;

public class WhatsAppAccounts(CrmDbContext db, IHttpContextAccessor context)
{
    // A seleção é explícita em cada requisição; nunca altera a sessão de outro navegador/aba.
    public async Task<string> Session(int userId)
    {
        var id = context.HttpContext?.Request.Query["accountId"].ToString();
        if (string.IsNullOrEmpty(id) || id == "default") return userId.ToString();
        if (!await db.WhatsAppAccounts.AnyAsync(x => x.Id == id && x.UserId == userId))
            throw new BusinessException("Conta WhatsApp não encontrada.", 404);
        return $"{userId}_{id}";
    }
}
