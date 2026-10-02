using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class GroupLeadTests
{
    private static async Task<int> Classify(HttpClient client, params int[] leadIds)
    {
        var response = await client.PostAsJsonAsync("/api/classifications", new { name = "Importante", color = "#ffc0cb" });
        response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<LeadClassification>())!.Id;
        foreach (var leadId in leadIds)
            (await client.PutAsJsonAsync($"/api/leads/{leadId}/classifications", new { classificationIds = new[] { id } })).EnsureSuccessStatusCode();
        return id;
    }

    [Fact]
    public async Task ClassificationFilterIsPersonalAndPreservesGroupLeadScope()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var other = await factory.Login("rafael");
        using var admin = await factory.Login();
        var classificationId = await Classify(seller, 1, 2, 4);
        var otherId = await Classify(other, 1);
        var candidates = (await seller.GetFromJsonAsync<Lead[]>($"/api/groups/leads?classificationId={classificationId}"))!;
        Assert.Equal(new[] { 1, 4 }, candidates.Select(x => x.Id).Order().ToArray());
        foreach (var client in new[] { other, admin })
            Assert.Empty((await client.GetFromJsonAsync<Lead[]>($"/api/groups/leads?classificationId={classificationId}"))!);
        Assert.Empty((await seller.GetFromJsonAsync<Lead[]>($"/api/groups/leads?classificationId={otherId}"))!);
        Assert.Empty((await seller.GetFromJsonAsync<Lead[]>("/api/groups/leads?classificationId=999999"))!);
        var created = await seller.PostAsJsonAsync("/api/groups", new { name = "Classificados", classificationId });
        created.EnsureSuccessStatusCode();
        var groupId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(new[] { 1, 4 }, detail.GetProperty("members").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).Order().ToArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/groups", new { name = "Outro vendedor", classificationId, leadIds = new[] { 2 } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/groups", new { name = "Classificação alheia", classificationId, leadIds = new[] { 1 } })).StatusCode);
    }

    [Fact]
    public async Task ClassificationCombinesWithFiltersAndIsRevalidatedWhenSaving()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var classificationId = await Classify(seller, 1, 4);
        var candidates = (await seller.GetFromJsonAsync<Lead[]>($"/api/groups/leads?classificationId={classificationId}&status={Uri.EscapeDataString(LeadStatuses.Contact)}&serviceId=1&search=Mariana"))!;
        Assert.Equal(1, Assert.Single(candidates).Id);
        var created = await seller.PostAsJsonAsync("/api/groups", new { name = "Filtrado", classificationId, status = LeadStatuses.Contact, serviceId = 1, search = "Mariana", leadIds = new[] { 1 } });
        created.EnsureSuccessStatusCode();
        var groupId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        (await seller.PutAsJsonAsync("/api/leads/1/classifications", new { classificationIds = Array.Empty<int>() })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Não deve salvar", classificationId, leadIds = new[] { 1 } })).StatusCode);
        var detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal("Filtrado", detail.GetProperty("name").GetString());
        Assert.Equal(1, Assert.Single(detail.GetProperty("members").EnumerateArray()).GetProperty("id").GetInt32());
        (await seller.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Atualizado", classificationId, leadIds = new[] { 4 } })).EnsureSuccessStatusCode();
        detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(4, Assert.Single(detail.GetProperty("members").EnumerateArray()).GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task GlobalAdminCanSelectUnlinkedLeadsFromMultipleSellersAndBranches()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var branchResponse = await admin.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        var leadResponse = await admin.PostAsJsonAsync("/api/leads", new { branchId = branch.Id, sellerId = 1, name = "Sem contato", phone = "5551988884001", status = LeadStatuses.Contact, origin = "site" });
        leadResponse.EnsureSuccessStatusCode();
        var lead = (await leadResponse.Content.ReadFromJsonAsync<Lead>())!;
        var candidates = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads"))!;
        Assert.Contains(candidates, x => x.Id == lead.Id && x.ChatId == null);
        Assert.Contains(candidates, x => x.CurrentSellerId == 2);
        Assert.Contains(candidates, x => x.CurrentSellerId == 3);
        var ids = new[] { 1, 2, lead.Id };
        var response = await admin.PostAsJsonAsync("/api/groups", new { name = "Leads", leadIds = ids });
        response.EnsureSuccessStatusCode();
        var group = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = group.GetProperty("id").GetInt32();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{id}");
        Assert.Equal(ids.Order(), detail.GetProperty("members").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).Order());
        var groups = await admin.GetFromJsonAsync<JsonElement>("/api/groups");
        Assert.Equal(3, groups.EnumerateArray().Single(x => x.GetProperty("id").GetInt32() == id).GetProperty("count").GetInt32());
        (await admin.PutAsJsonAsync($"/api/groups/{id}", new { name = "Leads", leadIds = new[] { lead.Id } })).EnsureSuccessStatusCode();
        detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{id}");
        Assert.Single(detail.GetProperty("members").EnumerateArray());
    }

    [Fact]
    public async Task SellerCannotUseAdminFiltersOrSelectAnotherSellersLeads()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var leads = (await seller.GetFromJsonAsync<Lead[]>("/api/groups/leads"))!;
        Assert.NotEmpty(leads);
        Assert.All(leads, lead => { Assert.Equal(2, lead.CurrentSellerId); Assert.Equal(1, lead.BranchId); });
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/groups/leads?sellerId=3")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/groups/leads?branchId=1")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/groups", new { name = "Inválido", leadIds = new[] { 2 } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/groups", new { name = "Inválido", leadIds = new[] { 1 }, sellerId = 2 })).StatusCode);
    }

    [Fact]
    public async Task BranchAdminCanSelectTheirSellersButCannotEscapeTheirBranch()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        (await admin.PostAsJsonAsync("/api/catalog/users", new { name = "Admin sede", username = "groupadmin", password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        var branchResponse = await admin.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        var response = await admin.PostAsJsonAsync("/api/leads", new { branchId = branch.Id, sellerId = 1, name = "Outra sede", phone = "5551988884002", status = LeadStatuses.Contact, origin = "site" });
        var otherLead = (await response.Content.ReadFromJsonAsync<Lead>())!;
        using var scoped = await factory.Login("groupadmin");
        var catalog = await scoped.GetFromJsonAsync<JsonElement>("/api/catalog");
        Assert.All(catalog.GetProperty("users").EnumerateArray(), user => Assert.Equal(1, user.GetProperty("branchId").GetInt32()));
        var leads = (await scoped.GetFromJsonAsync<Lead[]>("/api/groups/leads?sellerId=3"))!;
        Assert.NotEmpty(leads);
        Assert.All(leads, lead => { Assert.Equal(1, lead.BranchId); Assert.Equal(3, lead.CurrentSellerId); });
        (await scoped.PostAsJsonAsync("/api/groups", new { name = "Vendedor da sede", leadIds = leads.Select(x => x.Id).ToArray() })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.GetAsync($"/api/groups/leads?branchId={branch.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.PostAsJsonAsync("/api/groups", new { name = "Outra sede", leadIds = new[] { otherLead.Id } })).StatusCode);
    }

    [Fact]
    public async Task FiltersCombineStatusServiceSellerBranchAndRegistrationRange()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var start = new DateTime(2026, 9, 30, 3, 0, 0, DateTimeKind.Utc);
        int includedId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var entries = Enumerable.Range(0, 7).Select(index => new Lead
            {
                BranchId = 1, SellerId = 2, CurrentSellerId = index == 4 ? 3 : 2,
                Name = $"Filtro grupo {index}", Phone = $"55519888841{index:00}",
                Status = index == 5 ? LeadStatuses.Won : LeadStatuses.Contact,
                ServiceId = index == 6 ? 2 : 1,
                CreatedAt = index switch { 1 => start.AddTicks(-1), 2 => start.AddDays(1), 3 => start.AddDays(1).AddTicks(-1), _ => start }
            }).ToArray();
            db.Leads.AddRange(entries); await db.SaveChangesAsync();
            includedId = entries[0].Id;
        }
        var query = $"status={Uri.EscapeDataString(LeadStatuses.Contact)}&serviceId=1&sellerId=2&branchId=1&search=Filtro%20grupo&createdFrom={Uri.EscapeDataString(start.ToString("O"))}&createdTo={Uri.EscapeDataString(start.AddDays(1).ToString("O"))}";
        var leads = (await admin.GetFromJsonAsync<Lead[]>($"/api/groups/leads?{query}"))!;
        Assert.Equal(2, leads.Length);
        Assert.Contains(leads, x => x.Id == includedId);
        Assert.All(leads, x => Assert.InRange(x.CreatedAt, start, start.AddDays(1).AddTicks(-1)));
        var response = await admin.PostAsJsonAsync("/api/groups", new { name = "Filtrado", status = LeadStatuses.Contact, serviceId = 1, sellerId = 2, branchId = 1, search = "Filtro grupo", createdFrom = start, createdTo = start.AddDays(1) });
        response.EnsureSuccessStatusCode();
        var group = await response.Content.ReadFromJsonAsync<JsonElement>();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{group.GetProperty("id").GetInt32()}");
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/groups", new { name = "Fora do filtro", leadIds = new[] { includedId }, status = LeadStatuses.Won })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/groups/{group.GetProperty("id").GetInt32()}", new { name = "Fora do filtro", leadIds = new[] { includedId }, createdFrom = start.AddDays(1) })).StatusCode);
        detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{group.GetProperty("id").GetInt32()}");
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/groups/leads?createdFrom=2026-10-01&createdTo=2026-09-01")).StatusCode);
    }

    [Fact]
    public async Task SelectionIncludesMoreThanOneHundredFilteredLeadsAndCanBeCleared()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            db.Leads.AddRange(Enumerable.Range(0, 105).Select(index => new Lead
            {
                BranchId = 1, SellerId = 2, CurrentSellerId = 2,
                Name = $"Seleção grupo {index}", Phone = $"555198844{index:0000}"
            }));
            await db.SaveChangesAsync();
        }
        var leads = (await seller.GetFromJsonAsync<Lead[]>("/api/groups/leads?search=Sele%C3%A7%C3%A3o%20grupo"))!;
        Assert.Equal(105, leads.Length);
        var response = await seller.PostAsJsonAsync("/api/groups", new { name = "Todos", leadIds = leads.Select(x => x.Id).ToArray() });
        response.EnsureSuccessStatusCode();
        var group = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = group.GetProperty("id").GetInt32();
        var detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{id}");
        Assert.Equal(105, detail.GetProperty("members").GetArrayLength());
        (await seller.PutAsJsonAsync($"/api/groups/{id}", new { name = "Nenhum", leadIds = Array.Empty<int>() })).EnsureSuccessStatusCode();
        detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{id}");
        Assert.Empty(detail.GetProperty("members").EnumerateArray());
    }
}
