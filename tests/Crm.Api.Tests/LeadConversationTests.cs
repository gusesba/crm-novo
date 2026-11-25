using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.WhatsApp;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class LeadConversationTests
{
    private class WhatsAppHandler(string? phone, bool exists) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(phone == null ? null : new
                {
                    phone, chatId = phone + "@s.whatsapp.net", requiresConfirmation = phone != "5551988882001", exists
                })
            });
    }

    private class ConversationFactory(string? phone, bool exists = false) : ApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>()
                .ConfigurePrimaryHttpMessageHandler(() => new WhatsAppHandler(phone, exists)));
        }
    }

    private static async Task<Lead> Create(HttpClient client, string phone = "5551988882001")
    {
        var response = await client.PostAsJsonAsync("/api/leads", new
        {
            branchId = 1, sellerId = 2, name = "Cliente", phone, status = LeadStatuses.Contact, origin = "site"
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Lead>())!;
    }

    private static Task<HttpResponseMessage> MatchAlreadyRegisteredPhone(HttpClient client, string phone) =>
        client.GetAsync($"/api/leads/conversation-match?chatId={Uri.EscapeDataString(phone + "@s.whatsapp.net")}");

    private static async Task<Lead> AddHistoricalDuplicate(ApiFactory factory, Lead lead, string phone)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var duplicate = new Lead
        {
            BranchId = lead.BranchId, SellerId = lead.SellerId, CurrentSellerId = lead.CurrentSellerId,
            Phone = phone, Name = "Cadastro anterior"
        };
        db.Leads.Add(duplicate);
        await db.SaveChangesAsync();
        return duplicate;
    }

    [Theory]
    [InlineData("5551988882001", "555188882001")]
    [InlineData("555188882001", "5551988882001")]
    public async Task MatchAndLinkBrazilianMobileVariantWithoutChangingStoredPhone(string savedPhone, string chatPhone)
    {
        using var factory = new ConversationFactory(null);
        using var client = await factory.Login("camila");
        using var colleague = await factory.Login("rafael");
        var lead = await Create(client, savedPhone);
        var chatId = chatPhone + "@s.whatsapp.net";

        using var response = await MatchAlreadyRegisteredPhone(colleague, chatPhone);
        response.EnsureSuccessStatusCode();
        var match = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(chatId, match.GetProperty("chatId").GetString());
        Assert.False(match.GetProperty("ambiguous").GetBoolean());
        Assert.Equal(lead.Id, match.GetProperty("lead").GetProperty("id").GetInt32());
        Assert.Null(match.GetProperty("lead").GetProperty("chatId").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await colleague.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId })).StatusCode);

        var link = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId });
        link.EnsureSuccessStatusCode();
        var linked = (await link.Content.ReadFromJsonAsync<Lead>())!;
        Assert.Equal(chatId, linked.ChatId);
        Assert.Equal(savedPhone, linked.Phone);
        Assert.Equal(lead.Revision + 1, linked.Revision);

        var open = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { linked.Revision });
        open.EnsureSuccessStatusCode();
        Assert.Equal(chatPhone, (await open.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("phone").GetString());
    }

    [Fact]
    public async Task ConcurrentCreatesWithDifferentNinthDigitFormatsSaveOnlyOneLead()
    {
        using var factory = new ApiFactory();
        using var client = await factory.Login("camila");
        using var other = await factory.Login("camila");
        var responses = await Task.WhenAll(
            client.PostAsJsonAsync("/api/leads", new { branchId = 1, sellerId = 2, name = "Com 9", phone = "5551988882001" }),
            other.PostAsJsonAsync("/api/leads", new { branchId = 1, sellerId = 2, name = "Sem 9", phone = "(51) 8888-2001" }));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
    }

    [Theory]
    [InlineData("5511933331234", "551133331234")]
    [InlineData("4411999991234", "441199991234")]
    public async Task DoesNotInferNinthDigitForLandlinesOrInternationalNumbers(string savedPhone, string chatPhone)
    {
        using var factory = new ApiFactory();
        using var client = await factory.Login("camila");
        var lead = await Create(client, savedPhone);
        using var response = await MatchAlreadyRegisteredPhone(client, chatPhone);
        response.EnsureSuccessStatusCode();
        Assert.Equal(JsonValueKind.Null, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("lead").ValueKind);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId = chatPhone + "@s.whatsapp.net" })).StatusCode);
        await Create(client, chatPhone);
    }

    [Fact]
    public async Task VariantOnlyChangesPhoneAndLinkAfterAcceptance()
    {
        using var factory = new ConversationFactory("555188882001");
        using var client = await factory.Login("camila");
        var lead = await Create(client);
        var response = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision });
        response.EnsureSuccessStatusCode();
        Assert.True((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requiresConfirmation").GetBoolean());
        var unchanged = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Phone, unchanged!.Phone);
        Assert.Null(unchanged.ChatId);
        Assert.Equal(lead.Revision, unchanged.Revision);
        (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision, acceptedPhone = "555188882001" })).EnsureSuccessStatusCode();
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal("555188882001", saved!.Phone);
        Assert.Equal(saved.Phone + "@s.whatsapp.net", saved.ChatId);
        Assert.Equal(2, saved.ChatUserId);
        Assert.Equal(lead.Revision + 1, saved.Revision);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision })).StatusCode);
    }

    [Fact]
    public async Task ExactNumberLinksImmediatelyAndOnlyCurrentSellerCanLink()
    {
        using var factory = new ConversationFactory("5551988882001");
        using var client = await factory.Login("camila");
        using var other = await factory.Login("rafael");
        var lead = await Create(client);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision })).StatusCode);
        var response = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision });
        response.EnsureSuccessStatusCode();
        Assert.False((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requiresConfirmation").GetBoolean());
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Phone, saved!.Phone);
        Assert.Equal(lead.Phone + "@s.whatsapp.net", saved.ChatId);
    }

    [Fact]
    public async Task DuplicateVariantIsRejectedWithoutChangingLead()
    {
        using var factory = new ConversationFactory("555188882001");
        using var client = await factory.Login("camila");
        var lead = await Create(client);
        var duplicate = await AddHistoricalDuplicate(factory, lead, "555188882001");
        using var response = await MatchAlreadyRegisteredPhone(client, duplicate.Phone);
        response.EnsureSuccessStatusCode();
        var match = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(match.GetProperty("ambiguous").GetBoolean());
        Assert.Equal(JsonValueKind.Null, match.GetProperty("lead").ValueKind);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId = duplicate.Phone + "@s.whatsapp.net" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision, acceptedPhone = "555188882001" })).StatusCode);
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Phone, saved!.Phone);
        Assert.Null(saved.ChatId);
        var update = await client.PutAsJsonAsync($"/api/leads/{lead.Id}", new
        {
            lead.BranchId, lead.SellerId, lead.Name, lead.Phone, lead.Revision, notes = "Atendimento em andamento"
        });
        update.EnsureSuccessStatusCode();
        Assert.Equal("Atendimento em andamento", (await update.Content.ReadFromJsonAsync<Lead>())!.Notes);
    }

    [Fact]
    public async Task ExistingConversationRedirectsWithoutChangingLead()
    {
        using var factory = new ConversationFactory("5551988882001", true);
        using var client = await factory.Login("camila");
        var lead = await Create(client);
        var response = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.GetProperty("exists").GetBoolean());
        Assert.False(result.GetProperty("requiresConfirmation").GetBoolean());
        Assert.Equal(lead.Phone + "@s.whatsapp.net", result.GetProperty("chatId").GetString());
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Revision, saved!.Revision);
        Assert.Null(saved.ChatId);
    }

    [Fact]
    public async Task MissingNumberDoesNotChangeLead()
    {
        using var factory = new ConversationFactory(null);
        using var client = await factory.Login("camila");
        var lead = await Create(client);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision })).StatusCode);
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Revision, saved!.Revision);
        Assert.Null(saved.ChatId);
    }
}
