using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;

namespace Crm.Api.Tests;

public class UserRegistrationTests
{
    [Fact]
    public async Task OnlyAdministratorsCanRegisterUsersWithinTheirScope()
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        using var seller = await factory.Login("camila");
        var branchResponse = await global.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        (await global.PostAsJsonAsync("/api/catalog/users", Request("branch-admin", true, 1))).EnsureSuccessStatusCode();
        using var admin = await factory.Login("branch-admin");

        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/catalog/users", Request("seller-created", false, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PostAsJsonAsync("/api/catalog/users", Request("seller-global", true, null))).StatusCode);
        var created = await admin.PostAsJsonAsync("/api/catalog/users", Request("own-seller", false, 1));
        created.EnsureSuccessStatusCode();
        var user = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(user.GetProperty("isAdmin").GetBoolean());
        Assert.Equal(1, user.GetProperty("branchId").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/catalog/users", Request("other-seller", false, branch.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync("/api/catalog/users", Request("other-global", true, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync($"/api/catalog/users/{user.GetProperty("id").GetInt32()}", Request("own-seller", true, null))).StatusCode);

        (await global.PostAsJsonAsync("/api/catalog/users", Request("global-seller-one", false, 1))).EnsureSuccessStatusCode();
        (await global.PostAsJsonAsync("/api/catalog/users", Request("global-seller-two", false, branch.Id))).EnsureSuccessStatusCode();
        created = await global.PostAsJsonAsync("/api/catalog/users", Request("new-global", true, null));
        created.EnsureSuccessStatusCode();
        user = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(user.GetProperty("isAdmin").GetBoolean());
        Assert.Equal(JsonValueKind.Null, user.GetProperty("branchId").ValueKind);
        using var newGlobal = await factory.Login("new-global");
        (await newGlobal.PostAsJsonAsync("/api/catalog/users", Request("new-global-seller", false, branch.Id))).EnsureSuccessStatusCode();
    }

    private static object Request(string username, bool isAdmin, int? branchId) => new
    {
        name = "Usuário de teste", username, password = "ViaDemo2026!", isAdmin, active = true, branchId
    };
}
