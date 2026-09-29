namespace Crm.Api.Domain;

public class Branch
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool IsAdmin { get; set; }
    public bool Active { get; set; } = true;
    public int? BranchId { get; set; }
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString();
}

public class CatalogItem
{
    public int Id { get; set; }
    public string Kind { get; set; } = "service";
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}

public class Lead
{
    public int Id { get; set; }
    public int BranchId { get; set; }
    public int SellerId { get; set; }
    public int CurrentSellerId { get; set; }
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? AdditionalPhone { get; set; }
    public string? Email { get; set; }
    public string? Gender { get; set; }
    public DateOnly? BirthDate { get; set; }
    public string Origin { get; set; } = "site";
    public string? Referral { get; set; }
    public string? Discovery { get; set; }
    public string? ChoiceReason { get; set; }
    public int? ServiceId { get; set; }
    public int? ConditionId { get; set; }
    public string Status { get; set; } = LeadStatuses.Contact;
    public decimal Value { get; set; }
    public string? Notes { get; set; }
    public string? Contract { get; set; }
    public string? ChatId { get; set; }
    public int? ChatUserId { get; set; }
    public int Revision { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Appointment
{
    public int Id { get; set; }
    public int LeadId { get; set; }
    public DateTime DueAt { get; set; }
    public string? Note { get; set; }
    public bool Completed { get; set; }
}

public class ContactGroup
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int UserId { get; set; }
    public List<GroupMember> Members { get; set; } = [];
}

public class GroupMember
{
    public int GroupId { get; set; }
    public int LeadId { get; set; }
}
