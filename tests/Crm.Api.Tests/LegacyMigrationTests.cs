using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using LegacyMigration;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Tests;

public class LegacyMigrationTests
{
    private static readonly DateOnly Today = new(2026, 11, 7);
    private static LegacySnapshot Source() => new(
        [new(3, " Sede ", "2025-01-01", true)],
        [new(1, "Admin", " ADMIN ", BCrypt.Net.BCrypt.HashPassword("legacy", 4), true, 1, null),
         new(7, "Vendedor", "seller", BCrypt.Net.BCrypt.HashPassword("seller", 4), false, 1, 3)],
        [new(1, "Serviço")], [new(1, "Condição")],
        [new(42, 3, "2025-05-01T12:30:00+00:00", 1, "-infinity", " Cliente ", 2, null, "a@example.com", "41999999999",
            "(41) 98765-4321", "Indicação", "Preço", 1, "Observações", 1, 5, null, "Pessoa", "Contrato", "2000-02-03T00:00:00+00:00", 7)],
        [new(8, 42, "2026-02-01T10:00:00-03:00", "Retorno passado")]);

    [Fact]
    public void ConversionPreservesOwnershipDatesOptOutAndCatalogKinds()
    {
        var plan = LegacyImporter.Build(Source(), Today);
        Assert.Empty(plan.Issues);
        var lead = Assert.Single(plan.Leads);
        Assert.Equal(42, lead.Id); Assert.Equal(1, lead.SellerId); Assert.Equal(7, lead.CurrentSellerId);
        Assert.Equal("5541987654321", lead.Phone); Assert.Equal(LeadStatuses.OptOut, lead.Status);
        Assert.Equal("não informado", lead.Origin); Assert.Equal(0, lead.Value);
        Assert.Equal(lead.CreatedAt, lead.UpdatedAt); Assert.Equal(DateTimeKind.Utc, lead.CreatedAt.Kind);
        Assert.Equal("Contrato", lead.Contract); Assert.Equal(1, lead.Revision);
        Assert.Equal(new DateOnly(2000, 2, 3), lead.BirthDate);
        Assert.Null(lead.ChatId); Assert.Null(lead.ChatUserId);
        Assert.Equal("admin", plan.Users[0].Username);
        Assert.Equal(1, lead.ServiceId); Assert.Equal(2, lead.ConditionId);
        Assert.Equal("condition", plan.Catalog.Single(x => x.Id == 2).Kind);
        var appointment = Assert.Single(plan.Appointments);
        Assert.Equal(42, appointment.LeadId); Assert.False(appointment.Completed);
        Assert.Equal(new DateTime(2026, 2, 1, 13, 0, 0, DateTimeKind.Utc), appointment.DueAt);
    }

    [Fact]
    public void AllNormalizedDuplicatesAndTheirAppointmentsAreQuarantined()
    {
        var source = Source();
        source = source with { Leads = [source.Leads[0], source.Leads[0] with { Id = 43, Contato = "5541987654321" }] };
        var plan = LegacyImporter.Build(source, Today);
        Assert.Empty(plan.Leads); Assert.Empty(plan.Appointments);
        Assert.Equal(new[] {42, 43}, plan.Issues.Where(x => x.Code == "duplicate_phone").Select(x => x.Id).Order());
        Assert.Contains(plan.Issues, x => x.Entity == "appointment" && x.Id == 8 && x.Code == "pending_lead");
    }

    [Theory]
    [InlineData("phone")]
    [InlineData("birth")]
    [InlineData("value")]
    [InlineData("scope")]
    [InlineData("email")]
    [InlineData("status")]
    public void InvalidLeadNeverEntersAcceptedBatch(string field)
    {
        var source = Source();
        var lead = source.Leads[0];
        lead = field switch {
            "phone" => lead with { Contato = "41" }, "birth" => lead with { DataNascimento = "2026-11-12" },
            "value" => lead with { ValorVenda = -0.02m }, "scope" => lead with { SedeId = 4 },
            "email" => lead with { Email = "bad email" }, _ => lead with { Status = 99 } };
        var plan = LegacyImporter.Build(source with { Leads = [lead] }, Today);
        Assert.Empty(plan.Leads); Assert.Empty(plan.Appointments);
        Assert.Contains(plan.Issues, x => x.Entity == "lead" && x.Id == 42);
    }

    [Fact]
    public void DuplicateLoginsOrMissingSellerBranchBlockWholeImport()
    {
        var source = Source();
        source = source with { Users = [source.Users[0], source.Users[1] with { Usuario = "admin", SedeId = null }] };
        var plan = LegacyImporter.Build(source, Today);
        Assert.True(plan.HasBlockingIssues);
        Assert.Contains(plan.Issues, x => x.Code == "duplicate_name");
        Assert.Contains(plan.Issues, x => x.Code == "invalid_branch");
    }

    [Fact]
    public async Task DatabaseUsesActualMigrationsAndCannotBeOverwritten()
    {
        var path = Path.Combine(Path.GetTempPath(), $"legacy-migration-{Guid.NewGuid():N}.db");
        try
        {
            var plan = LegacyImporter.Build(Source(), Today);
            await MigrationDatabase.Write(plan, path, false);
            await using var db = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options);
            Assert.Equal(3, (await db.Database.GetAppliedMigrationsAsync()).Count());
            Assert.Equal(LeadStatuses.OptOut, (await db.Leads.SingleAsync()).Status);
            Assert.Equal(1, await db.Appointments.CountAsync());
            Assert.Empty(await db.WhatsAppAccounts.ToListAsync());
            await Assert.ThrowsAsync<IOException>(() => MigrationDatabase.Write(plan, path, false));
            // Autoincrement must advance beyond the explicit legacy IDs.
            var item = new Appointment { LeadId = 42, DueAt = DateTime.UtcNow };
            db.Appointments.Add(item); await db.SaveChangesAsync();
            Assert.True(item.Id > 8);
        }
        finally { if (File.Exists(path)) File.Delete(path); }
    }

    [Fact]
    public async Task PendingRequiresExplicitFlagAndCancellationPublishesNothing()
    {
        var path = Path.Combine(Path.GetTempPath(), $"legacy-migration-{Guid.NewGuid():N}.db");
        var source = Source();
        var plan = LegacyImporter.Build(source with { Leads = [source.Leads[0] with { Contato = "" }] }, Today);
        await Assert.ThrowsAsync<InvalidOperationException>(() => MigrationDatabase.Write(plan, path, false));
        Assert.False(File.Exists(path));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => MigrationDatabase.Write(plan, path, true, cancellation.Token));
        Assert.False(File.Exists(path));
    }
}
