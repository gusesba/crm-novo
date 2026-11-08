using System.Net;
using System.Net.Http.Json;
using Crm.Api.Domain;
using Crm.Api.Features.Auth;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class LegacyPasswordTests
{
    [Theory]
    [InlineData("garbage")]
    [InlineData("$2a$11$bad")]
    [InlineData("")]
    public void MalformedHashRejectsCredentials(string hash)
        => Assert.Equal(PasswordVerificationResult.Failed, PasswordCompatibility.Verify(new User { PasswordHash = hash }, "password"));

    [Fact]
    public void BcryptAndIdentityKeepTheirVerificationSemantics()
    {
        var user = new User { PasswordHash = BCrypt.Net.BCrypt.HashPassword("legacy", 4) };
        Assert.Equal(PasswordVerificationResult.Failed, PasswordCompatibility.Verify(user, "wrong"));
        Assert.Equal(PasswordVerificationResult.SuccessRehashNeeded, PasswordCompatibility.Verify(user, "legacy"));
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "modern-password");
        Assert.Equal(PasswordVerificationResult.Success, PasswordCompatibility.Verify(user, "modern-password"));
    }

    [Theory]
    [InlineData(true, true, "legacy", HttpStatusCode.OK)]
    [InlineData(true, true, "wrong", HttpStatusCode.Unauthorized)]
    [InlineData(false, true, "legacy", HttpStatusCode.Unauthorized)]
    [InlineData(true, false, "legacy", HttpStatusCode.Forbidden)]
    public async Task OnlySuccessfulAuthorizedLoginUpgradesLegacyHash(bool active, bool branchActive, string password, HttpStatusCode expected)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var hash = BCrypt.Net.BCrypt.HashPassword("legacy", 4);
        string stamp;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var user = await db.Users.SingleAsync(x => x.Username == "camila");
            user.PasswordHash = hash; user.Active = active; stamp = user.SecurityStamp;
            (await db.Branches.SingleAsync(x => x.Id == 1)).Active = branchActive;
            await db.SaveChangesAsync();
        }
        await ApiFactory.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/login", new { username = "CAMILA ", password });
        Assert.Equal(expected, response.StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var user = await scope.ServiceProvider.GetRequiredService<CrmDbContext>().Users.SingleAsync(x => x.Username == "camila");
            Assert.Equal(stamp, user.SecurityStamp);
            if (expected == HttpStatusCode.OK)
            {
                Assert.NotEqual(hash, user.PasswordHash);
                Assert.Equal(PasswordVerificationResult.Success, new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, "legacy"));
            }
            else Assert.Equal(hash, user.PasswordHash);
        }
        if (expected == HttpStatusCode.OK)
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
            await ApiFactory.Csrf(client);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { username = "camila", password })).StatusCode);
        }
    }

    [Fact]
    public async Task UnknownOriginCanBeSavedAndEditedWithoutLosingItsMeaning()
    {
        using var factory = new ApiFactory();
        using var client = await factory.Login();
        var response = await client.PostAsJsonAsync("/api/leads", new { branchId = 1, sellerId = 2, name = "Origem legada", phone = "41987654321", origin = "não informado", status = LeadStatuses.Contact });
        response.EnsureSuccessStatusCode();
        var lead = (await response.Content.ReadFromJsonAsync<Lead>())!;
        Assert.Equal("não informado", lead.Origin);
        response = await client.PutAsJsonAsync($"/api/leads/{lead.Id}", new { lead.BranchId, lead.SellerId, lead.Name, lead.Phone, lead.Origin, lead.Status, lead.Revision });
        response.EnsureSuccessStatusCode();
        Assert.Equal("não informado", (await response.Content.ReadFromJsonAsync<Lead>())!.Origin);
    }

    [Theory]
    [InlineData("-0.02")]
    [InlineData("100000000.01")]
    public async Task FractionalValuesOutsideRangeAreRejected(string value)
    {
        using var factory = new ApiFactory();
        using var client = await factory.Login();
        var response = await client.PostAsJsonAsync("/api/leads", new { branchId = 1, sellerId = 2,
            name = "Valor inválido", phone = "41987654321", origin = "site", status = LeadStatuses.Contact,
            value = decimal.Parse(value, System.Globalization.CultureInfo.InvariantCulture) });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
