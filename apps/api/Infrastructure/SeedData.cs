using Crm.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Infrastructure;

public static class SeedData
{
    public static async Task Initialize(CrmDbContext db, IConfiguration config, IHostEnvironment env)
    {
        if (await db.Users.AnyAsync()) return;
        var demo = env.IsDevelopment() && config.GetValue("Seed:Demo", true);
        var password = config["Seed:AdminPassword"] ?? (demo ? "ViaDemo2026!" : null);
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10) throw new InvalidOperationException("Configure Seed:AdminPassword (mínimo 10 caracteres).");
        var branch = new Branch { Name = "Unidade Centro" };
        db.Branches.Add(branch);
        var services = new[] { "Primeira habilitação · B", "Primeira habilitação · AB", "Adição de categoria · A", "Reciclagem", "Renovação de CNH" }.Select(name => new CatalogItem { Name = name }).ToArray();
        db.Catalog.AddRange(services);
        db.Catalog.AddRange(new CatalogItem { Kind = "condition", Name = "À vista" }, new CatalogItem { Kind = "condition", Name = "Cartão · até 12x" }, new CatalogItem { Kind = "condition", Name = "Boleto parcelado" });
        await db.SaveChangesAsync();
        var admin = MakeUser("Administrador", config["Seed:AdminUsername"] ?? "admin", password, true, null);
        db.Users.Add(admin); await db.SaveChangesAsync();
        if (!demo) return;
        var sellers = new[] { MakeUser("Camila Oliveira", "camila", password, false, branch.Id), MakeUser("Rafael Costa", "rafael", password, false, branch.Id), MakeUser("Beatriz Santos", "beatriz", password, false, branch.Id) };
        db.Users.AddRange(sellers); await db.SaveChangesAsync();
        string[] names = ["Mariana Almeida", "Lucas Ferreira", "Ana Clara Souza", "Pedro Henrique", "Juliana Martins", "Gabriel Lima", "Isabela Rocha", "Matheus Ribeiro", "Fernanda Alves", "Bruno Cardoso", "Larissa Mendes", "Felipe Castro", "Amanda Dias", "Gustavo Nunes", "Carolina Freitas", "Diego Teixeira", "Letícia Barros", "João Vitor", "Vitória Campos", "Thiago Moreira"];
        var now = DateTime.UtcNow;
        for (var i = 0; i < 60; i++)
        {
            var seller = sellers[i % sellers.Length];
            var lead = new Lead
            {
                BranchId = branch.Id, SellerId = seller.Id, CurrentSellerId = seller.Id,
                Name = names[i % names.Length] + (i >= 20 ? $" {i / 20 + 1}" : ""), Phone = $"555199000{i:0000}",
                Email = $"contato{i}@example.com", ServiceId = services[i % services.Length].Id,
                Origin = new[] { "site", "redes sociais", "fone", "presencialmente" }[i % 4],
                Status = new[] { LeadStatuses.Contact, LeadStatuses.Won, LeadStatuses.Waiting, LeadStatuses.Won, LeadStatuses.Contact, LeadStatuses.Lost, LeadStatuses.Contact, LeadStatuses.OptOut }[i % 8],
                Value = new[] { 1850m, 2490m, 980m, 420m, 350m }[i % 5],
                Notes = "Registro demonstrativo para conhecer o CRM.", CreatedAt = now.AddDays(-(i % 29)).AddMinutes(-i * 7)
            };
            db.Leads.Add(lead); await db.SaveChangesAsync();
            if (i < 8) db.Appointments.Add(new Appointment { LeadId = lead.Id, DueAt = now.Date.AddHours(12 + i).AddDays(i / 4), Note = "Retornar sobre condições e disponibilidade de matrícula." });
        }
        await db.SaveChangesAsync();
    }
    private static User MakeUser(string name, string username, string password, bool admin, int? branchId)
    {
        var user = new User { Name = name, Username = username, IsAdmin = admin, BranchId = branchId };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, password); return user;
    }
}
