namespace Pezhwan;

/// <summary>
/// RBAC/ABAC operations: role assignment, permission resolution, and
/// authorization can-checks against the identity server.
/// </summary>
public sealed class AuthorizationService
{
    private readonly PezhwanClient _client;

    internal AuthorizationService(PezhwanClient client)
    {
        _client = client;
    }

    /// <summary>Assigns a role to a user within a tenant+application scope.</summary>
    public async Task AssignRoleAsync(string userId, string roleName,
        string? tenantId = null, string? applicationId = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["userId"] = userId, ["roleName"] = roleName };
        if (!string.IsNullOrEmpty(tenantId)) body["tenantId"] = tenantId;
        if (!string.IsNullOrEmpty(applicationId)) body["applicationId"] = applicationId;
        await _client.PostAsync("/v1/admin/roles/assign", body, ct).ConfigureAwait(false);
    }

    /// <summary>Removes a role from a user within a tenant+application scope.</summary>
    public async Task RemoveRoleAsync(string userId, string roleName,
        string? tenantId = null, string? applicationId = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["userId"] = userId, ["roleName"] = roleName };
        if (!string.IsNullOrEmpty(tenantId)) body["tenantId"] = tenantId;
        if (!string.IsNullOrEmpty(applicationId)) body["applicationId"] = applicationId;
        await _client.PostAsync("/v1/admin/roles/remove", body, ct).ConfigureAwait(false);
    }

    /// <summary>Returns the roles assigned to a user.</summary>
    public async Task<List<Dictionary<string, object?>>> GetUserRolesAsync(
        string userId, string? tenantId = null, string? applicationId = null, CancellationToken ct = default)
    {
        var path = $"/v1/admin/users/{userId}/roles{ScopeQuery(tenantId, applicationId)}";
        var data = await _client.GetAsync(path, ct).ConfigureAwait(false);
        return ToListOfDict(data, "roles");
    }

    /// <summary>Returns the resolved permission names for a user.</summary>
    public async Task<List<string>> GetUserPermissionsAsync(
        string userId, string? tenantId = null, string? applicationId = null, CancellationToken ct = default)
    {
        var path = $"/v1/admin/users/{userId}/permissions{ScopeQuery(tenantId, applicationId)}";
        var data = await _client.GetAsync(path, ct).ConfigureAwait(false);
        var out_ = new List<string>();
        if (data.TryGetValue("permissions", out var raw) && raw is List<object?> list)
        {
            foreach (var item in list)
            {
                if (item is not null) out_.Add(item.ToString() ?? "");
            }
        }
        return out_;
    }

    /// <summary>Checks whether a user holds a permission; applies optional ABAC context.</summary>
    public async Task<bool> CanAsync(string userId, string permission,
        Dictionary<string, object?>? context = null, CancellationToken ct = default)
    {
        var body = new Dictionary<string, object?> { ["userId"] = userId, ["permission"] = permission };
        if (context is { Count: > 0 })
        {
            foreach (var (key, value) in context) body[key] = value;
        }
        var data = await _client.PostAsync("/v1/admin/authorization/can", body, ct).ConfigureAwait(false);
        return data.TryGetValue("allowed", out var allowed) && allowed is true;
    }

    private static string ScopeQuery(string? tenantId, string? applicationId)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(tenantId)) parts.Add("tenantId=" + Uri.EscapeDataString(tenantId));
        if (!string.IsNullOrEmpty(applicationId)) parts.Add("applicationId=" + Uri.EscapeDataString(applicationId));
        return parts.Count == 0 ? "" : "?" + string.Join("&", parts);
    }

    private static List<Dictionary<string, object?>> ToListOfDict(
        Dictionary<string, object?> data, string key)
    {
        var out_ = new List<Dictionary<string, object?>>();
        if (data.TryGetValue(key, out var raw) && raw is List<object?> list)
        {
            foreach (var item in list)
            {
                if (item is Dictionary<string, object?> dict) out_.Add(dict);
            }
        }
        return out_;
    }
}