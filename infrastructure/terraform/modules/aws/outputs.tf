# PEZHWAN — AWS module outputs.

output "region" {
  description = "AWS region deployed into."
  value       = data.aws_region.current.name
}

output "alb_dns_name" {
  description = "DNS name of the public Application Load Balancer."
  value       = aws_lb.api.dns_name
}

output "alb_zone_id" {
  description = "Route53 alias zone ID of the ALB (for alias records)."
  value       = aws_lb.api.zone_id
}

output "mongodb_connection_string" {
  description = "MongoDB connection string (DocumentDB, user:pass@host:port)."
  sensitive   = true
  value       = local.mongodb_connection_string
}

output "redis_endpoint" {
  description = "Redis endpoint (redis://host:port)."
  value       = local.redis_endpoint
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing the identity-server image."
  value       = aws_ecr_repository.app.repository_url
}

output "task_role_arn" {
  description = "IAM role ARN the identity-server ECS task runs as."
  value       = aws_iam_role.task.arn
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster."
  value       = aws_ecs_cluster.this.arn
}