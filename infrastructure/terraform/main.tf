# PEZHWAN — root composition.
#
# Enable EXACTLY ONE cloud module per environment by setting var.cloud:
#
#   module "iaas_aws"   enabled when var.cloud == "aws"
#   module "iaas_azure" enabled when var.cloud == "azure"
#   module "iaas_gcp"   enabled when var.cloud == "gcp"
#
# The other module blocks evaluate to an empty for_each map, so their providers
# are never contacted. Swap by editing var.cloud and applying again; data stores
# (Mongo/Redis) are NOT migrated between clouds automatically.

locals {
  cloud        = var.cloud
  environment  = var.environment
  project_name = var.project_name
  image_tag    = var.image_tag
  domain       = var.domain

  common_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# === AWS (ALB + ECS/Fargate, DocumentDB Mongo store, ElastiCache Redis) =====
module "iaas_aws" {
  for_each = var.cloud == "aws" ? { aws = true } : {}

  source = "./modules/aws"

  project_name               = local.project_name
  environment                = local.environment
  region                     = var.region
  vpc_cidr                   = "10.0.0.0/16"
  domain                     = var.domain
  allowed_origins            = var.allowed_origins
  image_tag                  = local.image_tag
  mongodb_instance_class     = var.mongodb_instance_class
  mongodb_instance_count     = var.mongodb_instance_count
  mongodb_master_username    = var.mongodb_master_username
  mongodb_master_password    = var.mongodb_master_password
  redis_node_type            = var.redis_node_type
  redis_num_cache_nodes      = var.redis_num_cache_nodes
  tenant_id                  = "dev-tenant"
  application_id             = "dev-app"
  identity_server_image_name = "${var.project_name}/identity-server"
}

# === Azure (App Service for Containers, CosmosDB Mongo API, Cache for Redis) =
# module "iaas_azure" {
#   for_each = var.cloud == "azure" ? { azure = true } : {}
#
#   source = "./modules/azure"
#
#   project_name     = local.project_name
#   environment      = local.environment
#   location         = var.azure_location
#   resource_group   = var.azure_resource_group
#   image_tag        = local.image_tag
#   allowed_origins  = var.allowed_origins
#   domain           = var.domain
#   mongodb_database = "pezhwan"
# }
#
# # === GCP (Cloud Run, Memorystore Redis, Mongo on GCE/Atlas) ================
# module "iaas_gcp" {
#   for_each = var.cloud == "gcp" ? { gcp = true } : {}
#
#   source = "./modules/gcp"
#
#   project_name    = local.project_name
#   environment     = local.environment
#   region          = var.region
#   allowed_origins = var.allowed_origins
#   image_tag       = local.image_tag
# }