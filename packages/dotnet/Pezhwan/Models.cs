namespace Pezhwan;

/// <summary>
/// Typed mirror of the identity server's wire envelope and resources.
/// </summary>
public static class Models
{
    /// <summary>Error payload: { code, message }.</summary>
    public sealed record ErrorBody(string Code, string Message);

    /// <summary>
    /// Wire envelope returned by every non-OAuth endpoint:
    /// { success, data, error }.
    /// </summary>
    public sealed record Envelope(bool Success, Dictionary<string, object?> Data, ErrorBody? Error)
    {
        public static Envelope From(Dictionary<string, object?> json)
        {
            var success = json.TryGetValue("success", out var s) && s is true;
            var data = json.TryGetValue("data", out var d) && d is Dictionary<string, object?> map
                ? map
                : new Dictionary<string, object?>();
            var error = json.TryGetValue("error", out var e) && e is Dictionary<string, object?> err
                ? ErrorBody.From(err)
                : null;
            return new Envelope(success, data, error);
        }

        public string? Code => Error?.Code;
        public string? Message => Error?.Message;
    }

    /// <summary>User resource from /v1/users/me and register.</summary>
    public sealed record User(string Id, string Email, string? Phone, bool EmailVerified,
        bool IsActive, List<string> Roles, string? TenantId)
    {
        public static User From(Dictionary<string, object?> json)
        {
            return new User(
                Str(json, "_id"),
                Str(json, "email"),
                Str(json, "phone"),
                json.TryGetValue("emailVerified", out var ev) && ev is true,
                json.TryGetValue("isActive", out var ia) && ia is bool b ? b : true,
                StrList(json, "roles"),
                Str(json, "tenantId"));
        }
    }

    /// <summary>Tokens from register/login/refresh.</summary>
    public sealed record LoginTokens(string AccessToken, string RefreshToken, int ExpiresIn, User? User)
    {
        public static LoginTokens From(Dictionary<string, object?> json)
        {
            return new LoginTokens(
                Str(json, "accessToken"),
                Str(json, "refreshToken"),
                json.TryGetValue("expiresIn", out var e) && e is int i ? i : 0,
                json.TryGetValue("user", out var u) && u is Dictionary<string, object?> user
                    ? User.From(user)
                    : null);
        }
    }

    /// <summary>MFA challenge returned by login when step-up is required.</summary>
    public sealed record MfaChallenge(bool MfaRequired, string UserId, List<string> Methods)
    {
        public static MfaChallenge From(Dictionary<string, object?> json)
        {
            return new MfaChallenge(
                json.TryGetValue("mfaRequired", out var m) && m is true,
                Str(json, "userId"),
                StrList(json, "methods"));
        }
    }

    /// <summary>Session entry from /v1/sessions.</summary>
    public sealed record Session(string Id, string Device, string? Ip, string? LastActiveAt)
    {
        public static Session From(Dictionary<string, object?> json)
        {
            var device = Str(json, "device");
            if (device.Length == 0) device = Str(json, "userAgent");
            return new Session(Str(json, "_id"), device, Str(json, "ip"),
                json.TryGetValue("lastActiveAt", out var la) ? la?.ToString() : null);
        }
    }

    /// <summary>TOTP setup result from /v1/mfa/setup.</summary>
    public sealed record MfaSetup(string Secret, string QrCode)
    {
        public static MfaSetup From(Dictionary<string, object?> json)
        {
            return new MfaSetup(Str(json, "secret"), Str(json, "qrCode"));
        }
    }

    /// <summary>Managed tenant resource from the admin surface.</summary>
    public sealed record Tenant(string Id, string Name, string Slug, string Plan, bool Active)
    {
        public static Tenant From(Dictionary<string, object?> json)
        {
            var id = Str(json, "_id");
            if (id.Length == 0) id = Str(json, "id");
            return new Tenant(
                id,
                Str(json, "name"),
                Str(json, "slug"),
                Str(json, "plan") is { Length: > 0 } plan ? plan : "free",
                json.TryGetValue("active", out var a) && a is bool b ? b : true);
        }
    }

    internal static string Str(Dictionary<string, object?> json, string key)
        => json.TryGetValue(key, out var v) && v is not null ? v.ToString() ?? "" : "";

    internal static List<string> StrList(Dictionary<string, object?> json, string key)
    {
        if (!json.TryGetValue(key, out var v) || v is not System.Collections.IEnumerable seq)
            return new List<string>();
        var result = new List<string>();
        foreach (var item in seq) result.Add(item?.ToString() ?? "");
        return result;
    }
}