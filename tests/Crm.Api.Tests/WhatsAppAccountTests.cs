using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.WhatsApp;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class WhatsAppAccountTests
{
    private class Handler : HttpMessageHandler
    {
        public ConcurrentQueue<string> Paths { get; } = new();
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            Paths.Enqueue(path);
            if (path.EndsWith("profile-picture")) return Task.FromResult(new HttpResponseMessage(Status)
            {
                Content = new ByteArrayContent([1, 2, 3]) { Headers = { ContentType = new("image/png") } }
            });
            object payload = path.EndsWith("chats") || path.EndsWith("messages") ? Array.Empty<object>() : new
            {
                status = "connected", phone = "5551999999999", chatId = "5551999999999@s.whatsapp.net",
                requiresConfirmation = false, exists = true, message = "Conta indisponível."
            };
            return Task.FromResult(new HttpResponseMessage(Status) { Content = JsonContent.Create(payload) });
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
    private static async Task<string> Add(HttpClient client, string name = "Atendimento")
    {
        var response = await client.PostAsJsonAsync("/api/whatsapp/accounts", new { name, userId = 3 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task AccountsPersistWithAuthenticatedOwnerAndLegacySessionRemainsAvailable()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var original = await owner.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts");
        Assert.Equal("default", Assert.Single(original.EnumerateArray()).GetProperty("id").GetString());
        var first = await Add(owner, "  Comercial  ");
        var second = await Add(owner, "Pessoal");
        Assert.NotEqual(first, second);
        using var reloaded = await factory.Login("camila");
        var accounts = await reloaded.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts");
        Assert.Equal(3, accounts.GetArrayLength());
        Assert.Contains(accounts.EnumerateArray(), item => item.GetProperty("name").GetString() == "Comercial");
        using var other = await factory.Login("rafael");
        Assert.Single((await other.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).EnumerateArray());
        (await owner.GetAsync("/api/whatsapp/status")).EnsureSuccessStatusCode();
        (await owner.GetAsync($"/api/whatsapp/status?accountId={first}")).EnsureSuccessStatusCode();
        (await owner.GetAsync($"/api/whatsapp/status?accountId={second}")).EnsureSuccessStatusCode();
        Assert.Equal(new[] { "/sessions/2/status", $"/sessions/2_{first}/status", $"/sessions/2_{second}/status" }, factory.Service.Paths);
    }

    [Fact]
    public async Task EveryConversationOperationUsesExplicitAccountAndDisconnectDoesNotRemoveOtherAccounts()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var account = await Add(client);
        var suffix = $"?accountId={account}";
        foreach (var path in new[] { "chats", "messages", "media/message", "stickers", "contacts", "campaigns", "campaigns/campaign/messages", "campaigns/campaign/deliveries", "profile-picture" })
            (await client.GetAsync($"/api/whatsapp/{path}{suffix}&chatId=5551999999999%40s.whatsapp.net")).EnsureSuccessStatusCode();
        foreach (var path in new[] { "connect", "disconnect", "campaigns/campaign/cancel" })
            (await client.PostAsync($"/api/whatsapp/{path}{suffix}", null)).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync($"/api/whatsapp/resolve-phone{suffix}", new { phone = "5551999999999" })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync($"/api/whatsapp/send{suffix}", new { chatId = "5551999999999@s.whatsapp.net", text = "Olá" })).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"/api/whatsapp/chats/read{suffix}", new { chatId = "5551999999999@s.whatsapp.net", lastMessageId = "message" })).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"/api/whatsapp/chats/archive{suffix}", new { chatId = "5551999999999@s.whatsapp.net", archived = true })).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"/api/whatsapp/contacts{suffix}", new { chatId = "5551999999999@s.whatsapp.net", firstName = "Maria" })).EnsureSuccessStatusCode();
        Assert.All(factory.Service.Paths, path => Assert.StartsWith($"/sessions/2_{account}/", path));
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).GetArrayLength());
        (await client.GetAsync("/api/whatsapp/status")).EnsureSuccessStatusCode();
        Assert.Equal("/sessions/2/status", factory.Service.Paths.Last());
    }

    [Fact]
    public async Task ForeignAndUnknownAccountsNeverReachServiceEvenForAdministrators()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var account = await Add(owner);
        foreach (var username in new[] { "admin", "rafael" })
        {
            using var other = await factory.Login(username);
            foreach (var id in new[] { account, "missing", "../2" })
            {
                Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/whatsapp/status?accountId={id}")).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/whatsapp/disconnect?accountId={id}&userId=2", null)).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/whatsapp/media/message?accountId={id}")).StatusCode);
            }
        }
        Assert.Empty(factory.Service.Paths);
    }

    [Fact]
    public async Task HistoryAccountSelectionStillRequiresOwnerScopeAndCannotBeUsedForSending()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var account = await Add(owner);
        using var admin = await factory.Login();
        Assert.Equal(2, (await admin.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts?userId=2")).GetArrayLength());
        (await admin.GetAsync($"/api/whatsapp/messages?userId=2&accountId={account}&chatId=5551999999999%40s.whatsapp.net")).EnsureSuccessStatusCode();
        Assert.Equal($"/sessions/2_{account}/messages", Assert.Single(factory.Service.Paths));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"/api/whatsapp/connect?userId=2&accountId={account}", null)).StatusCode);
        using var seller = await factory.Login("rafael");
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/whatsapp/accounts?userId=2")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync($"/api/whatsapp/messages?userId=2&accountId={account}&chatId=test")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Outra sede" };
            db.Branches.Add(branch);
            await db.SaveChangesAsync();
            var user = await db.Users.FindAsync(1);
            user!.BranchId = branch.Id;
            await db.SaveChangesAsync();
        }
        using var branchAdmin = await factory.Login();
        Assert.Equal(HttpStatusCode.Forbidden, (await branchAdmin.GetAsync("/api/whatsapp/accounts?userId=2")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await branchAdmin.GetAsync($"/api/whatsapp/messages?userId=2&accountId={account}&chatId=test")).StatusCode);
    }

    [Fact]
    public async Task CreationValidatesNameAndRequiresAuthenticationAndCsrf()
    {
        using var factory = new Factory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/accounts")).StatusCode);
        using var client = await factory.Login();
        foreach (var name in new[] { "", "   ", new string('x', 81) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/whatsapp/accounts", new { name })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/whatsapp/accounts", new { name = "Atendimento" })).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).EnumerateArray());
        Assert.Empty(factory.Service.Paths);
    }

    [Fact]
    public async Task AccountServiceFailuresArePropagatedWithoutChangingRegistration()
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        var account = await Add(client);
        factory.Service.Status = HttpStatusCode.Conflict;
        var response = await client.PostAsync($"/api/whatsapp/connect?accountId={account}", null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Conta indisponível.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).GetArrayLength());
    }

    [Fact]
    public async Task RemovingOwnedAccountRetiresOnlyItsSessionAndPersistsRemoval()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var account = await Add(owner);
        var other = await Add(owner, "Pessoal");
        var response = await owner.DeleteAsync($"/api/whatsapp/accounts/{account}?accountId={other}&userId=3");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal($"/sessions/2_{account}", Assert.Single(factory.Service.Paths));
        using var reloaded = await factory.Login("camila");
        var accounts = await reloaded.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts");
        Assert.Equal(new[] { "default", other }, accounts.EnumerateArray().Select(x => x.GetProperty("id").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/whatsapp/status?accountId={account}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"/api/whatsapp/accounts/{account}")).StatusCode);
        Assert.Single(factory.Service.Paths);
    }

    [Fact]
    public async Task RemovingAccountRequiresOwnerCsrfAndKeepsPrimary()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var account = await Add(owner);
        foreach (var username in new[] { "admin", "rafael" })
        {
            using var other = await factory.Login(username);
            Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/whatsapp/accounts/{account}?userId=2")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.DeleteAsync("/api/whatsapp/accounts/default")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync("/api/whatsapp/accounts/missing")).StatusCode);
        owner.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.DeleteAsync($"/api/whatsapp/accounts/{account}")).StatusCode);
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.DeleteAsync($"/api/whatsapp/accounts/{account}")).StatusCode);
        Assert.Equal(2, (await owner.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).GetArrayLength());
        Assert.Empty(factory.Service.Paths);
    }

    [Fact]
    public async Task FailedSessionRemovalKeepsAccountAvailableForRetry()
    {
        using var factory = new Factory();
        using var owner = await factory.Login("camila");
        var account = await Add(owner);
        factory.Service.Status = HttpStatusCode.BadGateway;
        var response = await owner.DeleteAsync($"/api/whatsapp/accounts/{account}");
        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Equal(2, (await owner.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).GetArrayLength());
        factory.Service.Status = HttpStatusCode.OK;
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/whatsapp/accounts/{account}")).StatusCode);
        Assert.Single((await owner.GetFromJsonAsync<JsonElement>("/api/whatsapp/accounts")).EnumerateArray());
    }

    [Fact]
    public async Task LinkedLeadResolvesOnSelectedAdditionalAccountAndCampaignUsesSameAccount()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var account = await Add(client);
        var response = await client.PostAsJsonAsync("/api/leads", new
        {
            branchId = 1, sellerId = 2, name = "Cliente mult conta", phone = "5551999999999", status = LeadStatuses.Contact, origin = "site"
        });
        response.EnsureSuccessStatusCode();
        var lead = (await response.Content.ReadFromJsonAsync<Lead>())!;
        response = await client.PostAsJsonAsync($"/api/leads/{lead.Id}/link", new { chatId = lead.Phone + "@s.whatsapp.net" });
        response.EnsureSuccessStatusCode();
        lead = (await response.Content.ReadFromJsonAsync<Lead>())!;
        (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation", new { lead.Revision })).EnsureSuccessStatusCode();
        Assert.Empty(factory.Service.Paths);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation?accountId=missing", new { lead.Revision })).StatusCode);
        (await client.PostAsJsonAsync($"/api/leads/{lead.Id}/conversation?accountId={account}", new { lead.Revision })).EnsureSuccessStatusCode();
        Assert.Equal($"/sessions/2_{account}/resolve-phone", Assert.Single(factory.Service.Paths));
        var unchanged = await client.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Revision, unchanged!.Revision);
        (await client.PostAsJsonAsync($"/api/whatsapp/campaigns?accountId={account}", new
        {
            name = "Disparo adicional", messages = new[] { new { text = "Olá" } }, leadIds = new[] { lead.Id }
        })).EnsureSuccessStatusCode();
        Assert.Equal($"/sessions/2_{account}/campaigns", factory.Service.Paths.Last());
    }
}
