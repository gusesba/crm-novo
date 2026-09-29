using System.ComponentModel.DataAnnotations;
using Crm.Api.Domain;

namespace Crm.Api.Features.Leads;

public class LeadRequest
{
    [Range(1, int.MaxValue)] public int BranchId { get; set; }
    [Range(1, int.MaxValue)] public int SellerId { get; set; }
    [Required, MaxLength(160)] public string Name { get; set; } = "";
    [Required, MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(30)] public string? AdditionalPhone { get; set; }
    [EmailAddress, MaxLength(200)] public string? Email { get; set; }
    public string? Gender { get; set; }
    public DateOnly? BirthDate { get; set; }
    public string Origin { get; set; } = "site";
    [MaxLength(200)] public string? Referral { get; set; }
    [MaxLength(500)] public string? Discovery { get; set; }
    [MaxLength(500)] public string? ChoiceReason { get; set; }
    public int? ServiceId { get; set; }
    public int? ConditionId { get; set; }
    [Required] public string Status { get; set; } = LeadStatuses.Contact;
    [Range(0, 100000000)] public decimal Value { get; set; }
    [MaxLength(5000)] public string? Notes { get; set; }
    public DateTime? ReturnAt { get; set; }
    [MaxLength(2000)] public string? ReturnNote { get; set; }
    public int Revision { get; set; }
}
public record TransferRequest(int[] LeadIds, int SellerId, bool Permanent);
public record LinkRequest(string ChatId);
