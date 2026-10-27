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

public class WhatsAppBackupTests
{
    private const string Number = "5551999990001";
    private class Handler : HttpMessageHandler
    {
        public ConcurrentQueue<string> Paths { get; } = new();
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery;
            Paths.Enqueue(path);
            object payload = path.EndsWith("numbers") ? new[] { new { id = Number, phone = Number } }
                : path.Contains("/chats") ? new object[] { new { id = "5551999998888@s.whatsapp.net", name = "Contato", lastText = "Texto", updatedAt = 100L, archived = 0, pinnedAt = 0 } }
                : new object[] { new { id = "message", text = "Texto sem mídia", kind = "text" } };
            return Task.FromResult(new HttpResponseMessage(Status)
            {
                Content = JsonContent.Create(Status == HttpStatusCode.OK ? payload : new { message = "Backup indisponível." })
            });
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
    [Fact]
    public async Task BackupUsesAuthenticatedOwnerAndNumberInsteadOfConnectionTab()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        foreach (var account in new[] { "default", "unknown-tab" })
        {
            (await client.GetAsync($"/api/whatsapp/backup/numbers?accountId={account}")).EnsureSuccessStatusCode();
            (await client.GetAsync($"/api/whatsapp/backup/chats?number={Number}&accountId={account}")).EnsureSuccessStatusCode();
            (await client.GetAsync($"/api/whatsapp/backup/messages?number={Number}&chatId=5551999998888%40s.whatsapp.net&before=100&beforeId=last&accountId={account}")).EnsureSuccessStatusCode();
        }
        Assert.All(factory.Service.Paths, path => Assert.StartsWith("/backups/2/", path));
        Assert.Contains($"/backups/2/{Number}/messages?chatId=5551999998888%40s.whatsapp.net&before=100&beforeId=last", factory.Service.Paths);
        Assert.DoesNotContain(factory.Service.Paths, path => path.Contains("/sessions/") || path.Contains("/media/") || path.Contains("profile-picture"));
    }
    [Fact]
    public async Task BackupRequiresAuthenticationAndRejectsForeignUserForSellers()
    {
        using var factory = new Factory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/backup/numbers")).StatusCode);
        using var client = await factory.Login("camila");
        foreach (var path in new[] { "numbers?", $"chats?number={Number}&", $"messages?number={Number}&chatId=test&" })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/whatsapp/backup/{path}userId=3")).StatusCode);
        Assert.Empty(factory.Service.Paths);
    }
    [Fact]
    public async Task AdministratorHistoryKeepsBranchScopeForAllBackupRoutes()
    {
        using var factory = new Factory();
        using var admin = await factory.Login();
        (await admin.GetAsync("/api/whatsapp/backup/numbers?userId=2")).EnsureSuccessStatusCode();
        Assert.Equal("/backups/2/numbers", Assert.Single(factory.Service.Paths));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Sede de conferência" };
            db.Branches.Add(branch);
            await db.SaveChangesAsync();
            (await db.Users.FindAsync(1))!.BranchId = branch.Id;
            await db.SaveChangesAsync();
        }
        using var branchAdmin = await factory.Login();
        foreach (var path in new[] { "numbers?", $"chats?number={Number}&", $"messages?number={Number}&chatId=test&" })
            Assert.Equal(HttpStatusCode.Forbidden, (await branchAdmin.GetAsync($"/api/whatsapp/backup/{path}userId=2")).StatusCode);
        Assert.Single(factory.Service.Paths);
    }
    [Theory]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("../2")]
    [InlineData("5551999990001/x")]
    public async Task MalformedNumbersNeverReachWhatsAppService(string number)
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        foreach (var endpoint in new[] { "chats", "messages" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/whatsapp/backup/{endpoint}?number={Uri.EscapeDataString(number)}&chatId=test")).StatusCode);
        Assert.Empty(factory.Service.Paths);
    }
    [Fact]
    public async Task MissingNumbersAndIntegrationFailuresPreserveTheirStatuses()
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        foreach (var status in new[] { HttpStatusCode.NotFound, HttpStatusCode.ServiceUnavailable })
        {
            factory.Service.Status = status;
            var response = await client.GetAsync($"/api/whatsapp/backup/chats?number={Number}");
            Assert.Equal(status, response.StatusCode);
            Assert.Equal("Backup indisponível.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        }
        factory.Service.Status = HttpStatusCode.OK;
        (await client.GetAsync("/api/whatsapp/backup/chats?number=legacy_1")).EnsureSuccessStatusCode();
        Assert.Equal("/backups/1/legacy_1/chats", factory.Service.Paths.Last());
    }
}
