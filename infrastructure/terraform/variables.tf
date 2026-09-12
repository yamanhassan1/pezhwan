# PEZHWAN — root inputs.
#
# Provide these via -var flags, a *.tfvars file, or environment variables
# (e.g. TF_VAR_region). Values marked `sensitive` are never shown in plan
# output or state diffs.

variable "project_name" {
  description = "Logical name of the PEZHWAN deployment; used in resource names and tags."
  type        = string
  default     = "pezhwan"
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "cloud" {
  description = "Target cloud. Enable EXACTLY ONE per environment by toggling the matching module in main.tf (aws, azure, or gcp)."
  type        = string
  default     = "aws"

  validation {
    condition     = contains(["aws", "azure", "gcp"], var.cloud)
    error_message = "cloud must be one of: aws, azure, gcp."
  }
}

variable "region" {
  description = "AWS region / GCP region for the deployment (e.g. us-east-1, us-central1)."
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "Public hostname the identity plane is served from (e.g. auth.example.com)."
  type        = string
  default     = "auth.pezhwan.example.com"
}

variable "allowed_origins" {
  description = "CORS allow-list forwarded to PEZHWAN_ALLOWED_ORIGINS on the identity server."
  type        = list(string)
  default = [
    "https://auth.pezhwan.example.com",
  ]
}

variable "admin_email" {
  description = "Bootstrap admin email ensured by the identity server's ensureBootstrap."
  type        = string
  default     = "admin@pezhwan.example.com"
}

# -- container image ---------------------------------------------------------
variable "image_tag" {
  description = "Tag of the identity-server image (see apps/identity-server/Dockerfile)."
  type        = string
  default     = "latest"
}

# -- MongoDB sizing (DocumentDB instance class / Cosmos tier / GCE mongo) ----
variable "mongodb_instance_class" {
  description = "DocumentDB instance class for the Mongo-compatible store (AWS)."
  type        = string
  default     = "db.t4g.medium"
}

variable "mongodb_instance_count" {
  description = "Number of worker nodes in the MongoDB-compatible store."
  type        = number
  default     = 1
}

variable "mongodb_master_username" {
  description = "Master username for the MongoDB-compatible store."
  type        = string
  default     = "pezhwan"
}

variable "mongodb_master_password" {
  description = "Master password for the MongoDB-compatible store. Inject via tfvars/secrets."
  type        = string
  sensitive   = true
}

# -- Redis sizing ------------------------------------------------------------
variable "redis_node_type" {
  description = "ElastiCache / Azure Cache / Memorystore node size (e.g. cache.t3.micro)."
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis nodes; set > 1 for automatic failover."
  type        = number
  default     = 1
}

# -- Azure-specific ----------------------------------------------------------
variable "azure_location" {
  description = "Azure region (e.g. eastus)."
  type        = string
  default     = "eastus"
}

variable "azure_resource_group" {
  description = "Base name of the Azure resource group."
  type        = string
  default     = "pezhwan"
}

variable "azure_subscription_id" {
  description = "Azure subscription ID."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
}

# -- GCP-specific ------------------------------------------------------------
variable "gcp_project" {
  description = "GCP project ID."
  type        = string
  default     = "pezhwan"
}