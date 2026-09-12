package pezhwan

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// Provider returns the Pezhwan Terraform provider.
//
// The provider talks to the Pezhwan Identity Server REST API (see
// apps/identity-server/src/admin.ts). All /v1/admin/* routes require a bearer
// token belonging to an ADMIN user of the target tenant; the token is injected
// as the Authorization header on every request. api_key is accepted too and,
// when set, is sent as the x-api-key header (reserved for /v1/admin/api-keys
// workflows).
func Provider() *schema.Provider {
	return &schema.Provider{
		Schema: map[string]*schema.Schema{
			"base_url": {
				Type:        schema.TypeString,
				Optional:    true,
				DefaultFunc: schema.EnvDefaultFunc("PEZHWAN_BASE_URL", "http://localhost:4011"),
				Description: "Base URL of the Pezhwan Identity Server API.",
			},
			"token": {
				Type:        schema.TypeString,
				Optional:    true,
				Sensitive:   true,
				DefaultFunc: schema.EnvDefaultFunc("PEZHWAN_TOKEN", nil),
				Description: "Admin bearer access token for the /v1/admin surface. One of token or api_key is required.",
			},
			"api_key": {
				Type:        schema.TypeString,
				Optional:    true,
				Sensitive:   true,
				DefaultFunc: schema.EnvDefaultFunc("PEZHWAN_API_KEY", nil),
				Description: "Pezhwan API key sent as the x-api-key header. One of token or api_key is required.",
			},
		},

		DataSourcesMap: map[string]*schema.Resource{
			"pezhwan_user":   dataSourceUser(),
			"pezhwan_tenant": dataSourceTenant(),
		},

		ResourcesMap: map[string]*schema.Resource{
			"pezhwan_user":    resourceUser(),
			"pezhwan_tenant":  resourceTenant(),
			"pezhwan_role":    resourceRole(),
			"pezhwan_client":  resourceClient(),
			"pezhwan_webhook": resourceWebhook(),
		},

		ConfigureContextFunc: func(ctx context.Context, d *schema.ResourceData) (interface{}, diag.Diagnostics) {
			baseURL := strings.TrimRight(d.Get("base_url").(string), "/")
			if baseURL == "" {
				return nil, diag.Errorf("pezhwan: base_url must not be empty")
			}

			client := &APIClient{
				BaseURL: baseURL,
				Token:   d.Get("token").(string),
				APIKey:  d.Get("api_key").(string),
				HTTP:    &http.Client{},
			}
			if client.Token == "" && client.APIKey == "" {
				return nil, diag.Errorf("pezhwan: at least one of token or api_key must be configured (PEZHWAN_TOKEN / PEZHWAN_API_KEY)")
			}

			return client, nil
		},
	}
}

// APIClient is a thin HTTP wrapper around the Pezhwan admin API.
type APIClient struct {
	BaseURL string
	Token   string
	APIKey  string
	HTTP    *http.Client
}

// clientFromMeta unwraps the *APIClient stored on the resource meta.
func clientFromMeta(m interface{}) *APIClient {
	if c, ok := m.(*APIClient); ok {
		return c
	}
	return nil
}

// apiEnvelope matches the { success, data, error } envelope returned by the
// admin server (see apps/identity-server/src/admin.ts: ok/fail helpers).
type apiEnvelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Do performs an authenticated request against the Pezhwan admin API and
// decodes the { success, data } payload into out (when out is non-nil).
func (c *APIClient) Do(method, path string, body, out interface{}) error {
	if c == nil || c.HTTP == nil {
		return fmt.Errorf("pezhwan: api client is nil — provider not configured")
	}

	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("pezhwan: marshal request body: %w", err)
		}
		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, payload)
	if err != nil {
		return fmt.Errorf("pezhwan: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if c.APIKey != "" {
		req.Header.Set("x-api-key", c.APIKey)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("pezhwan: request %s %s failed: %w", method, path, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("pezhwan: read response body: %w", err)
	}

	var envelope apiEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return fmt.Errorf("pezhwan: decode response from %s %s: %w", method, path, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if envelope.Error != nil {
			return fmt.Errorf("pezhwan: %s %s: %s (%s)", method, path, envelope.Error.Message, envelope.Error.Code)
		}
		return fmt.Errorf("pezhwan: %s %s: unexpected status %d", method, path, resp.StatusCode)
	}

	if !envelope.Success {
		if envelope.Error != nil {
			return fmt.Errorf("pezhwan: %s %s: %s (%s)", method, path, envelope.Error.Message, envelope.Error.Code)
		}
		return fmt.Errorf("pezhwan: %s %s: server reported failure", method, path)
	}

	if out != nil && len(envelope.Data) > 0 {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return fmt.Errorf("pezhwan: decode data from %s %s: %w", method, path, err)
		}
	}

	return nil
}

// stringSlice coerces a schema list ([]interface{} or []string) to []string.
func stringSlice(v interface{}) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []interface{}:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return []string{}
	}
}

// flattenStringMap converts an arbitrary JSON object into a string map, JSON-
// encoding any non-string leaf values (safe for TypeMap of strings).
func flattenStringMap(v map[string]interface{}) map[string]string {
	out := make(map[string]string, len(v))
	for k, val := range v {
		if s, ok := val.(string); ok {
			out[k] = s
			continue
		}
		if b, err := json.Marshal(val); err == nil {
			out[k] = string(b)
		}
	}
	return out
}