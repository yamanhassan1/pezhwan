"""Typed models mirroring the identity server's envelope and resources."""

from __future__ import annotations

from typing import Any, Mapping, Optional


class Envelope:
    """Wire envelope: every non-OAuth endpoint returns ``{success, data, error}``.

    Args:
        data: The parsed JSON payload.
    """

    def __init__(self, data: Mapping[str, Any]) -> None:
        self.raw: Mapping[str, Any] = data
        self.success: bool = bool(data.get("success"))
        self.data: Any = data.get("data")
        self.error: Optional[Mapping[str, Any]] = data.get("error")
        self.code: Optional[str] = (data.get("error") or {}).get("code")
        self.message: str = (data.get("error") or {}).get("message") or ""


class User:
    def __init__(self, data: Mapping[str, Any]) -> None:
        self.id: str = str(data.get("id") or data.get("_id") or "")
        self.email: Optional[str] = data.get("email")
        self.phone: Optional[str] = data.get("phone")
        self.email_verified: bool = bool(data.get("emailVerified"))
        self.active: bool = bool(data.get("isActive", True))
        self.roles: list[str] = list(data.get("roles") or [])
        self.tenant_id: Optional[str] = data.get("tenantId")
        self.raw: Mapping[str, Any] = data

    @classmethod
    def from_list(cls, data: Any) -> list["User"]:
        return [cls(item) for item in (data or [])]


class LoginTokens:
    def __init__(self, data: Mapping[str, Any]) -> None:
        self.access_token: str = data.get("accessToken") or data.get("access_token") or ""
        self.refresh_token: str = data.get("refreshToken") or data.get("refresh_token") or ""
        self.expires_in: int = int(data.get("expiresIn") or 0)
        self.raw: Mapping[str, Any] = data


class Session:
    def __init__(self, data: Mapping[str, Any]) -> None:
        self.id: str = str(data.get("_id") or data.get("id") or "")
        self.device: str = str(data.get("device") or data.get("userAgent") or "")
        self.ip: Optional[str] = data.get("ip")
        self.last_active_at: Optional[str] = data.get("lastActiveAt")
        self.raw: Mapping[str, Any] = data

    @classmethod
    def from_list(cls, data: Any) -> list["Session"]:
        return [cls(item) for item in (data or [])]


class MfaChallenge:
    def __init__(self, data: Mapping[str, Any]) -> None:
        self.mfa_required: bool = bool(data.get("mfaRequired"))
        self.user_id: str = str(data.get("userId") or "")
        self.methods: list[str] = list(data.get("methods") or [])
        self.raw: Mapping[str, Any] = data


class MfaSetup:
    def __init__(self, data: Mapping[str, Any]) -> None:
        self.secret = data.get("secret")
        self.qr_code = data.get("qrCode")
        self.raw: Mapping[str, Any] = data