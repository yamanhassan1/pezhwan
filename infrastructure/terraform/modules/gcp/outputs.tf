# PEZHWAN — GCP module outputs.

output "region" {
  description = "GCP region deployed into."
  value       = var.region
}

output "service_url" {
  description = "Cloud Run URL of the identity server."
  value       = google_cloud_run_service.identity_server.status[0].url
}

output "service_name" {
  description = "Cloud Run service name."
  value       = google_cloud_run_service.identity_server.name
}

output "redis_host" {
  description = "Memorystore Redis host (::1 unresolved via VPC; use the connector)."
  value       = google_redis_instance.this.host
}

output "redis_endpoint" {
  description = "Memorystore Redis endpoint (redis://<host>:6379)."
  value       = format("redis://%s:6379", google_redis_instance.this.host)
}

output "mongo_instance_ip" {
  description = "Private IP of the GCE Mongo host (empty when Atlas is used)."
  value = try(
    google_compute_instance.mongo[0].network_interface[0].network_ip,
    null,
  )
}

output "mongo_connection_string" {
  description = "MongoDB URI used by the identity server."
  sensitive   = var.mongo_use_atlas
  value       = local.mongodb_uri
}

output "server_service_account" {
  description = "Service account email the Cloud Run service runs as."
  value       = google_service_account.server.email
}