package com.pezhwan;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * RBAC/ABAC operations: role assignment, permission resolution, and
 * authorization can-checks against the identity server.
 */
public final class AuthorizationService {

    private final PezhwanClient client;

    AuthorizationService(PezhwanClient client) {
        this.client = client;
    }

    /** Assigns a role to a user within a tenant+application scope. */
    public void assignRole(String userId, String roleName, String tenantId, String applicationId)
            throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("userId", userId, "roleName", roleName);
        if (tenantId != null && !tenantId.isEmpty()) {
            body.put("tenantId", tenantId);
        }
        if (applicationId != null && !applicationId.isEmpty()) {
            body.put("applicationId", applicationId);
        }
        client.post("/v1/admin/roles/assign", body);
    }

    /** Removes a role from a user within a tenant+application scope. */
    public void removeRole(String userId, String roleName, String tenantId, String applicationId)
            throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("userId", userId, "roleName", roleName);
        if (tenantId != null && !tenantId.isEmpty()) {
            body.put("tenantId", tenantId);
        }
        if (applicationId != null && !applicationId.isEmpty()) {
            body.put("applicationId", applicationId);
        }
        client.post("/v1/admin/roles/remove", body);
    }

    /** Returns the roles assigned to a user. */
    public List<Map<String, Object>> getUserRoles(String userId, String tenantId, String applicationId)
            throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/v1/admin/users/").append(userId).append("/roles");
        String query = scopeQuery(tenantId, applicationId);
        if (!query.isEmpty()) {
            path.append('?').append(query);
        }
        Map<String, Object> data = client.get(path.toString());
        return asList(data.get("roles"));
    }

    /** Returns the resolved permission names for a user. */
    public List<String> getUserPermissions(String userId, String tenantId, String applicationId)
            throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/v1/admin/users/").append(userId).append("/permissions");
        String query = scopeQuery(tenantId, applicationId);
        if (!query.isEmpty()) {
            path.append('?').append(query);
        }
        Map<String, Object> data = client.get(path.toString());
        List<String> out = new ArrayList<>();
        Object raw = data.get("permissions");
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
        }
        return out;
    }

    /** Checks whether a user holds a permission; applies optional ABAC context. */
    public boolean can(String userId, String permission, Map<String, Object> context)
            throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("userId", userId, "permission", permission);
        if (context != null) {
            body.putAll(context);
        }
        Map<String, Object> data = client.post("/v1/admin/authorization/can", body);
        return Boolean.TRUE.equals(data.get("allowed"));
    }

    private static String scopeQuery(String tenantId, String applicationId) {
        List<String> parts = new ArrayList<>();
        if (tenantId != null && !tenantId.isEmpty()) {
            parts.add("tenantId=" + tenantId);
        }
        if (applicationId != null && !applicationId.isEmpty()) {
            parts.add("applicationId=" + applicationId);
        }
        return String.join("&", parts);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }
}