package pezhwan

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a minimal HTTP client for the PEZHWAN identity server.
type Client struct {
	BaseURL     string
	AccessToken string
	TenantID    string
	HTTP        *http.Client

	Auth      *Auth
	Sessions  *SessionService
	MFA       *Mfa
	Authz     *AuthorizationService
	Tenants   *TenantService
}

// NewClient constructs a client targeting baseURL.
func NewClient(baseURL string, opts ...Option) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	c := &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
	for _, opt := range opts {
		opt(c)
	}
	c.Auth = &Auth{client: c}
	c.Sessions = &SessionService{client: c}
	c.MFA = &Mfa{client: c}
	c.Authz = &AuthorizationService{client: c}
	c.Tenants = &TenantService{client: c}
	return c
}

// Option mutates a Client during construction.
type Option func(*Client)

// WithAccessToken sets the initial bearer token.
func WithAccessToken(token string) Option {
	return func(c *Client) { c.AccessToken = token }
}

// WithTenantID sets the X-Tenant-Id request header.
func WithTenantID(tenantID string) Option {
	return func(c *Client) { c.TenantID = tenantID }
}

// WithHTTP swaps in a custom *http.Client.
func WithHTTP(h *http.Client) Option {
	return func(c *Client) { c.HTTP = h }
}

// SetToken replaces the bearer token at runtime.
func (c *Client) SetToken(token string) {
	c.AccessToken = token
}

// do sends a JSON request and decodes the envelope, raising an *Error on
// non-2xx responses.
func (c *Client) do(ctx context.Context, method, path string, body any) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("pezhwan: marshal request: %w", err)
		}
		reader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "pezhwan-go/0.1.0")
	if c.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.AccessToken)
	}
	if c.TenantID != "" {
		req.Header.Set("X-Tenant-Id", c.TenantID)
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("pezhwan: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("pezhwan: read response: %w", err)
	}

	var wrapped envelope
	if err := json.Unmarshal(raw, &wrapped); err != nil {
		return nil, fmt.Errorf("pezhwan: decode response %d: %w", res.StatusCode, err)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		errMsg := wrapped.Error.Message
		if errMsg == "" {
			errMsg = http.StatusText(res.StatusCode)
		}
		return nil, NewError(res.StatusCode, map[string]any{"message": errMsg, "code": wrapped.Error.Code})
	}
	return wrapped.Data, nil
}

// get is a shorthand for GET requests.
func (c *Client) get(ctx context.Context, path string) (map[string]any, error) {
	return c.do(ctx, http.MethodGet, path, nil)
}

// post is a shorthand for POST requests.
func (c *Client) post(ctx context.Context, path string, body any) (map[string]any, error) {
	return c.do(ctx, http.MethodPost, path, body)
}

// delete is a shorthand for DELETE requests.
func (c *Client) delete(ctx context.Context, path string) error {
	_, err := c.do(ctx, http.MethodDelete, path, nil)
	return err
}

// Health probes the public health endpoint.
func (c *Client) Health(ctx context.Context) (map[string]any, error) {
	return c.get(ctx, "/v1/admin/health")
}

// Ping proves the server is reachable.
func (c *Client) Ping(ctx context.Context) (map[string]any, error) {
	return c.get(ctx, "/v1/services/ping")
}

// JoinPath appends query parameters to a path (helper for callers).
func JoinPath(path string, query url.Values) string {
	if len(query) == 0 {
		return path
	}
	return path + "?" + query.Encode()
}