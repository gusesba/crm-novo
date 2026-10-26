using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class WhatsAppUnreadTests
{
    private class Handler : HttpMessageHandler
    {
        public ConcurrentQueue<(string Path, HttpMethod Method, string Body)> Calls { get; } = new();
        public HttpStatusCode ReadStatus { get; set; } = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            Calls.Enqueue((path, request.Method, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken)));
            if (path.EndsWith("/chats"))
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""
                    [
                      {"id":"5551999999999@s.whatsapp.net","name":"Cliente","lastText":"Olá","updatedAt":1,"archived":0,"pinnedAt":0,"unreadCount":4},
                      {"id":"123@g.us","name":"Grupo","lastText":"Olá","updatedAt":1,"archived":1,"pinnedAt":1,"unreadCount":105},
                      {"id":"123@lid","name":"Legado","lastText":"Olá","updatedAt":1,"archived":0,"pinnedAt":0,"markedUnread":1},
                      {"id":"124@lid","name":"Inválido","lastText":"Olá","updatedAt":1,"archived":0,"pinnedAt":0,"unreadCount":"invalid"},
                      {"id":"125@lid","name":"Negativo","lastText":"Olá","updatedAt":1,"archived":0,"pinnedAt":0,"unreadCount":-1}
                    ]
                    """, Encoding.UTF8, "application/json") };
            return new HttpResponseMessage(ReadStatus)
            {
                Content = ReadStatus == HttpStatusCode.OK
                    ? JsonContent.Create(new { chatId = "5551999999999@s.whatsapp.net", unreadCount = 0 })
                    : JsonContent.Create(new { message = "Leitura indisponível." })
            };
        }
    }

    private class UnreadFactory : ApiFactory
    {
        public Handler Service { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>()
                .ConfigurePrimaryHttpMessageHandler(() => Service));
        }
    }

    [Fact]
    public async Task ChatsExposeCountAndRemainCompatibleWithOlderServicePayloads()
    {
        using var factory = new UnreadFactory();
        using var admin = await factory.Login();
        var chats = (await admin.GetFromJsonAsync<JsonElement[]>("/api/whatsapp/chats"))!;
        Assert.Equal(new[] { 4, 105, 0, 0, 0 }, chats.Select(chat => chat.GetProperty("unreadCount").GetInt32()));
        Assert.True(chats[1].GetProperty("archived").GetBoolean());
        Assert.Equal(1, chats[1].GetProperty("pinnedAt").GetInt32());
        Assert.True(chats[2].GetProperty("markedUnread").GetBoolean());
        Assert.False(chats[0].GetProperty("markedUnread").GetBoolean());
        (await admin.GetAsync("/api/whatsapp/chats?userId=2")).EnsureSuccessStatusCode();
        Assert.Contains(factory.Service.Calls, call => call.Path == "/sessions/2/chats");
        using var seller = await factory.Login("camila");
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/whatsapp/chats?userId=3")).StatusCode);
    }

    [Theory]
    [InlineData("admin", 1)]
    [InlineData("camila", 2)]
    public async Task ReadOnlyTargetsAuthenticatedSessionEvenWhenAnotherUserIsSupplied(string username, int userId)
    {
        using var factory = new UnreadFactory();
        using var client = await factory.Login(username);
        var response = await client.PutAsJsonAsync("/api/whatsapp/chats/read?userId=3", new
        { chatId = "5551999999999@s.whatsapp.net", lastMessageId = "last", userId = 3 });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, result.GetProperty("unreadCount").GetInt32());
        var call = Assert.Single(factory.Service.Calls);
        Assert.Equal($"/sessions/{userId}/chats/read", call.Path);
        Assert.Equal(HttpMethod.Put, call.Method);
        using var body = JsonDocument.Parse(call.Body);
        Assert.Equal("last", body.RootElement.GetProperty("lastMessageId").GetString());
        Assert.False(body.RootElement.TryGetProperty("userId", out _));
    }

    [Fact]
    public async Task ReadingRequiresAuthenticationAndCsrf()
    {
        using var factory = new UnreadFactory();
        var payload = new { chatId = "5551999999999@s.whatsapp.net", lastMessageId = "last" };
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PutAsJsonAsync("/api/whatsapp/chats/read", payload)).StatusCode);
        using var client = await factory.Login();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/whatsapp/chats/read", payload)).StatusCode);
        Assert.Empty(factory.Service.Calls);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"chatId\":\"5551999999999@s.whatsapp.net\"}")]
    [InlineData("{\"chatId\":\"status@broadcast\",\"lastMessageId\":\"last\"}")]
    [InlineData("{\"chatId\":\"123@g.us\",\"lastMessageId\":\"\"}")]
    public async Task InvalidReadPayloadsNeverReachTheService(string json)
    {
        using var factory = new UnreadFactory();
        using var client = await factory.Login();
        using var response = await client.PutAsync("/api/whatsapp/chats/read", new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(factory.Service.Calls);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.Conflict)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task ReadFailuresPreserveServiceStatusAndMessage(HttpStatusCode status)
    {
        using var factory = new UnreadFactory();
        factory.Service.ReadStatus = status;
        using var client = await factory.Login();
        using var response = await client.PutAsJsonAsync("/api/whatsapp/chats/read", new
        { chatId = "123@g.us", lastMessageId = "last" });
        Assert.Equal(status, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Leitura indisponível.", error.GetProperty("title").GetString());
    }
}
