package pezhwan

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// resourceUser manages a Pezhwan application user via the admin API:
//
//	POST   /v1/admin/users        create (apps/identity-server/src/admin.ts)
//	GET    /v1/admin/users/:id    read
//	PATCH  /v1/admin/users/:id    update (email/phone/is_active/roles/metadata)
//	DELETE /v1/admin/users/:id    soft-delete (deactivates, revokes sessions)
//
// The tenant and application the user belongs to come from the admin token's
// own realm; tenant_id is captured for planning convenience only.
func resourceUser() *schema.Resource {
	return &schema.Resource{
		CreateContext: resourceUserCreate,
		ReadContext:   resourceUserRead,
		UpdateContext: resourceUserUpdate,
		DeleteContext: resourceUserDelete,

		Schema: map[string]*schema.Schema{
			"tenant_id": {
				Type:        schema.TypeString,
				Optional:    true,
				ForceNew:    true,
				Description: "Tenant the user belongs to. Informational: the admin token's realm is authoritative.",
			},
			"email": {
				Type:        schema.TypeString,
				Optional:    true,
				Description: "Primary email (one of email or phone is required).",
			},
			"phone": {
				Type:        schema.TypeString,
				Optional:    true,
				Description: "Phone number in E.164 form.",
			},
			"password": {
				Type:        schema.TypeString,
				Optional:    true,
				Sensitive:   true,
				ForceNew:    true,
				Description: "Initial password. Changing forces recreation (password changes go through /v1/auth/password flows).",
			},
			"roles": {
				Type:        schema.TypeList,
				Optional:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Role names granted to the user.",
			},
			"is_active": {
				Type:        schema.TypeBool,
				Optional:    true,
				Default:     true,
				Description: "Whether the user account is enabled.",
			},
			"metadata": {
				Type:        schema.TypeMap,
				Optional:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Free-form metadata stored on the user record.",
			},
		},
	}
}

type userPayload struct {
	ID            string   `json:"id"`
	TenantID      string   `json:"tenantId"`
	Email         string   `json:"email"`
	Phone         string   `json:"phone"`
	EmailVerified bool     `json:"emailVerified"`
	PhoneVerified bool     `json:"phoneVerified"`
	IsActive      bool     `json:"isActive"`
	MFAEnabled    bool     `json:"mfaEnabled"`
	Roles         []string `json:"roles"`
}

type userEnvelope struct {
	User *userPayload `json:"user"`
}

func resourceUserCreate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{
		"email":      d.Get("email").(string),
		"phone":      d.Get("phone").(string),
		"password":   d.Get("password").(string),
		"roles":      stringSlice(d.Get("roles").([]interface{})),
		"isActive":   d.Get("is_active").(bool),
		"metadata":   d.Get("metadata").(map[string]interface{}),
	}

	var env userEnvelope
	if err := client.Do("POST", "/v1/admin/users", body, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.User == nil || env.User.ID == "" {
		return diag.Errorf("pezhwan: create user returned no id")
	}

	d.SetId(env.User.ID)
	return resourceUserRead(ctx, d, meta)
}

func resourceUserRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env userEnvelope
	path := fmt.Sprintf("/v1/admin/users/%s", d.Id())
	if err := client.Do("GET", path, nil, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.User == nil {
		return diag.Errorf("pezhwan: read user %s returned no payload", d.Id())
	}

	u := env.User
	d.SetId(u.ID)
	d.Set("tenant_id", u.TenantID)
	d.Set("email", u.Email)
	d.Set("phone", u.Phone)
	d.Set("is_active", u.IsActive)
	d.Set("roles", u.Roles)

	return nil
}

func resourceUserUpdate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{}
	if d.HasChange("email") {
		if v, ok := d.Get("email").(string); ok {
			body["email"] = v
		}
	}
	if d.HasChange("phone") {
		if v, ok := d.Get("phone").(string); ok {
			body["phone"] = v
		}
	}
	if d.HasChange("is_active") {
		body["isActive"] = d.Get("is_active").(bool)
	}
	if d.HasChange("roles") {
		body["roles"] = stringSlice(d.Get("roles").([]interface{}))
	}
	if d.HasChange("metadata") {
		body["metadata"] = d.Get("metadata").(map[string]interface{})
	}

	path := fmt.Sprintf("/v1/admin/users/%s", d.Id())
	if err := client.Do("PATCH", path, body, nil); err != nil {
		return diag.FromErr(err)
	}

	return resourceUserRead(ctx, d, meta)
}

func resourceUserDelete(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	// The admin API soft-deletes: it deactivates the account and revokes all
	// active sessions (admin.ts: DELETE /v1/admin/users/:id).
	path := fmt.Sprintf("/v1/admin/users/%s", d.Id())
	if err := client.Do("DELETE", path, nil, nil); err != nil {
		return diag.FromErr(err)
	}

	d.SetId("")
	return nil
}