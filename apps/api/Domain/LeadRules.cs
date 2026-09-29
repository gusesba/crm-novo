using System.Text.RegularExpressions;

namespace Crm.Api.Domain;

public static class LeadStatuses
{
    public const string Contact = "Agendar Contato";
    public const string Won = "Venda Efetivada";
    public const string Waiting = "Stand By";
    public const string Lost = "Optou pela Concorrência";
    public const string OptOut = "Não Enviar Mais";
    public static readonly string[] All = [Contact, Won, Waiting, Lost, OptOut];
}

public static partial class LeadRules
{
    public static string NormalizePhone(string input)
    {
        var phone = Digits().Replace(input, "");
        if (phone.Length is 10 or 11) phone = "55" + phone;
        if (phone.Length is < 12 or > 15 || phone.StartsWith('0'))
            throw new BusinessException("Informe um telefone válido com DDD (e DDI para números internacionais).");
        return phone;
    }

    public static void Transfer(Lead lead, int sellerId, bool permanent)
    {
        lead.CurrentSellerId = sellerId;
        if (permanent) lead.SellerId = sellerId;
        // A conversa pertence à sessão pessoal do atendente anterior.
        lead.ChatId = null;
        lead.ChatUserId = null;
        lead.UpdatedAt = DateTime.UtcNow;
        lead.Revision++;
    }

    [GeneratedRegex("[^0-9]")]
    private static partial Regex Digits();
}

public class BusinessException(string message, int status = 400) : Exception(message)
{
    public int Status { get; } = status;
}
