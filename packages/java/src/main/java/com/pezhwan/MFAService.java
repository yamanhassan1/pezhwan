package com.pezhwan;

import java.io.IOException;
import java.util.Map;

/**
 * Multi-factor authentication endpoints (TOTP + backup codes).
 */
public final class MFAService {

    private final PezhwanClient client;

    MFAService(PezhwanClient client) {
        this.client = client;
    }

    /** Starts TOTP enrollment; returns the shared secret + QR code. */
    public Models.MfaSetup setup() throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/mfa/setup", Map.of());
        return Models.MfaSetup.from(data);
    }

    /** Activates MFA after verifying the first generated code. */
    public void enable(String code) throws IOException, InterruptedException {
        client.post("/v1/mfa/enable", JsonUtil.mapOf("code", code));
    }

    /** Step-up verification of a current TOTP/backup code. */
    public boolean verify(String code) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/mfa/verify", JsonUtil.mapOf("code", code));
        return Boolean.TRUE.equals(data.get("verified"));
    }

    /** Disables MFA (requires a valid current code). */
    public void disable(String code) throws IOException, InterruptedException {
        client.post("/v1/mfa/disable", JsonUtil.mapOf("code", code));
    }

    /** Completes an MFA-challenged login. */
    public Models.LoginTokens login(String userId, String code) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/mfa/login",
                JsonUtil.mapOf("userId", userId, "code", code));
        Models.LoginTokens tokens = Models.LoginTokens.from(data);
        client.setToken(tokens.accessToken());
        return tokens;
    }
}