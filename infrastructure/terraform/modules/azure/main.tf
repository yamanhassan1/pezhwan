# PEZHWAN — Azure module main resources.
#
# Cosmos DB (MongoDB API) for durable state, Azure Cache for Redis, a Linux
# Web App for Containers running the identity server, and a minimal Application
# Gateway as the TLS ingress. Production deployments should pin the certificate
# in Key Vault and enable WAFv2 on the application gateway.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }

  cosmos_conn_string = azurerm_cosmosdb_account.mongo.primary_mongodb_connection_string
}

# --- Resource Group -----------------------------------------------------------
resource "azurerm_resource_group" "this" {
  name     = "${var.resource_group}-${var.environment}"
  location = var.location
  tags     = local.common_tags
}

# --- Cosmos DB (MongoDB API) -------------------------------------------------
resource "azurerm_cosmosdb_account" "mongo" {
  name                          = "${local.name_prefix}-mongo"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  kind                          = "MongoDB"
  offer_type                    = var.cosmos_offer_type
  default_identity_type         = "FirstParty"
  public_network_access_enabled = true
  is_virtual_network_filter_enabled = false

  consistency_policy {
    consistency_level       = var.cosmos_consistency_level
    max_interval_in_seconds = 300
    max_staleness_prefix    = 100000
  }

  capabilities {
    name = "EnableMongo"
  }

  geo_location {
    location          = azurerm_resource_group.this.location
    failover_priority = 0
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = local.common_tags
}

resource "azurerm_cosmosdb_mongo_database" "this" {
  name                = var.mongodb_database
  resource_group_name = azurerm_resource_group.this.name
  account_name        = azurerm_cosmosdb_account.mongo.name
  throughput          = 400
}

# --- Azure Cache for Redis ----------------------------------------------------
resource "azurerm_redis_cache" "this" {
  name                = "${local.name_prefix}-redis"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  capacity            = var.redis_capacity
  family              = var.redis_family
  sku_name            = var.redis_sku_name
  minimum_tls_version = "1.2"

  public_network_access_enabled = true

  tags = local.common_tags
}

# --- App Service Plan & Linux Web App -----------------------------------------
resource "azurerm_service_plan" "this" {
  name                = "${local.name_prefix}-asp"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku

  tags = local.common_tags
}

resource "azurerm_linux_web_app" "this" {
  name                = "${local.name_prefix}-api"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  service_plan_id     = azurerm_service_plan.this.id
  https_only          = true

  site_config {
    always_on = var.app_service_plan_sku != "F1"

    application_stack {
      docker_image_name        = var.app_image
      docker_registry_url      = split(":", var.app_image)[0]
      docker_registry_username = ""
      docker_registry_password = ""
    }
  }

  app_settings = {
    PEZHWAN_PORT              = "4011"
    PEZHWAN_ISSUER            = "https://${var.domain}"
    PEZHWAN_MONGODB_URI       = "${local.cosmos_conn_string}/?ssl=true"
    PEZHWAN_REDIS_URL         = "rediss://:${azurerm_redis_cache.this.primary_access_key}@${azurerm_redis_cache.this.hostname}:6380"
    PEZHWAN_ALLOWED_ORIGINS   = join(",", var.allowed_origins)
    PEZHWAN_TENANT_ID         = var.tenant_id
    PEZHWAN_APPLICATION_ID    = var.application_id
    PEZHWAN_ADMIN_EMAIL       = var.admin_email
    PEZHWAN_ADMIN_PASSWORD    = var.admin_password
  }

  connection_string {
    name  = "MongoDB"
    type  = "Custom"
    value = local.cosmos_conn_string
  }

  tags = local.common_tags
}

# --- Minimal Application Gateway (TLS front) ----------------------------------
resource "azurerm_public_ip" "gw" {
  name                = "${local.name_prefix}-gw-ip"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_application_gateway" "this" {
  name                = "${local.name_prefix}-gw"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location

  sku {
    name     = var.app_gateway_sku
    tier     = "Standard_v2"
    capacity = 2
  }

  frontend_ip_configuration {
    name                 = "public"
    public_ip_address_id = azurerm_public_ip.gw.id
  }

  frontend_port {
    name = "https"
    port = 443
  }

  backend_address_pool {
    name = "identity-server"
  }

  backend_http_settings {
    name                  = "identity-server"
    port                  = 443
    protocol              = "Https"
    cookie_based_affinity = "Disabled"
    host_name             = azurerm_linux_web_app.this.default_hostname
    request_timeout       = 30
  }

  http_listener {
    name                           = "https"
    frontend_ip_configuration_name = "public"
    frontend_port_name             = "https"
  }

  request_routing_rule {
    name                       = "identity-server"
    rule_type                  = "PathBased"
    http_listener_name         = "https"
    backend_address_pool_name  = "identity-server"
    backend_http_settings_name = "identity-server"
    priority                   = 100
  }

  tags = local.common_tags
}