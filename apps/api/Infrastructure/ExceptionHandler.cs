using Crm.Api.Domain;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Infrastructure;

public class ExceptionHandler(ILogger<ExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception error, CancellationToken token)
    {
        var (status, message) = error switch
        {
            BusinessException e => (e.Status, e.Message),
            DbUpdateConcurrencyException => (409, "Este registro foi alterado. Atualize a página e tente novamente."),
            DbUpdateException => (409, "Não foi possível salvar: registro duplicado ou referência em uso."),
            HttpRequestException => (503, "O serviço WhatsApp está indisponível. Tente novamente."),
            _ => (500, "Não foi possível concluir a operação.")
        };
        if (status == 500) logger.LogError(error, "Unhandled request error");
        await Results.Problem(statusCode: status, title: message).ExecuteAsync(context);
        return true;
    }
}
