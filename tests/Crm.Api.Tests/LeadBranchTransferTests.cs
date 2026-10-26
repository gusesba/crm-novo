using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class LeadBranchTransferTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task GlobalAdminCanMovePermanentlyPreservingLeadAndRelatedRecords(bool assignGlobal)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            var group = new ContactGroup { Name = "Grupo de origem", UserId = 2 };
            var classification = new LeadClassification { UserId = 2, Name = "Pessoal", Color = "#112233" };
            db.Groups.Add(group);
            db.Classifications.Add(classification);
            await db.SaveChangesAsync();
            db.GroupMembers.Add(new GroupMember { GroupId = group.Id, LeadId = data.First.Id });
            db.LeadClassifications.Add(new LeadClassificationMember { ClassificationId = classification.Id, LeadId = data.First.Id });
            db.Appointments.Add(new Appointment { LeadId = data.First.Id, DueAt = DateTime.UtcNow.AddDays(1) });
            await db.SaveChangesAsync();
        }

        var sellerId = assignGlobal ? 1 : data.Seller.Id;
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id, data.Second.Id }, sellerId, permanent = true, branchId = data.Branch.Id });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        foreach (var original in new[] { data.First, data.Second })
        {
            var moved = (await admin.GetFromJsonAsync<Lead>($"/api/leads/{original.Id}"))!;
            Assert.Equal(data.Branch.Id, moved.BranchId);
            Assert.Equal(sellerId, moved.SellerId);
            Assert.Equal(sellerId, moved.CurrentSellerId);
            Assert.Equal(original.Revision + 1, moved.Revision);
            Assert.True(moved.UpdatedAt > original.UpdatedAt);
            Assert.Equal(original.CreatedAt, moved.CreatedAt);
            Assert.Equal(original.Phone, moved.Phone);
            Assert.Equal(original.Name, moved.Name);
            Assert.Null(moved.ChatId);
            Assert.Null(moved.ChatUserId);
        }
        using var source = await factory.Login("camila");
        Assert.Equal(HttpStatusCode.NotFound, (await source.GetAsync($"/api/leads/{data.First.Id}")).StatusCode);
        var oldAgenda = await source.GetFromJsonAsync<JsonElement>($"/api/appointments?leadId={data.First.Id}");
        Assert.Equal(0, oldAgenda.GetProperty("total").GetInt32());
        using var target = await factory.Login("transfer-target");
        var newAgenda = await target.GetFromJsonAsync<JsonElement>($"/api/appointments?leadId={data.First.Id}");
        Assert.Single(newAgenda.GetProperty("items").EnumerateArray());
        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<CrmDbContext>();
        Assert.True(await verifyDb.GroupMembers.AnyAsync(x => x.LeadId == data.First.Id));
        Assert.True(await verifyDb.LeadClassifications.AnyAsync(x => x.LeadId == data.First.Id));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TemporaryTransferCannotSpecifyDestinationBranch(bool sameBranch)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        {
            leadIds = new[] { data.First.Id, data.Second.Id }, sellerId = sameBranch ? 3 : data.Seller.Id,
            permanent = false, branchId = sameBranch ? 1 : data.Branch.Id
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertUnchanged(factory, data.First, data.Second);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BranchUsersCannotMoveLeadsAcrossBranches(bool isAdmin)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        (await admin.PostAsJsonAsync("/api/catalog/users", new
        { name = "Usuário restrito", username = "transfer-scoped", password = "ViaDemo2026!", isAdmin, active = true, branchId = 1 })).EnsureSuccessStatusCode();
        using var scoped = await factory.Login("transfer-scoped");
        var response = await scoped.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id }, sellerId = data.Seller.Id, permanent = true, branchId = data.Branch.Id });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertUnchanged(factory, data.First, data.Second);
    }

    [Theory]
    [InlineData("missing-branch")]
    [InlineData("inactive-branch")]
    [InlineData("wrong-seller-branch")]
    [InlineData("inactive-seller")]
    public async Task InvalidDestinationRejectsWholeBatch(string scenario)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        var branchId = data.Branch.Id;
        var sellerId = data.Seller.Id;
        if (scenario == "missing-branch") branchId = 999999;
        if (scenario == "wrong-seller-branch") sellerId = 2;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            if (scenario == "inactive-branch") (await db.Branches.FindAsync(branchId))!.Active = false;
            if (scenario == "inactive-seller") (await db.Users.FindAsync(sellerId))!.Active = false;
            await db.SaveChangesAsync();
        }
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id, data.Second.Id }, sellerId, permanent = true, branchId });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertUnchanged(factory, data.First, data.Second);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DuplicatePhoneInDestinationOrSelectedBatchRejectsEverything(bool duplicateInBatch)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            if (duplicateInBatch)
            {
                var second = (await db.Leads.FindAsync(data.Second.Id))!;
                second.BranchId = data.Branch.Id;
                second.Phone = data.First.Phone;
                data.Second.BranchId = second.BranchId;
                data.Second.Phone = second.Phone;
            }
            else db.Leads.Add(new Lead
            { BranchId = data.Branch.Id, SellerId = data.Seller.Id, CurrentSellerId = data.Seller.Id, Name = "Duplicado", Phone = data.First.Phone });
            await db.SaveChangesAsync();
        }
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id, data.Second.Id }, sellerId = data.Seller.Id, permanent = true, branchId = data.Branch.Id });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertUnchanged(factory, data.First, data.Second);
    }

    [Fact]
    public async Task GlobalAdminCanConsolidateLeadsFromMultipleBranches()
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
            (await db.Leads.FindAsync(data.Second.Id))!.BranchId = data.Branch.Id;
            await db.SaveChangesAsync();
        }
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id, data.Second.Id }, sellerId = data.Seller.Id, permanent = true, branchId = data.Branch.Id });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        using var verifyScope = factory.Services.CreateScope();
        var dbVerify = verifyScope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var moved = await dbVerify.Leads.Where(x => x.Id == data.First.Id || x.Id == data.Second.Id).ToListAsync();
        Assert.All(moved, lead => Assert.Equal(data.Branch.Id, lead.BranchId));
        Assert.All(moved, lead => Assert.Equal(data.Seller.Id, lead.SellerId));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SellerFromAnotherBranchDoesNotImplicitlyChangeLeadBranch(bool permanent)
    {
        using var factory = new ApiFactory();
        using var admin = await factory.Login();
        var data = await Seed(factory);
        var response = await admin.PostAsJsonAsync("/api/leads/transfer", new
        { leadIds = new[] { data.First.Id }, sellerId = data.Seller.Id, permanent });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertUnchanged(factory, data.First, data.Second);
    }

    private static async Task AssertUnchanged(ApiFactory factory, params Lead[] originals)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        foreach (var original in originals)
        {
            var current = (await db.Leads.AsNoTracking().SingleAsync(x => x.Id == original.Id));
            Assert.Equal(original.BranchId, current.BranchId);
            Assert.Equal(original.SellerId, current.SellerId);
            Assert.Equal(original.CurrentSellerId, current.CurrentSellerId);
            Assert.Equal(original.Revision, current.Revision);
            Assert.Equal(original.UpdatedAt, current.UpdatedAt);
            Assert.Equal(original.ChatId, current.ChatId);
            Assert.Equal(original.ChatUserId, current.ChatUserId);
        }
    }

    private static async Task<TransferData> Seed(ApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        var branch = new Branch { Name = "Sede de destino" };
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        var seller = new User { Name = "Destino", Username = "transfer-target", BranchId = branch.Id };
        seller.PasswordHash = new PasswordHasher<User>().HashPassword(seller, "ViaDemo2026!");
        db.Users.Add(seller);
        var leads = Enumerable.Range(0, 2).Select(i => new Lead
        {
            BranchId = 1, SellerId = 2, CurrentSellerId = 3, Name = $"Transferência {i}", Phone = $"555198885000{i}",
            ChatId = $"555198885000{i}@s.whatsapp.net", ChatUserId = 3, Revision = 5,
            CreatedAt = new DateTime(2001, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2001, 1, 2, 0, 0, 0, DateTimeKind.Utc)
        }).ToArray();
        db.Leads.AddRange(leads);
        await db.SaveChangesAsync();
        return new TransferData(branch, seller, leads[0], leads[1]);
    }

    private record TransferData(Branch Branch, User Seller, Lead First, Lead Second);
}
