package pezhwan

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// resourceClient manages a Pezhwan OAuth client via the admin API:
//
//	POST   /v1/admin/clients                 create (admin.ts; secret returned once)
//	GET    /v1/admin/clients                 read (list, matched by clientId)
//	PATCH  /v1/admin/clients/:clientId       update (redirectUris, scopes only)
//	DELETE /v1/admin/clients/:clientId       disable (soft)
//
// Only redirect_uris and scopes are mutable server-side; name, grants,
// confidential and the client secret therefore force recreation.
func resourceClient() *schema.Resource {
	return &schema.Resource{
		CreateContext: resourceClientCreate,
		ReadContext:   resourceClientRead,
		UpdateContext: resourceClientUpdate,
		DeleteContext: resourceClientDelete,

		Schema: map[string]*schema.Schema{
			"client_id": {
				Type:        schema.TypeString,
				Computed:    true,
				Description: "OAuth client identifier issued by the server.",
			},
			"name": {
				Type:        schema.TypeString,
				Required:    true,
				ForceNew:    true,
				Description: "Human-readable client name.",
			},
			"redirect_uris": {
				Type:        schema.TypeList,
				Required:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Allowed redirect URIs.",
			},
			"grants": {
				Type:        schema.TypeList,
				Optional:    true,
				Computed:    true,
				ForceNew:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "OAuth grant types (defaults to authorization_code).",
			},
			"scopes": {
				Type:        schema.TypeList,
				Optional:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "OAuth scopes granted to the client.",
			},
			"confidential": {
				Type:        schema.TypeBool,
				Optional:    true,
				Default:     true,
				ForceNew:    true,
				Description: "Whether the client issues a secret and can use it to authenticate.",
			},
			"client_secret": {
				Type:        schema.TypeString,
				Optional:    true,
				Computed:    true,
				Sensitive:   true,
				ForceNew:    true,
				Description: "Client secret. Only returned once at creation; supply your own to pin it.",
			},
		},
	}
}

type clientPayload struct {
	ClientID       string   `json:"clientId"`
	TenantID       string   `json:"tenantId"`
	ApplicationID  string   `json:"applicationId"`
	Name           string   `json:"name"`
	RedirectUris   []string `json:"redirectUris"`
	Grants         []string `json:"grants"`
	Scopes         []string `json:"scopes"`
	IsActive       bool     `json:"isActive"`
	IsConfidential bool     `json:"isConfidential"`
}

type clientEnvelope struct {
	Client       *clientPayload `json:"client"`
	ClientSecret string         `json:"clientSecret"`
}

type clientListEnvelope struct {
	Clients []*clientPayload `json:"clients"`
}

func setClientState(d *schema.ResourceData, c *clientPayload) {
	d.SetId(c.ClientID)
	d.Set("client_id", c.ClientID)
	d.Set("name", c.Name)
	d.Set("redirect_uris", c.RedirectUris)
	d.Set("grants", c.Grants)
	d.Set("scopes", c.Scopes)
	d.Set("confidential", c.IsConfidential)
}

func resourceClientCreate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{
		"name":        d.Get("name").(string),
		"redirectUris": stringSlice(d.Get("redirect_uris").([]interface{})),
		"scopes":      stringSlice(d.Get("scopes").([]interface{})),
		"confidential": d.Get("confidential").(bool),
	}
	if grants := stringSlice(d.Get("grants").([]interface{})); len(grants) > 0 {
		body["grants"] = grants
	}

	var env clientEnvelope
	if err := client.Do("POST", "/v1/admin/clients", body, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Client == nil || env.Client.ClientID == "" {
		return diag.Errorf("pezhwan: create client returned no clientId")
	}

	setClientState(d, env.Client)
	// The secret is only surfaced once in the create response.
	d.Set("client_secret", env.ClientSecret)
	return nil
}

func resourceClientRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env clientListEnvelope
	if err := client.Do("GET", "/v1/admin/clients", nil, &env); err != nil {
		return diag.FromErr(err)
	}
	for _, c := range env.Clients {
		if c != nil && c.ClientID == d.Id() {
			setClientState(d, c)
			return nil
		}
	}

	return diag.Errorf("pezhwan: client %s not found", d.Id())
}

func resourceClientUpdate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{}
	if d.HasChange("redirect_uris") {
		body["redirectUris"] = stringSlice(d.Get("redirect_uris").([]interface{}))
	}
	if d.HasChange("scopes") {
		body["scopes"] = stringSlice(d.Get("scopes").([]interface{}))
	}

	path := fmt.Sprintf("/v1/admin/clients/%s", d.Id())
	if err := client.Do("PATCH", path, body, nil); err != nil {
		return diag.FromErr(err)
	}

	return resourceClientRead(ctx, d, meta)
}

func resourceClientDelete(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	// The admin API only disables clients (DELETE /v1/admin/clients/:clientId).
	path := fmt.Sprintf("/v1/admin/clients/%s", d.Id())
	if err := client.Do("DELETE", path, nil, nil); err != nil {
		return diag.FromErr(err)
	}

	d.SetId("")
	return nil
}