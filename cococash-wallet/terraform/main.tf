/*
  Módulo terraform: cococash-wallet
  - Provee recursos mínimos (security group) para el servicio
  - Implementa una base de datos PostgreSQL (RDS Multi-AZ) dedicada al servicio
*/

resource "aws_security_group" "service" {
  name        = "${var.project_name}-sg"
  description = "Security group para el servicio ${var.project_name}"
  vpc_id      = var.vpc_id

  ingress {
    description = "Acceso al servicio desde red interna"
    from_port   = var.service_port
    to_port     = var.service_port
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# ECS Fargate cluster and service
resource "aws_ecs_cluster" "wallet" {
  name = "${var.project_name}-cluster"
}

resource "aws_ecs_task_definition" "wallet" {
  family                   = "${var.project_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

  container_definitions = jsonencode([
    {
      name  = "wallet"
      image = "nginx:latest" # placeholder, reemplazar por tu imagen real
      portMappings = [
        {
          containerPort = var.service_port
          protocol      = "tcp"
        }
      ]
    }
  ])
}

resource "aws_ecs_service" "wallet" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.wallet.id
  task_definition = aws_ecs_task_definition.wallet.arn
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [var.service_subnet_id]
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  desired_count = 1
}

# --------------------
# Database Security Group
# --------------------
resource "aws_security_group" "db" {
  name        = "${var.project_name}-db-sg"
  description = "Security group para la base de datos ${var.project_name}"
  vpc_id      = var.vpc_id

  ingress {
    description      = "Permitir conexiones Postgres desde el servicio"
    from_port        = var.db_port
    to_port          = var.db_port
    protocol         = "tcp"
    security_groups  = [aws_security_group.service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-db-sg"
  }
}

# --------------------
# DB Subnet Group
# --------------------
resource "aws_db_subnet_group" "db_subnets" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [var.db_subnet_id]
  description = "Subnet group para RDS (subnet privada 2)"

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# --------------------
# RDS PostgreSQL
# --------------------
resource "aws_db_instance" "postgres" {
  identifier              = "cococash-wallet-db"
  allocated_storage      = var.allocated_storage
  max_allocated_storage  = var.max_allocated_storage
  storage_type           = "gp3"
  engine                 = "postgres"
  instance_class         = "db.t3.medium"
  name                   = var.db_name
  username               = var.db_username
  password               = var.db_password
  port                   = var.db_port
  multi_az               = true
  publicly_accessible    = false
  skip_final_snapshot    = true
  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name

  tags = {
    Name = "cococash-wallet-db"
  }
}

# Nota: Ajusta parámetros adicionales (backup_retention_period, parameter_group_name,
# maintenance_window, etc.) según necesidades de producción.
