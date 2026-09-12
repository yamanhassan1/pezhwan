package pezhwan

import (
	"context"
	"fmt"
	"strings"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// dataSourceUser reads an existing Pezhwan user by id or email.
//
//	GET /v1/admin/users/:id   (admin.ts) — by id
//	GET /v1/admin/users?search=  — by email (exact match on the search results)
//
// The server does not echo metadata on user reads, so this data source exposes
// only the fields the admin JSON mapper returns.
func dataSourceUser() *schema.Resource {
	return &schema.Resource{
		ReadContext: dataSourceUserRead,

		Schema: map[string]*schema.Schema{
			"id": {
				Type:          schema.TypeString,
				Optional:      true,
				Computed:      true,
				Description:   "User id. One of id or email is required.",
				ConflictsWith: []string{"email"},
			},
			"email": {
				Type:          schema.TypeString,
				Optional:      true,
				Computed:      true,
				Description:   "User email. One of id or email is required.",
				ConflictsWith: []string{"id"},
			},
			"tenant_id": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "Tenant the user belongs to.",
			},
			"phone": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "User phone number.",
			},
			"email_verified": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Whether the email is verified.",
			},
			"phone_verified": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Whether the phone is verified.",
			},
			"is_active": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Whether the account is active.",
			},
			"mfa_enabled": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Whether MFA is enabled on the account.",
			},
			"roles": {
				Type:        schema.TypeList,
				Computed:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Roles held by the user.",
			},
		},
	}
}

type userListEnvelope struct {
	Users []*userPayload `json:"users"`
}

func setUserDataSourceState(d *schema.ResourceData, u *userPayload) {
	if u == nil {
		return
	}
	d.SetId(u.ID)
	d.Set("id", u.ID)
	d.Set("tenant_id", u.TenantID)
	d.Set("email", u.Email)
	d.Set("phone", u.Phone)
	d.Set("email_verified", u.EmailVerified)
	d.Set("phone_verified", u.PhoneVerified)
	d.Set("is_active", u.IsActive)
	d.Set("mfa_enabled", u.MFAEnabled)
	d.Set("roles", u.Roles)
}

func dataSourceUserRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	if id, ok := d.Get("id").(string); ok && id != "" {
		var env userEnvelope
		if err := client.Do("GET", fmt.Sprintf("/v1/admin/users/%s", id), nil, &env); err != nil {
			return diag.FromErr(err)
		}
		if env.User == nil {
			return diag.Errorf("pezhwan: user %s not found", id)
		}
		setUserDataSourceState(d, env.User)
		return nil
	}

	email := strings.ToLower(d.Get("email").(string))
	if email == "" {
		return diag.Errorf("pezhwan: exactly one of id or email must be set")
	}

	var env userListEnvelope
	if err := client.Do("GET", "/v1/admin/users?search="+email, nil, &env); err != nil {
		return diag.FromErr(err)
	}
	for _, u := range env.Users {
		if u != nil && strings.EqualFold(u.Email, email) {
			setUserDataSourceState(d, u)
			return nil
		}
	}

	return diag.Errorf("pezhwan: no user found for email %s", email)
}