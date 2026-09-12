"""Tenant management: CRUD operations for multi-tenant identities."""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .client import PezhwanClient
from .errors import PezhwanApiError
from .models import Envelope


class Tenant:
    """Server-managed tenant resource."""

    def __init__(self, data: Mapping[str, Any]) -> None:
        self.id: str = str(data.get("id") or data.get("_id") or "")
        self.name: str = str(data.get("name") or "")
        self.slug: str = str(data.get("slug") or "")
        self.plan: str = str(data.get("plan") or "free")
        self.active: bool = bool(data.get("active", True))
        self.raw: Mapping[str, Any] = data


class TenantService:
    """Tenant lifecycle management via the identity server admin surface."""

    def __init__(self, client: PezhwanClient) -> None:
        self._client = client

    def create(
        self,
        name: str,
        slug: str,
        *,
        plan: str = "free",
        config: Optional[Mapping[str, Any]] = None,
    ) -> Tenant:
        """Create a new tenant."""
        body: dict[str, Any] = {"name": name, "slug": slug, "plan": plan}
        if config:
            body["config"] = config
        envelope = self._client.post("/v1/admin/tenants", body)
        return Tenant(envelope.data or {})

    def get(self, tenant_id: str) -> Tenant:
        """Fetch a single tenant by ID or slug."""
        envelope = self._client.get(f"/v1/admin/tenants/{tenant_id}")
        return Tenant(envelope.data or {})

    def list(self) -> list[Tenant]:
        """Return all tenants visible to the caller."""
        envelope = self._client.get("/v1/admin/tenants")
        items = envelope.data or []
        if isinstance(items, dict):
            items = items.get("tenants", [])
        return [Tenant(t) for t in items]

    def update(
        self,
        tenant_id: str,
        *,
        name: Optional[str] = None,
        plan: Optional[str] = None,
        active: Optional[bool] = None,
        config: Optional[Mapping[str, Any]] = None,
    ) -> Tenant:
        """Partially update a tenant."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if plan is not None:
            body["plan"] = plan
        if active is not None:
            body["active"] = active
        if config is not None:
            body["config"] = config
        envelope = self._client.post(f"/v1/admin/tenants/{tenant_id}", body)
        return Tenant(envelope.data or {})
