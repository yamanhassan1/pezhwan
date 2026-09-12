package pezhwan

import "fmt"

// Error codes surfaced by the identity server envelope.
const (
	ErrCodeInvalidCredentials   = "INVALID_CREDENTIALS"
	ErrCodeMfaRequired          = "MFA_REQUIRED"
	ErrCodeRateLimited          = "RATE_LIMITED"
	ErrCodeValidation           = "VALIDATION_FAILED"
	ErrCodeTokenExpired         = "TOKEN_EXPIRED"
	ErrCodeFeatureNotEnabled    = "FEATURE_NOT_ENABLED"
	ErrCodeUnknown               = "UNKNOWN"
)

// Error wraps the envelope's error payload with the HTTP status.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("pezhwan: %s (%d %s)", e.Message, e.Status, e.Code)
	}
	return fmt.Sprintf("pezhwan: HTTP %d %s", e.Status, e.Code)
}

// NewError builds an *Error from a body map, defaulting the code.
func NewError(status int, body map[string]any) *Error {
	msg, _ := body["message"].(string)
	code, _ := body["code"].(string)
	if code == "" {
		code = codeForStatus(status)
	}
	return &Error{Status: status, Code: code, Message: msg}
}

func codeForStatus(status int) string {
	switch status {
	case 400:
		return ErrCodeValidation
	case 401:
		return ErrCodeInvalidCredentials
	case 429:
		return ErrCodeRateLimited
	default:
		return ErrCodeUnknown
	}
}

// IsRateLimit reports whether err is a rate-limit error.
func IsRateLimit(err error) bool {
	e, ok := err.(*Error)
	return ok && e.Status == 429
}

// WasAuth reports whether err was an authentication (401) error.
func WasAuth(err error) bool {
	e, ok := err.(*Error)
	return ok && e.Status == 401
}