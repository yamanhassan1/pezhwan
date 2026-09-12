# PEZHWAN — Azure module inputs.

variable "project_name" {
  description = "Logical project name; prefixes all Azure resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "location" {
  description = "Azure region (e.g. eastus)."
  type        = string
}

variable "resource_group" {
  description = "Base name of the resource group; a uniqueness suffix will be appended."
  type        = string
}

variable "image_tag" {
  description = "Tag of the identity-server image to deploy."
  type        = string
}

variable "app_image" {
  description = "Full image URI (container registry / identity-server:<tag>)."
  type        = string
  default     = "pezhwanacr.azurecr.io/identity-server:latest"
}

variable "app_service_plan_sku" {
  description = "App Service Plan SKU (e.g. B1, S1, P1v3)."
  type        = string
  default     = "B1"
}

variable "allowed_origins" {
  description = "CORS allow-list forwarded to PEZHWAN_ALLOWED_ORIGINS."
  type        = list(string)
  default     = []
}

variable "domain" {
  description = "Public hostname for the identity server (used as PEZHWAN_ISSUER)."
  type        = string
  default     = "auth.pezhwan.example.com"
}

variable "tenant_id" {
  description = "Bootstrap tenant id (PEZHWAN_TENANT_ID)."
  type        = string
  default     = "dev-tenant"
}

variable "application_id" {
  description = "Bootstrap application id (PEZHWAN_APPLICATION_ID)."
  type        = string
  default     = "dev-app"
}

variable "admin_email" {
  description = "Bootstrap admin email."
  type        = string
  default     = "admin@pezhwan.example.com"
}

variable "admin_password" {
  description = "Bootstrap admin password. Inject via tfvars/secrets."
  type        = string
  sensitive   = true
}

# Cosmos DB (MongoDB API).
variable "mongodb_database" {
  description = "Name of the MongoDB database inside Cosmos DB."
  type        = string
  default     = "pezhwan"
}

variable "cosmos_offer_type" {
  description = "Cosmos DB account offer type (Standard or GlobalDocumentDB)."
  type        = string
  default     = "Standard"
}

variable "cosmos_consistency_level" {
  description = "Cosmos DB default consistency level."
  type        = string
  default     = "Session"
}

# Redis cache.
variable "redis_sku_name" {
  description = "Azure Cache for Redis SKU (Basic/Standard/Premium family 0/1)."
  type        = string
  default     = "B0"
}

variable "redis_family" {
  description = "Redis SKU family (C for Basic/Standard, P for Premium)."
  type        = string
  default     = "C"
}

variable "redis_capacity" {
  description = "Redis capacity (0 = 250 MB, 1 = 1 GB, 2 = 2.5 GB, 3 = 6 GB, 4 = 13 GB, 5 = 26 GB, 6 = 53 GB)."
  type        = number
  default     = 0
}

# Application Gateway (TLS front).
variable "app_gateway_sku" {
  description = "Application Gateway SKU name (e.g. Standard_v2)."
  type        = string
  default     = "Standard_v2"
}