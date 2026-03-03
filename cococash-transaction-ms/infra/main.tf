# -----------------------------------------------
# CocoCash Transaction MS Infrastructure
# ECS Fargate Worker + DynamoDB + IAM
# -----------------------------------------------

locals {
  service_name = "cococash-transaction"
}

# Data sources for account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------
# ECR Repository - Transaction MS Docker Image
# -----------------------------------------------
resource "aws_ecr_repository" "transaction" {
  name                 = "${local.service_name}-ms"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# Build and push Docker image to ECR on apply
resource "null_resource" "transaction_docker_build" {
  triggers = {
    src_hash        = sha256(join("", [for f in fileset("${path.module}/..", "*.go") : filesha256("${path.module}/../${f}")]))
    dockerfile_hash = filesha256("${path.module}/../Dockerfile")
    gomod_hash      = filesha256("${path.module}/../go.mod")
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = "aws ecr get-login-password --region ${data.aws_region.current.name} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com && docker build -t ${aws_ecr_repository.transaction.repository_url}:latest ${path.module}/.. && docker push ${aws_ecr_repository.transaction.repository_url}:latest"
  }

  depends_on = [aws_ecr_repository.transaction]
}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "private_app_subnet_id_1" {
  type        = string
  description = "Private app subnet AZ1"
}

variable "private_app_subnet_id_2" {
  type        = string
  description = "Private app subnet AZ2"
}

variable "ecs_cluster_id" {
  type        = string
  description = "ECS Cluster ID (shared)"
}

variable "ecs_task_execution_role_arn" {
  type        = string
  description = "ECS Task Execution Role ARN"
}

variable "sqs_transaction_audit_queue_url" {
  type        = string
  description = "SQS queue URL for consuming transfer events"
}

variable "sqs_transaction_audit_queue_arn" {
  type        = string
  description = "SQS queue ARN for consuming transfer events"
}

# -----------------------------------------------
# DynamoDB Table - Transaction Audit Log
# PK: user_id, SK: timestamp
# On-demand capacity for cost efficiency
# -----------------------------------------------
resource "aws_dynamodb_table" "transactions" {
  name         = "${local.service_name}-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "timestamp"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "transaction_id"
    type = "S"
  }

  # GSI for looking up by transaction_id
  global_secondary_index {
    name            = "transaction_id-index"
    hash_key        = "transaction_id"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# -----------------------------------------------
# IAM Role for Transaction MS Task
# -----------------------------------------------
resource "aws_iam_role" "transaction_task" {
  name = "${local.service_name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Project = "cococash"
  }
}

# DynamoDB permissions
resource "aws_iam_role_policy" "transaction_task_dynamodb" {
  name = "${local.service_name}-task-dynamodb-policy"
  role = aws_iam_role.transaction_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.transactions.arn,
          "${aws_dynamodb_table.transactions.arn}/index/*"
        ]
      }
    ]
  })
}

# SQS permissions
resource "aws_iam_role_policy" "transaction_task_sqs" {
  name = "${local.service_name}-task-sqs-policy"
  role = aws_iam_role.transaction_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [var.sqs_transaction_audit_queue_arn]
      }
    ]
  })
}

# CloudWatch
resource "aws_iam_role_policy" "transaction_task_cloudwatch" {
  name = "${local.service_name}-task-cloudwatch-policy"
  role = aws_iam_role.transaction_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# -----------------------------------------------
# Security Group for Transaction ECS Tasks
# -----------------------------------------------
resource "aws_security_group" "transaction_ecs" {
  name        = "${local.service_name}-ecs-sg"
  description = "Security group for transaction ECS Fargate worker"
  vpc_id      = var.vpc_id

  # No inbound rules - worker only consumes SQS, no HTTP listeners
  # The API endpoint will be added later if needed

  ingress {
    description = "API (read endpoints)"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "transaction" {
  name              = "/ecs/${local.service_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# -----------------------------------------------
# ECS Task Definition - Transaction MS
# -----------------------------------------------
resource "aws_ecs_task_definition" "transaction" {
  family                   = local.service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"   # 0.25 vCPU
  memory                   = "512"   # 0.5 GB
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = aws_iam_role.transaction_task.arn

  container_definitions = jsonencode([
    {
      name      = "transaction-ms"
      image     = "${aws_ecr_repository.transaction.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "SQS_QUEUE_URL", value = var.sqs_transaction_audit_queue_url },
        { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.transactions.name },
        { name = "AWS_REGION", value = "us-east-1" },
        { name = "PORT", value = "8080" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.transaction.name
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "transaction"
        }
      }
    }
  ])

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# -----------------------------------------------
# ECS Service - Transaction MS (Multi-AZ Worker)
# -----------------------------------------------
resource "aws_ecs_service" "transaction" {
  name            = "${local.service_name}-service"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.transaction.arn
  desired_count   = 2  # One per AZ
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.private_app_subnet_id_1, var.private_app_subnet_id_2]
    security_groups  = [aws_security_group.transaction_ecs.id]
    assign_public_ip = false
  }

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "dynamodb_table_name" {
  value = aws_dynamodb_table.transactions.name
}

output "dynamodb_table_arn" {
  value = aws_dynamodb_table.transactions.arn
}
