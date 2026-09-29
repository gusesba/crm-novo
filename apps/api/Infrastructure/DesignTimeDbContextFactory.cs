using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Crm.Api.Infrastructure;
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CrmDbContext>
{
    public CrmDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<CrmDbContext>().UseSqlite("Data Source=data/crm.db").Options);
}
