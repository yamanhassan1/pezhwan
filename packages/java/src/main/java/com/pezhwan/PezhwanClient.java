package com.pezhwan;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Synchronous HTTP client for the PEZHWAN identity server.
 *
 * <p>Strings are decoded to the server's {@code {success, data, error}}
 * envelope; any non-2xx response raises {@link PezhwanApiException}.
 */
public final class PezhwanClient {

    private final String baseUrl;
    private final HttpClient http;
    private String accessToken;
    private String tenantId;

    private PezhwanClient(Builder builder) {
        this.baseUrl = stripTrailingSlash(builder.baseUrl);
        this.accessToken = builder.accessToken;
        this.tenantId = builder.tenantId;
        HttpClient.Builder cb = HttpClient.newBuilder()
                .connectTimeout(builder.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL);
        if (builder.trustAllCerts) {
            cb.sslContext(InsecureTls.trustAllContext());
        }
        this.http = cb.build();

        this.auth = new AuthService(this);
        this.sessions = new SessionService(this);
        this.mfa = new MFAService(this);
        this.authorization = new AuthorizationService(this);
        this.tenant = new TenantService(this);
    }

    /** Builder for {@link PezhwanClient}. */
    public static final class Builder {
        private String baseUrl;
        private String accessToken;
        private String tenantId;
        private Duration timeout = Duration.ofSeconds(30);
        private boolean trustAllCerts = false;

        public Builder(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public Builder accessToken(String token) {
            this.accessToken = token;
            return this;
        }

        public Builder tenantId(String tenantId) {
            this.tenantId = tenantId;
            return this;
        }

        public Builder timeout(Duration timeout) {
            this.timeout = timeout;
            return this;
        }

        /** Disables TLS verification. For local/development hosts only. */
        public Builder trustAllCerts() {
            this.trustAllCerts = true;
            return this;
        }

        public PezhwanClient build() {
            return new PezhwanClient(this);
        }
    }

    public final AuthService auth;
    public final SessionService sessions;
    public final MFAService mfa;
    public final AuthorizationService authorization;
    public final TenantService tenant;

    /** Sets the bearer token used for subsequent requests. */
    public void setToken(String token) {
        this.accessToken = token;
    }

    public String getToken() {
        return accessToken;
    }

    /** Performs a GET and returns the decoded envelope data. */
    public Map<String, Object> get(String path) throws IOException, InterruptedException {
        return request("GET", path, null);
    }

    /** Performs a POST with a JSON body and returns the envelope data. */
    public Map<String, Object> post(String path, Map<String, Object> body)
            throws IOException, InterruptedException {
        return request("POST", path, body);
    }

    /** Performs a DELETE and returns the envelope data. */
    public Map<String, Object> delete(String path) throws IOException, InterruptedException {
        return request("DELETE", path, null);
    }

    private Map<String, Object> request(String method, String path, Map<String, Object> body)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(45))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("User-Agent", "pezhwan-java/0.1.0");
        if (accessToken != null && !accessToken.isEmpty()) {
            builder.header("Authorization", "Bearer " + accessToken);
        }
        if (tenantId != null && !tenantId.isEmpty()) {
            builder.header("X-Tenant-Id", tenantId);
        }

        String json = body == null ? null : JsonUtil.write(body);
        switch (method) {
            case "GET" -> builder.GET();
            case "DELETE" -> builder.DELETE();
            default -> builder.method(method, body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json));
        }

        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        Map<String, Object> payload = JsonUtil.read(response.body());
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            throw PezhwanException.PezhwanApiException.from(status, Models.Envelope.from(payload));
        }
        return Models.Envelope.from(payload).data();
    }

    /** Queries the public health endpoint. */
    public Map<String, Object> health() throws IOException, InterruptedException {
        return get("/v1/admin/health");
    }

    private static String stripTrailingSlash(String url) {
        return url == null || url.isEmpty() ? "" : url.replaceAll("/+$", "");
    }
}