# PEZHWAN — provider wiring and version pinning.
#
# All three clouds are declared up front so `terraform init` materialises every
# provider, but only `var.cloud`'s module (see main.tf) actually uses one. Run
# with credentials for the selected cloud only; the others are never invoked.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

provider "azurerm" {
  # The `features` block is mandatory for azurerm >= 3.x.
  features {}

  subscription_id = var.azure_subscription_id
}

provider "google" {
  project = var.gcp_project
  region  = var.region
}