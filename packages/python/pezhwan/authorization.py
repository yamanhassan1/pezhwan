"""Authorization operations: RBAC roles, permissions, and ABAC can-checks."""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

from .client import PezhwanClient
from .errors import PezhwanApiError
from .models import Envelope


class Authorization:
    """Server-side RBAC/ABAC operations exposed by the identity server."""

    def __init__(self, client: PezhwanClient) -> None:
        self._client = client

    def assign_role(
        self,
        user_id: str,
        role_name: str,
        tenant_id: Optional[str] = None,
        application_id: Optional[str] = None,
    ) -> None:
        """Assign a role to a user within a tenant+application scope."""
        self._client.post(
            "/v1/admin/roles/assign",
            {
                "userId": user_id,
                "roleName": role_name,
                **({"tenantId": tenant_id} if tenant_id else {}),
                **({"applicationId": application_id} if application_id else {}),
            },
        )

    def remove_role(
        self,
        user_id: str,
        role_name: str,
        tenant_id: Optional[str] = None,
        application_id: Optional[str] = None,
    ) -> None:
        """Remove a role from a user within a tenant+application scope."""
        self._client.post(
            "/v1/admin/roles/remove",
            {
                "userId": user_id,
                "roleName": role_name,
                **({"tenantId": tenant_id} if tenant_id else {}),
                **({"applicationId": application_id} if application_id else {}),
            },
        )

    def get_user_roles(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
        application_id: Optional[str] = None,
    ) -> list[Mapping[str, Any]]:
        """Return the roles assigned to a user."""
        params = []
        if tenant_id:
            params.append(f"tenantId={tenant_id}")
        if application_id:
            params.append(f"applicationId={application_id}")
        suffix = f"?{'&'.join(params)}" if params else ""
        envelope = self._client.get(f"/v1/admin/users/{user_id}/roles{suffix}")
        return envelope.data or [] if hasattr(envelope, 'data') else []

    def get_user_permissions(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
        application_id: Optional[str] = None,
    ) -> list[str]:
        """Return the resolved permission names for a user."""
        params = []
        if tenant_id:
            params.append(f"tenantId={tenant_id}")
        if application_id:
            params.append(f"applicationId={application_id}")
        suffix = f"?{'&'.join(params)}" if params else ""
        envelope = self._client.get(f"/v1/admin/users/{user_id}/permissions{suffix}")
        data = envelope.data or [] if hasattr(envelope, 'data') else []
        return [str(p) for p in data]

    def can(
        self,
        user_id: str,
        permission: str,
        *,
        tenant_id: Optional[str] = None,
        application_id: Optional[str] = None,
        resource: Optional[str] = None,
        action: Optional[str] = None,
        resource_id: Optional[str] = None,
        attributes: Optional[Mapping[str, Any]] = None,
    ) -> bool:
        """Check if a user holds a given permission (RBAC + optional ABAC)."""
        body: dict[str, Any] = {
            "userId": user_id,
            "permission": permission,
        }
        if tenant_id:
            body["tenantId"] = tenant_id
        if application_id:
            body["applicationId"] = application_id
        if resource:
            body["resource"] = resource
        if action:
            body["action"] = action
        if resource_id:
            body["resourceId"] = resource_id
        if attributes:
            body["attributes"] = attributes
        envelope = self._client.post("/v1/admin/authorization/can", body)
        return bool((envelope.data or {}).get("allowed"))
