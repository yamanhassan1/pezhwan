package pezhwan

// User mirrors the identity server's user resource.
type User struct {
	ID            string   `json:"_id"`
	Email         string   `json:"email"`
	Phone         string   `json:"phone"`
	EmailVerified bool     `json:"emailVerified"`
	IsActive      bool     `json:"isActive"`
	Roles         []string `json:"roles"`
	TenantID      string   `json:"tenantId,omitempty"`
}

// LoginTokens is the wire result of register/login/refresh.
type LoginTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
	User         *User  `json:"user,omitempty"`
}

// MfaChallenge is returned by login when step-up is required.
type MfaChallenge struct {
	MfaRequired bool     `json:"mfaRequired"`
	UserID      string   `json:"userId"`
	Methods     []string `json:"methods"`
	Challenge   string   `json:"challenge,omitempty"`
}

// Session mirrors a /v1/sessions entry.
type Session struct {
	ID           string `json:"_id"`
	Device       string `json:"device"`
	UserAgent    string `json:"userAgent"`
	IP           string `json:"ip"`
	LastActiveAt string `json:"lastActiveAt"`
}

// MfaSetup is returned by POST /v1/mfa/setup.
type MfaSetup struct {
	Secret string `json:"secret"`
	QRCode string `json:"qrCode"`
}

// envelope is the wire wrapper: {"success":bool,"data":...,"error":...}.
type envelope struct {
	Success bool           `json:"success"`
	Data    map[string]any `json:"data"`
	Error   *Error         `json:"error"`
}