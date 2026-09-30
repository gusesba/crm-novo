using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class CampaignAudienceTests
{
    [Theory]
    [InlineData("/api/leads", "Mariana")]
    [InlineData("/api/whatsapp/campaign-recipients", "Mariana")]
    [InlineData("/api/leads", "João")]
    [InlineData("/api/whatsapp/campaign-recipients", "João")]
    public async Task SearchMatchesRegardlessOfLetterCase(string endpoint, string name)
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var lower = await seller.GetFromJsonAsync<JsonElement>($"{endpoint}?search={Uri.EscapeDataString(name.ToLowerInvariant())}&pageSize=100");
        var upper = await seller.GetFromJsonAsync<JsonElement>($"{endpoint}?search={Uri.EscapeDataString(name.ToUpperInvariant())}&pageSize=100");
        var mixed = await seller.GetFromJsonAsync<JsonElement>($"{endpoint}?search={Uri.EscapeDataString(name)}&pageSize=100");
        var ids = lower.GetProperty("items").EnumerateArray().Select(lead => lead.GetProperty("id").GetInt32()).ToArray();
        Assert.NotEmpty(ids);
        Assert.Equal(ids, upper.GetProperty("items").EnumerateArray().Select(lead => lead.GetProperty("id").GetInt32()).ToArray());
        Assert.Equal(ids, mixed.GetProperty("items").EnumerateArray().Select(lead => lead.GetProperty("id").GetInt32()).ToArray());
    }

    [Fact]
    public async Task AllLeadsIncludeOtherSellersWithoutConversationsAndExcludeOptOut()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var page = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?pageSize=100");
        var leads = page.GetProperty("items").EnumerateArray().ToArray();
        Assert.Contains(leads, lead => lead.GetProperty("currentSellerId").GetInt32() == 3);
        Assert.All(leads, lead => Assert.NotEqual(LeadStatuses.OptOut, lead.GetProperty("status").GetString()));
        Assert.All(leads, lead => Assert.Equal(JsonValueKind.Null, lead.GetProperty("chatId").ValueKind));
        var response = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { excludedLeadIds = new[] { leads[0].GetProperty("id").GetInt32() } });
        response.EnsureSuccessStatusCode();
        var preview = (await response.Content.ReadFromJsonAsync<Lead[]>())!;
        Assert.Equal(leads.Length - 1, preview.Length);
        Assert.DoesNotContain(preview, lead => lead.Id == leads[0].GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task GroupAndManualSelectionAlwaysApplyFilters()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var groupResponse = await seller.PostAsJsonAsync("/api/groups", new { name = "Grupo de teste" });
        groupResponse.EnsureSuccessStatusCode();
        var group = await groupResponse.Content.ReadFromJsonAsync<JsonElement>();
        var groupId = group.GetProperty("id").GetInt32();
        var response = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { groupId, status = LeadStatuses.Contact, serviceId = 1 });
        response.EnsureSuccessStatusCode();
        var leads = (await response.Content.ReadFromJsonAsync<Lead[]>())!;
        Assert.NotEmpty(leads);
        Assert.All(leads, lead => { Assert.Equal(LeadStatuses.Contact, lead.Status); Assert.Equal(1, lead.ServiceId); Assert.Equal(2, lead.CurrentSellerId); });
        var id = leads[0].Id;
        var manual = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { leadIds = new[] { id }, groupId, status = LeadStatuses.Contact, serviceId = 1 });
        manual.EnsureSuccessStatusCode();
        Assert.Single((await manual.Content.ReadFromJsonAsync<Lead[]>())!);
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { leadIds = new[] { id }, status = LeadStatuses.Won })).StatusCode);
    }

    [Fact]
    public async Task AdminFiltersRespectBranchScopeAndSellerPermissions()
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        using var seller = await factory.Login("camila");
        var branchResponse = await global.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        (await global.PostAsJsonAsync("/api/catalog/users", new { name = "Admin sede", username = "branchadmin", password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        (await global.PostAsJsonAsync("/api/leads", new { branchId = branch.Id, sellerId = 1, name = "Outra sede", phone = "5551988883001", status = LeadStatuses.Contact, origin = "site" })).EnsureSuccessStatusCode();
        var otherBranch = await global.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?branchId={branch.Id}&sellerId=1");
        Assert.Single(otherBranch.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/whatsapp/campaign-recipients?sellerId=3")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/whatsapp/campaign-recipients?branchId={branch.Id}")).StatusCode);
        using var scoped = await factory.Login("branchadmin");
        var scopedPage = await scoped.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?sellerId=3&pageSize=100");
        Assert.NotEmpty(scopedPage.GetProperty("items").EnumerateArray());
        Assert.All(scopedPage.GetProperty("items").EnumerateArray(), lead => { Assert.Equal(1, lead.GetProperty("branchId").GetInt32()); Assert.Equal(3, lead.GetProperty("currentSellerId").GetInt32()); });
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.GetAsync($"/api/whatsapp/campaign-recipients?branchId={branch.Id}")).StatusCode);
    }

    [Fact]
    public async Task ConfirmationRejectsOptOutAndLeadsThatLeftTheScope()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { leadIds = new[] { 8 } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { leadIds = Array.Empty<int>() })).StatusCode);
        var response = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { leadIds = new[] { 1, 2 } });
        response.EnsureSuccessStatusCode();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var lead = (await db.Leads.FindAsync(2))!;
            lead.Status = LeadStatuses.OptOut;
            await db.SaveChangesAsync();
        }
        var campaign = await seller.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Confirmação", messages = new[] { new { text = "Teste" } }, leadIds = new[] { 1, 2 } });
        Assert.Equal(HttpStatusCode.Conflict, campaign.StatusCode);
    }

    [Fact]
    public async Task ExecutionEligibilityAllowsOtherSellersButPreservesOptOutAndPhoneChecks()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("x-service-key", "local-development-only-change-me");
        var eligible = await client.GetFromJsonAsync<JsonElement>("/internal/eligibility?userId=2&leadId=2&phone=5551990000001");
        Assert.True(eligible.GetProperty("eligible").GetBoolean());
        var optedOut = await client.GetFromJsonAsync<JsonElement>("/internal/eligibility?userId=2&leadId=8&phone=5551990000007");
        Assert.False(optedOut.GetProperty("eligible").GetBoolean());
        var changedPhone = await client.GetFromJsonAsync<JsonElement>("/internal/eligibility?userId=2&leadId=2&phone=5551999999999");
        Assert.False(changedPhone.GetProperty("eligible").GetBoolean());
    }

    [Fact]
    public async Task PreviewRejectsOversizedBatchesAndAllowsManualExclusions()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        int excludedId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var leads = Enumerable.Range(0, 501).Select(index => new Lead
            {
                BranchId = 1, SellerId = 2, CurrentSellerId = 2,
                Name = $"Limite lote {index}", Phone = $"555198800{index:0000}"
            }).ToArray();
            db.Leads.AddRange(leads);
            await db.SaveChangesAsync();
            excludedId = leads[0].Id;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { search = "Limite lote" })).StatusCode);
        var response = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { search = "Limite lote", excludedLeadIds = new[] { excludedId } });
        response.EnsureSuccessStatusCode();
        Assert.Equal(500, (await response.Content.ReadFromJsonAsync<Lead[]>())!.Length);
    }
}
