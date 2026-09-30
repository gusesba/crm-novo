using System.Net;
using System.Net.Http.Json;
using Crm.Api.Domain;
using Crm.Api.Features.Leads;
using Crm.Api.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Tests;

public class LeadEditingTests
{
    private static async Task<Lead> Create(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/leads", new LeadRequest
        {
            BranchId = 1, SellerId = 2, Name = "Cliente", Phone = "5551988882001"
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Lead>())!;
    }

    private static LeadRequest Request(Lead lead) => new()
    {
        BranchId = lead.BranchId, SellerId = lead.SellerId, Name = lead.Name,
        Phone = lead.Phone, Status = lead.Status, Origin = lead.Origin, Revision = lead.Revision
    };

    [Theory]
    [InlineData("name")]
    [InlineData("phone")]
    [InlineData("additionalPhone")]
    [InlineData("email")]
    [InlineData("gender")]
    [InlineData("birthDate")]
    public async Task OnlyAdminCanEditContact(string field)
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var admin = await factory.Login();
        var lead = await Create(seller);
        var request = Request(lead);
        switch (field)
        {
            case "name": request.Name = "Novo nome"; break;
            case "phone": request.Phone = "5551988882002"; break;
            case "additionalPhone": request.AdditionalPhone = "5551988882003"; break;
            case "email": request.Email = "cliente@example.com"; break;
            case "gender": request.Gender = "Outro"; break;
            case "birthDate": request.BirthDate = new DateOnly(2000, 1, 1); break;
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
        var unchanged = await seller.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}");
        Assert.Equal(lead.Revision, unchanged!.Revision);
        (await admin.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task CommercialEditingKeepsOwnershipAndContactProtected()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var other = await factory.Login("rafael");
        using var admin = await factory.Login();
        var lead = await Create(seller);
        var request = Request(lead);
        request.Notes = "Negociação atualizada";
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
        var response = await seller.PutAsJsonAsync($"/api/leads/{lead.Id}", request);
        response.EnsureSuccessStatusCode();
        lead = (await response.Content.ReadFromJsonAsync<Lead>())!;
        Assert.Equal(request.Notes, lead.Notes);
        request = Request(lead);
        request.SellerId = 3;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
        request.SellerId = lead.SellerId;
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var branch = new Branch { Name = "Outra sede" };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        request.BranchId = branch.Id;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
    }

    [Fact]
    public async Task BranchAdminCanEditOtherSellersLeadsAndTransferChangesSellerEditingAccess()
    {
        using var factory = new ApiFactory();
        using var global = await factory.Login();
        using var original = await factory.Login("camila");
        using var assigned = await factory.Login("rafael");
        (await global.PostAsJsonAsync("/api/catalog/users", new
        {
            name = "Administrador da sede", username = "branch-admin", password = "ViaDemo2026!",
            isAdmin = true, active = true, branchId = 1
        })).EnsureSuccessStatusCode();
        using var admin = await factory.Login("branch-admin");
        var lead = await Create(original);
        var request = Request(lead);
        request.Name = "Contato atualizado pelo administrador da sede";
        var updated = await admin.PutAsJsonAsync($"/api/leads/{lead.Id}", request);
        updated.EnsureSuccessStatusCode();
        lead = (await updated.Content.ReadFromJsonAsync<Lead>())!;
        Assert.Equal(request.Name, lead.Name);
        (await admin.PostAsJsonAsync("/api/leads/transfer", new
        {
            leadIds = new[] { lead.Id }, sellerId = 3, permanent = false
        })).EnsureSuccessStatusCode();
        lead = (await admin.GetFromJsonAsync<Lead>($"/api/leads/{lead.Id}"))!;
        Assert.Equal(2, lead.SellerId);
        Assert.Equal(3, lead.CurrentSellerId);
        request = Request(lead);
        request.Notes = "Atendimento pelo vendedor atual";
        Assert.Equal(HttpStatusCode.Forbidden, (await original.PutAsJsonAsync($"/api/leads/{lead.Id}", request)).StatusCode);
        updated = await assigned.PutAsJsonAsync($"/api/leads/{lead.Id}", request);
        updated.EnsureSuccessStatusCode();
        lead = (await updated.Content.ReadFromJsonAsync<Lead>())!;
        Assert.Equal(request.Notes, lead.Notes);
    }

    [Fact]
    public async Task OnlyAdminCanDeleteLeadAndItsAppointments()
    {
        using var factory = new ApiFactory();
        using var seller = await factory.Login("camila");
        using var admin = await factory.Login();
        var lead = await Create(seller);
        (await seller.PostAsJsonAsync("/api/appointments", new { leadId = lead.Id, dueAt = DateTime.UtcNow.AddDays(1), note = "Retorno" })).EnsureSuccessStatusCode();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var group = new ContactGroup { Name = "Clientes", UserId = 2, Members = [new GroupMember { LeadId = lead.Id }] };
        db.Groups.Add(group);
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.DeleteAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/leads/{lead.Id}")).StatusCode);
        Assert.False(await db.Appointments.AnyAsync(x => x.LeadId == lead.Id));
        Assert.False(await db.GroupMembers.AnyAsync(x => x.LeadId == lead.Id));
        Assert.True(await db.Groups.AnyAsync(x => x.Id == group.Id));
    }
}
