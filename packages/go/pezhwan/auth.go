package pezhwan

import "context"

// Auth implements the /v1/auth* and /v1/verify* endpoints.
type Auth struct {
	client *Client
}

// RegisterOptions narrows the register request body.
type RegisterOptions struct {
	Email    string
	Phone    string
	Password string
	Metadata map[string]any
}

func (o RegisterOptions) body() map[string]any {
	b := map[string]any{"email": o.Email, "password": o.Password}
	if o.Phone != "" {
		b["phone"] = o.Phone
	}
	if len(o.Metadata) > 0 {
		b["metadata"] = o.Metadata
	}
	return b
}

// RegisterOptionsWithEmail keeps the phone optional.
func RegisterOptionsWithEmail(email, password string) RegisterOptions {
	return RegisterOptions{Email: email, Password: password}
}

// Register creates a new user and opens a session.
func (a *Auth) Register(ctx context.Context, opts RegisterOptions) (LoginTokens, error) {
	data, err := a.client.post(ctx, "/v1/auth/register", opts.body())
	if err != nil {
		return LoginTokens{}, err
	}
	return tokensFrom(data), nil
}

// Login authenticates with a password (email or phone).
func (a *Auth) Login(ctx context.Context, password, email, phone string) (tokens LoginTokens, challenge *MfaChallenge, err error) {
	body := map[string]string{"password": password}
	if email != "" {
		body["email"] = email
	}
	if phone != "" {
		body["phone"] = phone
	}
	data, err := a.client.post(ctx, "/v1/auth/login", body)
	if err != nil {
		return tokens, nil, err
	}
	if mfa, ok := data["mfaRequired"].(bool); ok && mfa {
		uid, _ := data["userId"].(string)
		return tokens, &MfaChallenge{MfaRequired: true, UserID: uid, Methods: stringList(data["methods"])}, nil
	}
	if data != nil {
		if tok, ok := data["accessToken"].(string); ok && tok != "" {
			a.client.AccessToken = tok
		}
	}
	return tokensFrom(data), nil, nil
}

// Logout revokes the current session.
func (a *Auth) Logout(ctx context.Context) error {
	_, err := a.client.post(ctx, "/v1/auth/logout", map[string]any{})
	return err
}

// Refresh rotates a refresh token.
func (a *Auth) Refresh(ctx context.Context, refreshToken string) (LoginTokens, error) {
	data, err := a.client.post(ctx, "/v1/auth/refresh", map[string]any{"refreshToken": refreshToken})
	if err != nil {
		return LoginTokens{}, err
	}
	if data != nil {
		if tok, ok := data["accessToken"].(string); ok && tok != "" {
			a.client.AccessToken = tok
		}
	}
	return tokensFrom(data), nil
}

// OtpSend requests an OTP to email or phone.
func (a *Auth) OtpSend(ctx context.Context, target, purpose string) error {
	_, err := a.client.post(ctx, "/v1/auth/otp/send", map[string]string{"target": target, "purpose": purpose})
	return err
}

// OtpVerify checks an OTP without logging in.
func (a *Auth) OtpVerify(ctx context.Context, target, code, purpose string) (bool, error) {
	data, err := a.client.post(ctx, "/v1/auth/otp/verify", map[string]string{
		"target": target, "code": code, "purpose": purpose,
	})
	if err != nil {
		return false, err
	}
	ok, _ := data["verified"].(bool)
	return ok, nil
}

// OtpLogin exchanges an OTP for a session.
func (a *Auth) OtpLogin(ctx context.Context, target, code, purpose string) (tokens LoginTokens, challenge *MfaChallenge, err error) {
	data, err := a.client.post(ctx, "/v1/auth/otp/login", map[string]string{
		"target": target, "code": code, "purpose": purpose,
	})
	if err != nil {
		return tokens, nil, err
	}
	if data != nil {
		if tok, ok := data["accessToken"].(string); ok && tok != "" {
			a.client.AccessToken = tok
		}
	}
	return tokensFrom(data), nil, nil
}

// Forgot issues a password-reset verification token; returns expiry seconds.
func (a *Auth) Forgot(ctx context.Context, email, redirectURI string) (int, error) {
	body := map[string]string{"email": email}
	if redirectURI != "" {
		body["redirectUri"] = redirectURI
	}
	data, err := a.client.post(ctx, "/v1/auth/password/forgot", body)
	if err != nil {
		return 0, err
	}
	secs, _ := data["expiresIn"].(float64)
	return int(secs), nil
}

// Reset completes a password reset with a verification token.
func (a *Auth) Reset(ctx context.Context, token, newPassword string) (LoginTokens, error) {
	data, err := a.client.post(ctx, "/v1/verify/password/reset/confirm", map[string]string{
		"token": token, "newPassword": newPassword,
	})
	if err != nil {
		return LoginTokens{}, err
	}
	return tokensFrom(data), nil
}

// EmailVerify requests a verification email.
func (a *Auth) EmailVerify(ctx context.Context, email string) error {
	_, err := a.client.post(ctx, "/v1/auth/email/verify", map[string]string{"email": email})
	return err
}

// Me returns the authenticated user profile.
func (a *Auth) Me(ctx context.Context) (User, error) {
	data, err := a.client.get(ctx, "/v1/users/me")
	if err != nil {
		return User{}, err
	}
	return userFrom(data), nil
}

func tokensFrom(data map[string]any) LoginTokens {
	if data == nil {
		return LoginTokens{}
	}
	tokens := LoginTokens{
		AccessToken:  str(data["accessToken"]),
		RefreshToken: str(data["refreshToken"]),
		ExpiresIn:    int(num(data["expiresIn"])),
	}
	if raw, ok := data["user"].(map[string]any); ok {
		tokens.User = ptr(userFrom(raw))
	}
	return tokens
}

func userFrom(data map[string]any) User {
	if data == nil {
		return User{}
	}
	return User{
		ID:            str(data["_id"]),
		Email:         str(data["email"]),
		Phone:         str(data["phone"]),
		EmailVerified: boolv(data["emailVerified"]),
		IsActive:      boolv(data["isActive"]),
		Roles:         stringList(data["roles"]),
		TenantID:      str(data["tenantId"]),
	}
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) float64 {
	f, _ := v.(float64)
	return f
}

func boolv(v any) bool {
	b, _ := v.(bool)
	return b
}

func stringList(v any) []string {
	if v == nil {
		return nil
	}
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func ptr[T any](v T) *T {
	return &v
}