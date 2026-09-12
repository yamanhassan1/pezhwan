namespace Pezhwan;

/// <summary>
/// Multi-factor authentication endpoints (TOTP + backup codes).
/// </summary>
public sealed class MFAService
{
    private readonly PezhwanClient _client;

    internal MFAService(PezhwanClient client)
    {
        _client = client;
    }

    /// <summary>Starts TOTP enrollment; returns the shared secret + QR code.</summary>
    public async Task<Models.MfaSetup> SetupAsync(CancellationToken ct = default)
        => Models.MfaSetup.From(await _client.PostAsync("/v1/mfa/setup",
            new Dictionary<string, object?>(), ct).ConfigureAwait(false));

    /// <summary>Activates MFA after verifying the first generated code.</summary>
    public Task EnableAsync(string code, CancellationToken ct = default)
        => _client.PostAsync("/v1/mfa/enable", new Dictionary<string, object?> { ["code"] = code }, ct);

    /// <summary>Step-up verification of a current TOTP/backup code.</summary>
    public async Task<bool> VerifyAsync(string code, CancellationToken ct = default)
    {
        var data = await _client.PostAsync("/v1/mfa/verify",
            new Dictionary<string, object?> { ["code"] = code }, ct).ConfigureAwait(false);
        return data.TryGetValue("verified", out var v) && v is true;
    }

    /// <summary>Disables MFA (requires a valid current code).</summary>
    public Task DisableAsync(string code, CancellationToken ct = default)
        => _client.PostAsync("/v1/mfa/disable", new Dictionary<string, object?> { ["code"] = code }, ct);

    /// <summary>Completes an MFA-challenged login.</summary>
    public async Task<Models.LoginTokens> LoginAsync(string userId, string code, CancellationToken ct = default)
    {
        var tokens = Models.LoginTokens.From(await _client.PostAsync("/v1/mfa/login",
            new Dictionary<string, object?> { ["userId"] = userId, ["code"] = code }, ct).ConfigureAwait(false));
        _client.AccessToken = tokens.AccessToken;
        return tokens;
    }
}