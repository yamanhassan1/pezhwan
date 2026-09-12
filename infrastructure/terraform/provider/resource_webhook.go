package pezhwan

import (
	"context"

	"github.com/hashicorp/terraform-plugin-sdk/v2/diag"
	"github.com/hashicorp/terraform-plugin-sdk/v2/helper/schema"
)

// resourceWebhook registers a Pezhwan webhook endpoint via the admin API:
//
//	POST /v1/admin/webhooks        register (admin.ts; HMAC secret returned once)
//	GET  /v1/admin/webhooks        list (matched by id)
//
// CONSTRAINT: the Pezhwan Admin API exposes only register/list/test for
// webhooks — there is no PATCH/mutate or DELETE/unregister endpoint (see
// apps/identity-server/src/admin.ts and the WebhookService). Update and Delete
// therefore fail fast with a clear error instead of silently diverging from
// the real API; manage webhook mutations through the admin console or by
// replacing the resource.
//
// The API model has no "name" or "active" toggle; those fields are stored for
// planning/organisation only.
func resourceWebhook() *schema.Resource {
	return &schema.Resource{
		CreateContext: resourceWebhookCreate,
		ReadContext:   resourceWebhookRead,
		UpdateContext: resourceWebhookUpdate,
		DeleteContext: resourceWebhookDelete,

		Schema: map[string]*schema.Schema{
			"name": {
				Type:        schema.TypeString,
				Optional:    true,
				Description: "Local label only; the webhook API does not model names.",
			},
			"url": {
				Type:        schema.TypeString,
				Required:    true,
				Description: "URL that receives the webhook deliveries.",
			},
			"events": {
				Type:        schema.TypeList,
				Required:    true,
				Elem:        &schema.Schema{Type: schema.TypeString},
				Description: "Event names this webhook subscribes to.",
			},
			"active": {
				Type:        schema.TypeBool,
				Computed:    true,
				Description: "Server-side active flag (always true; no deactivate endpoint exists).",
			},
			"secret": {
				Type:        schema.TypeString,
				Computed:    true,
				Sensitive:   true,
				Description: "HMAC signing secret for x-pezhwan-signature. Shown once at registration.",
			},
		},
	}
}

type webhookPayload struct {
	ID         string   `json:"id"`
	URL        string   `json:"url"`
	Events     []string `json:"events"`
	Active     bool     `json:"active"`
	MaxRetries int      `json:"maxRetries"`
	Secret     string   `json:"secret"`
}

type webhookEnvelope struct {
	Webhook *webhookPayload `json:"webhook"`
}

type webhookListEnvelope struct {
	Webhooks []*webhookPayload `json:"webhooks"`
}

func setWebhookState(d *schema.ResourceData, w *webhookPayload) {
	d.SetId(w.ID)
	d.Set("url", w.URL)
	d.Set("events", w.Events)
	d.Set("active", w.Active)
	if w.Secret != "" {
		d.Set("secret", w.Secret)
	}
}

func resourceWebhookCreate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	body := map[string]interface{}{
		"url":    d.Get("url").(string),
		"events": stringSlice(d.Get("events").([]interface{})),
	}

	var env webhookEnvelope
	if err := client.Do("POST", "/v1/admin/webhooks", body, &env); err != nil {
		return diag.FromErr(err)
	}
	if env.Webhook == nil || env.Webhook.ID == "" {
		return diag.Errorf("pezhwan: register webhook returned no id")
	}

	setWebhookState(d, env.Webhook)
	return nil
}

func resourceWebhookRead(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	client := clientFromMeta(meta)
	if client == nil {
		return diag.Errorf("pezhwan: provider client is nil")
	}

	var env webhookListEnvelope
	if err := client.Do("GET", "/v1/admin/webhooks", nil, &env); err != nil {
		return diag.FromErr(err)
	}
	for _, w := range env.Webhooks {
		if w != nil && w.ID == d.Id() {
			setWebhookState(d, w)
			return nil
		}
	}

	return diag.Errorf("pezhwan: webhook %s not found", d.Id())
}

func resourceWebhookUpdate(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	// The Pezhwan Admin API exposes no mutate endpoint for webhooks (only
	// GET/POST /v1/admin/webhooks and POST /v1/admin/webhooks/:id/test).
	return diag.Errorf(
		"pezhwan: updating webhook %s is unsupported — the Admin API has no webhook PATCH endpoint; "+
			"replace the resource (destroy + create) or update it from the admin console",
		d.Id(),
	)
}

func resourceWebhookDelete(ctx context.Context, d *schema.ResourceData, meta interface{}) diag.Diagnostics {
	// The Pezhwan Admin API exposes no unregister endpoint for webhooks.
	return diag.Errorf(
		"pezhwan: deleting webhook %s is unsupported - the Admin API has no webhook DELETE endpoint; "+
			"deactivate it from the admin console",
		d.Id(),
	)
}