using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Crm.Api.Domain;
using Crm.Api.Features.WhatsApp;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Crm.Api.Features.Admin;

[ApiController, Authorize(Policy = "admin"), Route("api/settings/media")]
public class MediaStorageController(WhatsAppClient client, CurrentUser current) : ControllerBase
{
    private void EnsureGlobal()
    {
        if (current.BranchId.HasValue) throw new BusinessException("A configuração de mídia é gerida pelo administrador global.", 403);
    }

    [HttpGet]
    public Task<JsonElement> Get()
    {
        EnsureGlobal();
        return client.SendGlobal(HttpMethod.Get, "media-storage");
    }

    [HttpPut]
    public Task<JsonElement> Save(MediaSettingsRequest r)
    {
        EnsureGlobal();
        return client.SendGlobal(HttpMethod.Put, "media-storage/settings", new { retentionEnabled = r.RetentionEnabled!.Value, r.RetentionDays });
    }

    [HttpPost("cleanup-preview")]
    public Task<JsonElement> Preview(MediaCleanupRequest r)
    {
        EnsureGlobal();
        return client.SendGlobal(HttpMethod.Post, "media-storage/cleanup-preview", r);
    }

    [HttpPost("cleanup")]
    public Task<JsonElement> Cleanup(MediaCleanupConfirmRequest r)
    {
        EnsureGlobal();
        if (r.Confirmed != true) throw new BusinessException("Confirme a exclusão dos arquivos de mídia.");
        return client.SendGlobal(HttpMethod.Post, "media-storage/cleanup", new { r.Days, confirmed = true });
    }
}

public record MediaSettingsRequest([Required] bool? RetentionEnabled, [Range(1, 3650)] int RetentionDays);
public record MediaCleanupRequest([Range(1, 3650)] int Days);
public record MediaCleanupConfirmRequest([Range(1, 3650)] int Days, [Required] bool? Confirmed);
