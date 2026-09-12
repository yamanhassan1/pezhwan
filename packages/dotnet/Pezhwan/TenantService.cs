namespace Pezhwan;

/// <summary>
/// Tenant lifecycle management via the identity server admin surface.
/// </summary>
public sealed class TenantService
{
    private readonly PezhwanClient _client;

    internal TenantService(PezhwanClient client)
    {
        _client = client;
    }

    /// <summary>Creates a new tenant.</summary>
    public async Task<Models.Tenant> CreateAsync(string name, string slug,
        string? plan = null, Dictionary<string, object?>? config = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["name"] = name, ["slug"] = slug };
        if (!string.IsNullOrEmpty(plan)) body["plan"] = plan;
        if (config is { Count: > 0 }) body["config"] = config;
        return Models.Tenant.From(await _client.PostAsync("/v1/admin/tenants", body, ct).ConfigureAwait(false));
    }

    /// <summary>Fetches a single tenant by ID or slug.</summary>
    public async Task<Models.Tenant> GetAsync(string tenantId, CancellationToken ct = default)
        => Models.Tenant.From(await _client.GetAsync($"/v1/admin/tenants/{tenantId}", ct).ConfigureAwait(false));

    /// <summary>Returns the tenants visible to the caller.</summary>
    public async Task<List<Models.Tenant>> ListAsync(CancellationToken ct = default)
    {
        var data = await _client.GetAsync("/v1/admin/tenants", ct).ConfigureAwait(false);
        var out_ = new List<Models.Tenant>();
        if (data.TryGetValue("tenants", out var raw) && raw is List<object?> list)
        {
            foreach (var item in list)
            {
                if (item is Dictionary<string, object?> dict)
                    out_.Add(Models.Tenant.From(dict));
            }
        }
        return out_;
    }

    /// <summary>Partially updates a tenant.</summary>
    public async Task<Models.Tenant> UpdateAsync(string tenantId,
        Dictionary<string, object?> patch, CancellationToken ct = default)
        => Models.Tenant.From(await _client.PostAsync($"/v1/admin/tenants/{tenantId}", patch, ct).ConfigureAwait(false));
}