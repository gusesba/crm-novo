using Crm.Api.Domain;
using Microsoft.AspNetCore.Identity;

namespace Crm.Api.Features.Auth;

public static class PasswordCompatibility
{
    public static PasswordVerificationResult Verify(User user, string password)
    {
        try
        {
            if (user.PasswordHash.StartsWith("$2a$") || user.PasswordHash.StartsWith("$2b$") || user.PasswordHash.StartsWith("$2y$"))
                return BCrypt.Net.BCrypt.Verify(password, user.PasswordHash)
                    ? PasswordVerificationResult.SuccessRehashNeeded : PasswordVerificationResult.Failed;
            return new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, password);
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or BCrypt.Net.SaltParseException)
        {
            return PasswordVerificationResult.Failed;
        }
    }
}
