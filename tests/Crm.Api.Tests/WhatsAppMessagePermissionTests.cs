using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
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

    [Theory]
    [InlineData("5511988887777@s.whatsapp.net", HttpStatusCode.OK)]
    [InlineData("123@g.us", HttpStatusCode.BadRequest)]
    public async Task UnknownPhoneRemainsAllowedAndGroupRemainsBlocked(string chatId, HttpStatusCode expected)
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");

        Assert.Equal(expected, (await MessageAction(client, "POST", "send", chatId)).StatusCode);
        Assert.Equal(expected == HttpStatusCode.OK ? 1 : 0, factory.Service.Calls.Count);
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
