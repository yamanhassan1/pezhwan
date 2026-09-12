"""Session listing and revocation."""

from __future__ import annotations

from typing import Optional

from .client import PezhwanClient
from .models import Envelope, Session


class SessionService:
    def __init__(self, client: PezhwanClient) -> None:
        self._client = client

    def list(self) -> list[Session]:
        envelope = self._client.get("/v1/sessions")
        return Session.from_list((envelope.data or {}).get("sessions"))

    def revoke(self, session_id: str) -> bool:
        self._client.delete(f"/v1/sessions/{session_id}/revoke")
        return True

    def revoke_all(self) -> bool:
        self._client.post("/v1/sessions/all/revoke", {})
        return True