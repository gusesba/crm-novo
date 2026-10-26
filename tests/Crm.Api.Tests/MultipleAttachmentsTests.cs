using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Crm.Api.Features.WhatsApp;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Crm.Api.Tests;

public class MultipleAttachmentsTests
{
    private class Handler : HttpMessageHandler
    {
        public List<(string Path, JsonElement Body)> Calls { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add((request.RequestUri!.AbsolutePath, await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken)));
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { id = "sent", sent = false, sentAttachments = 1, textSent = true, error = "Envio parcial" }) };
        }
    }
    private class Factory : ApiFactory
    {
        public Handler Service { get; } = new();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services => services.AddHttpClient<WhatsAppClient>().ConfigurePrimaryHttpMessageHandler(() => Service));
        }
    }
    private static object File(string name = "a.pdf", string data = "YQ==") => new { name, mime = "application/pdf", data };

    [Fact]
    public async Task SendForwardsOrderedFilesAndPartialResultForOwnSession()
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        var response = await client.PostAsJsonAsync("/api/whatsapp/send", new { chatId = "5511000000000@s.whatsapp.net", text = "Legenda", attachments = new[] { File(), File("b.pdf") } });
        response.EnsureSuccessStatusCode();
        var call = Assert.Single(factory.Service.Calls);
        Assert.Equal("/sessions/1/send", call.Path);
        Assert.Equal(new[] { "a.pdf", "b.pdf" }, call.Body.GetProperty("attachments").EnumerateArray().Select(x => x.GetProperty("name").GetString()));
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(result.GetProperty("sent").GetBoolean());
        Assert.Equal(1, result.GetProperty("sentAttachments").GetInt32());
        Assert.True(result.GetProperty("textSent").GetBoolean());
    }

    [Fact]
    public async Task CampaignForwardsAttachmentsAndKeepsLegacyMessage()
    {
        using var factory = new Factory();
        using var client = await factory.Login("camila");
        var response = await client.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Teste", messages = new object[] {
            new { text = "Olá ${nome}", attachments = new[] { File(), File("b.pdf") } }, new { text = "Legado", attachment = File("old.pdf") }
        } });
        response.EnsureSuccessStatusCode();
        var messages = Assert.Single(factory.Service.Calls).Body.GetProperty("messages");
        Assert.Equal(2, messages[0].GetProperty("attachments").GetArrayLength());
        Assert.Equal("old.pdf", messages[1].GetProperty("attachment").GetProperty("name").GetString());
    }

    [Fact]
    public async Task BothRoutesRejectMixedFieldsTooManyFilesAndTotalSizeBeforeCallingService()
    {
        using var factory = new Factory();
        using var client = await factory.Login();
        foreach (var invalid in new[] {
            new { attachment = (object?)File(), attachments = new[] { File() } },
            new { attachment = (object?)null, attachments = Enumerable.Repeat(File(), 11).ToArray() },
            new { attachment = (object?)null, attachments = new[] { File(data: new string('a', 11_200_001)), File(data: new string('b', 11_200_001)) } }
        })
        {
            var send = await client.PostAsJsonAsync("/api/whatsapp/send", new { chatId = "5511000000000@s.whatsapp.net", invalid.attachment, invalid.attachments });
            Assert.Equal(HttpStatusCode.BadRequest, send.StatusCode);
            var campaign = await client.PostAsJsonAsync("/api/whatsapp/campaigns", new { name = "Teste", messages = new[] { invalid } });
            Assert.Equal(HttpStatusCode.BadRequest, campaign.StatusCode);
        }
        Assert.Empty(factory.Service.Calls);
    }
}
