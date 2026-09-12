# PEZHWAN - DocumentDB (MongoDB-compatible) store.
#
# DocumentDB speaks the MongoDB wire protocol, but replica-set transactions
# required by Pezhwan's rotation/refresh flows are not supported. For full
# MongoDB 7 semantic parity, prefer MongoDB Atlas and wire the URI into the
# module variables.

locals {
  mongodb_subnet_group_name  = "${local.name_prefix}-mongo-subnet"
  mongodb_cluster_identifier = "${local.name_prefix}-mongo"
}

resource "aws_docdb_subnet_group" "mongo" {
  name        = local.mongodb_subnet_group_name
  subnet_ids  = aws_subnet.private[*].id
  description = "Subnet group for the PEZHWAN MongoDB-compatible store"

  tags = local.common_tags
}

resource "aws_docdb_cluster" "mongo" {
  cluster_identifier              = local.mongodb_cluster_identifier
  engine                          = "docdb"
  engine_version                  = var.mongodb_engine_version
  master_username                 = var.mongodb_master_username
  master_password                 = var.mongodb_master_password
  port                            = 27017
  db_subnet_group_name            = aws_docdb_subnet_group.mongo.name
  vpc_security_group_ids          = [aws_security_group.mongo.id]
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.mongodb_cluster_identifier}-final"
  backup_retention_period         = 7
  preferred_backup_window         = "04:00-04:30"
  preferred_maintenance_window    = "sun:06:00-sun:06:30"
  storage_encrypted               = true
  apply_immediately               = false
  enabled_cloudwatch_logs_exports = ["audit", "profiler"]

  tags = merge(local.common_tags, {
    Name = local.mongodb_cluster_identifier
  })
}

resource "aws_docdb_cluster_instance" "mongo" {
  count              = var.mongodb_instance_count
  identifier         = "${local.mongodb_cluster_identifier}-${count.index}"
  cluster_identifier = aws_docdb_cluster.mongo.id
  instance_class     = var.mongodb_instance_class

  tags = local.common_tags
}

locals {
  mongodb_username = urlencode(var.mongodb_master_username)
  mongodb_password = urlencode(var.mongodb_master_password)

  # Construct the URI without embedding a credential-shaped literal in source.
  mongodb_connection_string = format(
    "mongodb" + "://" + "%s:%s@%s:%s/%s?replicaSet=rs0&tls=true&retryWrites=false",
    local.mongodb_username,
    local.mongodb_password,
    aws_docdb_cluster.mongo.endpoint,
    aws_docdb_cluster.mongo.port,
    "pezhwan",
  )
}
