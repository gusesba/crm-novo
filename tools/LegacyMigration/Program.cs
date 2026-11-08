using System.Security.Cryptography;
using System.Text.Json;

namespace LegacyMigration;

public static class MigrationCommand
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length < 1 || args[0] is not ("audit" or "import"))
        {
            Console.Error.WriteLine("Uso: dotnet run --project tools/LegacyMigration -- audit|import --source snapshot.json --report report.json [--output crm.db] [--allow-pending]");
            return 1;
        }
        var mode = args[0];
        var options = new Dictionary<string, string>();
        var allowPending = false;
        for (var i = 1; i < args.Length; i++)
        {
            if (args[i] == "--allow-pending") { allowPending = true; continue; }
            if (args[i] is not ("--source" or "--report" or "--output") || i + 1 >= args.Length || !options.TryAdd(args[i], args[++i]))
            {
                Console.Error.WriteLine("Argumento desconhecido, repetido ou sem valor.");
                return 1;
            }
        }
        if (!options.TryGetValue("--source", out var sourcePath) || !options.TryGetValue("--report", out var reportPath)
            || (mode == "import" && !options.ContainsKey("--output")))
        {
            Console.Error.WriteLine("Informe --source, --report e, para importar, --output.");
            return 1;
        }
        using var cancellation = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
        try
        {
            sourcePath = Path.GetFullPath(sourcePath);
            reportPath = Path.GetFullPath(reportPath);
            var pendingPath = reportPath + ".pending.json";
            var output = options.TryGetValue("--output", out var requestedOutput) ? Path.GetFullPath(requestedOutput) : null;
            var paths = new[] { sourcePath, reportPath, pendingPath, output }.Where(x => x != null).ToArray();
            if (paths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != paths.Length)
                throw new InvalidOperationException("Origem, destino e relatórios precisam de caminhos distintos.");
            if (File.Exists(reportPath) || File.Exists(pendingPath) || (output != null && File.Exists(output)))
                throw new IOException("Destino/relatório já existe. Use novos nomes para preservar a execução anterior.");
            var bytes = await File.ReadAllBytesAsync(sourcePath, cancellation.Token);
            var source = JsonSerializer.Deserialize<LegacySnapshot>(bytes, LegacyImporter.JsonOptions) ?? throw new InvalidOperationException("Snapshot vazio.");
            var plan = LegacyImporter.Build(source, DateOnly.FromDateTime(DateTime.UtcNow));
            Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
            var pendingLeadIds = plan.Issues.Where(x => x.Entity == "lead").Select(x => x.Id).ToHashSet();
            var pendingAppointmentIds = plan.Issues.Where(x => x.Entity == "appointment").Select(x => x.Id).ToHashSet();
            await File.WriteAllTextAsync(pendingPath, JsonSerializer.Serialize(new {
                leads = source.Leads.Where(x => pendingLeadIds.Contains(x.Id)),
                appointments = source.Appointments.Where(x => pendingAppointmentIds.Contains(x.Id) || pendingLeadIds.Contains(x.VendaId)),
                issues = plan.Issues
            }, LegacyImporter.JsonOptions), cancellation.Token);
            var state = mode == "import" ? "import_failed" : "audited";
            try
            {
                if (mode == "import")
                {
                    await MigrationDatabase.Write(plan, output!, allowPending, cancellation.Token);
                    state = "imported_and_verified";
                }
            }
            finally
            {
                // No source hashes or personal details of users are written to this report.
                await File.WriteAllTextAsync(reportPath, JsonSerializer.Serialize(new {
                    state, sourceSha256 = Convert.ToHexString(SHA256.HashData(bytes)), createdAt = DateTime.UtcNow,
                    output, allowPending,
                    sourceCounts = new { branches = source.Branches.Length, users = source.Users.Length, services = source.Services.Length,
                        conditions = source.Conditions.Length, leads = source.Leads.Length, appointments = source.Appointments.Length },
                    acceptedCounts = new { branches = plan.Branches.Count, users = plan.Users.Count,
                        services = plan.Catalog.Count(x => x.Kind == "service"), conditions = plan.Catalog.Count(x => x.Kind == "condition"),
                        leads = plan.Leads.Count, appointments = plan.Appointments.Count },
                    pendingCounts = new { leads = pendingLeadIds.Count, appointments = pendingAppointmentIds.Count },
                    idMaps = new { branches = plan.Branches.Select(x => new { oldId = x.Id, newId = x.Id }),
                        users = plan.Users.Select(x => new { oldId = x.Id, newId = x.Id }),
                        services = plan.Catalog.Where(x => x.Kind == "service").Select(x => new { oldId = x.Id, newId = x.Id }),
                        conditions = plan.ConditionIds.Select(x => new { oldId = x.Key, newId = x.Value }),
                        leads = plan.Leads.Select(x => new { oldId = x.Id, newId = x.Id }),
                        appointments = plan.Appointments.Select(x => new { oldId = x.Id, newId = x.Id }) },
                    reconciliation = plan.Leads.GroupBy(x => new { x.BranchId, x.Status }).Select(g => new {
                        g.Key.BranchId, g.Key.Status, count = g.Count(), value = g.Sum(x => x.Value) }),
                    issues = plan.Issues, conversions = plan.Conversions
                }, LegacyImporter.JsonOptions), CancellationToken.None);
            }
            Console.WriteLine($"{state}: {plan.Leads.Count} leads e {plan.Appointments.Count} agendamentos aceitos; {pendingLeadIds.Count} leads e {pendingAppointmentIds.Count} agendamentos pendentes.");
            Console.WriteLine($"Relatório: {reportPath}");
            return plan.HasBlockingIssues || (plan.Issues.Count > 0 && !allowPending) ? 2 : 0;
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine("Cancelado. Nenhum banco de destino novo foi publicado; consulte os relatórios já produzidos.");
            return 130;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"Migração não concluída: {e.Message}");
            return 1;
        }
    }
}
