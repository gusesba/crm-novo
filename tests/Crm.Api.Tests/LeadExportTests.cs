using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class LeadExportTests
{
    private static async Task<XLWorkbook> Export(HttpClient client, string filters = "")
    {
        using var response = await client.GetAsync($"/api/leads/export?{filters}");
        response.EnsureSuccessStatusCode();
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        using var document = SpreadsheetDocument.Open(new MemoryStream(bytes), false);
        Assert.Empty(new OpenXmlValidator().Validate(document));
        return new XLWorkbook(new MemoryStream(bytes));
    }

    private static int[] Ids(XLWorkbook workbook) => workbook.Worksheet(1).RowsUsed().Skip(1)
        .Select(row => row.Cell(1).GetValue<int>()).ToArray();

    [Fact]
    public async Task ExportsBeyondPaginationWithExcelTypesAndLiteralText()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var createdAt = new DateTime(2026, 10, 1, 12, 30, 0, DateTimeKind.Utc);
        var leads = Enumerable.Range(0, 105).Select(i => new Lead
        {
            BranchId = 1, SellerId = 2, CurrentSellerId = 3, Name = $"Exportação {i}", Phone = $"555199887{i:0000}",
            CreatedAt = createdAt, UpdatedAt = createdAt.AddDays(1), Value = 1234.56m,
            BirthDate = new DateOnly(1990, 5, 20), AdditionalPhone = "001234567890", Email = "contato@example.com",
            ServiceId = 1, ConditionId = 6, Notes = "+SUM(1,2)\nObservação com acento & <texto>"
        }).ToArray();
        leads[^1].Name = "=HYPERLINK(\"https://example.com\")";
        leads[^1].Referral = "@SUM(1,2)";
        leads[^1].ChoiceReason = "-1+2";
        db.Leads.AddRange(leads);
        await db.SaveChangesAsync();
        var classification = new LeadClassification { UserId = 1, Name = "Pessoal", Color = "#112233" };
        var privateClassification = new LeadClassification { UserId = 2, Name = "Privada", Color = "#112233" };
        db.Classifications.AddRange(classification, privateClassification);
        await db.SaveChangesAsync();
        db.LeadClassifications.AddRange(
            new LeadClassificationMember { LeadId = leads[^1].Id, ClassificationId = classification.Id },
            new LeadClassificationMember { LeadId = leads[^1].Id, ClassificationId = privateClassification.Id });
        await db.SaveChangesAsync();

        using var workbook = await Export(admin, "search=555199887&page=99&pageSize=1");
        Assert.Equal(leads.Reverse().Select(x => x.Id), Ids(workbook));
        var sheet = workbook.Worksheet("Leads");
        Assert.Equal(106, sheet.LastRowUsed()!.RowNumber());
        Assert.Equal(22, sheet.LastColumnUsed()!.ColumnNumber());
        Assert.Equal(leads[^1].Name, sheet.Cell("B2").GetString());
        Assert.Equal(XLDataType.Text, sheet.Cell("C2").DataType);
        Assert.Equal(leads[^1].Phone, sheet.Cell("C2").GetString());
        Assert.Equal("001234567890", sheet.Cell("D2").GetString());
        Assert.Equal(new DateTime(1990, 5, 20), sheet.Cell("G2").GetDateTime());
        Assert.Equal(leads[^1].Referral, sheet.Cell("I2").GetString());
        Assert.Equal(leads[^1].ChoiceReason, sheet.Cell("K2").GetString());
        Assert.Equal(await db.Branches.Where(x => x.Id == 1).Select(x => x.Name).SingleAsync(), sheet.Cell("L2").GetString());
        Assert.Equal(await db.Users.Where(x => x.Id == 2).Select(x => x.Name).SingleAsync(), sheet.Cell("M2").GetString());
        Assert.Equal(await db.Users.Where(x => x.Id == 3).Select(x => x.Name).SingleAsync(), sheet.Cell("N2").GetString());
        Assert.Equal(await db.Catalog.Where(x => x.Id == 1).Select(x => x.Name).SingleAsync(), sheet.Cell("O2").GetString());
        Assert.Equal(await db.Catalog.Where(x => x.Id == 6).Select(x => x.Name).SingleAsync(), sheet.Cell("P2").GetString());
        Assert.Equal(1234.56m, sheet.Cell("R2").GetValue<decimal>());
        Assert.Equal(XLDataType.Number, sheet.Cell("R2").DataType);
        Assert.Equal("Pessoal", sheet.Cell("S2").GetString());
        Assert.Equal(leads[^1].Notes, sheet.Cell("T2").GetString());
        Assert.Equal(createdAt, sheet.Cell("U2").GetDateTime());
        Assert.Equal(createdAt.AddDays(1), sheet.Cell("V2").GetDateTime());
        Assert.DoesNotContain(sheet.CellsUsed(), cell => cell.HasFormula);
        Assert.True(sheet.AutoFilter.IsEnabled);
        Assert.Equal("A1:V106", sheet.AutoFilter.Range.RangeAddress.ToString());
        Assert.Equal(1, sheet.SheetView.SplitRow);
    }

    [Fact]
    public async Task ExportCombinesEveryFilterAndPreservesPersonalClassificationPrivacy()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using var camila = await factory.Login("camila");
        using var rafael = await factory.Login("rafael");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var leads = Enumerable.Range(0, 4).Select(i => new Lead
        {
            BranchId = 1, SellerId = i == 1 ? 3 : 2, CurrentSellerId = i == 1 ? 3 : 2,
            Name = $"Árvore exportação {i}", Phone = $"555198887000{i}",
            ServiceId = i == 2 ? 2 : 1, Status = i == 3 ? LeadStatuses.Contact : LeadStatuses.Won
        }).ToArray();
        db.Leads.AddRange(leads);
        var classification = new LeadClassification { UserId = 2, Name = "Só Camila", Color = "#112233" };
        db.Classifications.Add(classification);
        await db.SaveChangesAsync();
        db.LeadClassifications.AddRange(leads.Take(3).Select(lead => new LeadClassificationMember
        { LeadId = lead.Id, ClassificationId = classification.Id }));
        await db.SaveChangesAsync();

        var prefix = $"search={Uri.EscapeDataString("árvore exportação")}&classificationId={classification.Id}";
        foreach (var filters in new[] { prefix, prefix + "&mine=true", prefix + "&sales=true", prefix + "&serviceId=2",
            prefix + "&sellerId=3", prefix + "&branchId=1", prefix + "&status=" + Uri.EscapeDataString(LeadStatuses.Contact) })
        {
            var list = await camila.GetFromJsonAsync<JsonElement>($"/api/leads?{filters}&pageSize=100");
            using var workbook = await Export(camila, filters);
            Assert.Equal(list.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()), Ids(workbook));
        }
        using var combined = await Export(camila, prefix + "&mine=true&sales=true&serviceId=1&sellerId=2&branchId=1&createdFrom=2000-01-01T00:00:00Z&createdTo=2100-01-01T00:00:00Z");
        Assert.Equal(new[] { leads[0].Id }, Ids(combined));
        Assert.Equal("Só Camila", combined.Worksheet("Vendas").Cell("S2").GetString());
        foreach (var client in new[] { admin, rafael })
        {
            using var hidden = await Export(client, prefix);
            Assert.Empty(Ids(hidden));
            using var visibleLead = await Export(client, "search=5551988870000");
            Assert.Equal(new[] { leads[0].Id }, Ids(visibleLead));
            Assert.Equal("", visibleLead.Worksheet(1).Cell("S2").GetString());
        }
        using var unknown = await Export(camila, "classificationId=999999");
        Assert.Empty(Ids(unknown));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExportKeepsBranchScopeEvenWithExplicitFilters(bool isAdmin)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        (await admin.PostAsJsonAsync("/api/catalog/users", new
        {
            name = "Escopo", username = "export-scope", password = "ViaDemo2026!", isAdmin, active = true, branchId = 1
        })).EnsureSuccessStatusCode();
        using var scoped = await factory.Login("export-scope");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var branch = new Branch { Name = "Sede externa" };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        var outside = new Lead { BranchId = branch.Id, SellerId = 1, CurrentSellerId = 1, Name = "Fora", Phone = "5551988879999" };
        db.Leads.Add(outside);
        await db.SaveChangesAsync();

        const string dates = "createdFrom=2000-01-01T00:00:00Z&createdTo=2100-01-01T00:00:00Z";
        using var allowed = await Export(scoped, dates);
        Assert.NotEmpty(Ids(allowed));
        Assert.DoesNotContain(outside.Id, Ids(allowed));
        using var denied = await Export(scoped, $"{dates}&branchId={branch.Id}&sellerId=1");
        Assert.Empty(Ids(denied));
        using var global = await Export(admin, $"{dates}&branchId={branch.Id}");
        Assert.Equal(new[] { outside.Id }, Ids(global));
    }

    [Fact]
    public async Task ExportRequiresAuthenticationValidatesFiltersAndSupportsEmptySales()
    {
        using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/leads/export")).StatusCode);
        using var admin = await factory.Login();
        foreach (var filters in new[] { "serviceId=abc", "classificationId=abc", "sellerId=abc", "branchId=abc", "mine=abc", "sales=abc" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/leads/export?{filters}")).StatusCode);
        using var empty = await Export(admin, "sales=true&search=nenhum-registro-exportacao");
        Assert.Empty(Ids(empty));
        Assert.Equal("Nome", empty.Worksheet("Vendas").Cell("B1").GetString());
        Assert.True(empty.Worksheet(1).AutoFilter.IsEnabled);
        using var response = await admin.GetAsync("/api/leads/export?sales=true&search=nenhum-registro-exportacao");
        Assert.Equal("vendas.xlsx", response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
    }

    [Theory]
    [InlineData("createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-13T03:00:00Z", new[] { 2, 1 })]
    [InlineData("createdFrom=2001-02-12T03:00:00Z&createdTo=2001-02-13T03:00:00Z", new[] { 2 })]
    [InlineData("createdFrom=2001-02-10T03:00:00Z", new[] { 3, 2, 1 })]
    [InlineData("createdTo=2001-02-13T03:00:00Z", new[] { 2, 1, 0 })]
    [InlineData("createdFrom=2001-02-10T00:00:00-03:00&createdTo=2001-02-13T00:00:00-03:00", new[] { 2, 1 })]
    [InlineData("createdFrom=2000-01-01T00:00:00Z&createdTo=2000-01-02T00:00:00Z", new int[] { })]
    public async Task DatePeriodFiltersListAndExportBeforePaginationIncludingLocalBoundaryDays(string dates, int[] indexes)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var firstMidnight = new DateTime(2001, 2, 10, 3, 0, 0, DateTimeKind.Utc);
        var nextMidnight = firstMidnight.AddDays(3);
        var times = new[] { firstMidnight.AddTicks(-1), firstMidnight, nextMidnight.AddTicks(-1), nextMidnight };
        var leads = times.Select((time, i) => new Lead
        {
            BranchId = 1, SellerId = 2, CurrentSellerId = 2, Name = $"Período exportação {i}",
            Phone = $"555198886000{i}", CreatedAt = time, UpdatedAt = new DateTime(2026, 10, 23),
            Status = LeadStatuses.Won, Value = 100
        }).ToArray();
        db.Leads.AddRange(leads);
        await db.SaveChangesAsync();
        var filters = $"search={Uri.EscapeDataString("Período exportação")}&{dates}";
        var expected = indexes.Select(i => leads[i].Id).ToArray();
        foreach (var mode in new[] { "", "&sales=true" })
        {
            var result = await admin.GetFromJsonAsync<JsonElement>($"/api/leads?{filters}{mode}&pageSize=1");
            Assert.Equal(expected.Length, result.GetProperty("total").GetInt32());
            Assert.Equal(expected.Take(1), result.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()));
            using var workbook = await Export(admin, filters + mode + "&page=99&pageSize=1");
            Assert.Equal(expected, Ids(workbook));
        }
        using var camila = await factory.Login("camila");
        var mine = await camila.GetFromJsonAsync<JsonElement>($"/api/leads?{filters}&mine=true&pageSize=100");
        Assert.Equal(expected, mine.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()));
        using var mineExport = await Export(camila, filters + "&mine=true");
        Assert.Equal(expected, Ids(mineExport));
    }

    [Theory]
    [InlineData("createdFrom=2001-02-13T03:00:00Z&createdTo=2001-02-10T03:00:00Z")]
    [InlineData("createdFrom=invalid")]
    [InlineData("createdTo=2001-02-30")]
    public async Task InvalidDatePeriodIsRejectedByListAndExport(string dates)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        foreach (var endpoint in new[] { "/api/leads", "/api/leads/export" })
        {
            using var response = await admin.GetAsync($"{endpoint}?{dates}");
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            if (dates.StartsWith("createdFrom=2001"))
                Assert.Contains("A data inicial deve ser anterior ou igual à data final.", await response.Content.ReadAsStringAsync());
        }
    }
}
