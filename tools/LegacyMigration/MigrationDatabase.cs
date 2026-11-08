using Crm.Api.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace LegacyMigration;

public static class MigrationDatabase
{
    public static async Task Write(MigrationPlan plan, string output, bool allowPending, CancellationToken cancellationToken = default)
    {
        if (plan.HasBlockingIssues || (!allowPending && plan.Issues.Count > 0))
            throw new InvalidOperationException("Auditoria contém pendências. Consulte o relatório antes de importar.");
        output = Path.GetFullPath(output);
        if (File.Exists(output)) throw new IOException("O destino já existe; o importador nunca sobrescreve um banco.");
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        var staging = output + $".staging-{Guid.NewGuid():N}.db";
        var options = new DbContextOptionsBuilder<CrmDbContext>().UseSqlite(new SqliteConnectionStringBuilder
            { DataSource = staging, Pooling = false }.ToString()).Options;
        try
        {
            await using (var db = new CrmDbContext(options))
            {
                await db.Database.MigrateAsync(cancellationToken);
                await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                db.Branches.AddRange(plan.Branches);
                db.Users.AddRange(plan.Users);
                db.Catalog.AddRange(plan.Catalog);
                db.Leads.AddRange(plan.Leads);
                db.Appointments.AddRange(plan.Appointments);
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                db.ChangeTracker.Clear();
                // Read back every field, not just counts. SQLite stores DateTime without Kind.
                var branches = await db.Branches.OrderBy(x => x.Id).AsNoTracking().ToListAsync(cancellationToken);
                foreach (var branch in branches) branch.CreatedAt = DateTime.SpecifyKind(branch.CreatedAt, DateTimeKind.Utc);
                var leads = await db.Leads.OrderBy(x => x.Id).AsNoTracking().ToListAsync(cancellationToken);
                foreach (var lead in leads)
                {
                    lead.CreatedAt = DateTime.SpecifyKind(lead.CreatedAt, DateTimeKind.Utc);
                    lead.UpdatedAt = DateTime.SpecifyKind(lead.UpdatedAt, DateTimeKind.Utc);
                }
                var appointments = await db.Appointments.OrderBy(x => x.Id).AsNoTracking().ToListAsync(cancellationToken);
                foreach (var item in appointments) item.DueAt = DateTime.SpecifyKind(item.DueAt, DateTimeKind.Utc);
                Equal(plan.Branches.OrderBy(x => x.Id), branches, "sedes");
                Equal(plan.Users.OrderBy(x => x.Id), await db.Users.OrderBy(x => x.Id).AsNoTracking().ToListAsync(cancellationToken), "usuários");
                Equal(plan.Catalog.OrderBy(x => x.Id), await db.Catalog.OrderBy(x => x.Id).AsNoTracking().ToListAsync(cancellationToken), "catálogo");
                Equal(plan.Leads.OrderBy(x => x.Id), leads, "leads");
                Equal(plan.Appointments.OrderBy(x => x.Id), appointments, "agendamentos");
                await db.Database.OpenConnectionAsync(cancellationToken);
                using var check = db.Database.GetDbConnection().CreateCommand();
                check.CommandText = "PRAGMA integrity_check";
                if ((string?)await check.ExecuteScalarAsync(cancellationToken) != "ok") throw new InvalidOperationException("Falha na integridade SQLite.");
                check.CommandText = "PRAGMA foreign_key_check";
                await using var reader = await check.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("Há referências inválidas no banco migrado.");
            }
            cancellationToken.ThrowIfCancellationRequested();
            File.Move(staging, output, overwrite: false);
        }
        finally
        {
            // Only this execution's temporary database can be removed; source/destination are never deleted.
            foreach (var suffix in new[] { "", "-wal", "-shm", "-journal" })
                if (File.Exists(staging + suffix)) File.Delete(staging + suffix);
        }
    }

    private static void Equal<T>(IEnumerable<T> expected, IEnumerable<T> actual, string entity)
    {
        var source = expected.ToArray();
        var target = actual.ToArray();
        if (source.Length != target.Length) throw new InvalidOperationException($"Contagem divergente: {entity}.");
        foreach (var (left, right) in source.Zip(target))
            foreach (var property in typeof(T).GetProperties())
                if (!Equals(property.GetValue(left), property.GetValue(right)))
                    throw new InvalidOperationException($"Conferência falhou: {entity}, campo {property.Name}.");
    }
}
