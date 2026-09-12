package com.pezhwan;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;

/**
 * Authentication endpoints: register, login, logout, refresh, OTP, password,
 * and email verification.
 */
public final class AuthService {

    private final PezhwanClient client;

    AuthService(PezhwanClient client) {
        this.client = client;
    }

    /** Registers a new user and opens a session. */
    public Models.LoginTokens register(String email, String password, String phone, Map<String, Object> metadata)
            throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf(
                "email", email,
                "password", password);
        if (phone != null && !phone.isEmpty()) {
            body.put("phone", phone);
        }
        if (metadata != null && !metadata.isEmpty()) {
            body.put("metadata", metadata);
        }
        Map<String, Object> data = client.post("/v1/auth/register", body);
        return Models.LoginTokens.from(data);
    }

    /** Simplest register call: email + password. */
    public Models.LoginTokens register(String email, String password) throws IOException, InterruptedException {
        return register(email, password, null, null);
    }

    /**
     * Password login. Returns tokens directly, or {@code null} when an MFA
     * challenge is issued (see {@link LoginResult}.
     */
    public LoginResult login(String password, String email, String phone) throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("password", password);
        if (email != null && !email.isEmpty()) {
            body.put("email", email);
        }
        if (phone != null && !phone.isEmpty()) {
            body.put("phone", phone);
        }
        Map<String, Object> data = client.post("/v1/auth/login", body);
        Models.MfaChallenge challenge = Models.MfaChallenge.from(data);
        if (challenge.mfaRequired()) {
            return LoginResult.challenge(challenge);
        }
        Models.LoginTokens tokens = Models.LoginTokens.from(data);
        client.setToken(tokens.accessToken());
        return LoginResult.tokens(tokens);
    }

    /** Convenience: login by email. */
    public LoginResult loginByEmail(String email, String password) throws IOException, InterruptedException {
        return login(password, email, null);
    }

    /** Revokes the current session. */
    public void logout() throws IOException, InterruptedException {
        client.post("/v1/auth/logout", Map.of());
    }

    /** Rotates a refresh token into a new token pair. */
    public Models.LoginTokens refresh(String refreshToken) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/auth/refresh",
                JsonUtil.mapOf("refreshToken", refreshToken));
        Models.LoginTokens tokens = Models.LoginTokens.from(data);
        client.setToken(tokens.accessToken());
        return tokens;
    }

    /** Requests an OTP delivered to email or phone. */
    public void otpSend(String target, String purpose) throws IOException, InterruptedException {
        client.post("/v1/auth/otp/send", JsonUtil.mapOf("target", target, "purpose", purpose));
    }

    /** Verifies an OTP without opening a session. */
    public boolean otpVerify(String target, String code, String purpose) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/auth/otp/verify",
                JsonUtil.mapOf("target", target, "code", code, "purpose", purpose));
        return Boolean.TRUE.equals(data.get("verified"));
    }

    /** Exchanges an OTP for a session (+ optional MFA challenge). */
    public LoginResult otpLogin(String target, String code, String purpose) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/auth/otp/login",
                JsonUtil.mapOf("target", target, "code", code, "purpose", purpose));
        Models.MfaChallenge challenge = Models.MfaChallenge.from(data);
        if (challenge.mfaRequired()) {
            return LoginResult.challenge(challenge);
        }
        Models.LoginTokens tokens = Models.LoginTokens.from(data);
        client.setToken(tokens.accessToken());
        return LoginResult.tokens(tokens);
    }

    /** Issues a password-reset verification token; returns expiry seconds. */
    public int forgotPassword(String email, String redirectUri) throws IOException, InterruptedException {
        Map<String, Object> body = JsonUtil.mapOf("email", email);
        if (redirectUri != null && !redirectUri.isEmpty()) {
            body.put("redirectUri", redirectUri);
        }
        Map<String, Object> data = client.post("/v1/auth/password/forgot", body);
        Object expiresIn = data.get("expiresIn");
        return expiresIn instanceof Number n ? n.intValue() : 0;
    }

    /** Completes a password reset with a verification token. */
    public Models.LoginTokens resetPassword(String token, String newPassword) throws IOException, InterruptedException {
        Map<String, Object> data = client.post("/v1/verify/password/reset/confirm",
                JsonUtil.mapOf("token", token, "newPassword", newPassword));
        return Models.LoginTokens.from(data);
    }

    /** Requests a verification email. */
    public void verifyEmail(String email) throws IOException, InterruptedException {
        client.post("/v1/auth/email/verify", JsonUtil.mapOf("email", email));
    }

    /** Returns the authenticated user's profile. */
    public Models.User me() throws IOException, InterruptedException {
        Map<String, Object> data = client.get("/v1/users/me");
        return Models.User.from(data);
    }

    /** Result of a credential or OTP login: tokens or an MFA challenge. */
    public record LoginResult(Models.MfaChallenge challenge, Models.LoginTokens tokens) {
        static LoginResult challenge(Models.MfaChallenge challenge) {
            return new LoginResult(challenge, null);
        }

        static LoginResult tokens(Models.LoginTokens tokens) {
            return new LoginResult(null, tokens);
        }
    }
}