package com.pezhwan;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Tenant lifecycle management via the identity server admin surface.
 */
public final class TenantService {

    private final PezhwanClient client;

    TenantService(PezhwanClient client) {
        this.client = client;
    }

    /** Creates a new tenant. */
    public Models.Tenant create(String name, String slug, String plan, Map<String, Object> config)
            throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("name", name, "slug", slug);
        if (plan != null && !plan.isEmpty()) {
            body.put("plan", plan);
        }
        if (config != null && !config.isEmpty()) {
            body.put("config", config);
        }
        return Models.Tenant.from(client.post("/v1/admin/tenants", body));
    }

    /** Fetches a single tenant by ID or slug. */
    public Models.Tenant get(String tenantId) throws IOException, InterruptedException {
        return Models.Tenant.from(client.get("/v1/admin/tenants/" + tenantId));
    }

    /** Returns the tenants visible to the caller. */
    public List<Models.Tenant> list() throws IOException, InterruptedException {
        Map<String, Object> data = client.get("/v1/admin/tenants");
        Object raw = data.get("tenants");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Models.Tenant> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add(Models.Tenant.from(castMap(m)));
            }
        }
        return out;
    }

    /** Partially updates a tenant. */
    public Models.Tenant update(String tenantId, Map<String, Object> patch)
            throws IOException, InterruptedException {
        Map<String, Object> body = patch == null ? Map.of() : patch;
        return Models.Tenant.from(client.post("/v1/admin/tenants/" + tenantId, body));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Map<?, ?> raw) {
        return (Map<String, Object>) raw;
    }
}