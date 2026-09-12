# PEZHWAN — ECS / Fargate compute for the identity server.

# --- Image repo -------------------------------------------------------------
resource "aws_ecr_repository" "app" {
  name                 = var.identity_server_image_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.common_tags
}

# --- Cluster ----------------------------------------------------------------
resource "aws_ecs_cluster" "this" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = var.environment == "prod" ? "enhanced" : "disabled"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "identity_server" {
  name              = "/ecs/${local.name_prefix}-identity-server"
  retention_in_days = var.environment == "prod" ? 90 : 7

  tags = local.common_tags
}

# --- IAM ----------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "task_execution" {
  name   = "${local.name_prefix}-ecs-execution"
  policy = data.aws_iam_policy_document.task_execution.json
}

data "aws_iam_policy_document" "task_execution" {
  statement {
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = ["*"]
  }

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.identity_server.arn}:*"]
  }
}

resource "aws_iam_role_policy_attachment" "task_execution_custom" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.task_execution.arn
}

# Task role: what the identity server itself can do (logs, decrypt of the KMS
# data key that wraps secrets in Secrets Manager).
resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json

  tags = local.common_tags
}

resource "aws_iam_policy" "task" {
  name   = "${local.name_prefix}-ecs-task"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.identity_server.arn}:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "ssm:GetParameter"]
        Resource = ["*"]
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task" {
  role       = aws_iam_role.task.name
  policy_arn = aws_iam_policy.task.arn
}

# --- Task definition ----------------------------------------------------------
resource "aws_ecs_task_definition" "identity_server" {
  family                   = "${local.name_prefix}-identity-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = "identity-server"
      image        = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential    = true
      portMappings = [{ containerPort = var.app_port, protocol = "tcp" }]

      environment = [
        { name = "PEZHWAN_PORT", value = tostring(var.app_port) },
        # Issue tokens against the public ALB hostname with the ACM cert.
        { name = "PEZHWAN_ISSUER", value = "https://${var.domain}" },
        { name = "PEZHWAN_MONGODB_URI", value = local.mongodb_connection_string },
        { name = "PEZHWAN_REDIS_URL", value = local.redis_endpoint },
        { name = "PEZHWAN_ALLOWED_ORIGINS", value = join(",", var.allowed_origins) },
        { name = "PEZHWAN_TENANT_ID", value = var.tenant_id },
        { name = "PEZHWAN_APPLICATION_ID", value = var.application_id },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.identity_server.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "identity-server"
        }
      }
    },
  ])

  tags = local.common_tags
}

# --- Service ------------------------------------------------------------------
resource "aws_ecs_service" "identity_server" {
  name            = "identity-server"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.identity_server.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.identity_server.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "identity-server"
    container_port   = var.app_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.https]

  tags = local.common_tags
}