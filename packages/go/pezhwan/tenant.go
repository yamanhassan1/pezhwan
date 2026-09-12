package pezhwan

import "context"

// Tenant describes a managed tenant resource.
type Tenant struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Slug   string `json:"slug"`
	Plan   string `json:"plan"`
	Active bool   `json:"active"`
}

// TenantService manages tenant lifecycle via the identity server admin surface.
type TenantService struct {
	client *Client
}

// CreateTenant creates a new tenant.
func (s *TenantService) CreateTenant(ctx context.Context, name, slug string, opts ...TenantOption) (*Tenant, error) {
	body := map[string]any{"name": name, "slug": slug}
	for _, o := range opts {
		o(body)
	}
	data, err := s.client.post(ctx, "/v1/admin/tenants", body)
	if err != nil {
		return nil, err
	}
	return tenantFromMap(data), nil
}

// GetTenant fetches a tenant by ID or slug.
func (s *TenantService) GetTenant(ctx context.Context, id string) (*Tenant, error) {
	data, err := s.client.get(ctx, "/v1/admin/tenants/"+id)
	if err != nil {
		return nil, err
	}
	return tenantFromMap(data), nil
}

// ListTenants returns the tenants visible to the caller.
func (s *TenantService) ListTenants(ctx context.Context) ([]*Tenant, error) {
	data, err := s.client.get(ctx, "/v1/admin/tenants")
	if err != nil {
		return nil, err
	}
	items := stringifyList(data, "tenants")
	out := make([]*Tenant, 0, len(items))
	for _, m := range items {
		out = append(out, tenantFromMap(m))
	}
	return out, nil
}

// UpdateTenant partially updates a tenant.
func (s *TenantService) UpdateTenant(ctx context.Context, id string, opts ...TenantOption) (*Tenant, error) {
	body := map[string]any{}
	for _, o := range opts {
		o(body)
	}
	data, err := s.client.post(ctx, "/v1/admin/tenants/"+id, body)
	if err != nil {
		return nil, err
	}
	return tenantFromMap(data), nil
}

// TenantOption mutates a tenant request body.
type TenantOption func(map[string]any)

// WithTenantPlan sets the billing plan.
func WithTenantPlan(plan string) TenantOption {
	return func(b map[string]any) { b["plan"] = plan }
}

// WithTenantActive toggles tenant status.
func WithTenantActive(active bool) TenantOption {
	return func(b map[string]any) { b["active"] = active }
}

// WithTenantConfig sets the tenant configuration map.
func WithTenantConfig(config map[string]any) TenantOption {
	return func(b map[string]any) { b["config"] = config }
}

func tenantFromMap(m map[string]any) *Tenant {
	active, _ := m["active"].(bool)
	return &Tenant{
		ID:     stringValue(m["id"], m["_id"]),
		Name:   stringValue(m["name"]),
		Slug:   stringValue(m["slug"]),
		Plan:   stringValue(m["plan"]),
		Active: active,
	}
}

func stringValue(values ...any) string {
	for _, v := range values {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}