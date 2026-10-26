using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using Crm.Api.Domain;
using Crm.Api.Features.Leads;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class TransferredLeadTests
{
    private const string Filters = "transferred=true&search=555198884&sort=name_asc";

    [Fact]
    public async Task SellerSeesOnlyOwnOriginalLeadsWithAnotherCurrentSellerBeforePaginationAndExport()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var leads = await Seed(factory);
        var first = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&pageSize=2");
        var second = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&pageSize=2&page=2");
        Assert.Equal(4, first.GetProperty("total").GetInt32());
        Assert.Equal(4, second.GetProperty("total").GetInt32());
        Assert.Equal(new[] { leads[0].Id, leads[3].Id }, Ids(first));
        Assert.Equal(new[] { leads[6].Id, leads[7].Id }, Ids(second));
        using var workbook = await Export(seller, Filters + "&pageSize=2&page=2");
        Assert.Equal(new[] { leads[0].Id, leads[3].Id, leads[6].Id, leads[7].Id }, ExportIds(workbook));
        Assert.Equal("Camila Oliveira", workbook.Worksheet(1).Cell("M2").GetString());
        Assert.Equal("Rafael Costa", workbook.Worksheet(1).Cell("N2").GetString());
        var normal = await seller.GetFromJsonAsync<JsonElement>("/api/leads?search=555198884&sort=name_asc");
        Assert.Equal(7, normal.GetProperty("total").GetInt32());
        Assert.Contains(leads[1].Id, Ids(normal));
        Assert.Contains(leads[2].Id, Ids(normal));
        Assert.Contains(leads[4].Id, Ids(normal));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AdministratorsCanFilterOriginalAndCurrentSellerWithinBranchScope(bool global)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var leads = await Seed(factory);
        (await admin.PostAsJsonAsync("/api/catalog/users", new
        { name = "Admin de sede", username = "transferred-scope", password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        using var scoped = await factory.Login("transferred-scope");
        var client = global ? admin : scoped;
        var expected = (global ? new[] { 0, 2, 3, 5, 6, 7 } : new[] { 0, 2, 3, 6, 7 }).Select(i => leads[i].Id).ToArray();
        var all = await client.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}");
        Assert.Equal(expected, Ids(all));
        using var workbook = await Export(client, Filters);
        Assert.Equal(expected, ExportIds(workbook));
        var original = await client.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&originalSellerId=2");
        Assert.Equal(expected.Where(id => id != leads[2].Id), Ids(original));
        var both = await client.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&originalSellerId=3&sellerId=2");
        Assert.Equal(new[] { leads[2].Id }, Ids(both));
        var outside = await client.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&branchId={leads[5].BranchId}");
        Assert.Equal(global ? new[] { leads[5].Id } : Array.Empty<int>(), Ids(outside));
        var unknown = await client.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&originalSellerId=999999");
        Assert.Empty(Ids(unknown));
    }

    [Theory]
    [InlineData("/api/leads")]
    [InlineData("/api/leads/export")]
    public async Task SellerCannotFilterAnotherOriginalSeller(string endpoint)
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        foreach (var transferred in new[] { false, true })
            Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"{endpoint}?transferred={transferred}&originalSellerId=3")).StatusCode);
    }

    [Fact]
    public async Task TransferredCombinesWithExistingFiltersAndDoesNotGrantEditingPermission()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var leads = await Seed(factory);
        int classificationId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var classification = new LeadClassification { UserId = 2, Name = "Pessoal", Color = "#112233" };
            db.Classifications.Add(classification);
            await db.SaveChangesAsync();
            classificationId = classification.Id;
            db.LeadClassifications.AddRange(new[] { 0, 3, 6, 7 }.Select(i => new LeadClassificationMember
            { LeadId = leads[i].Id, ClassificationId = classificationId }));
            await db.SaveChangesAsync();
        }
        var combined = $"{Filters}&originalSellerId=2&sellerId=3&branchId=1&serviceId=1&classificationId={classificationId}&sales=true"
            + "&status=" + Uri.EscapeDataString(LeadStatuses.Won)
            + "&createdFrom=2001-02-10T00:00:00Z&createdTo=2001-02-11T00:00:00Z";
        var result = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{combined}");
        Assert.Equal(new[] { leads[0].Id }, Ids(result));
        using var workbook = await Export(seller, combined);
        Assert.Equal(new[] { leads[0].Id }, ExportIds(workbook));
        var mine = await seller.GetFromJsonAsync<JsonElement>($"/api/leads?{Filters}&mine=true");
        Assert.Empty(Ids(mine));
        var first = leads[0];
        (await seller.GetAsync($"/api/leads/{first.Id}")).EnsureSuccessStatusCode();
        var edit = await seller.PutAsJsonAsync($"/api/leads/{first.Id}", new LeadRequest
        { BranchId = first.BranchId, SellerId = first.SellerId, Name = first.Name, Phone = first.Phone, Status = first.Status, Revision = first.Revision });
        Assert.Equal(HttpStatusCode.Forbidden, edit.StatusCode);
    }

    [Fact]
    public async Task TemporaryTransferAppearsReturnAndPermanentTransferDisappear()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using var seller = await factory.Login("camila");
        var leads = await Seed(factory);
        var lead = leads[1];
        var query = $"/api/leads?transferred=true&search={lead.Phone}";
        Assert.Empty(Ids(await seller.GetFromJsonAsync<JsonElement>(query)));
        foreach (var step in new[] { (Seller: 3, Permanent: false, Visible: true), (Seller: 2, Permanent: false, Visible: false),
            (Seller: 3, Permanent: false, Visible: true), (Seller: 3, Permanent: true, Visible: false) })
        {
            (await admin.PostAsJsonAsync("/api/leads/transfer", new
            { leadIds = new[] { lead.Id }, sellerId = step.Seller, permanent = step.Permanent })).EnsureSuccessStatusCode();
            var result = await seller.GetFromJsonAsync<JsonElement>(query);
            Assert.Equal(step.Visible ? new[] { lead.Id } : Array.Empty<int>(), Ids(result));
        }
        Assert.Empty(Ids(await admin.GetFromJsonAsync<JsonElement>(query)));
    }

    [Theory]
    [InlineData("/api/leads", "transferred=invalid")]
    [InlineData("/api/leads", "originalSellerId=invalid")]
    [InlineData("/api/leads/export", "transferred=invalid")]
    [InlineData("/api/leads/export", "originalSellerId=invalid")]
    public async Task InvalidFilterFormatsAreRejected(string endpoint, string filters)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"{endpoint}?{filters}")).StatusCode);
    }

    private static async Task<Lead[]> Seed(ApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var branch = new Branch { Name = "Outra sede" };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        int[] original = [2, 2, 3, 2, 3, 2, 2, 2];
        int[] current = [3, 2, 2, 4, 3, 3, 3, 3];
        var leads = Enumerable.Range(0, 8).Select(i => new Lead
        {
            BranchId = i == 5 ? branch.Id : 1, SellerId = original[i], CurrentSellerId = current[i],
            Name = $"Transferido {i}", Phone = $"555198884000{i}", ServiceId = i == 6 ? 2 : 1,
            Status = LeadStatuses.Won, CreatedAt = new DateTime(i == 7 ? 1999 : 2001, 2, 10, 12, 0, 0, DateTimeKind.Utc)
        }).ToArray();
        db.Leads.AddRange(leads);
        await db.SaveChangesAsync();
        return leads;
    }

    private static int[] Ids(JsonElement result) => result.GetProperty("items").EnumerateArray()
        .Select(item => item.GetProperty("id").GetInt32()).ToArray();

    private static async Task<XLWorkbook> Export(HttpClient client, string filters)
    {
        using var response = await client.GetAsync($"/api/leads/export?{filters}");
        response.EnsureSuccessStatusCode();
        return new XLWorkbook(new MemoryStream(await response.Content.ReadAsByteArrayAsync()));
    }

    private static int[] ExportIds(XLWorkbook workbook) => workbook.Worksheet(1).RowsUsed().Skip(1)
        .Select(row => row.Cell(1).GetValue<int>()).ToArray();
}
