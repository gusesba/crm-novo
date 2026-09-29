using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;
using Crm.Api.Features.Auth;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Admin;

[ApiController, Authorize, Route("api/catalog")]
public class CatalogController(CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public async Task<object> Get() => new
    {
        branches = await db.Branches.Where(x => current.BranchId == null || x.Id == current.BranchId).ToListAsync(),
        users = (await db.Users.Where(x => current.BranchId == null || x.BranchId == current.BranchId).ToListAsync()).Select(AuthController.ToDto),
        services = await db.Catalog.Where(x => x.Kind == "service").ToListAsync(),
        conditions = await db.Catalog.Where(x => x.Kind == "condition").ToListAsync(),
        statuses = LeadStatuses.All
    };

    [HttpPost("branches"), Authorize(Policy = "admin")]
    public async Task<Branch> CreateBranch(NamedRequest r)
    {
        if (current.BranchId.HasValue) throw new BusinessException("Somente o administrador global pode criar sedes.", 403);
        var item = new Branch { Name = r.Name.Trim(), Active = r.Active };
        db.Branches.Add(item); await db.SaveChangesAsync(); return item;
    }
    [HttpPut("branches/{id:int}"), Authorize(Policy = "admin")]
    public async Task<Branch> UpdateBranch(int id, NamedRequest r)
    {
        current.EnsureBranch(id);
        var item = await db.Branches.FindAsync(id) ?? throw new BusinessException("Sede não encontrada.", 404);
        item.Name = r.Name.Trim(); item.Active = r.Active; await db.SaveChangesAsync(); return item;
    }
    [HttpPost("items/{kind}"), Authorize(Policy = "admin")]
    public async Task<CatalogItem> CreateItem(string kind, NamedRequest r)
    {
        EnsureGlobalCatalog();
        if (kind != "service" && kind != "condition") throw new BusinessException("Tipo inválido.");
        var item = new CatalogItem { Kind = kind, Name = r.Name.Trim(), Active = r.Active };
        db.Catalog.Add(item); await db.SaveChangesAsync(); return item;
    }
    [HttpPut("items/{id:int}"), Authorize(Policy = "admin")]
    public async Task<CatalogItem> UpdateItem(int id, NamedRequest r)
    {
        EnsureGlobalCatalog();
        var item = await db.Catalog.FindAsync(id) ?? throw new BusinessException("Item não encontrado.", 404);
        item.Name = r.Name.Trim(); item.Active = r.Active; await db.SaveChangesAsync(); return item;
    }
    private void EnsureGlobalCatalog()
    {
        if (current.BranchId.HasValue) throw new BusinessException("Os catálogos compartilhados são geridos pelo administrador global.", 403);
    }
    [HttpPost("users"), Authorize(Policy = "admin")]
    public Task<object> CreateUser(UserRequest r) => SaveUser(null, r);
    [HttpPut("users/{id:int}"), Authorize(Policy = "admin")]
    public Task<object> UpdateUser(int id, UserRequest r) => SaveUser(id, r);

    private async Task<object> SaveUser(int? id, UserRequest r)
    {
        if (!r.IsAdmin && !r.BranchId.HasValue) throw new BusinessException("Vendedores precisam de uma sede.");
        if (r.BranchId.HasValue)
        {
            current.EnsureBranch(r.BranchId.Value);
            if (!await db.Branches.AnyAsync(x => x.Id == r.BranchId && x.Active)) throw new BusinessException("Sede inválida ou inativa.");
        }
        else if (current.BranchId.HasValue) throw new BusinessException("Não é permitido criar administradores globais.", 403);
        var user = id.HasValue ? await db.Users.FindAsync(id) ?? throw new BusinessException("Usuário não encontrado.", 404) : new User();
        if (id.HasValue && current.BranchId.HasValue && user.BranchId != current.BranchId) throw new BusinessException("Usuário fora do escopo.", 403);
        if (id == current.Id && (!r.Active || r.IsAdmin != user.IsAdmin || r.BranchId != user.BranchId)) throw new BusinessException("Você não pode remover seu próprio acesso administrativo.");
        if (id.HasValue && user.BranchId != r.BranchId && await db.Leads.AnyAsync(x => x.CurrentSellerId == id || x.SellerId == id)) throw new BusinessException("Transfira permanentemente a carteira antes de mudar a sede do vendedor.");
        user.Name = r.Name.Trim(); user.Username = r.Username.Trim().ToLower(); user.IsAdmin = r.IsAdmin;
        user.BranchId = r.BranchId; user.Active = r.Active; user.SecurityStamp = Guid.NewGuid().ToString();
        if (id == null && string.IsNullOrEmpty(r.Password)) throw new BusinessException("Informe uma senha.");
        if (!string.IsNullOrEmpty(r.Password))
        {
            if (r.Password.Length < 10) throw new BusinessException("A senha precisa ter ao menos 10 caracteres.");
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, r.Password);
        }
        if (id == null) db.Users.Add(user);
        await db.SaveChangesAsync(); return AuthController.ToDto(user);
    }
}
public record NamedRequest([Required, MaxLength(160)] string Name, bool Active = true);
public record UserRequest([Required, MaxLength(160)] string Name, [Required, MaxLength(100)] string Username,
    [MaxLength(200)] string? Password, bool IsAdmin, bool Active, int? BranchId);
