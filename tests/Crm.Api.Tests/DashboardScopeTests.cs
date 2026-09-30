using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;

namespace Crm.Api.Tests;

public class DashboardScopeTests
{
    [Fact]
    public async Task BranchDashboardAndAgendaAreScopedWhileGlobalAdminCanFilterAllBranches()
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        var branchResponse = await global.PostAsJsonAsync("/api/catalog/branches", new { name = "Outra sede", active = true });
        branchResponse.EnsureSuccessStatusCode();
        var branch = (await branchResponse.Content.ReadFromJsonAsync<Branch>())!;
        (await global.PostAsJsonAsync("/api/catalog/users", new
        {
            name = "Administrador da sede", username = "dashboard-scoped", password = "ViaDemo2026!",
            isAdmin = true, active = true, branchId = 1
        })).EnsureSuccessStatusCode();
        var leadResponse = await global.PostAsJsonAsync("/api/leads", new
        {
            branchId = branch.Id, sellerId = 1, name = "Venda de outra sede", phone = "5551988884001",
            status = LeadStatuses.Won, origin = "site", value = 2500
        });
        leadResponse.EnsureSuccessStatusCode();
        var lead = (await leadResponse.Content.ReadFromJsonAsync<Lead>())!;
        (await global.PostAsJsonAsync("/api/appointments", new
        {
            leadId = lead.Id, dueAt = DateTime.UtcNow.AddDays(1), note = "Retorno de outra sede"
        })).EnsureSuccessStatusCode();

        var own = await global.GetFromJsonAsync<JsonElement>("/api/dashboard?branchId=1");
        var other = await global.GetFromJsonAsync<JsonElement>($"/api/dashboard?branchId={branch.Id}");
        var all = await global.GetFromJsonAsync<JsonElement>("/api/dashboard");
        Assert.True(own.GetProperty("total").GetInt32() > 0);
        Assert.Equal(1, other.GetProperty("total").GetInt32());
        Assert.Equal(1, other.GetProperty("sales").GetInt32());
        Assert.Equal(2500m, other.GetProperty("revenue").GetDecimal());
        Assert.Equal(own.GetProperty("total").GetInt32() + 1, all.GetProperty("total").GetInt32());
        Assert.Equal(own.GetProperty("sales").GetInt32() + 1, all.GetProperty("sales").GetInt32());
        Assert.Equal(own.GetProperty("revenue").GetDecimal() + 2500m, all.GetProperty("revenue").GetDecimal());
        Assert.All(other.GetProperty("recent").EnumerateArray(), item => Assert.Equal(branch.Id, item.GetProperty("branchId").GetInt32()));

        using var scoped = await factory.Login("dashboard-scoped");
        var scopedDashboard = await scoped.GetFromJsonAsync<JsonElement>("/api/dashboard");
        Assert.Equal(own.GetRawText(), scopedDashboard.GetRawText());
        var outsideDashboard = await scoped.GetFromJsonAsync<JsonElement>($"/api/dashboard?branchId={branch.Id}");
        Assert.Equal(0, outsideDashboard.GetProperty("total").GetInt32());
        Assert.Empty(outsideDashboard.GetProperty("recent").EnumerateArray());
        Assert.Empty(outsideDashboard.GetProperty("sellers").EnumerateArray());

        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var customQuery = $"startDate={today}&endDate={today}";
        var ownPeriod = await global.GetFromJsonAsync<JsonElement>($"/api/dashboard?branchId=1&{customQuery}");
        var scopedPeriod = await scoped.GetFromJsonAsync<JsonElement>($"/api/dashboard?{customQuery}");
        Assert.Equal(ownPeriod.GetRawText(), scopedPeriod.GetRawText());
        var outsidePeriod = await scoped.GetFromJsonAsync<JsonElement>($"/api/dashboard?branchId={branch.Id}&{customQuery}");
        Assert.Equal(0, outsidePeriod.GetProperty("total").GetInt32());

        var scopedAgenda = await scoped.GetFromJsonAsync<JsonElement>("/api/appointments?pageSize=100");
        Assert.NotEmpty(scopedAgenda.GetProperty("items").EnumerateArray());
        Assert.All(scopedAgenda.GetProperty("items").EnumerateArray(), item => Assert.Equal(1, item.GetProperty("branchId").GetInt32()));
        var outsideAgenda = await scoped.GetFromJsonAsync<JsonElement>($"/api/appointments?branchId={branch.Id}");
        Assert.Equal(0, outsideAgenda.GetProperty("total").GetInt32());
        var globalAgenda = await global.GetFromJsonAsync<JsonElement>($"/api/appointments?branchId={branch.Id}");
        Assert.Equal(lead.Id, Assert.Single(globalAgenda.GetProperty("items").EnumerateArray()).GetProperty("leadId").GetInt32());
    }
}
