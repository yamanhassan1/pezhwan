# PEZHWAN — Azure module outputs.

output "resource_group_name" {
  description = "Name of the resource group."
  value       = azurerm_resource_group.this.name
}

output "location" {
  description = "Azure region the deployment lives in."
  value       = azurerm_resource_group.this.location
}

output "app_service_hostname" {
  description = "Default hostname of the Linux Web App (public ingress)."
  value       = azurerm_linux_web_app.this.default_hostname
}

output "app_image" {
  description = "Container image deployed into the Web App."
  value       = var.app_image
}

output "cosmos_connection_strings" {
  description = "Cosmos DB (MongoDB API) primary connection strings. Sensitive."
  sensitive   = true
  value = [
    azurerm_cosmosdb_account.mongo.primary_mongodb_connection_string,
  ]
}

output "mongodb_database" {
  description = "Name of the MongoDB database inside Cosmos DB."
  value       = azurerm_cosmosdb_mongo_database.this.name
}

output "redis_endpoint" {
  description = "Redis host and SSL port (redis://<host>:6380)."
  value       = format("redis://%s:6380", azurerm_redis_cache.this.hostname)
}

output "redis_host" {
  description = "Redis cache hostname."
  value       = azurerm_redis_cache.this.hostname
}

output "app_gateway_public_ip" {
  description = "Static public IP of the Application Gateway."
  value       = azurerm_public_ip.gw.ip_address
}