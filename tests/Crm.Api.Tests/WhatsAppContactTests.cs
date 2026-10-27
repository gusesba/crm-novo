using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class WhatsAppContactTests
{
    private class Handler : HttpMessageHandler
    {
        public ConcurrentQueue<(string Path, string Query, HttpMethod Method, string Body)> Calls { get; } = new();
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Enqueue((request.RequestUri!.AbsolutePath, request.RequestUri.Query, request.Method, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken)));
            return new HttpResponseMessage(Status) { Content = JsonContent.Create(new { message = "Falha no contato.", chatId = "5551999999999@s.whatsapp.net", firstName = "Maria Clara", lastName = "Silva", fullName = "Maria Clara Silva", saved = true }) };
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
    [Theory]
    [InlineData("admin", 1)]
    [InlineData("camila", 2)]
    public async Task ContactReadsAndWritesOnlyUseOwnWhatsAppAccount(string username, int userId)
    {
        using var factory = new Factory();
        using var client = await factory.Login(username);
        (await client.GetAsync("/api/whatsapp/contacts?chatId=5551999999999%40s.whatsapp.net&userId=3")).EnsureSuccessStatusCode();
        var response = await client.PutAsJsonAsync("/api/whatsapp/contacts?userId=3", new { chatId = "5551999999999@s.whatsapp.net", firstName = "  Maria Clara  ", lastName = " Silva ", userId = 3 });
        response.EnsureSuccessStatusCode();
        var contact = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Maria Clara", contact.GetProperty("firstName").GetString());
        var calls = factory.Service.Calls.ToArray();
        Assert.All(calls, call => Assert.Equal($"/sessions/{userId}/contacts", call.Path));
        Assert.Contains("chatId=5551999999999", calls[0].Query);
        var payload = JsonSerializer.Deserialize<JsonElement>(calls[1].Body);
        Assert.Equal("Maria Clara", payload.GetProperty("firstName").GetString());
        Assert.Equal("Silva", payload.GetProperty("lastName").GetString());
        Assert.False(payload.TryGetProperty("userId", out _));
    }
    [Theory]
    [InlineData("1234567890")]
    [InlineData("51990000030")]
    [InlineData("5551999999999")]
    [InlineData("123456789012345")]
    public async Task ContactSupportsExistingLeadConversationIdsWithoutRewritingPhone(string phone)
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var chatId = phone + "@s.whatsapp.net";
        (await client.GetAsync($"/api/whatsapp/contacts?chatId={Uri.EscapeDataString(chatId)}")).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync("/api/whatsapp/contacts", new { chatId, firstName = "Larissa", lastName = "Mendes" })).EnsureSuccessStatusCode();
        var calls = factory.Service.Calls.ToArray();
        Assert.Equal(2, calls.Length);
        Assert.All(calls, call => Assert.Equal("/sessions/2/contacts", call.Path));
        Assert.Contains(Uri.EscapeDataString(chatId), calls[0].Query);
        Assert.Equal(chatId, JsonSerializer.Deserialize<JsonElement>(calls[1].Body).GetProperty("chatId").GetString());
    }
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"chatId\":\"123@g.us\",\"firstName\":\"Nome\"}")]
    [InlineData("{\"chatId\":\"123@lid\",\"firstName\":\"Nome\"}")]
    [InlineData("{\"chatId\":\"5551999999999@s.whatsapp.net\",\"firstName\":\"  \"}")]
    public async Task InvalidContactRequestsNeverReachService(string json)
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsync("/api/whatsapp/contacts", new StringContent(json, Encoding.UTF8, "application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/whatsapp/contacts?chatId=123%40g.us")).StatusCode);
        Assert.Empty(factory.Service.Calls);
    }
    [Fact]
    public async Task NamesHaveLimitsAndSurnameIsOptional()
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        foreach (var field in new[] { "firstName", "lastName" })
        {
            var payload = new Dictionary<string, string> { ["chatId"] = "5551999999999@s.whatsapp.net", ["firstName"] = "Nome", [field] = new string('a', 81) };
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/whatsapp/contacts", payload)).StatusCode);
        }
        Assert.Empty(factory.Service.Calls);
        (await client.PutAsJsonAsync("/api/whatsapp/contacts", new { chatId = "5551999999999@s.whatsapp.net", firstName = "Nome" })).EnsureSuccessStatusCode();
        Assert.Equal("", JsonSerializer.Deserialize<JsonElement>(Assert.Single(factory.Service.Calls).Body).GetProperty("lastName").GetString());
    }
    [Fact]
    public async Task ContactWriteRequiresAuthenticationAndCsrfAndPreservesRemoteFailures()
    {
        using var factory = new Factory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/contacts?chatId=5551999999999%40s.whatsapp.net")).StatusCode);
        using var client = await factory.Login();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        var payload = new { chatId = "5551999999999@s.whatsapp.net", firstName = "Nome" };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/whatsapp/contacts", payload)).StatusCode);
        Assert.Empty(factory.Service.Calls);
        await ApiFactory.Csrf(client);
        factory.Service.Status = HttpStatusCode.Conflict;
        var response = await client.PutAsJsonAsync("/api/whatsapp/contacts", payload);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Falha no contato.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }
}
