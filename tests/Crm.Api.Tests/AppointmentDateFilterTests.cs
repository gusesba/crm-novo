using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class AppointmentDateFilterTests
{
    private const string Day = "dueFrom=2001-02-10T03:00:00Z&dueTo=2001-02-11T03:00:00Z";

    [Fact]
    public async Task LocalDayIncludesMidnightAndLastTickBeforeNextDayBeforePagination()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var start = new DateTime(2001, 2, 10, 3, 0, 0, DateTimeKind.Utc);
        var end = start.AddDays(1);
        Appointment[] appointments;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            db.Appointments.RemoveRange(db.Appointments);
            appointments = new[] { start.AddTicks(-1), start, start.AddHours(12), end.AddTicks(-1), end }
                .Select(dueAt => new Appointment { LeadId = 1, DueAt = dueAt }).ToArray();
            db.Appointments.AddRange(appointments);
            await db.SaveChangesAsync();
        }

        var first = await admin.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&pageSize=2");
        var second = await admin.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&pageSize=2&page=2");
        Assert.Equal(3, first.GetProperty("total").GetInt32());
        Assert.Equal(3, second.GetProperty("total").GetInt32());
        Assert.Equal(new[] { appointments[1].Id, appointments[2].Id }, Ids(first));
        Assert.Equal(new[] { appointments[3].Id }, Ids(second));

        var unfiltered = await admin.GetFromJsonAsync<JsonElement>("/api/appointments");
        Assert.Equal(5, unfiltered.GetProperty("total").GetInt32());
        var empty = await admin.GetFromJsonAsync<JsonElement>("/api/appointments?dueFrom=2001-02-12T03:00:00Z&dueTo=2001-02-13T03:00:00Z");
        Assert.Equal(0, empty.GetProperty("total").GetInt32());
        Assert.Empty(Ids(empty));
        var onlyStart = await admin.GetFromJsonAsync<JsonElement>("/api/appointments?dueFrom=2001-02-11T03:00:00Z");
        Assert.Equal(new[] { appointments[4].Id }, Ids(onlyStart));
        var onlyEnd = await admin.GetFromJsonAsync<JsonElement>("/api/appointments?dueTo=2001-02-10T03:00:00Z");
        Assert.Equal(new[] { appointments[0].Id }, Ids(onlyEnd));
    }

    [Fact]
    public async Task DayCombinesWithWalletLeadBranchAndCompletionWithoutEscapingScope()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Appointment pending, completed, otherSeller, otherBranch;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var branch = new Branch { Name = "Outra unidade" };
            db.Branches.Add(branch);
            await db.SaveChangesAsync();
            var lead = new Lead { BranchId = branch.Id, SellerId = 1, CurrentSellerId = 1, Name = "Outro lead", Phone = "5551988884300" };
            db.Leads.Add(lead);
            await db.SaveChangesAsync();
            var dueAt = new DateTime(2001, 2, 10, 12, 0, 0, DateTimeKind.Utc);
            pending = new Appointment { LeadId = 1, DueAt = dueAt };
            completed = new Appointment { LeadId = 1, DueAt = dueAt, Completed = true };
            otherSeller = new Appointment { LeadId = 2, DueAt = dueAt };
            otherBranch = new Appointment { LeadId = lead.Id, DueAt = dueAt };
            db.Appointments.AddRange(pending, completed, otherSeller, otherBranch);
            await db.SaveChangesAsync();
        }

        var all = await admin.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&includeCompleted=true");
        Assert.Equal(new[] { pending.Id, completed.Id, otherSeller.Id, otherBranch.Id }, Ids(all));
        using var seller = await factory.Login("camila");
        var scoped = await seller.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&includeCompleted=true");
        Assert.Equal(new[] { pending.Id, completed.Id, otherSeller.Id }, Ids(scoped));
        var mine = await seller.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&mine=true");
        Assert.Equal(new[] { pending.Id }, Ids(mine));
        var leadOnly = await seller.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&leadId=1&includeCompleted=true");
        Assert.Equal(new[] { pending.Id, completed.Id }, Ids(leadOnly));
        var branchOnly = await admin.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&branchId=1");
        Assert.Equal(new[] { pending.Id, otherSeller.Id }, Ids(branchOnly));
        var outsideScope = await seller.GetFromJsonAsync<JsonElement>($"/api/appointments?{Day}&leadId={otherBranch.LeadId}&includeCompleted=true");
        Assert.Equal(0, outsideScope.GetProperty("total").GetInt32());
        Assert.Empty(Ids(outsideScope));
    }

    [Theory]
    [InlineData("dueFrom=invalid")]
    [InlineData("dueTo=2001-02-30T00:00:00Z")]
    [InlineData("dueFrom=2001-02-11T03:00:00Z&dueTo=2001-02-10T03:00:00Z")]
    public async Task InvalidDatesAreRejected(string query)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/appointments?{query}")).StatusCode);
    }

    private static int[] Ids(JsonElement result) => result.GetProperty("items").EnumerateArray()
        .Select(item => item.GetProperty("id").GetInt32()).ToArray();
}
