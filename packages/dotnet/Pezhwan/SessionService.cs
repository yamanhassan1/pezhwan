namespace Pezhwan;

/// <summary>
/// Session endpoints: list, revoke one, revoke all.
/// </summary>
public sealed class SessionService
{
    private readonly PezhwanClient _client;

    internal SessionService(PezhwanClient client)
    {
        _client = client;
    }

    /// <summary>Lists the authenticated user's active sessions.</summary>
    public async Task<List<Models.Session>> ListAsync(CancellationToken ct = default)
    {
        var data = await _client.GetAsync("/v1/sessions", ct).ConfigureAwait(false);
        if (!data.TryGetValue("sessions", out var raw) || raw is not System.Collections.IEnumerable seq)
            return new List<Models.Session>();
        var result = new List<Models.Session>();
        foreach (var item in seq)
        {
            if (item is Dictionary<string, object?> map)
                result.Add(Models.Session.From(map));
        }
        return result;
    }

    /// <summary>Revokes a single session.</summary>
    public Task RevokeAsync(string sessionId, CancellationToken ct = default)
        => _client.DeleteAsync($"/v1/sessions/{sessionId}/revoke", ct);

    /// <summary>Revokes every session for the current user.</summary>
    public Task RevokeAllAsync(CancellationToken ct = default)
        => _client.PostAsync("/v1/sessions/all/revoke", new Dictionary<string, object?>(), ct);
}