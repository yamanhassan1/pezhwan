# PEZHWAN — AWS module inputs.

variable "project_name" {
  description = "Logical project name, prefixes all resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/staging/prod)."
  type        = string
}

variable "region" {
  description = "AWS region."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the deployment VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "domain" {
  description = "Public hostname (must have an ACM certificate with status ISSUED in this account/region)."
  type        = string
}

variable "allowed_origins" {
  description = "CORS allow-list forwarded to PEZHWAN_ALLOWED_ORIGINS."
  type        = list(string)
  default     = []
}

variable "identity_server_image_name" {
  description = "ECR repository name of the identity-server image."
  type        = string
  default     = "pezhwan/identity-server"
}

variable "image_tag" {
  description = "Tag of the identity-server image to deploy."
  type        = string
}

variable "app_port" {
  description = "Container port the identity server listens on."
  type        = number
  default     = 4011
}

variable "desired_count" {
  description = "Desired number of Fargate tasks."
  type        = number
  default     = 1
}

variable "task_cpu" {
  description = "ECS task CPU units (Fargate)."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "ECS task memory (MiB, Fargate)."
  type        = number
  default     = 1024
}

# Tenancy / auth plane for the managed identity store (see rds.tf, elasticache.tf).
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

# MongoDB-compatible store.
variable "mongodb_instance_class" {
  description = "DocumentDB instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "mongodb_instance_count" {
  description = "Number of DocumentDB instances."
  type        = number
  default     = 1
}

variable "mongodb_engine_version" {
  description = "DocumentDB engine version."
  type        = string
  default     = "5.0.0"
}

variable "mongodb_master_username" {
  description = "DocumentDB master username."
  type        = string
  default     = "pezhwan"
}

variable "mongodb_master_password" {
  description = "DocumentDB master password. Marked sensitive."
  type        = string
  sensitive   = true
}

# Redis.
variable "redis_node_type" {
  description = "ElastiCache node type (e.g. cache.t3.micro)."
  type        = string
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.0"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes; > 1 enables automatic failover."
  type        = number
  default     = 1
}