using Crm.Api.Domain;
using Crm.Api.Infrastructure;

namespace Crm.Api.Features.Leads;

public static class LeadOrdering
{
    public static IOrderedQueryable<Lead> Apply(IQueryable<Lead> query, string? sort) => sort switch
    {
        null or "" or "created_desc" => query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id),
        "created_asc" => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id),
        "name_asc" => query.OrderBy(x => x.Name.ToLower()).ThenBy(x => x.Id),
        "name_desc" => query.OrderByDescending(x => x.Name.ToLower()).ThenByDescending(x => x.Id),
        // SQLite não suporta ORDER BY decimal; compara os valores monetários como números.
        "value_asc" => query.OrderBy(x => (double)x.Value).ThenBy(x => x.Id),
        "value_desc" => query.OrderByDescending(x => (double)x.Value).ThenByDescending(x => x.Id),
        _ => throw new BusinessException("Ordenação inválida.")
    };
}
