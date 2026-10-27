using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class MediaStorageTests
{
    private class Handler : HttpMessageHandler
    {
        public ConcurrentQueue<(string Path, HttpMethod Method, string Body)> Calls { get; } = new();
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Enqueue((request.RequestUri!.AbsolutePath, request.Method, request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken)));
            return new HttpResponseMessage(Status) { Content = JsonContent.Create(Status == HttpStatusCode.OK ? new { message = "ok" } : new { message = "Armazenamento indisponível." }) };
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
    public async Task GlobalAdminCanReadConfigurePreviewAndConfirmCleanup()
    {
        using var factory = new Factory();
        using var admin = await factory.Login();
        (await admin.GetAsync("/api/settings/media?userId=2")).EnsureSuccessStatusCode();
        (await admin.PutAsJsonAsync("/api/settings/media", new { retentionEnabled = true, retentionDays = 45 })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/settings/media/cleanup-preview", new { days = 30 })).EnsureSuccessStatusCode();
        (await admin.PostAsJsonAsync("/api/settings/media/cleanup", new { days = 30, confirmed = true })).EnsureSuccessStatusCode();
        var calls = factory.Service.Calls.ToArray();
        Assert.Equal(new[] { "/media-storage", "/media-storage/settings", "/media-storage/cleanup-preview", "/media-storage/cleanup" }, calls.Select(x => x.Path));
        Assert.Equal(new[] { HttpMethod.Get, HttpMethod.Put, HttpMethod.Post, HttpMethod.Post }, calls.Select(x => x.Method));
        var settings = JsonSerializer.Deserialize<JsonElement>(calls[1].Body);
        Assert.True(settings.GetProperty("retentionEnabled").GetBoolean());
        Assert.Equal(45, settings.GetProperty("retentionDays").GetInt32());
        Assert.False(settings.TryGetProperty("userId", out _));
    }
    [Fact]
    public async Task SellerAndBranchAdminCannotReadOrModifySharedMedia()
    {
        using var factory = new Factory();
        using var global = await factory.Login();
        (await global.PostAsJsonAsync("/api/catalog/users", new { name = "Admin mídia", username = "media-admin", password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        foreach (var username in new[] { "camila", "media-admin" })
        {
            using var client = await factory.Login(username);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/settings/media")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/settings/media", new { retentionEnabled = false, retentionDays = 30 })).StatusCode);
            foreach (var action in new[] { "cleanup-preview", "cleanup" })
                Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/settings/media/{action}", new { days = 30, confirmed = true })).StatusCode);
        }
        Assert.Empty(factory.Service.Calls);
    }
    [Theory]
    [InlineData("", "{}")]
    [InlineData("", "{\"retentionEnabled\":null,\"retentionDays\":30}")]
    [InlineData("", "{\"retentionEnabled\":true,\"retentionDays\":0}")]
    [InlineData("", "{\"retentionEnabled\":false,\"retentionDays\":3651}")]
    [InlineData("/cleanup-preview", "{\"days\":0}")]
    [InlineData("/cleanup-preview", "{\"days\":1.5}")]
    [InlineData("/cleanup", "{\"days\":30}")]
    [InlineData("/cleanup", "{\"days\":30,\"confirmed\":false}")]
    [InlineData("/cleanup", "{\"days\":-1,\"confirmed\":true}")]
    public async Task InvalidOrUnconfirmedRequestsNeverReachService(string action, string json)
    {
        using var factory = new Factory();
        using var admin = await factory.Login();
        using var body = new StringContent(json, Encoding.UTF8, "application/json");
        var response = action == "" ? await admin.PutAsync("/api/settings/media", body) : await admin.PostAsync($"/api/settings/media{action}", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(factory.Service.Calls);
    }
    [Fact]
    public async Task AuthenticationCsrfAndServiceFailuresArePreserved()
    {
        using var factory = new Factory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/settings/media")).StatusCode);
        using var admin = await factory.Login();
        admin.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/settings/media/cleanup", new { days = 30, confirmed = true })).StatusCode);
        Assert.Empty(factory.Service.Calls);
        factory.Service.Status = HttpStatusCode.ServiceUnavailable;
        var response = await admin.GetAsync("/api/settings/media");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("Armazenamento indisponível.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }
}
