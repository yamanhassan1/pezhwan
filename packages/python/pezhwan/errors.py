"""PEZHWAN SDK exceptions.

All exceptions subclass :class:`PezhwanError` so callers can catch one type
for every SDK failure.
"""

from __future__ import annotations


class PezhwanError(Exception):
    """Base class for all SDK errors."""


class PezhwanConfigurationError(PezhwanError):
    """Raised when the client is constructed incorrectly."""


class PezhwanApiError(PezhwanError):
    """A non-2xx response from the identity server.

    Attributes:
        status: HTTP status code.
        code: Application error code from the envelope (``error.code``).
    """

    def __init__(self, message: str, status: int, code: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class PezhwanAuthError(PezhwanApiError):
    """401 responses — invalid, expired, disabled or locked credentials."""


class PezhwanRateLimitError(PezhwanApiError):
    """429 responses. Populated once the envelope carries one."""

    def __init__(self, message: str, retry_after_seconds: int | None = None) -> None:
        super().__init__(message, 429, "RATE_LIMITED")
        self.retry_after_seconds = retry_after_seconds


class PezhwanValidationError(PezhwanApiError):
    """400 responses — policy or schema violations."""