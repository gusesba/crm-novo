using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class ClassificationTests
{
    private class ChatHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new[] {
                new { id = "5551988887001@s.whatsapp.net", name = "WhatsApp", lastText = "Olá", updatedAt = 1L, archived = 0, pinnedAt = 0L },
                new { id = "5551988887002@s.whatsapp.net", name = "Sem lead", lastText = "Olá", updatedAt = 1L, archived = 0, pinnedAt = 0L }
            }) });
    }

    private class ClassificationFactory : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>()
                .ConfigurePrimaryHttpMessageHandler(() => new ChatHandler()));
        }
    }

    private static async Task<LeadClassification> Create(HttpClient client, string name = "Importante", string color = "#FFC0CB")
    {
        var response = await client.PostAsJsonAsync("/api/classifications", new { name, color });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LeadClassification>())!;
    }

    private static Task<HttpResponseMessage> Assign(HttpClient client, int leadId, params int[] ids) =>
        client.PutAsJsonAsync($"/api/leads/{leadId}/classifications", new { classificationIds = ids });

    [Fact]
    public async Task ClassificationsAndAssignmentsArePrivateEvenForGlobalAdmin()
    {
        using var factory = new ClassificationFactory();
        using var camila = await factory.Login("camila");
        using var rafael = await factory.Login("rafael");
        using var admin = await factory.Login();
        var first = await Create(camila, "  Importante  ");
        var second = await Create(camila, "Negociação", "#FFCC00");
        var other = await Create(rafael);
        Assert.Equal("Importante", first.Name);
        Assert.Equal("#ffc0cb", first.Color);
        Assert.Equal(2, (await camila.GetFromJsonAsync<LeadClassification[]>("/api/classifications"))!.Length);
        Assert.Single((await rafael.GetFromJsonAsync<LeadClassification[]>("/api/classifications"))!);
        Assert.Empty((await admin.GetFromJsonAsync<LeadClassification[]>("/api/classifications"))!);
        (await Assign(camila, 1, first.Id, second.Id, first.Id)).EnsureSuccessStatusCode();
        // Personal labels do not alter the shared lead, including another seller's labels.
        (await Assign(rafael, 1, other.Id)).EnsureSuccessStatusCode();
        Assert.Equal(2, (await camila.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!.Length);
        Assert.Empty((await admin.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await Assign(camila, 1, second.Id, other.Id)).StatusCode);
        Assert.Equal(2, (await camila.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!.Length);
        (await Assign(camila, 1, second.Id)).EnsureSuccessStatusCode();
        Assert.Equal(second.Id, Assert.Single((await camila.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!).Id);
        (await Assign(camila, 1)).EnsureSuccessStatusCode();
        Assert.Empty((await camila.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!);
        Assert.Equal(other.Id, Assert.Single((await rafael.GetFromJsonAsync<LeadClassification[]>("/api/leads/1/classifications"))!).Id);
        var lead = await camila.GetFromJsonAsync<Lead>("/api/leads/1");
        Assert.Equal(0, lead!.Revision);
        (await admin.DeleteAsync("/api/leads/1")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await rafael.GetAsync("/api/leads/1/classifications")).StatusCode);
        Assert.Single((await rafael.GetFromJsonAsync<LeadClassification[]>("/api/classifications"))!);
    }

    [Fact]
    public async Task ValidationAndLeadScopeRejectInvalidWrites()
    {
        using var factory = new ClassificationFactory();
        using var admin = await factory.Login();
        using var camila = await factory.Login("camila");
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/classifications")).StatusCode);
        foreach (var color in new[] { "red", "#123", "#GGGGGG", "" })
            Assert.Equal(HttpStatusCode.BadRequest, (await camila.PostAsJsonAsync("/api/classifications", new { name = "Teste", color })).StatusCode);
        foreach (var name in new[] { "", "   ", new string('x', 81) })
            Assert.Equal(HttpStatusCode.BadRequest, (await camila.PostAsJsonAsync("/api/classifications", new { name, color = "#112233" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await camila.PutAsJsonAsync("/api/leads/1/classifications", new { })).StatusCode);
        var branchResponse = await admin.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        var leadResponse = await admin.PostAsJsonAsync("/api/leads", new { branchId = branch.Id, sellerId = 1, name = "Fora do escopo", phone = "5551988887003" });
        leadResponse.EnsureSuccessStatusCode();
        var lead = (await leadResponse.Content.ReadFromJsonAsync<Lead>())!;
        var classification = await Create(camila);
        Assert.Equal(HttpStatusCode.NotFound, (await camila.GetAsync($"/api/leads/{lead.Id}/classifications")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Assign(camila, lead.Id, classification.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Assign(camila, 999999, classification.Id)).StatusCode);
    }

    [Fact]
    public async Task LeadListReturnsOnlyPersonalLabelsAndFiltersBeforePagination()
    {
        using var factory = new ClassificationFactory();
        using var camila = await factory.Login("camila");
        using var rafael = await factory.Login("rafael");
        using var admin = await factory.Login();
        var own = await Create(camila, "Importante");
        var second = await Create(camila, "Negociação", "#ffcc00");
        var other = await Create(rafael, "Privada");
        var ids = new List<int>();
        for (var i = 0; i < 3; i++)
        {
            var response = await admin.PostAsJsonAsync("/api/leads", new
            {
                branchId = 1, sellerId = i == 1 ? 3 : 2, name = $"Filtro pessoal {i}",
                phone = $"555198888710{i}", serviceId = 1,
                status = i == 0 ? LeadStatuses.Won : LeadStatuses.Contact
            });
            response.EnsureSuccessStatusCode();
            ids.Add((await response.Content.ReadFromJsonAsync<Lead>())!.Id);
        }
        (await Assign(camila, ids[0], own.Id, second.Id)).EnsureSuccessStatusCode();
        (await Assign(camila, ids[1], own.Id)).EnsureSuccessStatusCode();
        (await Assign(rafael, ids[0], other.Id)).EnsureSuccessStatusCode();
        (await Assign(rafael, ids[2], other.Id)).EnsureSuccessStatusCode();
        var prefix = $"/api/leads?search=Filtro%20pessoal&classificationId={own.Id}";
        var firstPage = await camila.GetFromJsonAsync<JsonElement>($"{prefix}&pageSize=1&page=1");
        var secondPage = await camila.GetFromJsonAsync<JsonElement>($"{prefix}&pageSize=1&page=2");
        Assert.Equal(2, firstPage.GetProperty("total").GetInt32());
        Assert.Equal(2, secondPage.GetProperty("total").GetInt32());
        Assert.Equal(ids[1], Assert.Single(firstPage.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32());
        var lead = Assert.Single(secondPage.GetProperty("items").EnumerateArray());
        Assert.Equal(ids[0], lead.GetProperty("id").GetInt32());
        var labels = lead.GetProperty("classifications").EnumerateArray().ToArray();
        Assert.Equal(new[] { own.Id, second.Id }, labels.Select(x => x.GetProperty("id").GetInt32()));
        Assert.Equal(own.Color, labels[0].GetProperty("color").GetString());
        Assert.Equal(LeadStatuses.Won, lead.GetProperty("status").GetString());
        Assert.Equal(2, lead.GetProperty("currentSellerId").GetInt32());
        Assert.True(lead.TryGetProperty("revision", out _));
        var combined = await camila.GetFromJsonAsync<JsonElement>($"{prefix}&mine=true&sales=true&serviceId=1&branchId=1&sellerId=2");
        Assert.Equal(ids[0], Assert.Single(combined.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32());
        Assert.Equal(1, combined.GetProperty("total").GetInt32());
        var empty = await camila.GetFromJsonAsync<JsonElement>($"{prefix}&serviceId=2");
        Assert.Equal(0, empty.GetProperty("total").GetInt32());
        foreach (var client in new[] { rafael, admin })
        {
            var hidden = await client.GetFromJsonAsync<JsonElement>(prefix);
            Assert.Equal(0, hidden.GetProperty("total").GetInt32());
        }
        var unknown = await camila.GetFromJsonAsync<JsonElement>("/api/leads?classificationId=999999");
        Assert.Equal(0, unknown.GetProperty("total").GetInt32());
        var all = await admin.GetFromJsonAsync<JsonElement>("/api/leads?search=Filtro%20pessoal");
        Assert.All(all.GetProperty("items").EnumerateArray(), item => Assert.Empty(item.GetProperty("classifications").EnumerateArray()));
        var unassigned = await camila.GetFromJsonAsync<JsonElement>("/api/leads?search=Filtro%20pessoal%202");
        Assert.Empty(Assert.Single(unassigned.GetProperty("items").EnumerateArray()).GetProperty("classifications").EnumerateArray());
    }

    [Fact]
    public async Task ClassificationFilterKeepsBranchScopeForPreviouslyTaggedLeads()
    {
        using var factory = new ClassificationFactory();
        using var camila = await factory.Login("camila");
        var own = await Create(camila);
        (await Assign(camila, 1, own.Id)).EnsureSuccessStatusCode();
        // A personal label can remain after a user is moved to another branch.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Sede anterior" };
            db.Branches.Add(branch);
            await db.SaveChangesAsync();
            var historical = new Lead { BranchId = branch.Id, SellerId = 1, CurrentSellerId = 1, Name = "Histórico", Phone = "5551988887199" };
            db.Leads.Add(historical);
            await db.SaveChangesAsync();
            db.LeadClassifications.Add(new LeadClassificationMember { LeadId = historical.Id, ClassificationId = own.Id });
            await db.SaveChangesAsync();
        }
        var result = await camila.GetFromJsonAsync<JsonElement>($"/api/leads?classificationId={own.Id}");
        Assert.Equal(1, result.GetProperty("total").GetInt32());
        Assert.Equal(1, Assert.Single(result.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task ChatDotsUseExplicitLinkAndOnlyViewersClassificationsInBackup()
    {
        using var factory = new ClassificationFactory();
        using var camila = await factory.Login("camila");
        using var admin = await factory.Login();
        var created = await camila.PostAsJsonAsync("/api/leads", new { branchId = 1, sellerId = 2, name = "Cliente", phone = "5551988887001" });
        created.EnsureSuccessStatusCode();
        var lead = (await created.Content.ReadFromJsonAsync<Lead>())!;
        var own = await Create(camila);
        (await Assign(camila, lead.Id, own.Id)).EnsureSuccessStatusCode();
        var unlinked = await camila.GetFromJsonAsync<JsonElement>("/api/whatsapp/chats");
        Assert.Equal(JsonValueKind.Null, unlinked[0].GetProperty("leadId").ValueKind);
        Assert.Empty(unlinked[0].GetProperty("classifications").EnumerateArray());
        (await camila.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId = lead.Phone + "@s.whatsapp.net" })).EnsureSuccessStatusCode();
        var chats = await camila.GetFromJsonAsync<JsonElement>("/api/whatsapp/chats");
        Assert.Equal(lead.Id, chats[0].GetProperty("leadId").GetInt32());
        Assert.Equal("Cliente", chats[0].GetProperty("name").GetString());
        Assert.Equal(own.Id, Assert.Single(chats[0].GetProperty("classifications").EnumerateArray()).GetProperty("id").GetInt32());
        Assert.Empty(chats[1].GetProperty("classifications").EnumerateArray());
        var backup = await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/chats?userId=2");
        Assert.Empty(backup[0].GetProperty("classifications").EnumerateArray());
        var personalAdmin = await Create(admin, "Meu lembrete");
        (await Assign(admin, lead.Id, personalAdmin.Id)).EnsureSuccessStatusCode();
        backup = await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/chats?userId=2");
        Assert.Equal(personalAdmin.Id, Assert.Single(backup[0].GetProperty("classifications").EnumerateArray()).GetProperty("id").GetInt32());
    }
}
