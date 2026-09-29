using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Crm.Api.Domain;
using Crm.Api.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Features.Auth;

[ApiController, Route("api/auth")]
public class AuthController(CrmDbContext db, CurrentUser current) : ControllerBase
{
    [HttpGet("csrf")]
    public object Csrf(IAntiforgery antiforgery) => new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken };
    [HttpPost("login"), EnableRateLimiting("login")]
    public async Task<object> Login(LoginRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Username == request.Username.Trim().ToLower());
        var hasher = new PasswordHasher<User>();
        if (user is null || !user.Active || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            throw new BusinessException("Usuário ou senha inválidos.", 401);
        if (user.BranchId.HasValue && !await db.Branches.AnyAsync(x => x.Id == user.BranchId && x.Active))
            throw new BusinessException("Sua sede está inativa.", 403);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.IsAdmin ? "admin" : "seller"), new("stamp", user.SecurityStamp)
        };
        if (user.BranchId.HasValue) claims.Add(new("branch", user.BranchId.ToString()!));
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
        return ToDto(user);
    }
    [HttpGet("me"), Authorize]
    public async Task<object> Me() => ToDto(await db.Users.SingleAsync(x => x.Id == current.Id));
    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout() { await HttpContext.SignOutAsync(); return NoContent(); }
    public static object ToDto(User u) => new { u.Id, u.Name, u.Username, u.IsAdmin, u.Active, u.BranchId };
}
public record LoginRequest([Required, MaxLength(100)] string Username, [Required, MaxLength(200)] string Password);
