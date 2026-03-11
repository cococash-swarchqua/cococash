# -----------------------------------------------
# CocoCash Frontend (WFE) Infrastructure
# ECS Fargate + ALB (public) + ECR
# -----------------------------------------------

locals {
  service_name = "cococash-wfe"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "public_subnet_id_1" {
  type        = string
  description = "Public subnet AZ1 (for ALB & ECS)"
}

variable "public_subnet_id_2" {
  type        = string
  description = "Public subnet AZ2 (for ALB & ECS)"
}

variable "private_app_subnet_id_1" {
  type        = string
  description = "Private app subnet AZ1 (for ECS tasks)"
}

variable "private_app_subnet_id_2" {
  type        = string
  description = "Private app subnet AZ2 (for ECS tasks)"
}

variable "ecs_cluster_id" {
  type        = string
  description = "Shared ECS cluster ID"
}

variable "ecs_task_execution_role_arn" {
  type        = string
  description = "ECS task execution role ARN"
}

variable "api_gateway_url" {
  type        = string
  description = "API Gateway invoke URL for backend calls"
}

variable "cognito_user_pool_id" {
  type        = string
  description = "Cognito User Pool ID"
}

variable "cognito_client_id" {
  type        = string
  description = "Cognito User Pool Client ID"
}

# -----------------------------------------------
# ECR Repository
# -----------------------------------------------
resource "aws_ecr_repository" "wfe" {
  name                 = local.service_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

# Build and push Docker image to ECR
resource "null_resource" "wfe_docker_build" {
  triggers = {
    src_hash        = sha256(join("", [for f in fileset("${path.module}/../src", "**/*") : filesha256("${path.module}/../src/${f}")]))
    dockerfile_hash = filesha256("${path.module}/../Dockerfile")
    package_hash    = filesha256("${path.module}/../package.json")
    index_hash      = filesha256("${path.module}/../index.html")
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      aws ecr get-login-password --region ${data.aws_region.current.name} | \
        docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com && \
      docker build \
        --build-arg VITE_API_URL=${var.api_gateway_url} \
        --build-arg VITE_COGNITO_USER_POOL_ID=${var.cognito_user_pool_id} \
        --build-arg VITE_COGNITO_CLIENT_ID=${var.cognito_client_id} \
        --build-arg VITE_AWS_REGION=${data.aws_region.current.name} \
        -t ${aws_ecr_repository.wfe.repository_url}:latest \
        ${path.module}/.. && \
      docker push ${aws_ecr_repository.wfe.repository_url}:latest
    EOT
  }

  depends_on = [aws_ecr_repository.wfe]
}

# -----------------------------------------------
# Security Group - ALB (public)
# -----------------------------------------------
resource "aws_security_group" "wfe_alb" {
  name        = "${local.service_name}-alb-sg"
  description = "Security group for frontend ALB"
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
    Component = "wfe"
  }
}

# -----------------------------------------------
# Security Group - ECS Tasks
# -----------------------------------------------
resource "aws_security_group" "wfe_ecs" {
  name        = "${local.service_name}-ecs-sg"
  description = "Security group for frontend ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.wfe_alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

# -----------------------------------------------
# ALB (public)
# -----------------------------------------------
resource "aws_lb" "wfe" {
  name               = "${local.service_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.wfe_alb.id]
  subnets            = [var.public_subnet_id_1, var.public_subnet_id_2]

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

resource "aws_lb_target_group" "wfe" {
  name        = "${local.service_name}-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

resource "aws_lb_listener" "wfe_http" {
  load_balancer_arn = aws_lb.wfe.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.wfe.arn
  }
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "wfe" {
  name              = "/ecs/${local.service_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

# -----------------------------------------------
# ECS Task Definition
# -----------------------------------------------
resource "aws_ecs_task_definition" "wfe" {
  family                   = local.service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = var.ecs_task_execution_role_arn

  container_definitions = jsonencode([
    {
      name      = "wfe"
      image     = "${aws_ecr_repository.wfe.repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 80
          protocol      = "tcp"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.wfe.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "wfe"
        }
      }
    }
  ])

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

# -----------------------------------------------
# ECS Service
# -----------------------------------------------
resource "aws_ecs_service" "wfe" {
  name            = "${local.service_name}-service"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.wfe.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.private_app_subnet_id_1, var.private_app_subnet_id_2]
    security_groups  = [aws_security_group.wfe_ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.wfe.arn
    container_name   = "wfe"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.wfe_http]

  tags = {
    Project   = "cococash"
    Component = "wfe"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "wfe_alb_dns" {
  value       = aws_lb.wfe.dns_name
  description = "Frontend ALB DNS (public URL)"
}

output "wfe_ecr_url" {
  value       = aws_ecr_repository.wfe.repository_url
  description = "Frontend ECR repository URL"
}
