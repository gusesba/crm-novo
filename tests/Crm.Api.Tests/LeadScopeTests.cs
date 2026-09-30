using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.Leads;

namespace Crm.Api.Tests;

public class LeadScopeTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BranchUsersCannotAccessOtherBranchesAndGlobalAdminCan(bool isAdmin)
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        var branchResponse = await global.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        (await global.PostAsJsonAsync("/api/catalog/users", new
        {
            name = "Usuário da sede", username = "scoped", password = "ViaDemo2026!",
            isAdmin, active = true, branchId = 1
        })).EnsureSuccessStatusCode();
        var request = new LeadRequest { BranchId = branch.Id, SellerId = 1, Name = "Lead de outra sede", Phone = "5551988883001" };
        var created = await global.PostAsJsonAsync("/api/leads", request);
        created.EnsureSuccessStatusCode();
        var lead = (await created.Content.ReadFromJsonAsync<Lead>())!;
        request.Revision = lead.Revision;
        using var scoped = await factory.Login("scoped");

        var own = await scoped.GetFromJsonAsync<JsonElement>("/api/leads?pageSize=100");
        Assert.NotEmpty(own.GetProperty("items").EnumerateArray());
        Assert.All(own.GetProperty("items").EnumerateArray(), item => Assert.Equal(1, item.GetProperty("branchId").GetInt32()));
        (await scoped.GetAsync("/api/leads/1")).EnsureSuccessStatusCode();
        var filtered = await scoped.GetFromJsonAsync<JsonElement>($"/api/leads?branchId={branch.Id}");
        Assert.Equal(0, filtered.GetProperty("total").GetInt32());
        Assert.Empty(filtered.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await scoped.GetAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.PostAsJsonAsync("/api/leads", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
        Assert.Equal(isAdmin ? HttpStatusCode.NotFound : HttpStatusCode.Forbidden,
            (await scoped.DeleteAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await scoped.PostAsJsonAsync("/api/leads/transfer",
            new { leadIds = new[] { lead.Id }, sellerId = 2, permanent = true })).StatusCode);

        var all = await global.GetFromJsonAsync<JsonElement>("/api/leads?pageSize=100");
        Assert.Contains(all.GetProperty("items").EnumerateArray(), item => item.GetProperty("branchId").GetInt32() == 1);
        Assert.Contains(all.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetInt32() == lead.Id);
        (await global.GetAsync($"/api/leads/{lead.Id}")).EnsureSuccessStatusCode();
        request.Notes = "Alterado pelo administrador global";
        (await global.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await global.DeleteAsync($"/api/leads/{lead.Id}")).StatusCode);
    }
}
