"""Multi-factor authentication (TOTP / backup codes)."""

from __future__ import annotations

from typing import Optional

from .client import PezhwanClient
from .models import Envelope, LoginTokens, MfaSetup, MfaChallenge


class Mfa:
    def __init__(self, client: PezhwanClient) -> None:
        self._client = client

    def setup(self) -> MfaSetup:
        envelope = self._client.post("/v1/mfa/setup", {})
        return MfaSetup(envelope.data or {})

    def enable(self, code: str) -> bool:
        envelope = self._client.post("/v1/mfa/enable", {"code": code})
        return bool((envelope.data or {}).get("enabled", envelope.success))

    def verify(self, code: str) -> bool:
        envelope = self._client.post("/v1/mfa/verify", {"code": code})
        return bool((envelope.data or {}).get("verified"))

    def disable(self, code: str) -> bool:
        envelope = self._client.post("/v1/mfa/disable", {"code": code})
        return envelope.success

    def login(self, user_id: str, code: str) -> tuple[LoginTokens, Optional[MfaChallenge]]:
        envelope = self._client.post("/v1/mfa/login", {"userId": user_id, "code": code}, auth=False)
        data = envelope.data or {}
        if data.get("mfaRequired"):
            return LoginTokens(), MfaChallenge(data)
        self._client.access_token = data.get("accessToken")
        return LoginTokens(data), None