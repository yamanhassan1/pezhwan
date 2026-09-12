package pezhwan

import (
	"context"
	"net/url"
)

// AuthorizationService manages RBAC/ABAC operations via the identity server.
type AuthorizationService struct {
	client *Client
}

// AssignRole assigns a named role to a user within a tenant+application scope.
func (s *AuthorizationService) AssignRole(ctx context.Context, userID, roleName string, opts ...AuthorizationOption) error {
	body := map[string]any{"userId": userID, "roleName": roleName}
	for _, o := range opts {
		o(body)
	}
	_, err := s.client.post(ctx, "/v1/admin/roles/assign", body)
	return err
}

// RemoveRole removes a named role from a user within a tenant+application scope.
func (s *AuthorizationService) RemoveRole(ctx context.Context, userID, roleName string, opts ...AuthorizationOption) error {
	body := map[string]any{"userId": userID, "roleName": roleName}
	for _, o := range opts {
		o(body)
	}
	_, err := s.client.post(ctx, "/v1/admin/roles/remove", body)
	return err
}

// GetUserRoles returns the roles assigned to a user.
func (s *AuthorizationService) GetUserRoles(ctx context.Context, userID string, opts ...AuthorizationOption) ([]map[string]any, error) {
	data, err := s.client.get(ctx, "/v1/admin/users/"+userID+"/roles"+queryFor(opts))
	if err != nil {
		return nil, err
	}
	return stringifyList(data, "roles"), nil
}

// GetUserPermissions returns the resolved permission names for a user.
func (s *AuthorizationService) GetUserPermissions(ctx context.Context, userID string, opts ...AuthorizationOption) ([]string, error) {
	data, err := s.client.get(ctx, "/v1/admin/users/"+userID+"/permissions"+queryFor(opts))
	if err != nil {
		return nil, err
	}
	perms, _ := data["permissions"].([]any)
	out := make([]string, 0, len(perms))
	for _, p := range perms {
		if s, ok := p.(string); ok {
			out = append(out, s)
		}
	}
	return out, nil
}

// Can checks if a user holds a given permission (RBAC + optional ABAC).
func (s *AuthorizationService) Can(ctx context.Context, userID, permission string, opts ...AuthorizationOption) (bool, error) {
	body := map[string]any{"userId": userID, "permission": permission}
	for _, o := range opts {
		o(body)
	}
	data, err := s.client.post(ctx, "/v1/admin/authorization/can", body)
	if err != nil {
		return false, err
	}
	allowed, _ := data["allowed"].(bool)
	return allowed, nil
}

// AuthorizationOption mutates an authorization request body or query.
type AuthorizationOption func(map[string]any)

// WithAuthzTenantID sets the tenant scope.
func WithAuthzTenantID(tenantID string) AuthorizationOption {
	return func(b map[string]any) { b["tenantId"] = tenantID }
}

// WithAuthzApplicationID sets the application scope.
func WithAuthzApplicationID(appID string) AuthorizationOption {
	return func(b map[string]any) { b["applicationId"] = appID }
}

// WithAuthzResource sets the target resource and optional resource ID for ABAC checks.
func WithAuthzResource(resource string, resourceID string) AuthorizationOption {
	return func(b map[string]any) {
		b["resource"] = resource
		b["resourceId"] = resourceID
	}
}

// WithAuthzAction sets the target action for ABAC checks.
func WithAuthzAction(action string) AuthorizationOption {
	return func(b map[string]any) { b["action"] = action }
}

// WithAuthzAttributes sets the attribute map for ABAC checks.
func WithAuthzAttributes(attrs map[string]any) AuthorizationOption {
	return func(b map[string]any) { b["attributes"] = attrs }
}

// queryFor turns request-scoping options into a deterministic query string.
func queryFor(opts []AuthorizationOption) string {
	params := map[string]any{}
	for _, o := range opts {
		o(params)
	}
	values := url.Values{}
	for _, k := range []string{"tenantId", "applicationId"} {
		if v, ok := params[k].(string); ok && v != "" {
			values.Set(k, v)
		}
	}
	if len(values) == 0 {
		return ""
	}
	return "?" + values.Encode()
}

func stringifyList(data map[string]any, key string) []map[string]any {
	raw, _ := data[key].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}