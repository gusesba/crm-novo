using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.WhatsApp;
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
        await Create(client, "555188882001");
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision, acceptedPhone = "555188882001" })).StatusCode);
        var saved = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Phone, saved!.Phone);
        Assert.Null(saved.ChatId);
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
