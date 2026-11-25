using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.Leads;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class WhatsAppMessagePermissionTests
{
    private class Handler : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path, JsonElement Body)> Calls { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add((request.Method, request.RequestUri!.AbsolutePath, await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken)));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { sent = true }) };
        }
    }

    private class Factory : ApiFactory
    {
        public Handler Service { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>().ConfigurePrimaryHttpMessageHandler(() => Service));
        }
    }

    private static Task<HttpResponseMessage> MessageAction(HttpClient client, string method, string path, string chatId)
        => client.SendAsync(new HttpRequestMessage(new HttpMethod(method), "/api/whatsapp/" + path)
        {
            Content = JsonContent.Create(new { chatId, text = "Olá", emoji = "👍", forEveryone = false })
        });

    [Theory]
    [InlineData("camila", 2, "POST", "send")]
    [InlineData("camila", 2, "PUT", "messages/own-message")]
    [InlineData("camila", 2, "POST", "messages/own-message/react")]
    [InlineData("camila", 2, "POST", "messages/own-message/forward")]
    [InlineData("camila", 2, "DELETE", "messages/own-message")]
    [InlineData("admin", 1, "POST", "send")]
    public async Task OtherSellerLeadAllowsOwnSessionActionsWithoutChangingOwnership(string username, int userId, string method, string path)
    {
        using var factory = new Factory();
        using var client = await factory.Login(username);
        var before = (await client.GetFromJsonAsync<Lead>("/api/leads/2"))!;
        Assert.Equal(3, before.CurrentSellerId);

        (await MessageAction(client, method, path, before.Phone + "@s.whatsapp.net")).EnsureSuccessStatusCode();

        var call = Assert.Single(factory.Service.Calls);
        Assert.Equal(method, call.Method.Method);
        Assert.Equal($"/sessions/{userId}/{path}", call.Path);
        Assert.Equal(before.Phone + "@s.whatsapp.net", call.Body.GetProperty("chatId").GetString());
        var after = (await client.GetFromJsonAsync<Lead>("/api/leads/2"))!;
        Assert.Equal(before.BranchId, after.BranchId);
        Assert.Equal(before.SellerId, after.SellerId);
        Assert.Equal(before.CurrentSellerId, after.CurrentSellerId);
        Assert.Equal(before.ChatId, after.ChatId);
        Assert.Equal(before.ChatUserId, after.ChatUserId);
        Assert.Equal(before.Revision, after.Revision);
    }

    [Theory]
    [InlineData("POST", "send")]
    [InlineData("PUT", "messages/own-message")]
    [InlineData("POST", "messages/own-message/react")]
    [InlineData("POST", "messages/own-message/forward")]
    [InlineData("DELETE", "messages/own-message")]
    public async Task OtherSellerOptOutStillBlocksActionsBeforeCallingService(string method, string path)
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var lead = (await client.GetFromJsonAsync<Lead>("/api/leads/8"))!;
        Assert.Equal(3, lead.CurrentSellerId);
        Assert.Equal(LeadStatuses.OptOut, lead.Status);

        var response = await MessageAction(client, method, path, lead.Phone + "@s.whatsapp.net");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("Não Enviar Mais", await response.Content.ReadAsStringAsync());
        Assert.Empty(factory.Service.Calls);
    }

    [Fact]
    public async Task OptOutStillBlocksSendingToTheVariantWithoutNinthDigit()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var lead = (await client.GetFromJsonAsync<Lead>("/api/leads/8"))!;
        var chatId = lead.Phone.Remove(4, 1) + "@s.whatsapp.net";

        Assert.Equal(HttpStatusCode.Forbidden, (await MessageAction(client, "POST", "send", chatId)).StatusCode);
        Assert.Empty(factory.Service.Calls);
    }

    [Theory]
    [InlineData("5511988887777@s.whatsapp.net", HttpStatusCode.OK)]
    [InlineData("123@lid", HttpStatusCode.BadRequest)]
    [InlineData("status@broadcast", HttpStatusCode.BadRequest)]
    [InlineData("abc@g.us", HttpStatusCode.BadRequest)]
    [InlineData("123@@g.us", HttpStatusCode.BadRequest)]
    [InlineData("123 @g.us", HttpStatusCode.BadRequest)]
    public async Task UnknownPhoneRemainsAllowedAndUnsupportedIdsRemainBlocked(string chatId, HttpStatusCode expected)
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");

        Assert.Equal(expected, (await MessageAction(client, "POST", "send", chatId)).StatusCode);
        Assert.Equal(expected == HttpStatusCode.OK ? 1 : 0, factory.Service.Calls.Count);
    }

    [Theory]
    [InlineData("camila", 2, "POST", "send", "120363123456789012@g.us")]
    [InlineData("camila", 2, "POST", "send", "5511999999999-1234567890@g.us")]
    [InlineData("camila", 2, "PUT", "messages/own-message", "120363123456789012@g.us")]
    [InlineData("camila", 2, "POST", "messages/own-message/react", "120363123456789012@g.us")]
    [InlineData("camila", 2, "POST", "messages/own-message/forward", "120363123456789012@g.us")]
    [InlineData("camila", 2, "DELETE", "messages/own-message", "120363123456789012@g.us")]
    [InlineData("admin", 1, "POST", "send", "120363123456789012@g.us")]
    public async Task GroupAllowsOwnSessionActionsWithoutCreatingLead(string username, int userId, string method, string path, string chatId)
    {
        using var factory = new Factory();
        using var client = await factory.Login(username);
        var before = await client.GetFromJsonAsync<JsonElement>("/api/leads");

        (await MessageAction(client, method, path, chatId)).EnsureSuccessStatusCode();

        var call = Assert.Single(factory.Service.Calls);
        Assert.Equal(method, call.Method.Method);
        Assert.Equal($"/sessions/{userId}/{path}", call.Path);
        Assert.Equal(chatId, call.Body.GetProperty("chatId").GetString());
        var after = await client.GetFromJsonAsync<JsonElement>("/api/leads");
        Assert.Equal(before.GetRawText(), after.GetRawText());
    }

    [Theory]
    [InlineData("120363123456789@g.us")]
    [InlineData("5511999999999-1234567890@g.us")]
    public async Task GroupCannotBeRegisteredLinkedOrUsedAsCampaignRecipient(string chatId)
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var before = await client.GetFromJsonAsync<JsonElement>("/api/leads");
        var create = await client.PostAsJsonAsync("/api/leads", new LeadRequest
        {
            BranchId = 1, SellerId = 2, Name = "Grupo", Phone = chatId
        });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Contains("Grupos do WhatsApp", await create.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/leads/1/link", new { chatId })).StatusCode);
        var audience = new { leadIds = Array.Empty<int>(), recipients = new[] { new { leadId = 1, phone = chatId, name = "Grupo" } } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/whatsapp/campaigns/preview", audience)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/whatsapp/campaigns", new
        {
            name = "Grupo", messages = new[] { new { text = "Olá" } }, audience.leadIds, audience.recipients
        })).StatusCode);
        Assert.Empty(factory.Service.Calls);
        var after = await client.GetFromJsonAsync<JsonElement>("/api/leads");
        Assert.Equal(before.GetRawText(), after.GetRawText());
    }

    [Fact]
    public async Task CampaignDispatchesOtherSellerLeadThroughOwnSessionWithoutChangingOwnership()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var before = (await client.GetFromJsonAsync<Lead>("/api/leads/2"))!;

        var response = await client.PostAsJsonAsync("/api/whatsapp/campaigns", new
        {
            name = "Disparo de outra carteira", messages = new[] { new { text = "Olá" } }, leadIds = new[] { before.Id }
        });

        response.EnsureSuccessStatusCode();
        var call = Assert.Single(factory.Service.Calls);
        Assert.Equal("/sessions/2/campaigns", call.Path);
        var recipient = Assert.Single(call.Body.GetProperty("recipients").EnumerateArray());
        Assert.Equal(before.Id, recipient.GetProperty("leadId").GetInt32());
        Assert.Equal(before.Phone, recipient.GetProperty("phone").GetString());
        var after = (await client.GetFromJsonAsync<Lead>("/api/leads/2"))!;
        Assert.Equal(3, after.SellerId);
        Assert.Equal(3, after.CurrentSellerId);
        Assert.Equal(before.Revision, after.Revision);
    }
}
