package pezhwan

import "context"

// Mfa implements the /v1/mfa* endpoints (TOTP + backup codes).
type Mfa struct {
	client *Client
}

// Setup starts TOTP enrollment and returns the secret + QR code.
func (m *Mfa) Setup(ctx context.Context) (MfaSetup, error) {
	data, err := m.client.post(ctx, "/v1/mfa/setup", map[string]any{})
	if err != nil {
		return MfaSetup{}, err
	}
	return MfaSetup{Secret: str(data["secret"]), QRCode: str(data["qrCode"])}, nil
}

// Enable activates MFA after verifying the first code.
func (m *Mfa) Enable(ctx context.Context, code string) error {
	_, err := m.client.post(ctx, "/v1/mfa/enable", map[string]string{"code": code})
	return err
}

// Verify performs a step-up verification of a current code.
func (m *Mfa) Verify(ctx context.Context, code string) (bool, error) {
	data, err := m.client.post(ctx, "/v1/mfa/verify", map[string]string{"code": code})
	if err != nil {
		return false, err
	}
	ok, _ := data["verified"].(bool)
	return ok, nil
}

// Disable turns MFA off (requires a valid current code).
func (m *Mfa) Disable(ctx context.Context, code string) error {
	_, err := m.client.post(ctx, "/v1/mfa/disable", map[string]string{"code": code})
	return err
}

// Login completes an MFA-challenged login and returns tokens.
func (m *Mfa) Login(ctx context.Context, userID, code string) (LoginTokens, error) {
	data, err := m.client.post(ctx, "/v1/mfa/login", map[string]string{"userId": userID, "code": code})
	if err != nil {
		return LoginTokens{}, err
	}
	if data != nil {
		if tok, ok := data["accessToken"].(string); ok && tok != "" {
			m.client.AccessToken = tok
		}
	}
	return tokensFrom(data), nil
}