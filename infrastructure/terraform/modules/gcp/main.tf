# PEZHWAN — GCP module main resources.
#
# Cloud Run hosts the stateless identity server on port 4011, behind a VPC
# connector so it can reach Memorystore Redis and the Mongo VM. MongoDB is
# provided either by a single GCE instance (dev/ref; replica-set transactions
# need a real 3-node replSet or Atlas — see the note on var.mongo_use_atlas) or
# delegated to MongoDB Atlas.
#
# Enable required APIs first:
#   gcloud services enable run.googleapis.com vpcaccess.googleapis.com \
#     redis.googleapis.com compute.googleapis.com artifactregistry.googleapis.com

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# --- Networking ---------------------------------------------------------------
resource "google_compute_network" "this" {
  name                    = local.name_prefix
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "this" {
  name          = local.name_prefix
  network       = google_compute_network.this.id
  region        = var.region
  ip_cidr_range = "10.0.0.0/24"
}

# --- Service account + VPC connector for Cloud Run -----------------------------
resource "google_service_account" "server" {
  account_id   = "${local.name_prefix}-server"
  display_name = "Identity server service account"
}

resource "google_vpc_access_connector" "this" {
  name          = local.name_prefix
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.this.id
}

# --- Memorystore Redis ---------------------------------------------------------
resource "google_redis_instance" "this" {
  name           = local.name_prefix
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  region         = var.region
  authorized_network = google_compute_network.this.id
  labels         = local.common_labels
}

# --- MongoDB on GCE (dev reference) — or Atlas ---------------------------------
resource "google_compute_instance" "mongo" {
  count        = var.mongo_use_atlas ? 0 : 1
  name         = "${local.name_prefix}-mongo"
  machine_type = var.machine_type
  zone         = var.zone

  network_interface {
    subnetwork = google_compute_subnetwork.this.id
  }

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
      size  = 40
    }
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    # Reference-only single-node Mongo. For production parity (transactions,
    # replica set semantics) deploy a 3-node replSet or use MongoDB Atlas and
    # set var.mongo_use_atlas = true with the Atlas URI.
    apt-get update -y && apt-get install -y mongodb-org 2>/dev/null || true
    mkdir -p /data/db && systemctl enable mongod && systemctl start mongod || true
  EOT

  tags = ["mongo"]
}

locals {
  mongodb_uri = var.mongo_use_atlas
    ? var.mongodb_atlas_uri
    : "mongodb://${google_compute_instance.mongo[0].network_interface[0].network_ip}:27017/pezhwan?replicaSet=rs0"
}

# --- Cloud Run identity server --------------------------------------------------
resource "google_cloud_run_service" "identity_server" {
  name     = local.name_prefix
  location = var.region

  template {
    metadata {
      labels = local.common_labels

      annotations = {
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.this.id
      }
    }

    spec {
      container_concurrency = 80
      service_account_name  = google_service_account.server.email

      containers {
        image = var.image
        ports {
          container_port = 4011
        }
        resources {
          limits = {
            memory = var.cloud_run_memory
            cpu    = "1"
          }
        }
        env {
          name  = "PEZHWAN_PORT"
          value = "4011"
        }
        env {
          name  = "PEZHWAN_ISSUER"
          value = "https://${var.domain}"
        }
        env {
          name  = "PEZHWAN_MONGODB_URI"
          value = local.mongodb_uri
        }
        env {
          name  = "PEZHWAN_REDIS_URL"
          value = "redis://${google_redis_instance.this.host}:6379"
        }
        env {
          name  = "PEZHWAN_ALLOWED_ORIGINS"
          value = join(",", var.allowed_origins)
        }
        env {
          name  = "PEZHWAN_TENANT_ID"
          value = var.tenant_id
        }
        env {
          name  = "PEZHWAN_APPLICATION_ID"
          value = var.application_id
        }
        env {
          name  = "PEZHWAN_ADMIN_EMAIL"
          value = var.admin_email
        }
        env {
          name  = "PEZHWAN_ADMIN_PASSWORD"
          value = var.admin_password
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["client.knative.dev/user-image"],
      template[0].metadata[0].annotations["run.googleapis.com/startup-probe"],
    ]
  }

  autogenerate_revision_name = true

  depends_on = [google_vpc_access_connector.this]
}

data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = ["allUsers"]
  }
}

resource "google_cloud_run_service_iam_policy" "public" {
  location = google_cloud_run_service.identity_server.location
  project  = google_cloud_run_service.identity_server.project
  service  = google_cloud_run_service.identity_server.name
  policy_data = data.google_iam_policy.noauth.policy_data
}