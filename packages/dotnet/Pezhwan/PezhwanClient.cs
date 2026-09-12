using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Pezhwan;

/// <summary>
/// Minimal HTTP client for the PEZHWAN identity server.
/// </summary>
public sealed class PezhwanClient
{
    private readonly HttpClient _http;
    private string _accessToken;
    private readonly string _tenantId;

    public PezhwanClient(string baseUrl, string? accessToken = null, string? tenantId = null,
        TimeSpan? timeout = null)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new ArgumentException("baseUrl is required", nameof(baseUrl));

        _http = new HttpClient
        {
            BaseAddress = new Uri(baseUrl.EndsWith("/") ? baseUrl : baseUrl + "/"),
            Timeout = timeout ?? TimeSpan.FromSeconds(30),
        };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("pezhwan-dotnet/0.1.0");
        _accessToken = accessToken ?? "";
        _tenantId = tenantId ?? "";

        Auth = new AuthService(this);
        Sessions = new SessionService(this);
        Mfa = new MFAService(this);
        Authorization = new AuthorizationService(this);
        Tenant = new TenantService(this);
    }

    public AuthService Auth { get; }
    public SessionService Sessions { get; }
    public MFAService Mfa { get; }
    public AuthorizationService Authorization { get; }
    public TenantService Tenant { get; }

    public string AccessToken
    {
        get => _accessToken;
        set => _accessToken = value ?? "";
    }

    /// <summary>Constructs a configured client with auth/session/mfa attached.</summary>
    public static PezhwanClient Create(string baseUrl, string? accessToken = null, string? tenantId = null,
        TimeSpan? timeout = null)
        => new PezhwanClient(baseUrl, accessToken, tenantId, timeout);

    /// <summary>Sends a JSON request returning the envelope's data payload.</summary>
    public async Task<Dictionary<string, object?>> RequestAsync(
        HttpMethod method, string path, object? body = null, CancellationToken ct = default)
    {
        using var request = NewRequest(method, path, body);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct)
            .ConfigureAwait(false);

        var raw = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        var payload = Parse(raw);
        if (!response.IsSuccessStatusCode)
            throw BuildException((int)response.StatusCode, payload);

        return payload.TryGetValue("data", out var data)
            && data is Dictionary<string, object?> map
                ? map
                : new Dictionary<string, object?>();
    }

    public Task<Dictionary<string, object?>> GetAsync(string path, CancellationToken ct = default)
        => RequestAsync(HttpMethod.Get, path, null, ct);

    public Task<Dictionary<string, object?>> PostAsync(string path, object? body = null, CancellationToken ct = default)
        => RequestAsync(HttpMethod.Post, path, body, ct);

    public Task<Dictionary<string, object?>> DeleteAsync(string path, CancellationToken ct = default)
        => RequestAsync(HttpMethod.Delete, path, null, ct);

    /// <summary>Queries the public health endpoint.</summary>
    public Task<Dictionary<string, object?>> HealthAsync(CancellationToken ct = default)
        => GetAsync("/v1/admin/health", ct);

    /// <summary>Fetches the OIDC discovery document.</summary>
    public Task<Dictionary<string, object?>> DiscoveryAsync(CancellationToken ct = default)
        => GetAsync("/.well-known/openid-configuration", ct);

    private HttpRequestMessage NewRequest(HttpMethod method, string path, object? body)
    {
        var request = new HttpRequestMessage(method, path.TrimStart('/'));
        if (!string.IsNullOrEmpty(_accessToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
        if (!string.IsNullOrEmpty(_tenantId))
            request.Headers.TryAddWithoutValidation("X-Tenant-Id", _tenantId);
        if (body is not null)
            request.Content = JsonContent.Create(body);
        return request;
    }

    private static Dictionary<string, object?> Parse(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return new Dictionary<string, object?>();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(raw)
                ?? new Dictionary<string, object?>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?>();
        }
    }

    private static PezhwanApiException BuildException(int status, Dictionary<string, object?> payload)
    {
        var code = payload.TryGetValue("error", out var e)
                   && e is Dictionary<string, object?> error
                   && error.TryGetValue("code", out var c)
            ? c?.ToString() ?? "UNKNOWN"
            : "UNKNOWN";
        var message = payload.TryGetValue("error", out var m)
                      && m is Dictionary<string, object?> err2
                      && err2.TryGetValue("message", out var msg)
            ? msg?.ToString() ?? ""
            : ((HttpStatusCode)status).ToString();
        return new PezhwanApiException(status, code, message);
    }
}