package pezhwan

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// resourceTenant manages a Pezhwan tenant via the admin API:
//
//	POST   /v1/admin/tenants    create (admin.ts)
//	GET    /v1/admin/tenants/:id   read
//	PATCH  /v1/admin/tenants/:id   update (name/is_active/plan/config.settings)
//
// There is no tenant DELETE endpoint in the admin API, so destroy performs a
// soft deactivation (is_active = false).
//
// Tenant JSON does not carry a top-level "domain"; the resource stores it under
// config.settings.domain so it survives the server's sanitizeTenantPatch.
func resourceTenant() *schema.Resource {
	return &schema.Resource{
		CreateContext: resourceTenantCreate,
		ReadContext:   resourceTenantRead,
		UpdateContext: resourceTenantUpdate,
		DeleteContext: resourceTenantDelete,

		Schema: map[string]*schema.Schema{
			"name": {
				Type:        schema.TypeString,
				Required:    true,
				Description: "Display name of the tenant.",
			},
			"slug": {
				Type:        schema.TypeString,
				Optional:    true,
				ForceNew:    true,
				Computed:    true,
				Description: "URL-safe identifier; defaults to the slugified name. Cannot be changed.",
			},
			"domain": {
				Type:        schema.TypeString,
				Optional:    true,
				Description: "Public domain of the tenant. Persisted under config.settings.domain.",
			},
			"plan": {
				Type:        schema.TypeString,
				Optional:    true,
				Default:     "free",
				Description: "Billing plan (free/pro/enterprise...).",
			},
			"settings": {
				Type:        schema.TypeMap,
				Optional:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Tenant settings (stored in config.settings).",
			},
			"is_active": {
				Type:        schema.TypeBool,
				Optional:    true,
				Default:     true,
				Description: "Whether the tenant is active.",
			},
		},
	}
}

type tenantPayload struct {
	ID       string                 `json:"id"`
	Name     string                 `json:"name"`
	Slug     string                 `json:"slug"`
	IsActive bool                   `json:"isActive"`
	Plan     string                 `json:"plan"`
	Config   map[string]interface{} `json:"config"`
}

type tenantEnvelope struct {
	Tenant *tenantPayload `json:"tenant"`
}

func tenantSettings(t *tenantPayload) map[string]string {
	if t.Config == nil {
		return map[string]string{}
	}
	if settings, ok := t.Config["settings"].(map[string]interface{}); ok {
		return flattenStringMap(settings)
	}
	return map[string]string{}
}

func tenantDomain(t *tenantPayload) string {
	if settings := tenantSettings(t); settings != nil {
		return settings["domain"]
	}
	return ""
}

func tenantCreateBody(d *schema.ResourceData) map[string]interface{} {
	settings := d.Get("settings").(map[string]interface{})
	if domain, ok := d.Get("domain").(string); ok && domain != "" {
		if settings == nil {
			settings = map[string]interface{}{}
		}
		settings["domain"] = domain
	}

	body := map[string]interface{}{
		"name":     d.Get("name").(string),
		"isActive": d.Get("is_active").(bool),
	}
	if slug, ok := d.Get("slug").(string); ok && slug != "" {
		body["slug"] = slug
	}
	body["config"] = map[string]interface{}{
		"plan":     d.Get("plan").(string),
		"settings": settings,
	}
	return body
}

func resourceTenantCreate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env tenantEnvelope
	if err := client.Do("POST", "/v1/admin/tenants", tenantCreateBody(d), &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Tenant == nil || env.Tenant.ID == "" {
		return diag.Errorf("pezhwan: create tenant returned no id")
	}

	d.SetId(env.Tenant.ID)
	return resourceTenantRead(ctx, d, meta)
}

func resourceTenantRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env tenantEnvelope
	path := fmt.Sprintf("/v1/admin/tenants/%s", d.Id())
	if err := client.Do("GET", path, nil, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Tenant == nil {
		return diag.Errorf("pezhwan: read tenant %s returned no payload", d.Id())
	}

	t := env.Tenant
	d.SetId(t.ID)
	d.Set("name", t.Name)
	d.Set("slug", t.Slug)
	d.Set("is_active", t.IsActive)
	d.Set("plan", t.Plan)

	settings := tenantSettings(t)
	domain := settings["domain"]
	delete(settings, "domain")
	d.Set("settings", settings)
	d.Set("domain", domain)

	return nil
}

func resourceTenantUpdate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{}
	if d.HasChange("name") {
		body["name"] = d.Get("name").(string)
	}
	if d.HasChange("is_active") {
		body["isActive"] = d.Get("is_active").(bool)
	}

	newSettings := map[string]interface{}{}
	settingsChanged := d.HasChange("settings") || d.HasChange("domain")
	if settingsChanged {
		if settings, ok := d.Get("settings").(map[string]interface{}); ok {
			for k, v := range settings {
				newSettings[k] = v
			}
		}
		if domain, ok := d.Get("domain").(string); ok && domain != "" {
			newSettings["domain"] = domain
		}
		body["config"] = map[string]interface{}{
			"settings": newSettings,
		}
	}
	if d.HasChange("plan") {
		if existing, ok := body["config"].(map[string]interface{}); ok {
			existing["plan"] = d.Get("plan").(string)
		} else {
			body["config"] = map[string]interface{}{"plan": d.Get("plan").(string)}
		}
	}

	path := fmt.Sprintf("/v1/admin/tenants/%s", d.Id())
	if err := client.Do("PATCH", path, body, nil); err != nil {
		return diag.FromErr(err)
	}

	return resourceTenantRead(ctx, d, meta)
}

func resourceTenantDelete(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	// The admin API has no tenant DELETE endpoint; destroy deactivates.
	path := fmt.Sprintf("/v1/admin/tenants/%s", d.Id())
	if err := client.Do("PATCH", path, map[string]interface{}{"isActive": false}, nil); err != nil {
		return diag.FromErr(err)
	}

	d.SetId("")
	return nil
}