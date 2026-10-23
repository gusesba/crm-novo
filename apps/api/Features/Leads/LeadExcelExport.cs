using ClosedXML.Excel;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Leads;

public static class LeadExcelExport
{
    public static async Task<byte[]> Create(IQueryable<Lead> query, CrmDbContext db, int userId, bool sales, CancellationToken cancellationToken)
    {
        if (await query.CountAsync(cancellationToken) > 1_048_575)
            throw new BusinessException("O resultado excede o limite de linhas do Excel. Refine os filtros para exportar.");

        var items = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Select(lead => new
            {
                lead,
                branch = db.Branches.Where(x => x.Id == lead.BranchId).Select(x => x.Name).FirstOrDefault(),
                seller = db.Users.Where(x => x.Id == lead.SellerId).Select(x => x.Name).FirstOrDefault(),
                currentSeller = db.Users.Where(x => x.Id == lead.CurrentSellerId).Select(x => x.Name).FirstOrDefault(),
                service = db.Catalog.Where(x => x.Id == lead.ServiceId).Select(x => x.Name).FirstOrDefault(),
                condition = db.Catalog.Where(x => x.Id == lead.ConditionId).Select(x => x.Name).FirstOrDefault(),
                classifications = (from member in db.LeadClassifications
                                   join classification in db.Classifications on member.ClassificationId equals classification.Id
                                   where member.LeadId == lead.Id && classification.UserId == userId
                                   orderby classification.Name, classification.Id
                                   select classification.Name).ToArray()
            }).ToListAsync(cancellationToken);

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(sales ? "Vendas" : "Leads");
        string[] headers = ["ID", "Nome", "Telefone", "Telefone adicional", "E-mail", "Gênero", "Nascimento", "Origem",
            "Indicação", "Como conheceu", "Motivo da escolha", "Sede", "Vendedor original", "Vendedor atual", "Serviço",
            "Condição de venda", "Status", "Valor (R$)", "Classificações", "Observações", "Criado em (UTC)", "Atualizado em (UTC)"];
        for (var i = 0; i < headers.Length; i++) sheet.Cell(1, i + 1).Value = headers[i];
        var row = 2;
        foreach (var item in items)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var lead = item.lead;
            object?[] values = [lead.Id, lead.Name, lead.Phone, lead.AdditionalPhone, lead.Email, lead.Gender,
                lead.BirthDate?.ToDateTime(TimeOnly.MinValue), lead.Origin, lead.Referral, lead.Discovery, lead.ChoiceReason,
                item.branch, item.seller, item.currentSeller, item.service, item.condition, lead.Status, lead.Value,
                string.Join("; ", item.classifications), lead.Notes, lead.CreatedAt, lead.UpdatedAt];
            for (var i = 0; i < values.Length; i++)
                sheet.Cell(row, i + 1).Value = XLCellValue.FromObject(values[i]);
            row++;
        }
        sheet.Range(1, 1, 1, headers.Length).Style.Font.Bold = true;
        sheet.Range(1, 1, 1, headers.Length).Style.Fill.BackgroundColor = XLColor.FromHtml("#E8EEF5");
        sheet.Range(1, 1, row - 1, headers.Length).SetAutoFilter();
        sheet.SheetView.FreezeRows(1);
        sheet.Columns(1, headers.Length).Width = 22;
        sheet.Column(1).Width = 10;
        sheet.Column(2).Width = 32;
        sheet.Columns(3, 4).Style.NumberFormat.Format = "@";
        sheet.Column(7).Style.DateFormat.Format = "dd/mm/yyyy";
        sheet.Column(18).Style.NumberFormat.Format = "\"R$\" #,##0.00";
        sheet.Columns(21, 22).Style.DateFormat.Format = "dd/mm/yyyy hh:mm";
        sheet.Columns(19, 20).Width = 40;
        using var stream = new MemoryStream();
        cancellationToken.ThrowIfCancellationRequested();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }
}
