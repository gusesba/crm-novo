using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class CampaignAudienceTests
{
    private class CampaignHandler : HttpMessageHandler
    {
        public List<int[]> Recipients { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var payload = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
            Recipients.Add(payload.GetProperty("recipients").EnumerateArray().Select(x => x.GetProperty("leadId").GetInt32()).ToArray());
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { id = "test-campaign" }) };
        }
    }

    private class CampaignFactory : ApiFactory
    {
        public CampaignHandler Handler { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>()
                .ConfigurePrimaryHttpMessageHandler(() => Handler));
        }
    }

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
    public async Task RegistrationPeriodUsesWholeLocalDaysBeforePaginationPreviewAndDispatch()
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        var start = new DateTime(2001, 2, 10, 3, 0, 0, DateTimeKind.Utc);
        var end = start.AddDays(1);
        Lead[] leads;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            leads = new[] { start.AddTicks(-1), start, start.AddHours(12), end.AddTicks(-1), end }
                .Select((date, i) => new Lead { Name = $"Periodo {i}", Phone = $"55519887700{i:00}",
                    BranchId = 1, SellerId = 2, CurrentSellerId = i % 2 == 0 ? 2 : 3, CreatedAt = date }).ToArray();
            db.Leads.AddRange(leads);
            await db.SaveChangesAsync();
        }
        const string range = "search=Periodo&createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z";
        var first = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?{range}&pageSize=2");
        var second = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?{range}&pageSize=2&page=2");
        Assert.Equal(3, first.GetProperty("total").GetInt32());
        Assert.Equal(3, second.GetProperty("total").GetInt32());
        Assert.Equal(new[] { leads[1].Id, leads[2].Id }, CampaignIds(first));
        Assert.Equal(new[] { leads[3].Id }, CampaignIds(second));
        var preview = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { createdFrom = start, createdTo = end });
        preview.EnsureSuccessStatusCode();
        var expected = leads.Skip(1).Take(3).Select(x => x.Id).ToArray();
        Assert.Equal(expected, (await preview.Content.ReadFromJsonAsync<Lead[]>())!.Select(x => x.Id));
        (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Periodo", messages = new[] { new { text = "Teste" } },
            search = "Periodo", createdFrom = start, createdTo = end })).EnsureSuccessStatusCode();
        Assert.Equal(expected, Assert.Single(factory.Handler.Recipients));
        var unfiltered = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Periodo");
        Assert.Equal(5, unfiltered.GetProperty("total").GetInt32());
        var onlyFrom = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Periodo&createdFrom=2001-02-11T03:00:00Z");
        Assert.Equal(new[] { leads[4].Id }, CampaignIds(onlyFrom));
        var onlyTo = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Periodo&createdTo=2001-02-10T03:00:00Z");
        Assert.Equal(new[] { leads[0].Id }, CampaignIds(onlyTo));
        var empty = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?createdTo=2000-01-01T00:00:00Z");
        Assert.Equal(0, empty.GetProperty("total").GetInt32());
        Assert.Empty(CampaignIds(empty));
    }

    [Fact]
    public async Task RegistrationPeriodCombinesWithGroupClassificationAndScope()
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        using var admin = await factory.Login();
        var start = new DateTime(2001, 2, 10, 3, 0, 0, DateTimeKind.Utc);
        var end = start.AddDays(1);
        int groupId, otherLeadId, otherBranchId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            foreach (var id in new[] { 1, 2, 8 })
            {
                var lead = (await db.Leads.FindAsync(id))!;
                lead.CreatedAt = start;
                lead.Name = $"Combinado {id}";
                lead.ServiceId = 1;
                if (id != 8) lead.Status = LeadStatuses.Contact;
            }
            var branch = new Branch { Name = "Outra sede" };
            db.Branches.Add(branch);
            await db.SaveChangesAsync();
            otherBranchId = branch.Id;
            var outside = new Lead { Name = "Combinado fora", Phone = "5551988771000", BranchId = branch.Id,
                SellerId = 1, CurrentSellerId = 1, CreatedAt = start, ServiceId = 1 };
            db.Leads.Add(outside);
            await db.SaveChangesAsync();
            otherLeadId = outside.Id;
            var group = new ContactGroup { UserId = 2, Name = "Combinado", Members = new[] { 1, 2, 8, otherLeadId }
                .Select(id => new GroupMember { LeadId = id }).ToList() };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            groupId = group.Id;
        }
        var classificationId = await Classify(seller, 1, 2, 8);
        var query = $"createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z&groupId={groupId}&classificationId={classificationId}&status={Uri.EscapeDataString(LeadStatuses.Contact)}&serviceId=1&search=Combinado";
        var page = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?{query}");
        Assert.Equal(new[] { 1, 2 }, CampaignIds(page));
        var body = new { createdFrom = start, createdTo = end, groupId, classificationId, status = LeadStatuses.Contact,
            serviceId = 1, search = "Combinado", excludedLeadIds = new[] { 2 } };
        var preview = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", body);
        preview.EnsureSuccessStatusCode();
        Assert.Equal(1, Assert.Single((await preview.Content.ReadFromJsonAsync<Lead[]>())!).Id);
        var scoped = await seller.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z");
        Assert.Equal(new[] { 1, 2 }, CampaignIds(scoped));
        var global = await admin.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z&branchId={otherBranchId}&sellerId=1");
        Assert.Equal(new[] { otherLeadId }, CampaignIds(global));
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/whatsapp/campaign-recipients?{query}&sellerId=3")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/whatsapp/campaign-recipients?{query}&branchId={otherBranchId}")).StatusCode);
    }

    [Fact]
    public async Task RegistrationPeriodRejectsOutOfRangeManualSelectionAndRevalidatesConfirmation()
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        var start = new DateTime(2001, 2, 10, 3, 0, 0, DateTimeKind.Utc);
        var end = start.AddDays(1);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            foreach (var id in new[] { 1, 2 }) (await db.Leads.FindAsync(id))!.CreatedAt = start;
            await db.SaveChangesAsync();
        }
        var preview = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { createdFrom = start, createdTo = end, leadIds = new[] { 1, 2 } });
        preview.EnsureSuccessStatusCode();
        Assert.Equal(2, (await preview.Content.ReadFromJsonAsync<Lead[]>())!.Length);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(2))!.CreatedAt = end;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new {
            createdFrom = start, createdTo = end, leadIds = new[] { 1, 2 } })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", new {
            name = "Periodo", messages = new[] { new { text = "Teste" } }, createdFrom = start, createdTo = end, leadIds = new[] { 1, 2 } })).StatusCode);
        Assert.Empty(factory.Handler.Recipients);
    }

    [Theory]
    [InlineData("invalid", null)]
    [InlineData(null, "2001-02-30T00:00:00Z")]
    [InlineData("2001-02-11T03:00:00Z", "2001-02-10T03:00:00Z")]
    public async Task InvalidRegistrationPeriodIsRejectedEverywhere(string? createdFrom, string? createdTo)
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        var query = $"createdFrom={Uri.EscapeDataString(createdFrom ?? "")}&createdTo={Uri.EscapeDataString(createdTo ?? "")}";
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.GetAsync($"/api/whatsapp/campaign-recipients?{query}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { createdFrom, createdTo })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Invalido",
            messages = new[] { new { text = "Teste" } }, createdFrom, createdTo })).StatusCode);
        Assert.Empty(factory.Handler.Recipients);
    }

    private static int[] CampaignIds(JsonElement result) => result.GetProperty("items").EnumerateArray()
        .Select(item => item.GetProperty("id").GetInt32()).ToArray();

    [Fact]
    public async Task MultipleAudienceFiltersUnionEachFieldAndIntersectAcrossFields()
    {
        using var factory = new CampaignFactory();
        using var admin = await factory.Login();
        var created = new DateTime(2001, 2, 10, 12, 0, 0, DateTimeKind.Utc);
        Lead[] leads;
        int branchId, inactiveBranchId, groupId, firstLabel, secondLabel, foreignLabel;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Sede múltipla" };
            var inactive = new Branch { Name = "Sede inativa", Active = false };
            var labelA = new LeadClassification { UserId = 1, Name = "A", Color = "#112233" };
            var labelB = new LeadClassification { UserId = 1, Name = "B", Color = "#223344" };
            var labelForeign = new LeadClassification { UserId = 2, Name = "Privada", Color = "#334455" };
            db.Branches.AddRange(branch, inactive);
            db.Classifications.AddRange(labelA, labelB, labelForeign);
            await db.SaveChangesAsync();
            branchId = branch.Id; inactiveBranchId = inactive.Id;
            firstLabel = labelA.Id; secondLabel = labelB.Id; foreignLabel = labelForeign.Id;
            leads = Enumerable.Range(0, 10).Select(i => new Lead { Name = $"Multiplo {i}", Phone = $"55519886600{i:00}",
                BranchId = i == 9 ? inactive.Id : i % 2 == 0 ? 1 : branch.Id,
                SellerId = i % 2 == 0 ? 2 : 1, CurrentSellerId = i % 2 == 0 ? 2 : 1,
                Status = i == 3 ? LeadStatuses.OptOut : i == 4 ? LeadStatuses.Lost : i % 2 == 0 ? LeadStatuses.Contact : LeadStatuses.Waiting,
                ServiceId = i == 2 ? null : i == 5 ? 3 : i % 2 == 0 ? 1 : 2,
                CreatedAt = i == 6 ? created.AddDays(-1) : created }).ToArray();
            db.Leads.AddRange(leads);
            await db.SaveChangesAsync();
            foreach (var (lead, i) in leads.Select((lead, i) => (lead, i)))
            {
                db.LeadClassifications.Add(new LeadClassificationMember { LeadId = lead.Id,
                    ClassificationId = i == 7 ? foreignLabel : i % 2 == 0 ? firstLabel : secondLabel });
            }
            db.LeadClassifications.Add(new LeadClassificationMember { LeadId = leads[0].Id, ClassificationId = secondLabel });
            var group = new ContactGroup { UserId = 1, Name = "Multiplo", Members = leads.Take(8)
                .Select(lead => new GroupMember { LeadId = lead.Id }).ToList() };
            db.Groups.Add(group);
            await db.SaveChangesAsync();
            groupId = group.Id;
        }
        var statuses = new[] { LeadStatuses.Contact, LeadStatuses.Waiting, LeadStatuses.OptOut };
        var serviceIds = new[] { 1, 2, 1 };
        var sellerIds = new[] { 1, 2 };
        var branchIds = new[] { 1, branchId, inactiveBranchId };
        var classificationIds = new[] { firstLabel, secondLabel, foreignLabel };
        var query = "search=Multiplo&createdFrom=2001-02-10T03:00:00Z&createdTo=2001-02-11T03:00:00Z&includeNoService=true" +
            $"&groupId={groupId}" + string.Concat(statuses.Select(x => $"&statuses={Uri.EscapeDataString(x)}")) +
            string.Concat(serviceIds.Select(x => $"&serviceIds={x}")) + string.Concat(sellerIds.Select(x => $"&sellerIds={x}")) +
            string.Concat(branchIds.Select(x => $"&branchIds={x}")) + string.Concat(classificationIds.Select(x => $"&classificationIds={x}"));
        var first = await admin.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?{query}&pageSize=2");
        var second = await admin.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?{query}&pageSize=2&page=2");
        var expected = leads.Take(3).Select(x => x.Id).ToArray();
        Assert.Equal(3, first.GetProperty("total").GetInt32());
        Assert.Equal(expected.Take(2), CampaignIds(first));
        Assert.Equal(expected.Skip(2), CampaignIds(second));
        var preview = await admin.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { statuses, serviceIds, sellerIds, branchIds,
            classificationIds, includeNoService = true, groupId, search = "Multiplo", createdFrom = created.Date.AddHours(3), createdTo = created.Date.AddDays(1).AddHours(3) });
        preview.EnsureSuccessStatusCode();
        Assert.Equal(expected, (await preview.Content.ReadFromJsonAsync<Lead[]>())!.Select(x => x.Id));
        (await admin.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Múltiplos filtros", messages = new[] { new { text = "Teste" } },
            statuses, serviceIds, sellerIds, branchIds, classificationIds, includeNoService = true, groupId, search = "Multiplo",
            createdFrom = created.Date.AddHours(3), createdTo = created.Date.AddDays(1).AddHours(3), leadIds = expected })).EnsureSuccessStatusCode();
        Assert.Equal(expected, Assert.Single(factory.Handler.Recipients));
        var none = await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Multiplo&includeNoService=true");
        Assert.Equal(new[] { leads[2].Id }, CampaignIds(none));
        var withServices = await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Multiplo&serviceIds=1&serviceIds=2");
        Assert.DoesNotContain(leads[2].Id, CampaignIds(withServices));
        var legacyUnion = await admin.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?search=Multiplo&serviceId=1&serviceIds=2&classificationId={firstLabel}&classificationIds={secondLabel}");
        Assert.Equal(new[] { leads[0].Id, leads[1].Id, leads[4].Id, leads[6].Id, leads[8].Id }, CampaignIds(legacyUnion));
        var cleared = await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/campaign-recipients?search=Multiplo");
        Assert.Equal(8, cleared.GetProperty("total").GetInt32());
        var privateOnly = await admin.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?search=Multiplo&classificationIds={foreignLabel}");
        Assert.Empty(CampaignIds(privateOnly));
        var excluded = await admin.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { search = "Multiplo", includeNoService = true, excludedLeadIds = new[] { leads[2].Id } });
        Assert.Equal(HttpStatusCode.BadRequest, excluded.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Fora do filtro",
            messages = new[] { new { text = "Teste" } }, search = "Multiplo", includeNoService = true, leadIds = new[] { leads[0].Id, leads[2].Id } })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(leads[2].Id))!.ServiceId = 1;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Mudou o serviço",
            messages = new[] { new { text = "Teste" } }, includeNoService = true, search = "Multiplo", leadIds = new[] { leads[2].Id } })).StatusCode);
        Assert.Single(factory.Handler.Recipients);
    }

    [Theory]
    [InlineData("sellerIds=2&sellerIds=3", true)]
    [InlineData("branchIds=1&branchIds=2", false)]
    public async Task MultipleAudienceFiltersPreservePermissionsOnAllEndpoints(string query, bool sellers)
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/whatsapp/campaign-recipients?{query}")).StatusCode);
        var payload = new { name = "Sem permissão", messages = new[] { new { text = "Teste" } },
            sellerIds = sellers ? new[] { 2, 3 } : null, branchIds = sellers ? null : new[] { 1, 2 } };
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", payload)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", payload)).StatusCode);
        Assert.Empty(factory.Handler.Recipients);
    }

    [Fact]
    public async Task ClassificationFilterIsPersonalAndAppliedBeforePagination()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var other = await factory.Login("rafael");
        using var admin = await factory.Login();
        var classificationId = await Classify(seller, 1, 2, 8);
        var otherId = await Classify(other, 1);
        var first = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?classificationId={classificationId}&pageSize=1");
        var second = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?classificationId={classificationId}&pageSize=1&page=2");
        Assert.Equal(2, first.GetProperty("total").GetInt32());
        var ids = new[] { Assert.Single(first.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32(),
            Assert.Single(second.GetProperty("items").EnumerateArray()).GetProperty("id").GetInt32() };
        Assert.Equal(new[] { 1, 2 }, ids.Order().ToArray());
        foreach (var client in new[] { other, admin })
        {
            var hidden = await client.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?classificationId={classificationId}");
            Assert.Equal(0, hidden.GetProperty("total").GetInt32());
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { classificationId })).StatusCode);
        }
        var otherLabel = await seller.GetFromJsonAsync<JsonElement>($"/api/whatsapp/campaign-recipients?classificationId={otherId}");
        Assert.Equal(0, otherLabel.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task ClassificationCombinesWithGroupAndSelectionAndIsRevalidatedOnConfirmation()
    {
        using var factory = new CampaignFactory();
        using var seller = await factory.Login("camila");
        var classificationId = await Classify(seller, 1, 2);
        var groupResponse = await seller.PostAsJsonAsync("/api/groups", new { name = "Grupo classificado" });
        groupResponse.EnsureSuccessStatusCode();
        var groupId = (await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var preview = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { classificationId, groupId, status = LeadStatuses.Contact, serviceId = 1 });
        preview.EnsureSuccessStatusCode();
        Assert.Equal(1, Assert.Single((await preview.Content.ReadFromJsonAsync<Lead[]>())!).Id);
        var excluded = await seller.PostAsJsonAsync("/api/whatsapp/campaigns/preview", new { classificationId, excludedLeadIds = new[] { 2 } });
        excluded.EnsureSuccessStatusCode();
        Assert.Equal(1, Assert.Single((await excluded.Content.ReadFromJsonAsync<Lead[]>())!).Id);
        var payload = new { name = "Filtro pessoal", messages = new[] { new { text = "Teste" } }, classificationId, leadIds = new[] { 1, 2 } };
        (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", payload)).EnsureSuccessStatusCode();
        Assert.Equal(new[] { 1, 2 }, Assert.Single(factory.Handler.Recipients).Order().ToArray());
        (await seller.PutAsJsonAsync("/api/leads/2/classifications", new { classificationIds = Array.Empty<int>() })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", payload)).StatusCode);
        Assert.Single(factory.Handler.Recipients);
    }

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
