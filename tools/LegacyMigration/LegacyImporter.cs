using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Crm.Api.Domain;
using Crm.Api.Features.Admin;
using Crm.Api.Features.Appointments;
using Crm.Api.Features.Leads;

namespace LegacyMigration;

public record LegacyBranch(int Id, string Nome, string DataInclusao, bool Ativo);
public record LegacyUser(int Id, string Nome, string Usuario, string SenhaHash, bool IsAdmin, int Status, int? SedeId);
public record LegacyItem(int Id, string Nome);
public record LegacyLead(int Id, int? SedeId, string DataInicial, int VendedorId, string DataAlteracao,
    string Cliente, int? Genero, int? Origem, string? Email, string? Fone, string Contato, string? ComoConheceu,
    string? MotivoEscolha, int? ServicoId, string? Obs, int? CondicaoVendaId, int Status, decimal? ValorVenda,
    string? Indicacao, string? Contrato, string? DataNascimento, int? VendedorAtualId);
public record LegacyAppointment(int Id, int VendaId, string DataAgendamento, string? Obs);
public record LegacySnapshot(LegacyBranch[] Branches, LegacyUser[] Users, LegacyItem[] Services,
    LegacyItem[] Conditions, LegacyLead[] Leads, LegacyAppointment[] Appointments);
public record MigrationIssue(string Entity, int Id, string Code, string Detail);
public record MigrationConversion(string Entity, int Id, string Field, string Rule);

public class MigrationPlan(LegacySnapshot source)
{
    public LegacySnapshot Source { get; } = source;
    public List<Branch> Branches { get; } = [];
    public List<User> Users { get; } = [];
    public List<CatalogItem> Catalog { get; } = [];
    public List<Lead> Leads { get; } = [];
    public List<Appointment> Appointments { get; } = [];
    public List<MigrationIssue> Issues { get; } = [];
    public List<MigrationConversion> Conversions { get; } = [];
    public Dictionary<int, int> ConditionIds { get; } = [];
    public bool HasBlockingIssues => Issues.Any(x => x.Entity is not ("lead" or "appointment"));
}

public static class LegacyImporter
{
    public static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true, WriteIndented = true };

    public static MigrationPlan Build(LegacySnapshot source, DateOnly today)
    {
        var plan = new MigrationPlan(source);
        void Issue(string entity, int id, string code, string detail) => plan.Issues.Add(new(entity, id, code, detail));
        void Converted(string entity, int id, string field, string rule) => plan.Conversions.Add(new(entity, id, field, rule));
        void Validate(string entity, int id, object request)
        {
            var errors = new List<ValidationResult>();
            Validator.TryValidateObject(request, new ValidationContext(request), errors, true);
            foreach (var error in errors) Issue(entity, id, "validation", error.ErrorMessage ?? "Campo inválido.");
        }
        // A duplicate source ID must never silently replace another row in a lookup.
        foreach (var (entity, ids) in new (string, IEnumerable<int>)[] {
            ("branch", source.Branches.Select(x => x.Id)), ("user", source.Users.Select(x => x.Id)),
            ("service", source.Services.Select(x => x.Id)), ("condition", source.Conditions.Select(x => x.Id)),
            ("lead", source.Leads.Select(x => x.Id)), ("appointment", source.Appointments.Select(x => x.Id)) })
        {
            foreach (var id in ids.Where(x => x <= 0)) Issue("source", id, "invalid_id", entity);
            foreach (var group in ids.GroupBy(x => x).Where(x => x.Count() > 1)) Issue("source", group.Key, "duplicate_id", entity);
        }
        if (plan.HasBlockingIssues) return plan;

        foreach (var b in source.Branches)
        {
            Validate("branch", b.Id, new NamedRequest(b.Nome ?? "", b.Ativo));
            if (!DateOnly.TryParseExact(b.DataInclusao, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var created))
                Issue("branch", b.Id, "invalid_date", "DataInclusao inválida.");
            plan.Branches.Add(new Branch { Id = b.Id, Name = b.Nome?.Trim() ?? "", Active = b.Ativo,
                CreatedAt = DateTime.SpecifyKind(created.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc) });
            Converted("branch", b.Id, "CreatedAt", "DataInclusao sem horário representada à meia-noite UTC; preserva o dia original.");
        }
        foreach (var u in source.Users)
        {
            Validate("user", u.Id, new UserRequest(u.Nome ?? "", u.Usuario ?? "", null, u.IsAdmin, u.Status == 1, u.SedeId));
            if (u.Status is < 1 or > 3) Issue("user", u.Id, "invalid_status", "Status de usuário desconhecido.");
            if ((!u.IsAdmin && u.SedeId == null) || (u.SedeId.HasValue && !source.Branches.Any(x => x.Id == u.SedeId)))
                Issue("user", u.Id, "invalid_branch", "Vendedor sem sede ou referência inexistente.");
            if (!Regex.IsMatch(u.SenhaHash ?? "", @"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$"))
                Issue("user", u.Id, "invalid_password_hash", "Hash BCrypt inválido ou formato inesperado.");
            plan.Users.Add(new User { Id = u.Id, Name = u.Nome?.Trim() ?? "", Username = u.Usuario?.Trim().ToLowerInvariant() ?? "",
                PasswordHash = u.SenhaHash ?? "", IsAdmin = u.IsAdmin, Active = u.Status == 1, BranchId = u.SedeId });
            if (u.Status != 1) Converted("user", u.Id, "Active", $"Status legado {u.Status} preservado como inativo.");
        }
        if (!plan.Users.Any(x => x.IsAdmin && x.Active && x.BranchId == null))
            Issue("source", 0, "no_global_admin", "Não há administrador global ativo no backup.");
        var maxServiceId = source.Services.Select(x => x.Id).DefaultIfEmpty(0).Max();
        foreach (var item in source.Services)
        {
            Validate("service", item.Id, new NamedRequest(item.Nome ?? ""));
            plan.Catalog.Add(new CatalogItem { Id = item.Id, Kind = "service", Name = item.Nome?.Trim() ?? "" });
        }
        foreach (var (item, index) in source.Conditions.OrderBy(x => x.Id).Select((x, i) => (x, i)))
        {
            Validate("condition", item.Id, new NamedRequest(item.Nome ?? ""));
            var id = checked(maxServiceId + index + 1);
            plan.ConditionIds.Add(item.Id, id);
            plan.Catalog.Add(new CatalogItem { Id = id, Kind = "condition", Name = item.Nome?.Trim() ?? "" });
        }
        CheckNames(plan.Branches.Select(x => (x.Id, x.Name)), "branch");
        CheckNames(plan.Users.Select(x => (x.Id, x.Username)), "user");
        foreach (var kind in new[] { "service", "condition" }) CheckNames(plan.Catalog.Where(x => x.Kind == kind).Select(x => (x.Id, x.Name)), kind);
        if (plan.HasBlockingIssues) return plan;
        var users = plan.Users.ToDictionary(x => x.Id);
        var branches = plan.Branches.Select(x => x.Id).ToHashSet();
        var services = source.Services.Select(x => x.Id).ToHashSet();
        var allLeads = new List<Lead>();
        var validPhones = new HashSet<int>();
        foreach (var l in source.Leads)
        {
            var currentSeller = l.VendedorAtualId ?? l.VendedorId;
            var branch = l.SedeId ?? 0;
            if (!branches.Contains(branch)) Issue("lead", l.Id, "invalid_branch", "Sede ausente ou inexistente.");
            foreach (var id in new[] { l.VendedorId, currentSeller }.Distinct())
                if (!users.TryGetValue(id, out var user) || !(user.BranchId == branch || user.IsAdmin && user.BranchId == null))
                    Issue("lead", l.Id, "seller_scope", $"Vendedor {id} incompatível com a sede {branch}.");
            if (l.VendedorAtualId == null) Converted("lead", l.Id, "CurrentSellerId", "Vendedor atual ausente: usa o original, sujeito à validação da sede.");
            var phone = l.Contato ?? "";
            try { phone = LeadRules.NormalizePhone(phone); validPhones.Add(l.Id); }
            catch (BusinessException e) { Issue("lead", l.Id, "invalid_phone", e.Message); }
            if (phone != l.Contato) Converted("lead", l.Id, "Phone", "Normalização por LeadRules.NormalizePhone, sem inferir DDD ou nono dígito.");
            var origin = l.Origem switch { null => "não informado", 1 => "presencialmente", 2 => "fone", 3 => "site", 4 => "redes sociais", _ => "" };
            if (origin == "") Issue("lead", l.Id, "invalid_origin", "Origem desconhecida.");
            if (l.Origem == null) Converted("lead", l.Id, "Origin", "Origem ausente convertida para não informado.");
            var gender = l.Genero switch { null => null, 1 => "Masculino", 2 => "Feminino", 3 => "Outro", 4 => "Prefiro não informar", _ => "" };
            if (gender == "") Issue("lead", l.Id, "invalid_gender", "Gênero desconhecido.");
            var status = l.Status is >= 1 and <= 5 ? LeadStatuses.All[l.Status - 1] : "";
            if (status == "") Issue("lead", l.Id, "invalid_status", "Status comercial desconhecido.");
            DateOnly? birthDate = null;
            if (!string.IsNullOrEmpty(l.DataNascimento))
            {
                if (l.DataNascimento.Length >= 10 && DateOnly.TryParseExact(l.DataNascimento[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var birth))
                {
                    birthDate = birth;
                    if (birth > today) Issue("lead", l.Id, "future_birth", "Nascimento no futuro.");
                }
                else Issue("lead", l.Id, "invalid_birth", "Nascimento inválido.");
            }
            if (l.ServicoId.HasValue && !services.Contains(l.ServicoId.Value)) Issue("lead", l.Id, "invalid_service", "Serviço inexistente.");
            int? condition = l.CondicaoVendaId.HasValue && plan.ConditionIds.TryGetValue(l.CondicaoVendaId.Value, out var mapped) ? mapped : null;
            if (l.CondicaoVendaId.HasValue && condition == null) Issue("lead", l.Id, "invalid_condition", "Condição inexistente.");
            var created = ParseDate(l.DataInicial, l.Id, "CreatedAt");
            var updated = l.DataAlteracao is "-infinity" or null or "" ? created : ParseDate(l.DataAlteracao, l.Id, "UpdatedAt");
            if (l.DataAlteracao is "-infinity" or null or "") Converted("lead", l.Id, "UpdatedAt", "Data de alteração ausente: usa CreatedAt; original preservado no snapshot.");
            if (l.ValorVenda == null) Converted("lead", l.Id, "Value", "Valor nulo convertido para zero.");
            var lead = new Lead { Id = l.Id, BranchId = branch, SellerId = l.VendedorId, CurrentSellerId = currentSeller,
                Name = l.Cliente?.Trim() ?? "", Phone = phone, AdditionalPhone = l.Fone, Email = string.IsNullOrWhiteSpace(l.Email) ? null : l.Email,
                Gender = gender, BirthDate = birthDate, Origin = origin, Referral = l.Indicacao, Discovery = l.ComoConheceu,
                ChoiceReason = l.MotivoEscolha, ServiceId = l.ServicoId, ConditionId = condition, Status = status,
                Value = l.ValorVenda ?? 0, Notes = l.Obs, Contract = l.Contrato, CreatedAt = created, UpdatedAt = updated, Revision = 1 };
            Validate("lead", l.Id, new LeadRequest { BranchId = branch, SellerId = l.VendedorId, Name = lead.Name, Phone = phone,
                AdditionalPhone = lead.AdditionalPhone, Email = lead.Email, Gender = gender, BirthDate = birthDate,
                Origin = origin, Referral = lead.Referral, Discovery = lead.Discovery, ChoiceReason = lead.ChoiceReason,
                ServiceId = lead.ServiceId, ConditionId = condition, Status = status, Value = lead.Value, Notes = lead.Notes });
            allLeads.Add(lead);
        }
        foreach (var group in allLeads.Where(x => validPhones.Contains(x.Id)).GroupBy(x => (x.BranchId, x.Phone)).Where(x => x.Count() > 1))
        {
            var ids = string.Join(", ", group.Select(x => x.Id));
            foreach (var lead in group) Issue("lead", lead.Id, "duplicate_phone", $"Mesmo telefone na sede; IDs: {ids}. Todos ficam pendentes, sem escolher um sobrevivente.");
        }
        var pendingLeadIds = plan.Issues.Where(x => x.Entity == "lead").Select(x => x.Id).ToHashSet();
        plan.Leads.AddRange(allLeads.Where(x => !pendingLeadIds.Contains(x.Id)));
        var acceptedLeadIds = plan.Leads.Select(x => x.Id).ToHashSet();
        foreach (var a in source.Appointments)
        {
            if (!acceptedLeadIds.Contains(a.VendaId)) { Issue("appointment", a.Id, "pending_lead", $"Lead {a.VendaId} pendente ou inexistente; retorno preservado na quarentena."); continue; }
            var due = ParseDate(a.DataAgendamento, a.Id, "DueAt", "appointment");
            Validate("appointment", a.Id, new AppointmentRequest(a.VendaId, due, a.Obs));
            if (plan.Issues.Any(x => x.Entity == "appointment" && x.Id == a.Id)) continue;
            plan.Appointments.Add(new Appointment { Id = a.Id, LeadId = a.VendaId, DueAt = due, Note = a.Obs, Completed = false });
        }
        return plan;

        DateTime ParseDate(string? input, int id, string field, string entity = "lead")
        {
            if (DateTimeOffset.TryParse(input, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) && date.UtcDateTime != default)
                return date.UtcDateTime;
            Issue(entity, id, "invalid_date", $"{field} inválido.");
            return default;
        }
        void CheckNames(IEnumerable<(int Id, string Name)> rows, string entity)
        {
            foreach (var group in rows.GroupBy(x => x.Name.Trim().ToLowerInvariant()).Where(x => x.Count() > 1))
                foreach (var row in group) Issue(entity, row.Id, "duplicate_name", "Nome/login duplicado após trim/lower invariant.");
        }
    }
}
