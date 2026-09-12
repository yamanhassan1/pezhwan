# PEZHWAN — GCP module inputs.

variable "project_name" {
  description = "Logical project name; prefixes GCP resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

variable "region" {
  description = "GCP region (e.g. us-central1)."
  type        = string
}

variable "zone" {
  description = "GCP zone for zonal resources (e.g. us-central1-a)."
  type        = string
  default     = "us-central1-a"
}

variable "image_tag" {
  description = "Tag of the identity-server image to deploy."
  type        = string
}

variable "image" {
  description = "Full identity-server container image URI (Artifact Registry)."
  type        = string
  default     = "us-central1-docker.pkg.dev/pezhwan/pezhwan/identity-server:latest"
}

variable "allowed_origins" {
  description = "CORS allow-list forwarded to PEZHWAN_ALLOWED_ORIGINS."
  type        = list(string)
  default     = []
}

variable "domain" {
  description = "Public hostname used as PEZHWAN_ISSUER (mapped to the Cloud Run URL externally)."
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

# Compute.
variable "machine_type" {
  description = "GCE machine type for the Mongo host (or use Atlas and leave empty)."
  type        = string
  default     = "e2-standard-2"
}

variable "cloud_run_max_instances" {
  description = "Cloud Run max instances."
  type        = number
  default     = 10
}

variable "cloud_run_memory" {
  description = "Cloud Run memory per instance (e.g. 512Mi)."
  type        = string
  default     = "512Mi"
}

# Memorystore Redis.
variable "redis_tier" {
  description = "Memorystore tier: STANDARD (HA, >= R1) or BASIC (single node)."
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Memorystore memory size in GiB."
  type        = number
  default     = 1
}

# MongoDB (on GCE) — or delegate to Atlas.
variable "mongo_use_atlas" {
  description = "When true, point PEZHWAN_MONGODB_URI at the provided Atlas URI and skip the GCE Mongo instance."
  type        = bool
  default     = false
}

variable "mongodb_atlas_uri" {
  description = "MongoDB Atlas SRV URI used when mongo_use_atlas = true."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
}