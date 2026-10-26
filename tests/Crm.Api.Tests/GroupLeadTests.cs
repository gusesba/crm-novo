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
    public async Task MultipleGroupFiltersCombineWithNoServiceAndAreRevalidatedOnSave()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var date = new DateTime(2001, 2, 10, 12, 0, 0, DateTimeKind.Utc);
        Lead[] leads;
        int branchId, firstLabel, secondLabel, foreignLabel;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Sede múltipla" };
            var labelA = new LeadClassification { UserId = 1, Name = "A", Color = "#112233" };
            var labelB = new LeadClassification { UserId = 1, Name = "B", Color = "#223344" };
            var labelForeign = new LeadClassification { UserId = 2, Name = "Privada", Color = "#334455" };
            db.Branches.Add(branch); db.Classifications.AddRange(labelA, labelB, labelForeign);
            await db.SaveChangesAsync();
            branchId = branch.Id; firstLabel = labelA.Id; secondLabel = labelB.Id; foreignLabel = labelForeign.Id;
            leads = Enumerable.Range(0, 9).Select(i => new Lead { Name = $"Multigrupo {i}", Phone = $"55519885500{i:00}",
                BranchId = i % 2 == 0 ? 1 : branchId, SellerId = i % 2 == 0 ? 2 : 1,
                CurrentSellerId = i == 6 ? 3 : i % 2 == 0 ? 2 : 1,
                Status = i == 4 ? LeadStatuses.Won : i % 2 == 0 ? LeadStatuses.Contact : LeadStatuses.Waiting,
                ServiceId = i == 2 ? null : i == 3 ? 3 : i % 2 == 0 ? 1 : 2,
                CreatedAt = i == 7 ? date.AddDays(-1) : date }).ToArray();
            db.Leads.AddRange(leads); await db.SaveChangesAsync();
            for (var i = 0; i < 8; i++) db.LeadClassifications.Add(new LeadClassificationMember { LeadId = leads[i].Id,
                ClassificationId = i == 5 ? foreignLabel : i % 2 == 0 ? firstLabel : secondLabel });
            db.LeadClassifications.Add(new LeadClassificationMember { LeadId = leads[0].Id, ClassificationId = secondLabel });
            await db.SaveChangesAsync();
        }
        var statuses = new[] { LeadStatuses.Contact, LeadStatuses.Waiting };
        var serviceIds = new[] { 1, 2, 1 }; var sellerIds = new[] { 1, 2 }; var branchIds = new[] { 1, branchId };
        var classificationIds = new[] { firstLabel, secondLabel, foreignLabel };
        var query = "search=Multigrupo&createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z&includeNoService=true" +
            string.Concat(statuses.Select(x => $"&statuses={Uri.EscapeDataString(x)}")) + string.Concat(serviceIds.Select(x => $"&serviceIds={x}")) +
            string.Concat(sellerIds.Select(x => $"&sellerIds={x}")) + string.Concat(branchIds.Select(x => $"&branchIds={x}")) +
            string.Concat(classificationIds.Select(x => $"&classificationIds={x}"));
        var candidates = (await admin.GetFromJsonAsync<Lead[]>($"/api/groups/leads?{query}"))!;
        var expected = leads.Take(3).Select(x => x.Id).ToArray();
        Assert.Equal(expected, candidates.Select(x => x.Id).Order());
        var response = await admin.PostAsJsonAsync("/api/groups", new { name = "Múltiplos filtros", statuses, serviceIds, sellerIds, branchIds,
            classificationIds, includeNoService = true, search = "Multigrupo", createdFrom = date.Date.AddHours(3), createdTo = date.Date.AddDays(1).AddHours(3), leadIds = expected });
        response.EnsureSuccessStatusCode();
        var groupId = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(expected, detail.GetProperty("members").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).Order());
        var onlyNone = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads?search=Multigrupo&includeNoService=true"))!;
        Assert.Equal(leads[2].Id, Assert.Single(onlyNone).Id);
        var cleared = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads?search=Multigrupo"))!;
        Assert.Equal(9, cleared.Length);
        var legacyUnion = (await admin.GetFromJsonAsync<Lead[]>($"/api/groups/leads?search=Multigrupo&serviceId=1&serviceIds=2&classificationId={firstLabel}&classificationIds={secondLabel}&sellerId=2&sellerIds=1&branchId=1&branchIds={branchId}"))!;
        Assert.Equal(new[] { leads[0].Id, leads[1].Id, leads[4].Id, leads[7].Id }, legacyUnion.Select(x => x.Id).Order());
        Assert.Empty((await admin.GetFromJsonAsync<Lead[]>($"/api/groups/leads?search=Multigrupo&classificationIds={foreignLabel}"))!);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(leads[2].Id))!.ServiceId = 3;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Não deve salvar",
            statuses, serviceIds, sellerIds, branchIds, classificationIds, includeNoService = true, leadIds = expected })).StatusCode);
        detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal("Múltiplos filtros", detail.GetProperty("name").GetString());
        Assert.Equal(3, detail.GetProperty("members").GetArrayLength());
        (await admin.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Atualizado", serviceIds, sellerIds, branchIds,
            classificationIds, leadIds = expected.Take(2).ToArray() })).EnsureSuccessStatusCode();
        detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task MultipleGroupFiltersPreserveSellerAndBranchPermissions(bool sellers)
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        var query = sellers ? "sellerIds=2&sellerIds=3" : "branchIds=1&branchIds=2";
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/groups/leads?{query}")).StatusCode);
        var payload = new { name = "Não permitido", sellerIds = sellers ? new[] { 2, 3 } : null, branchIds = sellers ? null : new[] { 1, 2 }, leadIds = new[] { 1 } };
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/groups", payload)).StatusCode);
        var own = await seller.PostAsJsonAsync("/api/groups", new { name = "Próprio", leadIds = new[] { 1 } });
        own.EnsureSuccessStatusCode();
        var groupId = (await own.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PutAsJsonAsync($"/api/groups/{groupId}", payload)).StatusCode);
    }

    [Fact]
    public async Task MultipleStatusesFilterCandidatesAndGroupCreationWithoutDuplicates()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var all = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads"))!;
        var expected = all.Where(x => x.Status is LeadStatuses.Contact or LeadStatuses.Waiting).Select(x => x.Id).Order().ToArray();
        var candidates = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads?statuses=Agendar%20Contato&statuses=Stand%20By&statuses=Agendar%20Contato"))!;
        Assert.Contains(candidates, x => x.Status == LeadStatuses.Contact);
        Assert.Contains(candidates, x => x.Status == LeadStatuses.Waiting);
        Assert.Equal(expected, candidates.Select(x => x.Id).Order());
        var response = await admin.PostAsJsonAsync("/api/groups", new { name = "Contato e Stand By",
            statuses = new[] { LeadStatuses.Contact, LeadStatuses.Waiting } });
        response.EnsureSuccessStatusCode();
        var groupId = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(expected, detail.GetProperty("members").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).Order());
        var legacy = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads?status=Agendar%20Contato&statuses=Stand%20By"))!;
        Assert.Equal(expected, legacy.Select(x => x.Id).Order());
        var cleared = (await admin.GetFromJsonAsync<Lead[]>("/api/groups/leads"))!;
        Assert.Equal(all.Length, cleared.Length);
        using var seller = await factory.Login("camila");
        var mine = (await seller.GetFromJsonAsync<Lead[]>("/api/groups/leads?statuses=Agendar%20Contato&statuses=Stand%20By"))!;
        Assert.NotEmpty(mine);
        Assert.All(mine, lead => { Assert.Equal(2, lead.CurrentSellerId); Assert.Equal(1, lead.BranchId); });
    }

    [Fact]
    public async Task MultipleStatusesAreRevalidatedOnSaveAndEditingWithoutFilterPreservesOtherStatuses()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(1))!.Status = LeadStatuses.Contact;
            (await db.Leads.FindAsync(2))!.Status = LeadStatuses.Waiting;
            (await db.Leads.FindAsync(3))!.Status = LeadStatuses.Won;
            await db.SaveChangesAsync();
        }
        var statuses = new[] { LeadStatuses.Contact, LeadStatuses.Waiting };
        var response = await admin.PostAsJsonAsync("/api/groups", new { name = "Status iniciais", statuses, leadIds = new[] { 1, 2 } });
        response.EnsureSuccessStatusCode();
        var groupId = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/groups", new { name = "Fora dos status", statuses, leadIds = new[] { 1, 3 } })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(2))!.Status = LeadStatuses.Won;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Não deve salvar", statuses, leadIds = new[] { 1, 2 } })).StatusCode);
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal("Status iniciais", detail.GetProperty("name").GetString());
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
        (await admin.PutAsJsonAsync($"/api/groups/{groupId}", new { name = "Todos os status", statuses = Array.Empty<string>(), leadIds = new[] { 1, 2, 3 } })).EnsureSuccessStatusCode();
        detail = await admin.GetFromJsonAsync<JsonElement>($"/api/groups/{groupId}");
        Assert.Equal(new[] { 1, 2, 3 }, detail.GetProperty("members").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).Order());
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
