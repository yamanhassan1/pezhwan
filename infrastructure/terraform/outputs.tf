# PEZHWAN — root outputs.
#
# Every output is read through try() so the plan stays valid regardless of
# which cloud module is enabled (unselected modules evaluate to an empty map).

output "provider" {
  description = "Which cloud provider module is active."
  value       = local.cloud
}

output "region" {
  description = "Region/location the deployment targets."
  value       = try(module.iaas_aws["aws"].region, module.iaas_gcp["gcp"].region, var.region)
}

output "app_endpoint" {
  description = "Public endpoint of the identity server (issuer)."
  value = try(
    module.iaas_aws["aws"].alb_dns_name,
    module.iaas_azure["azure"].app_service_hostname,
    module.iaas_gcp["gcp"].service_url,
    null,
  )
}

output "mongodb_connection_string" {
  description = "MongoDB-compatible connection string (AWS/Azure) or Mongo host (GCP)."
  sensitive   = true
  value = try(
    module.iaas_aws["aws"].mongodb_connection_string,
    module.iaas_azure["azure"].cosmos_connection_strings,
    module.iaas_gcp["gcp"].mongo_instance_ip,
    null,
  )
}

output "redis_endpoint" {
  description = "Redis endpoint (host:port)."
  value = try(
    format(
      "%s:%s",
      trimprefix(module.iaas_aws["aws"].redis_endpoint, "redis://"),
      6379,
    ),
    module.iaas_azure["azure"].redis_endpoint,
    module.iaas_gcp["gcp"].redis_host,
    null,
  )
}

output "image_repository_url" {
  description = "Container image repository holding the identity-server image."
  value = try(
    module.iaas_aws["aws"].ecr_repository_url,
    module.iaas_azure["azure"].app_image,
    null,
  )
}

output "task_role_arn" {
  description = "IAM/service-account role ARN the identity server runs as."
  value = try(
    module.iaas_aws["aws"].task_role_arn,
    module.iaas_gcp["gcp"].server_service_account,
    null,
  )
}