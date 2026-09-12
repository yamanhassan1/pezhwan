package com.pezhwan;

import java.util.Map;

/**
 * Typed mirror of the identity server's wire envelope and resources.
 */
public final class Models {

    private Models() {
    }

    /** Wire envelope: {success, data, error}. */
    public record Envelope(boolean success, Map<String, Object> data, ErrorBody error) {
        public static Envelope from(Map<String, Object> json) {
            boolean success = Boolean.TRUE.equals(json.get("success"));
            @SuppressWarnings("unchecked")
            Map<String, Object> data = json.get("data") instanceof Map<?, ?>
                    ? (Map<String, Object>) json.get("data")
                    : Map.of();
            @SuppressWarnings("unchecked")
            Map<String, Object> err = json.get("error") instanceof Map<?, ?>
                    ? (Map<String, Object>) json.get("error")
                    : null;
            return new Envelope(success, data, err == null ? null : ErrorBody.from(err));
        }
    }

    /** Error payload: {code, message}. */
    public record ErrorBody(String code, String message) {
        public static ErrorBody from(Map<String, Object> json) {
            String code = asString(json.get("code"), "UNKNOWN");
            String message = asString(json.get("message"), "");
            return new ErrorBody(code, message);
        }
    }

    /** User resource returned by /v1/users/me and register. */
    public record User(String id, String email, String phone, boolean emailVerified,
                       boolean isActive, java.util.List<String> roles, String tenantId) {
        public static User from(Map<String, Object> json) {
            return new User(
                    asString(json.get("_id"), ""),
                    asString(json.get("email"), ""),
                    asString(json.get("phone"), ""),
                    Boolean.TRUE.equals(json.get("emailVerified")),
                    json.containsKey("isActive") ? Boolean.TRUE.equals(json.get("isActive")) : true,
                    toStringList(json.get("roles")),
                    asString(json.get("tenantId"), ""));
        }
    }

    /** Tokens from register/login/refresh. */
    public record LoginTokens(String accessToken, String refreshToken, int expiresIn, User user) {
        public static LoginTokens from(Map<String, Object> json) {
            return new LoginTokens(
                    asString(json.get("accessToken"), ""),
                    asString(json.get("refreshToken"), ""),
                    json.get("expiresIn") instanceof Number n ? n.intValue() : 0,
                    json.get("user") instanceof Map<?, ?> userMap
                            ? User.from(castMap(userMap))
                            : null);
        }
    }

    /** MFA challenge returned by login when step-up is required. */
    public record MfaChallenge(boolean mfaRequired, String userId, java.util.List<String> methods) {
        public static MfaChallenge from(Map<String, Object> json) {
            return new MfaChallenge(
                    Boolean.TRUE.equals(json.get("mfaRequired")),
                    asString(json.get("userId"), ""),
                    toStringList(json.get("methods")));
        }
    }

    /** Session entry from /v1/sessions. */
    public record Session(String id, String device, String ip, String lastActiveAt) {
        public static Session from(Map<String, Object> json) {
            String device = asString(json.get("device"), "");
            if (device.isEmpty()) {
                device = asString(json.get("userAgent"), "");
            }
            return new Session(
                    asString(json.get("_id"), ""),
                    device,
                    asString(json.get("ip"), ""),
                    asString(json.get("lastActiveAt"), ""));
        }
    }

    /** TOTP setup result from /v1/mfa/setup. */
    public record MfaSetup(String secret, String qrCode) {
        public static MfaSetup from(Map<String, Object> json) {
            return new MfaSetup(asString(json.get("secret"), ""), asString(json.get("qrCode"), ""));
        }
    }

    /** Managed tenant resource from the admin surface. */
    public record Tenant(String id, String name, String slug, String plan, boolean active) {
        public static Tenant from(Map<String, Object> json) {
            String id = asString(json.get("_id"), "");
            if (id.isEmpty()) {
                id = asString(json.get("id"), "");
            }
            return new Tenant(
                    id,
                    asString(json.get("name"), ""),
                    asString(json.get("slug"), ""),
                    asString(json.get("plan"), "free"),
                    json.containsKey("active") ? Boolean.TRUE.equals(json.get("active")) : true);
        }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> castMap(Object value) {
        return (Map<String, Object>) value;
    }

    static String asString(Object value, String fallback) {
        return value == null ? fallback : value.toString();
    }

    static java.util.List<String> toStringList(Object value) {
        if (!(value instanceof java.util.List<?> list)) {
            return java.util.List.of();
        }
        java.util.List<String> out = new java.util.ArrayList<>();
        for (Object item : list) {
            out.add(item == null ? "" : item.toString());
        }
        return out;
    }
}