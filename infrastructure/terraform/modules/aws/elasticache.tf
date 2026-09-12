# PEZHWAN — ElastiCache Redis.
#
# Redis is an optimiser (rate limits, session liveness, account-state TTLs,
# distributed locks); the server degrades to the durable Mongo-counter fallback
# if it is unreachable. A single node is acceptable; set redis_num_cache_nodes
# to an odd number >= 3 for automatic failover + replicas.

locals {
  redis_subnet_group_name = "${local.name_prefix}-redis-subnet"
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = local.redis_subnet_group_name
  subnet_ids = aws_subnet.private[*].id

  tags = local.common_tags
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  apply_immediately          = false

  # Production consideration: Redis major versions retire on a cadence (7.x
  # EOS announced); track the latest stable engine_version.
  snapshot_retention_limit = var.environment == "prod" ? 7 : 0
  snapshot_window          = "03:30-04:30"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })

  lifecycle {
    ignore_changes = [engine_version]
  }
}

locals {
  # redis://<host>:6379
  redis_endpoint = format(
    "redis://%s:%s",
    aws_elasticache_cluster.redis.cache_nodes[0].address,
    aws_elasticache_cluster.redis.cache_nodes[0].port,
  )
}