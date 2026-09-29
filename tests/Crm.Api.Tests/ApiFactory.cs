using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Crm.Api.Tests;

public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string database = Path.Combine(Path.GetTempPath(), $"via-tests-{Guid.NewGuid()}.db");
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Crm"] = $"Data Source={database}", ["Seed:Demo"] = "true", ["Seed:AdminPassword"] = "ViaDemo2026!"
        }));
    }
    public async Task<HttpClient> Login(string username = "admin")
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = "ViaDemo2026!" });
        response.EnsureSuccessStatusCode(); await Csrf(client); return client;
    }
    public static async Task Csrf(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
    }
    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); foreach (var suffix in new[] { "", "-shm", "-wal" }) if (File.Exists(database + suffix)) File.Delete(database + suffix); }
    }
}
