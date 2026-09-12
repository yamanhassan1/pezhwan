"""Authentication operations: register, login, logout, refresh, password."""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .client import PezhwanClient
from .errors import PezhwanError, PezhwanValidationError
from .models import Envelope, LoginTokens, MfaChallenge, User


class Auth:
    def __init__(self, client: PezhwanClient) -> None:
        self._client = client

    def register(
        self,
        email: str,
        password: str,
        phone: Optional[str] = None,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> tuple[LoginTokens, User | None]:
        body: dict[str, Any] = {"email": email, "password": password}
        if phone:
            body["phone"] = phone
        if metadata:
            body["metadata"] = metadata
        envelope = self._client.post("/v1/auth/register", body, auth=False)
        if not envelope.success:
            raise PezhwanValidationError(envelope.message or "Registration failed")
        return LoginTokens(envelope.data or {}), to_user(envelope.data)

    def login(
        self,
        password: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> tuple[LoginTokens | None, MfaChallenge | None]:
        body: dict[str, str] = {"password": password}
        if email:
            body["email"] = email
        if phone:
            body["phone"] = phone
        envelope = self._client.post("/v1/auth/login", body, auth=False)
        data = envelope.data or {}
        if data.get("mfaRequired"):
            return None, MfaChallenge(data)
        self._client.access_token = data.get("accessToken")
        return LoginTokens(data), None

    def logout(self) -> None:
        self._client.post("/v1/auth/logout", {})

    def refresh(self, refresh_token: str) -> tuple[LoginTokens, Optional[str]]:
        envelope = self._client.post("/v1/auth/refresh", {"refreshToken": refresh_token}, auth=False)
        if not envelope.success:
            raise PezhwanValidationError(envelope.message or "Refresh failed")
        data = envelope.data or {}
        self._client.access_token = data.get("accessToken")
        return LoginTokens(data), data.get("user")

    def otp_send(self, target: str, purpose: str) -> Envelope:
        return self._client.post("/v1/auth/otp/send", {"target": target, "purpose": purpose}, auth=False)

    def otp_verify(self, target: str, code: str, purpose: str) -> bool:
        envelope = self._client.post(
            "/v1/auth/otp/verify", {"target": target, "code": code, "purpose": purpose}, auth=False
        )
        return bool((envelope.data or {}).get("verified"))

    def otp_login(self, target: str, code: str, purpose: str) -> tuple[LoginTokens | None, MfaChallenge | None]:
        envelope = self._client.post(
            "/v1/auth/otp/login", {"target": target, "code": code, "purpose": purpose}, auth=False
        )
        data = envelope.data or {}
        if data.get("mfaRequired"):
            return None, MfaChallenge(data)
        self._client.access_token = data.get("accessToken")
        return LoginTokens(data), None

    def password_change(self, current_password: str, new_password: str) -> None:
        self._client.post("/v1/auth/password/change", {"currentPassword": current_password, "newPassword": new_password})

    def password_forgot(self, email: str, redirect_uri: Optional[str] = None) -> int:
        body: dict[str, Any] = {"email": email}
        if redirect_uri:
            body["redirectUri"] = redirect_uri
        envelope = self._client.post("/v1/auth/password/forgot", body, auth=False)
        return int((envelope.data or {}).get("expiresIn") or 0)

    def password_reset(self, token: str, new_password: str) -> tuple[LoginTokens, User | None]:
        envelope = self._client.post(
            "/v1/verify/password/reset/confirm", {"token": token, "newPassword": new_password}, auth=False
        )
        return LoginTokens(envelope.data or {}), to_user(envelope.data)

    def email_verify(self, email: str) -> int:
        envelope = self._client.post("/v1/auth/email/verify", {"email": email}, auth=False)
        return int((envelope.data or {}).get("expiresIn") or 0)

    def me(self) -> User | None:
        envelope = self._client.get("/v1/users/me")
        return to_user(envelope.data)


def to_user(data: Optional[Mapping[str, Any]]) -> User | None:
    return User(data) if data else None