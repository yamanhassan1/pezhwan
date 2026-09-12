# PEZHWAN — security groups.
#
# Network boundary, least privilege between tiers:
#   internet -> ALB (80/443)
#   ALB      -> identity-server (4011)
#   identity-server -> Mongo (27017), Redis (6379)
# Nothing else reaches the data stores or the compute layer.

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Load balancer ingress: HTTP/HTTPS from the internet"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb"
  })
}

resource "aws_security_group" "identity_server" {
  name        = "${local.name_prefix}-identity-server"
  description = "Identity server: reachable from the ALB only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "HTTP from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-identity-server"
  })
}

resource "aws_security_group" "mongo" {
  name        = "${local.name_prefix}-mongo"
  description = "MongoDB-compatible store: reachable from the identity server only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "MongoDB from identity server"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.identity_server.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-mongo"
  })
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis"
  description = "Redis: reachable from the identity server only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Redis from identity server"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.identity_server.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })
}