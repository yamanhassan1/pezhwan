package pezhwan

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// resourceRole manages a Pezhwan role via the admin API:
//
//	POST   /v1/admin/roles             create (admin.ts)
//	GET    /v1/admin/roles             read (list, matched by id)
//	PATCH  /v1/admin/roles/:id         update (description, permissions only)
//	DELETE /v1/admin/roles/:id         delete (system roles are protected)
//
// The API does not allow renaming a role, so name is ForceNew. Roles belong to
// the caller's tenant/application; scope is captured for planning only.
func resourceRole() *schema.Resource {
	return &schema.Resource{
		CreateContext: resourceRoleCreate,
		ReadContext:   resourceRoleRead,
		UpdateContext: resourceRoleUpdate,
		DeleteContext: resourceRoleDelete,

		Schema: map[string]*schema.Schema{
			"name": {
				Type:        schema.TypeString,
				Required:    true,
				ForceNew:    true,
				Description: "Role name (stored UPPERCASE by the server). Cannot be renamed.",
			},
			"description": {
				Type:        schema.TypeString,
				Optional:    true,
				Default:     "",
				Description: "Human-readable description of the role.",
			},
			"permissions": {
				Type:        schema.TypeList,
				Optional:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Permission ids granted by the role.",
			},
			"scope": {
				Type:        schema.TypeString,
				Optional:    true,
				ForceNew:    true,
				Description: "Scoping context (tenant/application). Informational on the wire.",
			},
		},
	}
}

type rolePayload struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	PermissionIds []string `json:"permissionIds"`
	IsSystem      bool     `json:"isSystem"`
}

type roleEnvelope struct {
	Role *rolePayload `json:"role"`
}

type roleListEnvelope struct {
	Roles []*rolePayload `json:"roles"`
}

func setRoleState(d *schema.ResourceData, r *rolePayload) {
	d.SetId(r.ID)
	d.Set("name", r.Name)
	d.Set("description", r.Description)
	d.Set("permissions", r.PermissionIds)
}

func resourceRoleCreate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{
		"name":        d.Get("name").(string),
		"description": d.Get("description").(string),
		"permissions": stringSlice(d.Get("permissions").([]interface{})),
	}

	var env roleEnvelope
	if err := client.Do("POST", "/v1/admin/roles", body, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Role == nil || env.Role.ID == "" {
		return diag.Errorf("pezhwan: create role returned no id")
	}

	setRoleState(d, env.Role)
	return nil
}

func resourceRoleRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env roleListEnvelope
	if err := client.Do("GET", "/v1/admin/roles", nil, &env); err != nil {
		return diag.FromErr(err)
	}
	for _, r := range env.Roles {
		if r != nil && r.ID == d.Id() {
			setRoleState(d, r)
			return nil
		}
	}

	return diag.Errorf("pezhwan: role %s not found", d.Id())
}

func resourceRoleUpdate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{}
	if d.HasChange("description") {
		body["description"] = d.Get("description").(string)
	}
	if d.HasChange("permissions") {
		body["permissions"] = stringSlice(d.Get("permissions").([]interface{}))
	}

	path := fmt.Sprintf("/v1/admin/roles/%s", d.Id())
	if err := client.Do("PATCH", path, body, nil); err != nil {
		return diag.FromErr(err)
	}

	return resourceRoleRead(ctx, d, meta)
}

func resourceRoleDelete(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	// The API rejects deletion of system roles (SYSTEM_ROLE error).
	path := fmt.Sprintf("/v1/admin/roles/%s", d.Id())
	if err := client.Do("DELETE", path, nil, nil); err != nil {
		return diag.FromErr(err)
	}

	d.SetId("")
	return nil
}