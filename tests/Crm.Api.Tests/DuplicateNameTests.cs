using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class DuplicateNameTests
{
    [Theory]
    [InlineData("branches", "Já existe uma sede com este nome.")]
    [InlineData("items/service", "Já existe um serviço com este nome.")]
    [InlineData("items/condition", "Já existe uma condição com este nome.")]
    public async Task CatalogRejectsDuplicatesOnCreateAndUpdateIncludingInactiveRecords(string path, string message)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var url = $"/api/catalog/{path}";
        var first = await Create(admin, url, "  Área São José  ", false);
        Assert.Equal("Área São José", first.GetProperty("name").GetString());
        await Conflict(await admin.PostAsJsonAsync(url, new { name = "  ÁREA SÃO JOSÉ  ", active = true }), message);
        var second = await Create(admin, url, "Outro nome");
        var updateUrl = path == "branches" ? url : "/api/catalog/items";
        updateUrl += $"/{second.GetProperty("id").GetInt32()}";
        await Conflict(await admin.PutAsJsonAsync(updateUrl, new { name = "área são josé", active = false }), message);
        var catalog = await admin.GetFromJsonAsync<JsonElement>("/api/catalog");
        var key = path == "branches" ? "branches" : path == "items/service" ? "services" : "conditions";
        var stored = catalog.GetProperty(key).EnumerateArray().Single(x => x.GetProperty("id").GetInt32() == second.GetProperty("id").GetInt32());
        Assert.Equal("Outro nome", stored.GetProperty("name").GetString());
        Assert.True(stored.GetProperty("active").GetBoolean());
        Assert.Single(catalog.GetProperty(key).EnumerateArray(), x => x.GetProperty("name").GetString() == "Área São José");
        (await admin.PutAsJsonAsync(updateUrl, new { name = "  OUTRO NOME  ", active = false })).EnsureSuccessStatusCode();
        var firstUrl = (path == "branches" ? url : "/api/catalog/items") + $"/{first.GetProperty("id").GetInt32()}";
        (await admin.PutAsJsonAsync(firstUrl, new { name = "Área São José", active = true })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task CatalogNamesAreIndependentBetweenBranchesServicesAndConditions()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        foreach (var path in new[] { "branches", "items/service", "items/condition" })
            await Create(admin, $"/api/catalog/{path}", "Mesmo nome");
    }

    [Fact]
    public async Task GroupDuplicatesArePrivateAndFailedRenamePreservesMembers()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var other = await factory.Login("rafael");
        using var admin = await factory.Login();
        var leadId = (await seller.GetFromJsonAsync<Lead[]>("/api/groups/leads"))![0].Id;
        var first = await Create(seller, "/api/groups", "  Área São José  ");
        Assert.Equal("Área São José", first.GetProperty("name").GetString());
        await Conflict(await seller.PostAsJsonAsync("/api/groups", new { name = "ÁREA SÃO JOSÉ", leadIds = Array.Empty<int>() }), "Já existe um grupo com este nome.");
        var secondResponse = await seller.PostAsJsonAsync("/api/groups", new { name = "Outro grupo", leadIds = new[] { leadId } });
        secondResponse.EnsureSuccessStatusCode();
        var secondId = (await secondResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        await Conflict(await seller.PutAsJsonAsync($"/api/groups/{secondId}", new { name = " área são josé ", leadIds = Array.Empty<int>() }), "Já existe um grupo com este nome.");
        var stored = await seller.GetFromJsonAsync<JsonElement>($"/api/groups/{secondId}");
        Assert.Equal("Outro grupo", stored.GetProperty("name").GetString());
        Assert.Equal(leadId, Assert.Single(stored.GetProperty("members").EnumerateArray()).GetProperty("id").GetInt32());
        (await seller.PutAsJsonAsync($"/api/groups/{secondId}", new { name = " OUTRO GRUPO ", leadIds = new[] { leadId } })).EnsureSuccessStatusCode();
        Assert.Equal(2, (await seller.GetFromJsonAsync<JsonElement>("/api/groups")).GetArrayLength());
        var foreign = await Create(other, "/api/groups", "Área São José");
        await Create(admin, "/api/groups", "Área São José");
        Assert.Equal(HttpStatusCode.NotFound, (await seller.PutAsJsonAsync($"/api/groups/{foreign.GetProperty("id").GetInt32()}", new { name = "Área São José", leadIds = Array.Empty<int>() })).StatusCode);
        var firstId = first.GetProperty("id").GetInt32();
        (await seller.DeleteAsync($"/api/groups/{firstId}")).EnsureSuccessStatusCode();
        await Create(seller, "/api/groups", "Área São José");
    }

    [Fact]
    public async Task NameValidationPreservesCatalogPermissionsAndMissingRecordResponses()
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        using var seller = await factory.Login("camila");
        var branch = await Create(global, "/api/catalog/branches", "Sede reservada");
        var userResponse = await global.PostAsJsonAsync("/api/catalog/users", new { name = "Admin local", username = "local-admin",
            password = "ViaDemo2026!", isAdmin = true, active = true, branchId = 1 });
        userResponse.EnsureSuccessStatusCode();
        using var local = await factory.Login("local-admin");
        foreach (var path in new[] { "branches", "items/service", "items/condition" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync($"/api/catalog/{path}", new { name = "Sede reservada" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await local.PostAsJsonAsync($"/api/catalog/{path}", new { name = "Sede reservada" })).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await local.PutAsJsonAsync($"/api/catalog/branches/{branch.GetProperty("id").GetInt32()}", new { name = "Unidade Centro" })).StatusCode);
        await Conflict(await local.PutAsJsonAsync("/api/catalog/branches/1", new { name = " SEDE RESERVADA " }), "Já existe uma sede com este nome.");
        (await local.PutAsJsonAsync("/api/catalog/branches/1", new { name = "Unidade Centro", active = true })).EnsureSuccessStatusCode();
        foreach (var path in new[] { "catalog/branches", "catalog/items", "groups" })
            Assert.Equal(HttpStatusCode.NotFound, (await global.PutAsJsonAsync($"/api/{path}/999999", new { name = "Sede reservada", leadIds = Array.Empty<int>() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await global.PostAsJsonAsync("/api/catalog/items/invalid", new { name = "Sede reservada" })).StatusCode);
    }

    [Theory]
    [InlineData("/api/catalog/branches")]
    [InlineData("/api/catalog/items/service")]
    [InlineData("/api/catalog/items/condition")]
    [InlineData("/api/groups")]
    public async Task SimultaneousCreatesCannotSaveTheSameNameTwice(string url)
    {
        using var factory = new ApiFactory();
        using var first = await factory.Login();
        using var second = await factory.Login();
        var responses = await Task.WhenAll(
            first.PostAsJsonAsync(url, new { name = "Área concorrente", active = true, leadIds = Array.Empty<int>() }),
            second.PostAsJsonAsync(url, new { name = " ÁREA CONCORRENTE ", active = false, leadIds = Array.Empty<int>() }));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var count = url == "/api/groups" ? await db.Groups.CountAsync(x => x.Name.ToLower() == "área concorrente") :
            url.EndsWith("branches") ? await db.Branches.CountAsync(x => x.Name.ToLower() == "área concorrente") :
            await db.Catalog.CountAsync(x => x.Name.ToLower() == "área concorrente");
        Assert.Equal(1, count);
    }

    [Theory]
    [InlineData("/api/catalog/branches")]
    [InlineData("/api/catalog/items/service")]
    [InlineData("/api/catalog/items/condition")]
    [InlineData("/api/groups")]
    public async Task SimultaneousRenamesCannotSaveTheSameNameTwice(string url)
    {
        using var factory = new ApiFactory();
        using var first = await factory.Login();
        using var second = await factory.Login();
        var firstRecord = await Create(first, url, "Primeiro nome");
        var secondRecord = await Create(second, url, "Segundo nome");
        var updateUrl = url.Contains("/items/") ? "/api/catalog/items" : url;
        var responses = await Task.WhenAll(
            first.PutAsJsonAsync($"{updateUrl}/{firstRecord.GetProperty("id").GetInt32()}", new { name = "Área concorrente", active = false, leadIds = Array.Empty<int>() }),
            second.PutAsJsonAsync($"{updateUrl}/{secondRecord.GetProperty("id").GetInt32()}", new { name = " ÁREA CONCORRENTE ", active = false, leadIds = Array.Empty<int>() }));
        Assert.Single(responses, x => x.IsSuccessStatusCode);
        await Conflict(Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict), url == "/api/groups" ? "Já existe um grupo com este nome." :
            url.EndsWith("branches") ? "Já existe uma sede com este nome." : url.EndsWith("service") ? "Já existe um serviço com este nome." : "Já existe uma condição com este nome.");
    }

    [Theory]
    [InlineData("/api/catalog/branches")]
    [InlineData("/api/catalog/items/service")]
    [InlineData("/api/catalog/items/condition")]
    [InlineData("/api/groups")]
    public async Task EmptyNamesAreRejected(string url)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync(url, new { name = "   ", leadIds = Array.Empty<int>() })).StatusCode);
    }

    private static async Task<JsonElement> Create(HttpClient client, string url, string name, bool active = true)
    {
        var response = await client.PostAsJsonAsync(url, new { name, active, leadIds = Array.Empty<int>() });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task Conflict(HttpResponseMessage response, string message)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(message, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }
}
