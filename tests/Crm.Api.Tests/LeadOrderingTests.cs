using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class LeadOrderingTests
{
    [Theory]
    [InlineData(null, new[] { 3, 2, 1, 0 })]
    [InlineData("", new[] { 3, 2, 1, 0 })]
    [InlineData("created_desc", new[] { 3, 2, 1, 0 })]
    [InlineData("created_asc", new[] { 0, 1, 2, 3 })]
    [InlineData("name_asc", new[] { 1, 2, 0, 3 })]
    [InlineData("name_desc", new[] { 3, 0, 2, 1 })]
    [InlineData("value_asc", new[] { 0, 2, 1, 3 })]
    [InlineData("value_desc", new[] { 3, 1, 2, 0 })]
    public async Task OrderingAppliesBeforePaginationAndMatchesCompleteExport(string? sort, int[] indexes)
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var start = new DateTime(2001, 2, 10, 12, 0, 0, DateTimeKind.Utc);
        string[] names = ["bruno", "Ana", "ana", "Zulu"];
        decimal[] values = [2.01m, 10.05m, 2.01m, 100.10m];
        int[] days = [0, 1, 1, 2];
        var leads = Enumerable.Range(0, 4).Select(i => new Lead
        {
            BranchId = 1, SellerId = 2, CurrentSellerId = 2, Name = names[i], Phone = $"555198886000{i}",
            Status = LeadStatuses.Won, Value = values[i], CreatedAt = start.AddDays(days[i])
        }).ToArray();
        db.Leads.AddRange(leads);
        await db.SaveChangesAsync();
        var filters = "search=555198886&sales=true&mine=true" + (sort == null ? "" : $"&sort={sort}");

        var first = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{filters}&pageSize=2");
        var second = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{filters}&pageSize=2&page=2");
        var expected = indexes.Select(i => leads[i].Id).ToArray();
        Assert.Equal(4, first.GetProperty("total").GetInt32());
        Assert.Equal(4, second.GetProperty("total").GetInt32());
        Assert.Equal(expected.Take(2), Ids(first));
        Assert.Equal(expected.Skip(2), Ids(second));

        using var response = await seller.GetAsync($"/api/leads/export?{filters}&page=2&pageSize=2");
        response.EnsureSuccessStatusCode();
        using var workbook = new XLWorkbook(new MemoryStream(await response.Content.ReadAsByteArrayAsync()));
        Assert.Equal(expected, workbook.Worksheet("Vendas").RowsUsed().Skip(1).Select(row => row.Cell(1).GetValue<int>()));
    }

    [Fact]
    public async Task OrderingPreservesScopeAndCombinesWithAllFilters()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var branch = new Branch { Name = "Outra unidade" };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        var createdAt = new DateTime(2001, 2, 10, 12, 0, 0, DateTimeKind.Utc);
        var leads = Enumerable.Range(0, 5).Select(i => new Lead
        {
            BranchId = i == 0 ? branch.Id : 1, SellerId = i < 2 ? 3 : 2, CurrentSellerId = i < 2 ? 3 : 2,
            Name = $"Ordenação {i}", Phone = $"555198886100{i}", ServiceId = 1,
            Status = i == 3 ? LeadStatuses.Contact : LeadStatuses.Won, Value = i, CreatedAt = createdAt
        }).ToArray();
        db.Leads.AddRange(leads);
        var classification = new LeadClassification { UserId = 2, Name = "Pessoal", Color = "#112233" };
        db.Classifications.Add(classification);
        await db.SaveChangesAsync();
        db.LeadClassifications.AddRange(leads.Skip(2).Select(lead => new LeadClassificationMember
        { LeadId = lead.Id, ClassificationId = classification.Id }));
        await db.SaveChangesAsync();

        const string prefix = "search=5551988861&sort=value_desc";
        var scoped = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{prefix}");
        Assert.Equal(leads.Skip(1).Reverse().Select(lead => lead.Id), Ids(scoped));
        var combined = $"{prefix}&mine=true&sales=true&branchId=1&sellerId=2&serviceId=1&classificationId={classification.Id}"
            + "&status=" + Uri.EscapeDataString(LeadStatuses.Won)
            + "&createdFrom=2001-02-10T00:00:00Z&createdTo=2001-02-11T00:00:00Z";
        var result = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{combined}");
        Assert.Equal(new[] { leads[4].Id, leads[2].Id }, Ids(result));
        using var response = await seller.GetAsync($"/api/leads/export?{combined}");
        response.EnsureSuccessStatusCode();
        using var workbook = new XLWorkbook(new MemoryStream(await response.Content.ReadAsByteArrayAsync()));
        Assert.Equal(new[] { leads[4].Id, leads[2].Id }, workbook.Worksheet(1).RowsUsed().Skip(1).Select(row => row.Cell(1).GetValue<int>()));
        var outside = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{prefix}&branchId={branch.Id}");
        Assert.Empty(Ids(outside));
    }

    [Theory]
    [InlineData("/api/leads")]
    [InlineData("/api/leads/export")]
    public async Task UnknownOrderingIsRejectedWithoutChangingData(string endpoint)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"{endpoint}?sort=unknown")).StatusCode);
        var result = await admin.GetFromJsonAsync<JsonElement>("/api/leads");
        Assert.Equal(60, result.GetProperty("total").GetInt32());
    }

    private static int[] Ids(JsonElement result) => result.GetProperty("items").EnumerateArray()
        .Select(item => item.GetProperty("id").GetInt32()).ToArray();
}
