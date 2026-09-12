namespace Pezhwan;

/// <summary>
/// Authentication endpoints: register, login, logout, refresh, OTP, password,
/// and email verification.
/// </summary>
public sealed class AuthService
{
    private readonly PezhwanClient _client;

    internal AuthService(PezhwanClient client)
    {
        _client = client;
    }

    /// <summary>Registers a new user and opens a session.</summary>
    public async Task<Models.LoginTokens> RegisterAsync(
        string email, string password, string? phone = null,
        Dictionary<string, object?>? metadata = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["email"] = email, ["password"] = password };
        if (!string.IsNullOrEmpty(phone)) body["phone"] = phone;
        if (metadata is { Count: > 0 }) body["metadata"] = metadata;
        return Models.LoginTokens.From(await _client.PostAsync("/v1/auth/register", body, ct).ConfigureAwait(false));
    }

    /// <summary>
    /// Password login. Returns tokens, or an MFA challenge payload when
    /// <c>MfaRequired</c> is set on the result.
    /// </summary>
    public async Task<LoginResult> LoginAsync(string password, string? email = null, string? phone = null,
        CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["password"] = password };
        if (!string.IsNullOrEmpty(email)) body["email"] = email;
        if (!string.IsNullOrEmpty(phone)) body["phone"] = phone;
        var data = await _client.PostAsync("/v1/auth/login", body, ct).ConfigureAwait(false);

        var challenge = Models.MfaChallenge.From(data);
        if (challenge.MfaRequired)
            return LoginResult.FromChallenge(challenge);

        var tokens = Models.LoginTokens.From(data);
        _client.AccessToken = tokens.AccessToken;
        return LoginResult.FromTokens(tokens);
    }

    /// <summary>Revokes the current session.</summary>
    public Task LogoutAsync(CancellationToken ct = default)
        => _client.PostAsync("/v1/auth/logout", new Dictionary<string, object?>(), ct);

    /// <summary>Rotates a refresh token into a fresh token pair.</summary>
    public async Task<Models.LoginTokens> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        var data = await _client.PostAsync("/v1/auth/refresh",
            new Dictionary<string, object?> { ["refreshToken"] = refreshToken }, ct).ConfigureAwait(false);
        var tokens = Models.LoginTokens.From(data);
        _client.AccessToken = tokens.AccessToken;
        return tokens;
    }

    /// <summary>Requests an OTP delivered to email or phone.</summary>
    public Task OtpSendAsync(string target, string purpose, CancellationToken ct = default)
        => _client.PostAsync("/v1/auth/otp/send",
            new Dictionary<string, object?> { ["target"] = target, ["purpose"] = purpose }, ct);

    /// <summary>Verifies an OTP without opening a session.</summary>
    public async Task<bool> OtpVerifyAsync(string target, string code, string purpose,
        CancellationToken ct = default)
    {
        var data = await _client.PostAsync("/v1/auth/otp/verify",
            new Dictionary<string, object?> { ["target"] = target, ["code"] = code, ["purpose"] = purpose },
            ct).ConfigureAwait(false);
        return data.TryGetValue("verified", out var v) && v is true;
    }

    /// <summary>Exchanges an OTP for a session (+ optional MFA challenge).</summary>
    public async Task<LoginResult> OtpLoginAsync(string target, string code, string purpose,
        CancellationToken ct = default)
    {
        var data = await _client.PostAsync("/v1/auth/otp/login",
            new Dictionary<string, object?> { ["target"] = target, ["code"] = code, ["purpose"] = purpose },
            ct).ConfigureAwait(false);
        var challenge = Models.MfaChallenge.From(data);
        if (challenge.MfaRequired)
            return LoginResult.FromChallenge(challenge);
        var tokens = Models.LoginTokens.From(data);
        _client.AccessToken = tokens.AccessToken;
        return LoginResult.FromTokens(tokens);
    }

    /// <summary>Issues a password-reset verification token; returns expiry seconds.</summary>
    public async Task<int> ForgotPasswordAsync(string email, string? redirectUri = null,
        CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["email"] = email };
        if (!string.IsNullOrEmpty(redirectUri)) body["redirectUri"] = redirectUri;
        var data = await _client.PostAsync("/v1/auth/password/forgot", body, ct).ConfigureAwait(false);
        return data.TryGetValue("expiresIn", out var e) && e is int i ? i : 0;
    }

    /// <summary>Completes a password reset with a verification token.</summary>
    public Task<Models.LoginTokens> ResetPasswordAsync(string token, string newPassword,
        CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["token"] = token, ["newPassword"] = newPassword };
        return Task.Run(async () =>
            {
                var data = await _client.PostAsync("/v1/verify/password/reset/confirm", body, ct)
                    .ConfigureAwait(false);
                return Models.LoginTokens.From(data);
            }, ct);
    }

    /// <summary>Requests a verification email.</summary>
    public Task VerifyEmailAsync(string email, CancellationToken ct = default)
        => _client.PostAsync("/v1/auth/email/verify",
            new Dictionary<string, object?> { ["email"] = email }, ct);

    /// <summary>Returns the authenticated user's profile.</summary>
    public async Task<Models.User> MeAsync(CancellationToken ct = default)
        => Models.User.From(await _client.GetAsync("/v1/users/me", ct).ConfigureAwait(false));

    /// <summary>Result of a credential or OTP login: tokens or an MFA challenge.</summary>
    public sealed record LoginResult(Models.MfaChallenge? Challenge, Models.LoginTokens? Tokens)
    {
        public static LoginResult FromChallenge(Models.MfaChallenge challenge)
            => new(challenge, null);

        public static LoginResult FromTokens(Models.LoginTokens tokens)
            => new(null, tokens);
    }
}