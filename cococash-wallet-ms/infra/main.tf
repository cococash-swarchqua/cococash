# -----------------------------------------------
# CocoCash Wallet Infrastructure Module
# ECS Fargate + SNS Topics + SQS Queues + RDS PostgreSQL (Multi-AZ)
# -----------------------------------------------

locals {
  service_name = "cococash-wallet"
}

# Data sources for account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------
# ECR Repository - Wallet MS Docker Image
# -----------------------------------------------
resource "aws_ecr_repository" "wallet" {
  name                 = "${local.service_name}-ms"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# Build and push Docker image to ECR on apply
resource "null_resource" "wallet_docker_build" {
  triggers = {
    # Rebuild whenever source files change
    src_hash       = sha256(join("", [for f in fileset("${path.module}/../src", "**/*") : filesha256("${path.module}/../src/${f}")]))
    dockerfile_hash = filesha256("${path.module}/../Dockerfile")
    package_hash    = filesha256("${path.module}/../package.json")
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = "aws ecr get-login-password --region ${data.aws_region.current.name} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com && docker build -t ${aws_ecr_repository.wallet.repository_url}:latest ${path.module}/.. && docker push ${aws_ecr_repository.wallet.repository_url}:latest"
  }

  depends_on = [aws_ecr_repository.wallet]
}

# -----------------------------------------------
# Variables (passed from root module)
# -----------------------------------------------
variable "vpc_id" {
  type        = string
  description = "VPC ID for resources"
}

variable "private_app_subnet_id_1" {
  type        = string
  description = "Private app subnet AZ1 (for ECS tasks)"
}

variable "private_app_subnet_id_2" {
  type        = string
  description = "Private app subnet AZ2 (for ECS tasks)"
}

variable "private_data_subnet_id_1" {
  type        = string
  description = "Private data subnet AZ1 (for RDS primary)"
}

variable "private_data_subnet_id_2" {
  type        = string
  description = "Private data subnet AZ2 (for RDS standby)"
}

variable "public_subnet_id_1" {
  type        = string
  description = "Public subnet AZ1 (for ALB)"
}

variable "public_subnet_id_2" {
  type        = string
  description = "Public subnet AZ2 (for ALB)"
}

variable "db_password" {
  type        = string
  description = "Database master password"
  sensitive   = true
}

# -----------------------------------------------
# SNS Topic - Transfer Events
# RF-14: Domain events
# -----------------------------------------------
resource "aws_sns_topic" "transfer_events" {
  name = "${local.service_name}-transfer-events"

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

resource "aws_sns_topic" "account_events" {
  name = "${local.service_name}-account-events"

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# -----------------------------------------------
# SQS Queue - Wallet Transfer Processing
# (wallet-ms consumes transfer.initiated to process)
# -----------------------------------------------
resource "aws_sqs_queue" "transfer_dlq" {
  name                      = "${local.service_name}-transfer-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

resource "aws_sqs_queue" "transfer_queue" {
  name                       = "${local.service_name}-transfer-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.transfer_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# SQS Policy - Allow SNS to send messages
resource "aws_sqs_queue_policy" "transfer_queue_policy" {
  queue_url = aws_sqs_queue.transfer_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNS"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.transfer_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.transfer_events.arn
          }
        }
      }
    ]
  })
}

# SNS -> SQS Subscription (filter: transfer.initiated)
resource "aws_sns_topic_subscription" "transfer_to_sqs" {
  topic_arn = aws_sns_topic.transfer_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.transfer_queue.arn

  filter_policy = jsonencode({
    eventType = ["transfer.initiated"]
  })
}

# -----------------------------------------------
# SQS Queue - Transaction MS Audit Log
# (transaction-ms consumes transfer.completed/failed)
# -----------------------------------------------
resource "aws_sqs_queue" "transaction_audit_dlq" {
  name                      = "cococash-transaction-audit-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

resource "aws_sqs_queue" "transaction_audit_queue" {
  name                       = "cococash-transaction-audit-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.transaction_audit_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Project   = "cococash"
    Component = "transaction-ms"
  }
}

# SQS Policy - Allow SNS to send to transaction audit queue
resource "aws_sqs_queue_policy" "transaction_audit_queue_policy" {
  queue_url = aws_sqs_queue.transaction_audit_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNS"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.transaction_audit_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.transfer_events.arn
          }
        }
      }
    ]
  })
}

# SNS -> SQS subscription for transaction-ms (completed + failed events)
resource "aws_sns_topic_subscription" "transfer_completed_to_transaction" {
  topic_arn = aws_sns_topic.transfer_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.transaction_audit_queue.arn

  filter_policy = jsonencode({
    eventType = ["transfer.completed", "transfer.failed"]
  })
}

# -----------------------------------------------
# RDS PostgreSQL - Wallet Database (Multi-AZ)
# -----------------------------------------------
resource "aws_db_subnet_group" "wallet" {
  name       = "${local.service_name}-db-subnet"
  subnet_ids = [var.private_data_subnet_id_1, var.private_data_subnet_id_2]

  tags = {
    Project = "cococash"
  }
}

resource "aws_security_group" "wallet_db" {
  name        = "${local.service_name}-db-sg"
  description = "Security group for wallet RDS"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
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
    Project = "cococash"
  }
}

resource "aws_db_instance" "wallet" {
  identifier     = "${local.service_name}-db"
  engine         = "postgres"
  engine_version = "15"
  instance_class = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  # Multi-AZ: Active-passive replication with automatic failover
  multi_az = true

  db_name  = "cococash_wallet"
  username = "cococash_admin"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.wallet.name
  vpc_security_group_ids = [aws_security_group.wallet_db.id]

  skip_final_snapshot = true
  publicly_accessible = false

  tags = {
    Project   = "cococash"
    Component = "wallet-db"
  }
}

# -----------------------------------------------
# ECS Cluster (shared by wallet-ms and transaction-ms)
# -----------------------------------------------
resource "aws_ecs_cluster" "cococash" {
  name = "cococash-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Project = "cococash"
  }
}

# -----------------------------------------------
# IAM Role for ECS Task Execution
# -----------------------------------------------
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.service_name}-ecs-execution-role"

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

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# -----------------------------------------------
# IAM Role for Wallet MS Task (app permissions)
# -----------------------------------------------
resource "aws_iam_role" "wallet_task" {
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

# SNS/SQS permissions for wallet task
resource "aws_iam_role_policy" "wallet_task_sns_sqs" {
  name = "${local.service_name}-task-sns-sqs-policy"
  role = aws_iam_role.wallet_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = [
          aws_sns_topic.transfer_events.arn,
          aws_sns_topic.account_events.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [aws_sqs_queue.transfer_queue.arn]
      }
    ]
  })
}

# CloudWatch Logs permissions for wallet task
resource "aws_iam_role_policy" "wallet_task_cloudwatch" {
  name = "${local.service_name}-task-cloudwatch-policy"
  role = aws_iam_role.wallet_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# -----------------------------------------------
# Security Group for Wallet ECS Tasks
# -----------------------------------------------
resource "aws_security_group" "wallet_ecs" {
  name        = "${local.service_name}-ecs-sg"
  description = "Security group for wallet ECS Fargate tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "API from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.wallet_alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# -----------------------------------------------
# ALB for Wallet MS
# -----------------------------------------------
resource "aws_security_group" "wallet_alb" {
  name        = "${local.service_name}-alb-sg"
  description = "Security group for wallet ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
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

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

resource "aws_lb" "wallet" {
  name               = "${local.service_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.wallet_alb.id]
  subnets            = [var.public_subnet_id_1, var.public_subnet_id_2]

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

resource "aws_lb_target_group" "wallet" {
  name        = "${local.service_name}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

resource "aws_lb_listener" "wallet_http" {
  load_balancer_arn = aws_lb.wallet.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wallet.arn
  }
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "wallet" {
  name              = "/ecs/${local.service_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# -----------------------------------------------
# ECS Task Definition - Wallet MS
# -----------------------------------------------
resource "aws_ecs_task_definition" "wallet" {
  family                   = local.service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"  # 1 vCPU
  memory                   = "2048"  # 2 GB
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.wallet_task.arn

  container_definitions = jsonencode([
    {
      name      = "wallet-ms"
      image     = "${aws_ecr_repository.wallet.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "DB_HOST", value = aws_db_instance.wallet.address },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_NAME", value = "cococash_wallet" },
        { name = "DB_USER", value = "cococash_admin" },
        { name = "DB_PASSWORD", value = var.db_password },
        { name = "DB_SSL", value = "true" },
        { name = "SNS_TRANSFER_TOPIC_ARN", value = aws_sns_topic.transfer_events.arn },
        { name = "SNS_ACCOUNT_TOPIC_ARN", value = aws_sns_topic.account_events.arn },
        { name = "SQS_TRANSFER_QUEUE_URL", value = aws_sqs_queue.transfer_queue.url },
        { name = "AWS_REGION", value = "us-east-1" },
        { name = "PORT", value = "3000" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.wallet.name
          "awslogs-region"        = "us-east-1"
          "awslogs-stream-prefix" = "wallet"
        }
      }
    }
  ])

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# -----------------------------------------------
# ECS Service - Wallet MS (Multi-AZ Fargate)
# -----------------------------------------------
resource "aws_ecs_service" "wallet" {
  name            = "${local.service_name}-service"
  cluster         = aws_ecs_cluster.cococash.id
  task_definition = aws_ecs_task_definition.wallet.arn
  desired_count   = 2  # One per AZ for redundancy
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.private_app_subnet_id_1, var.private_app_subnet_id_2]
    security_groups  = [aws_security_group.wallet_ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.wallet.arn
    container_name   = "wallet-ms"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.wallet_http]

  tags = {
    Project   = "cococash"
    Component = "wallet-ms"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "sns_transfer_topic_arn" {
  value = aws_sns_topic.transfer_events.arn
}

output "sns_account_topic_arn" {
  value = aws_sns_topic.account_events.arn
}

output "sqs_transfer_queue_url" {
  value = aws_sqs_queue.transfer_queue.url
}

output "sqs_transfer_queue_arn" {
  value = aws_sqs_queue.transfer_queue.arn
}

output "sqs_transaction_audit_queue_url" {
  value = aws_sqs_queue.transaction_audit_queue.url
}

output "sqs_transaction_audit_queue_arn" {
  value = aws_sqs_queue.transaction_audit_queue.arn
}

output "rds_endpoint" {
  value = aws_db_instance.wallet.endpoint
}

output "rds_port" {
  value = aws_db_instance.wallet.port
}

output "ecs_cluster_id" {
  value = aws_ecs_cluster.cococash.id
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.cococash.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "wallet_alb_dns" {
  value       = aws_lb.wallet.dns_name
  description = "DNS name for the wallet ALB"
}
