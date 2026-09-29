using System.Security.Claims;
using System.Threading.RateLimiting;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Auth;

public static class AuthenticationSetup
{
    public static IServiceCollection AddCrmAuthentication(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        if (!env.IsDevelopment() && string.IsNullOrWhiteSpace(config["WhatsApp:Secret"]))
            throw new InvalidOperationException("Configure WhatsApp:Secret fora do desenvolvimento.");
        var secure = config.GetValue("SecureCookies", !env.IsDevelopment());
        services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo("data/keys")).SetApplicationName("via-crm");
        services.AddAntiforgery(o =>
        {
            o.HeaderName = "X-CSRF-TOKEN";
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.SecurePolicy = secure ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
        });
        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
        {
            o.Cookie.Name = "via.session";
            o.Cookie.HttpOnly = true;
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.SecurePolicy = secure ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
            o.ExpireTimeSpan = TimeSpan.FromHours(8);
            o.SlidingExpiration = true;
            o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
            o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
            o.Events.OnValidatePrincipal = async c =>
            {
                var db = c.HttpContext.RequestServices.GetRequiredService<CrmDbContext>();
                var id = int.Parse(c.Principal!.FindFirstValue(ClaimTypes.NameIdentifier)!);
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
                if (user is null || !user.Active || user.SecurityStamp != c.Principal!.FindFirstValue("stamp")
                    || (user.BranchId.HasValue && !await db.Branches.AnyAsync(x => x.Id == user.BranchId && x.Active)))
                    c.RejectPrincipal();
            };
        });
        services.AddAuthorization(o => o.AddPolicy("admin", p => p.RequireRole("admin")));
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = 429;
            o.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 15, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }
}
