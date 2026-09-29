using System.Text.Json;
using Crm.Api.Domain;

namespace Crm.Api.Features.WhatsApp;

public class WhatsAppClient(HttpClient http)
{
    public async Task<(byte[] Data, string ContentType)> Download(int userId, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/sessions/{userId}/{path}");
        using var response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new BusinessException("Foto de perfil indisponível.", (int)response.StatusCode);
        var contentType = response.Content.Headers.ContentType?.MediaType;
        if (contentType == null || !contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            throw new BusinessException("O serviço WhatsApp retornou uma foto inválida.", 502);
        return (await response.Content.ReadAsByteArrayAsync(), contentType);
    }

    public async Task<JsonElement> Send(int userId, HttpMethod method, string path, object? body = null)
    {
        using var request = new HttpRequestMessage(method, $"/sessions/{userId}/{path}");
        if (body != null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            string message;
            try { message = JsonDocument.Parse(json).RootElement.GetProperty("message").GetString() ?? "Falha no WhatsApp."; }
            catch { message = "Não foi possível completar a operação do WhatsApp."; }
            throw new BusinessException(message, (int)response.StatusCode);
        }
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
