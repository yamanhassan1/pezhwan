# PEZHWAN — AWS module composition header.
#
# This directory IS the module (source = "./modules/aws"); there is no provider
# or required_providers block here — those live at the root (providers.tf).
#
# Data sources shared across sub-files: current region, caller identity, and a
# stable set of AZs used by the VPC, DocumentDB subnet group, and ElastiCache.

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}