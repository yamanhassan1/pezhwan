package com.pezhwan;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Session endpoints: list, revoke one, revoke all.
 */
public final class SessionService {

    private final PezhwanClient client;

    SessionService(PezhwanClient client) {
        this.client = client;
    }

    /** Lists the authenticated user's active sessions. */
    public List<Models.Session> list() throws IOException, InterruptedException {
        Map<String, Object> data = client.get("/v1/sessions");
        Object raw = data.get("sessions");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(Map.class::isInstance)
                .map(item -> Models.Session.from(Models.castMap(item)))
                .collect(java.util.stream.Collectors.toList());
    }

    /** Revokes a single session. */
    public void revoke(String sessionId) throws IOException, InterruptedException {
        client.delete("/v1/sessions/" + sessionId + "/revoke");
    }

    /** Revokes every session for the current user. */
    public void revokeAll() throws IOException, InterruptedException {
        client.post("/v1/sessions/all/revoke", Map.of());
    }
}