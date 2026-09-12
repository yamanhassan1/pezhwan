"""HTTP client core for the PEZHWAN identity server."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping, Optional

from .errors import (
    PezhwanApiError,
    PezhwanAuthError,
    PezhwanConfigurationError,
    PezhwanRateLimitError,
)
from .models import Envelope


class PezhwanClient:
    """Synchronous HTTP client for the PEZHWAN REST surface.

    Args:
        base_url: Server origin, e.g. ``http://localhost:4011``.
        access_token: Optional initial bearer token.
        timeout: Request timeout in seconds.
        tenant_id: Optional ``X-Tenant-Id`` header value.
    """

    def __init__(
        self,
        base_url: str,
        access_token: Optional[str] = None,
        timeout: float = 30.0,
        tenant_id: Optional[str] = None,
    ) -> None:
        if not base_url:
            raise PezhwanConfigurationError("base_url is required")
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout
        self.tenant_id = tenant_id

        from .auth import Auth
        from .mfa import Mfa
        from .session import SessionService
        from .authorization import Authorization
        from .tenant import TenantService

        self.auth = Auth(self)
        self.mfa = Mfa(self)
        self.sessions = SessionService(self)
        self.authorization = Authorization(self)
        self.tenant = TenantService(self)

    # ------------------------------------------------------------------ core
    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Mapping[str, Any]] = None,
        *,
        auth: bool = True,
    ) -> Envelope:
        url = self.base_url + path
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "pezhwan-python/0.1.0",
        }
        if auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        if self.tenant_id:
            headers["X-Tenant-Id"] = self.tenant_id

        data = json.dumps(body or {}).encode("utf-8") if body is not None else None
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as http_error:
            payload = json.loads(http_error.read().decode("utf-8") or "{}")
            self._raise_for_status(http_error.code, payload)
        except urllib.error.URLError as error:
            raise PezhwanApiError(f"Request failed: {error.reason}", 0, "NETWORK_ERROR") from error
        return Envelope(payload)

    def _raise_for_status(self, status: int, payload: dict[str, Any]) -> None:
        error = payload.get("error") or {}
        message = error.get("message") or f"HTTP {status}"
        code = error.get("code")
        if status == 429:
            retry_after = None
            try:
                retry_after = int(error.get("retryAfterSeconds") or error.get("retryAfter", 0))
            except (TypeError, ValueError):
                retry_after = None
            raise PezhwanRateLimitError(message, retry_after)
        if status == 401:
            raise PezhwanAuthError(message, status, code)
        if 400 <= status <= 599:
            raise PezhwanApiError(message, status, code)

    def get(self, path: str, *, auth: bool = True) -> Envelope:
        return self._request("GET", path, auth=auth)

    def post(self, path: str, body: Mapping[str, Any], *, auth: bool = True) -> Envelope:
        return self._request("POST", path, body, auth=auth)

    def delete(self, path: str, *, auth: bool = True) -> Envelope:
        return self._request("DELETE", path, auth=auth)

    # ----------------------------------------------------------------- token
    @property
    def token(self) -> Optional[str]:
        return self.access_token

    @token.setter
    def token(self, value: Optional[str]) -> None:
        self.access_token = value

    def bearer_token(self, token: str) -> "PezhwanClient":
        self.access_token = token
        return self