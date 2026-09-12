"""PEZHWAN — Python SDK.

Universal Identity & Access Management client.

Usage:
    import pezhwan

import os

client = pezhwan.PezhwanClient(
    base_url="http://localhost:4011",
    tenant_id="000000000000000000000001",
    application_id="000000000000000000000002",
)
tokens, user = client.auth.register(email="demo@pezhwan.dev", password=os.environ["PEZHWAN_DEMO_PASSWORD"])
    me = client.auth.me()
    client.authorization.assign_role(user.id, "ADMIN")
    tenant = client.tenant.create(name="Acme", slug="acme")
"""

from .client import PezhwanClient
from .errors import PezhwanError, PezhwanApiError, PezhwanAuthError, PezhwanRateLimitError
from .models import LoginTokens, User, Session, MfaChallenge, Envelope
from .authorization import Authorization
from .tenant import Tenant, TenantService

__all__ = [
    "PezhwanClient",
    "PezhwanError",
    "PezhwanApiError",
    "PezhwanAuthError",
    "PezhwanRateLimitError",
    "LoginTokens",
    "User",
    "Session",
    "MfaChallenge",
    "Envelope",
    "Authorization",
    "Tenant",
    "TenantService",
]

__version__ = "0.1.0"