package pezhwan

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// dataSourceTenant reads an existing Pezhwan tenant by id or slug. The admin
// API resolves either (GET /v1/admin/tenants/:id accepts both _id and slug —
// see tenantLookup in apps/identity-server/src/admin.ts).
func dataSourceTenant() *schema.Resource {
	return &schema.Resource{
		ReadContext: dataSourceTenantRead,

		Schema: map[string]*schema.Schema{
			"id": {
				Type:          schema.TypeString,
				Optional:      true,
				Computed:      true,
				Description:   "Tenant id. One of id or slug is required.",
				ConflictsWith: []string{"slug"},
			},
			"slug": {
				Type:          schema.TypeString,
				Optional:      true,
				Computed:      true,
				Description:   "Tenant slug. One of id or slug is required.",
				ConflictsWith: []string{"id"},
			},
			"name": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "Display name of the tenant.",
			},
			"is_active": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Whether the tenant is active.",
			},
			"plan": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "Billing plan.",
			},
			"domain": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "Tenant domain read from config.settings.domain.",
			},
			"settings": {
				Type:        schema.TypeMap,
				Computed:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Tenant settings (config.settings).",
			},
		},
	}
}

func setTenantDataSourceState(d *schema.ResourceData, t *tenantPayload) {
	if t == nil {
		return
	}
	d.SetId(t.ID)
	d.Set("id", t.ID)
	d.Set("slug", t.Slug)
	d.Set("name", t.Name)
	d.Set("is_active", t.IsActive)
	d.Set("plan", t.Plan)

	settings := tenantSettings(t)
	domain := settings["domain"]
	delete(settings, "domain")
	d.Set("settings", settings)
	d.Set("domain", domain)
}

func dataSourceTenantRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var key string
	if id, ok := d.Get("id").(string); ok && id != "" {
		key = id
	} else if slug, ok := d.Get("slug").(string); ok && slug != "" {
		key = slug
	}
	if key == "" {
		return diag.Errorf("pezhwan: exactly one of id or slug must be set")
	}

	var env tenantEnvelope
	if err := client.Do("GET", fmt.Sprintf("/v1/admin/tenants/%s", key), nil, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Tenant == nil {
		return diag.Errorf("pezhwan: tenant %s not found", key)
	}

	setTenantDataSourceState(d, env.Tenant)
	return nil
}