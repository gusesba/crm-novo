using Crm.Api.Features.Auth;
using Crm.Api.Features.Leads;
using Crm.Api.Features.WhatsApp;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(builder.Configuration["Urls"] ?? "http://localhost:5080");
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ExceptionHandler>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<LeadService>();
builder.Services.AddDbContext<CrmDbContext>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Crm") ?? "Data Source=data/crm.db"));
builder.Services.AddCrmAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddHttpClient<WhatsAppClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["WhatsApp:Url"] ?? "http://localhost:3080");
    client.DefaultRequestHeaders.Add("x-service-key", builder.Configuration["WhatsApp:Secret"] ?? "local-development-only-change-me");
    client.Timeout = TimeSpan.FromSeconds(45);
});
var app = builder.Build();
Directory.CreateDirectory("data");
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.Initialize(db, builder.Configuration, builder.Environment);
}
app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method) || HttpMethods.IsPatch(context.Request.Method))
    {
        if (!context.Request.Path.StartsWithSegments("/internal"))
        {
            try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
            catch (AntiforgeryValidationException)
            {
                await Results.Problem(statusCode: 400, title: "Sessão de segurança expirada. Atualize a página.").ExecuteAsync(context);
                return;
            }
        }
    }
    await next();
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapControllers();
app.Run();
public partial class Program;
