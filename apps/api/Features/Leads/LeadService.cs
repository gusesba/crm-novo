using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Leads;

public class LeadService(CrmDbContext db, CurrentUser current)
{
    public async Task<Lead> Find(int id) => await current.Scope(db.Leads).SingleOrDefaultAsync(x => x.Id == id)
        ?? throw new BusinessException("Lead não encontrado.", 404);

    public async Task<Lead> Save(int? id, LeadRequest r)
    {
        current.EnsureBranch(r.BranchId);
        if (!LeadStatuses.All.Contains(r.Status)) throw new BusinessException("Status inválido.");
        if (!new[] { "presencialmente", "fone", "site", "redes sociais" }.Contains(r.Origin)) throw new BusinessException("Origem inválida.");
        if (r.Gender != null && !new[] { "Masculino", "Feminino", "Outro", "Prefiro não informar" }.Contains(r.Gender)) throw new BusinessException("Gênero inválido.");
        if (r.BirthDate > DateOnly.FromDateTime(DateTime.UtcNow)) throw new BusinessException("A data de nascimento não pode estar no futuro.");
        if (!string.IsNullOrWhiteSpace(r.ReturnNote) && r.ReturnAt == null) throw new BusinessException("Informe a data do retorno.");
        if (!await db.Branches.AnyAsync(x => x.Id == r.BranchId && x.Active)) throw new BusinessException("Sede inativa ou inexistente.");
        var phone = LeadRules.NormalizePhone(r.Phone);
        if (await db.Leads.AnyAsync(x => x.BranchId == r.BranchId && x.Phone == phone && x.Id != id))
            throw new BusinessException("Já existe um cliente com este telefone nesta sede.", 409);
        if (r.ServiceId.HasValue && !await db.Catalog.AnyAsync(x => x.Id == r.ServiceId && x.Kind == "service" && x.Active)) throw new BusinessException("Serviço inválido.");
        if (r.ConditionId.HasValue && !await db.Catalog.AnyAsync(x => x.Id == r.ConditionId && x.Kind == "condition" && x.Active)) throw new BusinessException("Condição de venda inválida.");
        Lead lead;
        if (id.HasValue)
        {
            lead = await Find(id.Value);
            current.EnsureEdit(lead);
            if (lead.Revision != r.Revision) throw new BusinessException("O lead foi alterado por outro usuário. Atualize a página.", 409);
            if (lead.BranchId != r.BranchId || lead.SellerId != r.SellerId) throw new BusinessException("Use a transferência para alterar o vendedor. A sede do cadastro não pode ser alterada.");
            if (lead.Phone != phone) { lead.ChatId = null; lead.ChatUserId = null; }
        }
        else
        {
            if (!current.IsAdmin && r.SellerId != current.Id) throw new BusinessException("Cadastre leads para o seu usuário.", 403);
            await ValidateSeller(r.SellerId, r.BranchId);
            lead = new Lead { BranchId = r.BranchId, SellerId = r.SellerId, CurrentSellerId = r.SellerId };
            db.Leads.Add(lead);
        }
        lead.Name = r.Name.Trim(); lead.Phone = phone; lead.AdditionalPhone = r.AdditionalPhone;
        lead.Email = r.Email; lead.Gender = r.Gender; lead.BirthDate = r.BirthDate;
        lead.Origin = r.Origin; lead.Referral = r.Referral; lead.Discovery = r.Discovery; lead.ChoiceReason = r.ChoiceReason;
        lead.ServiceId = r.ServiceId; lead.ConditionId = r.ConditionId; lead.Status = r.Status; lead.Value = r.Value;
        lead.Notes = r.Notes; lead.UpdatedAt = DateTime.UtcNow; lead.Revision++;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        if (r.ReturnAt.HasValue)
        {
            db.Appointments.Add(new Appointment { LeadId = lead.Id, DueAt = r.ReturnAt.Value.ToUniversalTime(), Note = r.ReturnNote });
            await db.SaveChangesAsync();
        }
        await transaction.CommitAsync();
        return lead;
    }

    public async Task Transfer(TransferRequest request)
    {
        if (request.LeadIds.Length is 0 or > 500) throw new BusinessException("Selecione entre 1 e 500 leads.");
        var leads = await current.Scope(db.Leads).Where(x => request.LeadIds.Contains(x.Id)).ToListAsync();
        if (leads.Count != request.LeadIds.Distinct().Count()) throw new BusinessException("Há leads fora do seu escopo.", 403);
        foreach (var lead in leads)
        {
            await ValidateSeller(request.SellerId, lead.BranchId);
            LeadRules.Transfer(lead, request.SellerId, request.Permanent);
        }
        await db.SaveChangesAsync();
    }

    private async Task ValidateSeller(int sellerId, int branchId)
    {
        if (!await db.Users.AnyAsync(x => x.Id == sellerId && x.Active && (x.BranchId == branchId || (x.IsAdmin && x.BranchId == null))))
            throw new BusinessException("O vendedor precisa estar ativo e pertencer à sede selecionada.");
    }
}
