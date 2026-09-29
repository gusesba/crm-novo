using System.Security.Claims;
using Crm.Api.Domain;

namespace Crm.Api.Infrastructure;

public class CurrentUser(IHttpContextAccessor accessor)
{
    private ClaimsPrincipal Principal => accessor.HttpContext!.User;
    public int Id => int.Parse(Principal.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public bool IsAdmin => Principal.IsInRole("admin");
    public int? BranchId => int.TryParse(Principal.FindFirstValue("branch"), out var id) ? id : null;
    public IQueryable<Lead> Scope(IQueryable<Lead> leads) => BranchId.HasValue
        ? leads.Where(x => x.BranchId == BranchId) : IsAdmin ? leads : leads.Where(x => false);
    public void EnsureBranch(int branchId)
    {
        if (BranchId != branchId && !(IsAdmin && BranchId == null))
            throw new BusinessException("Esta sede não pertence ao seu escopo.", 403);
    }
    public void EnsureEdit(Lead lead)
    {
        EnsureBranch(lead.BranchId);
        if (!IsAdmin && lead.CurrentSellerId != Id)
            throw new BusinessException("Somente o vendedor atual pode alterar este atendimento.", 403);
    }
}
