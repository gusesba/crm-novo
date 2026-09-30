using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class DashboardPeriodTests
{
    [Theory]
    [InlineData("2001-02-10", "2001-02-12", 3, 2, 200)]
    [InlineData("2001-02-12", "2001-02-12", 1, 1, 100)]
    [InlineData("2001-02-13", "2001-02-14", 2, 1, 100)]
    [InlineData("2001-01-01", "2001-02-09", 40, 1, 100)]
    [InlineData("2000-01-01", "2001-02-12", 409, 3, 300)]
    public async Task CustomPeriodIncludesBothBoundaryDaysAndFiltersAllMetrics(string start, string end, int dayCount, int total, int revenue)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var times = new[]
            {
                new DateTime(2001, 2, 9, 23, 59, 59, DateTimeKind.Utc),
                new DateTime(2001, 2, 10, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(2001, 2, 12, 23, 59, 59, DateTimeKind.Utc).AddMilliseconds(999),
                new DateTime(2001, 2, 13, 0, 0, 0, DateTimeKind.Utc)
            };
            db.Leads.AddRange(times.Select((time, index) => new Lead
            {
                BranchId = 1, SellerId = 2, CurrentSellerId = 2, Name = $"Lead histórico {index}",
                Phone = $"555198888410{index}", CreatedAt = time, Status = LeadStatuses.Won, Value = 100
            }));
            await db.SaveChangesAsync();
        }

        var dashboard = await admin.GetFromJsonAsync<JsonElement>($"/api/dashboard?startDate={start}&endDate={end}");
        Assert.Equal(total, dashboard.GetProperty("total").GetInt32());
        Assert.Equal(total, dashboard.GetProperty("sales").GetInt32());
        Assert.Equal(revenue, dashboard.GetProperty("revenue").GetDecimal());
        Assert.Equal(100m, dashboard.GetProperty("conversion").GetDecimal());
        Assert.Equal(0, dashboard.GetProperty("open").GetInt32());
        Assert.Equal(0, dashboard.GetProperty("lost").GetInt32());
        var daily = dashboard.GetProperty("daily").EnumerateArray().ToArray();
        Assert.Equal(dayCount, daily.Length);
        Assert.Equal(start, daily.First().GetProperty("date").GetString());
        Assert.Equal(end, daily.Last().GetProperty("date").GetString());
        Assert.Equal(total, daily.Sum(day => day.GetProperty("leads").GetInt32()));
        Assert.Equal(total, daily.Sum(day => day.GetProperty("sales").GetInt32()));
        var seller = Assert.Single(dashboard.GetProperty("sellers").EnumerateArray());
        Assert.Equal(total, seller.GetProperty("leads").GetInt32());
        Assert.Equal(revenue, seller.GetProperty("revenue").GetDecimal());
        Assert.Equal(total, dashboard.GetProperty("recent").GetArrayLength());
        Assert.Equal(total, dashboard.GetProperty("statuses").EnumerateArray()
            .Single(item => item.GetProperty("status").GetString() == LeadStatuses.Won).GetProperty("count").GetInt32());
    }

    [Theory]
    [InlineData("startDate=2001-02-12")]
    [InlineData("endDate=2001-02-12")]
    [InlineData("startDate=2001-02-13&endDate=2001-02-12")]
    [InlineData("startDate=invalid&endDate=2001-02-12")]
    public async Task InvalidCustomPeriodIsRejected(string query)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/dashboard?{query}")).StatusCode);
    }
}
