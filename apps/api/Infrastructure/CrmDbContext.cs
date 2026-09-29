using Crm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Infrastructure;

public class CrmDbContext(DbContextOptions<CrmDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<CatalogItem> Catalog => Set<CatalogItem>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<ContactGroup> Groups => Set<ContactGroup>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(x => x.Username).IsUnique();
        b.Entity<User>().HasOne<Branch>().WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasIndex(x => new { x.BranchId, x.Phone }).IsUnique();
        b.Entity<Lead>().HasIndex(x => new { x.ChatUserId, x.ChatId }).IsUnique();
        b.Entity<Lead>().Property(x => x.Revision).IsConcurrencyToken();
        b.Entity<Lead>().HasOne<Branch>().WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasOne<User>().WithMany().HasForeignKey(x => x.SellerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasOne<User>().WithMany().HasForeignKey(x => x.CurrentSellerId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasOne<CatalogItem>().WithMany().HasForeignKey(x => x.ServiceId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasOne<CatalogItem>().WithMany().HasForeignKey(x => x.ConditionId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Appointment>().HasOne<Lead>().WithMany().HasForeignKey(x => x.LeadId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<ContactGroup>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ContactGroup>().HasMany(x => x.Members).WithOne().HasForeignKey(x => x.GroupId);
        b.Entity<GroupMember>().HasKey(x => new { x.GroupId, x.LeadId });
        b.Entity<GroupMember>().HasOne<Lead>().WithMany().HasForeignKey(x => x.LeadId).OnDelete(DeleteBehavior.Cascade);
    }
}
