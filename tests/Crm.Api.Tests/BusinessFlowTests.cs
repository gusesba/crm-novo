using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;

namespace Crm.Api.Tests;

public class BusinessFlowTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory factory;
    public BusinessFlowTests(ApiFactory factory) => this.factory = factory;
    private static object LeadRequest(int branch, int seller, string phone, string status = LeadStatuses.Contact) => new
    { branchId = branch, sellerId = seller, name = "Cliente de teste", phone, status, origin = "site", value = 1500 };

    [Fact]
    public async Task AnonymousAndSellerCannotAccessDashboard()
    {
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/dashboard")).StatusCode);
        using var seller = await factory.Login("camila");
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/dashboard")).StatusCode);
    }
    [Fact]
    public async Task UnsafeRequestsRequireAntiforgeryToken()
    {
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "ViaDemo2026!" })).StatusCode);
    }
    [Fact]
    public async Task PhoneIsUniquePerBranchAndNormalized()
    {
        using var admin = await factory.Login();
        var first = await admin.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "(51) 98888-1001"));
        first.EnsureSuccessStatusCode();
        var lead = await first.Content.ReadFromJsonAsync<Lead>(); Assert.Equal("5551988881001", lead!.Phone);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881001"))).StatusCode);
        var branchResponse = await admin.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra unidade", active = true });
        var branch = await branchResponse.Content.ReadFromJsonAsync<Branch>();
        (await admin.PostAsJsonAsync("/api/leads", LeadRequest(branch!.Id, 1, "5551988881001"))).EnsureSuccessStatusCode();
        using var seller = await factory.Login("camila");
        var all = await seller.GetFromJsonAsync<JsonElement>("/api/leads?pageSize=100");
        Assert.All(all.GetProperty("items").EnumerateArray(), l => Assert.Equal(1, l.GetProperty("branchId").GetInt32()));
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/leads", LeadRequest(branch.Id, 2, "5551988881002"))).StatusCode);
    }
    [Fact]
    public async Task TransfersPreserveOrReplaceOriginalSeller()
    {
        using var admin = await factory.Login();
        var response = await admin.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881003"));
        var lead = await response.Content.ReadFromJsonAsync<Lead>();
        (await admin.PostAsJsonAsync("/api/leads/transfer", new { leadIds = new[] { lead!.Id }, sellerId = 3, permanent = false })).EnsureSuccessStatusCode();
        lead = await admin.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}"); Assert.Equal(2, lead!.SellerId); Assert.Equal(3, lead.CurrentSellerId);
        (await admin.PostAsJsonAsync("/api/leads/transfer", new { leadIds = new[] { lead.Id }, sellerId = 4, permanent = true })).EnsureSuccessStatusCode();
        lead = await admin.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}"); Assert.Equal(4, lead!.SellerId); Assert.Equal(4, lead.CurrentSellerId);
        using var seller = await factory.Login("camila");
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/leads/transfer", new { leadIds = new[] { lead.Id }, sellerId = 2, permanent = true })).StatusCode);
    }
    [Fact]
    public async Task OptOutPreventsIndividualAndBatchMessages()
    {
        using var seller = await factory.Login("camila");
        var response = await seller.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881004", LeadStatuses.OptOut));
        var lead = await response.Content.ReadFromJsonAsync<Lead>();
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/whatsapp/send", new { chatId = "5551988881004@s.whatsapp.net", text = "Não enviar" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Teste", text = "Não enviar", leadIds = new[] { lead!.Id }, intervalSeconds = 10, pauseEvery = 20, pauseSeconds = 60 })).StatusCode);
    }
    [Fact]
    public async Task ReturnNoteRequiresDateAndInitialReturnIsPersisted()
    {
        using var seller = await factory.Login("camila");
        var payload = new { branchId = 1, sellerId = 2, name = "Retorno teste", phone = "5551988881005", status = LeadStatuses.Contact, origin = "site", returnNote = "Ligar amanhã" };
        Assert.Equal(HttpStatusCode.BadRequest, (await seller.PostAsJsonAsync("/api/leads", payload)).StatusCode);
        var response = await seller.PostAsJsonAsync("/api/leads", new { payload.branchId, payload.sellerId, payload.name, payload.phone, payload.status, payload.origin, payload.returnNote, returnAt = DateTime.UtcNow.AddDays(1) });
        response.EnsureSuccessStatusCode(); var lead = await response.Content.ReadFromJsonAsync<Lead>();
        var appointments = await seller.GetFromJsonAsync<JsonElement>($"/api/appointments?leadId={lead!.Id}"); Assert.Single(appointments.GetProperty("items").EnumerateArray());
    }
    [Fact]
    public async Task AppointmentsArePaginatedInDueDateOrder()
    {
        using var admin = await factory.Login();
        var first = await admin.GetFromJsonAsync<JsonElement>("/api/appointments?page=1&pageSize=3");
        var second = await admin.GetFromJsonAsync<JsonElement>("/api/appointments?page=2&pageSize=3");
        Assert.Equal(1, first.GetProperty("page").GetInt32());
        Assert.Equal(3, first.GetProperty("pageSize").GetInt32());
        Assert.True(first.GetProperty("total").GetInt32() >= 8);
        Assert.Equal(3, first.GetProperty("items").GetArrayLength());
        Assert.Equal(3, second.GetProperty("items").GetArrayLength());
        var firstIds = first.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt32());
        var secondIds = second.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetInt32());
        Assert.Empty(firstIds.Intersect(secondIds));
    }
    [Fact]
    public async Task OnlyCurrentSellerCanLinkAndConcurrentUpdatesAreRejected()
    {
        using var camila = await factory.Login("camila"); using var rafael = await factory.Login("rafael");
        var response = await camila.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881006")); var lead = await response.Content.ReadFromJsonAsync<Lead>();
        Assert.Equal(HttpStatusCode.Forbidden, (await rafael.PostAsJsonAsync($"/api/leads/{lead!.Id}/link", new { chatId = lead.Phone + "@s.whatsapp.net" })).StatusCode);
        (await camila.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId = lead.Phone + "@s.whatsapp.net" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await camila.PutAsJsonAsync($"/api/leads/{lead.Id}", new { lead.BranchId, lead.SellerId, lead.Name, lead.Phone, lead.Status, lead.Origin, lead.Revision })).StatusCode);
    }

    [Fact]
    public async Task ScopedAdministratorCannotEscapeTheirBranch()
    {
        using var admin = await factory.Login();
        (await admin.PostAsJsonAsync("/api/catalog/users", new { name = "Admin da sede", username = "scoped", password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        using var scoped = await factory.Login("scoped");
        var catalog = await scoped.GetFromJsonAsync<JsonElement>("/api/catalog");
        Assert.Single(catalog.GetProperty("branches").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.PostAsJsonAsync("/api/catalog/branches", new { name = "Proibida" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.GetAsync("/api/whatsapp/chats?userId=1")).StatusCode);
        (await scoped.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GroupMembershipCanBeUpdatedWithoutExposingOtherWallets()
    {
        using var seller = await factory.Login("camila");
        var first = await seller.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881010"));
        var lead = await first.Content.ReadFromJsonAsync<Lead>();
        var created = await seller.PostAsJsonAsync("/api/groups", new { name = "Grupo teste", leadIds = new[] { lead!.Id } });
        created.EnsureSuccessStatusCode(); var group = await created.Content.ReadFromJsonAsync<JsonElement>(); var id = group.GetProperty("id").GetInt32();
        var detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{id}"); Assert.Single(detail.GetProperty("members").EnumerateArray());
        (await seller.PutAsJsonAsync($"/api/groups/{id}", new { name = "Grupo vazio", leadIds = Array.Empty<int>() })).EnsureSuccessStatusCode();
        detail = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{id}"); Assert.Empty(detail.GetProperty("members").EnumerateArray());
        // Seed lead 2 pertence ao Rafael.
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PutAsJsonAsync($"/api/groups/{id}", new { name = "Grupo", leadIds = new[] { 2 } })).StatusCode);
    }

    [Fact]
    public async Task WorkerRevalidatesCurrentStatusAndRequiresServiceSecret()
    {
        using var seller = await factory.Login("camila");
        var created = await seller.PostAsJsonAsync("/api/leads", LeadRequest(1, 2, "5551988881011")); var lead = await created.Content.ReadFromJsonAsync<Lead>();
        using var worker = factory.CreateClient();
        var path = $"/internal/eligibility?userId=2&leadId={lead!.Id}&phone={lead.Phone}";
        Assert.Equal(HttpStatusCode.Unauthorized, (await worker.GetAsync(path)).StatusCode);
        worker.DefaultRequestHeaders.Add("x-service-key", "local-development-only-change-me");
        Assert.True((await worker.GetFromJsonAsync<JsonElement>(path)).GetProperty("eligible").GetBoolean());
        (await seller.PutAsJsonAsync($"/api/leads/{lead.Id}", new { lead.BranchId, lead.SellerId, lead.Name, lead.Phone, status = LeadStatuses.OptOut, lead.Origin, lead.Revision })).EnsureSuccessStatusCode();
        Assert.False((await worker.GetFromJsonAsync<JsonElement>(path)).GetProperty("eligible").GetBoolean());
    }
}
