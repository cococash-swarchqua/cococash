# -----------------------------------------------
# CocoCash Base Infrastructure - VPC & Networking
# Multi-AZ deployment across us-east-1a & us-east-1b
# -----------------------------------------------

locals {
  project_name = "cococash"
  vpc_cidr     = "10.0.0.0/16"
  az_1         = "us-east-1a"
  az_2         = "us-east-1b"
}

# -----------------------------------------------
# VPC
# -----------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = local.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.project_name}-vpc"
  }
}

# -----------------------------------------------
# Internet Gateway
# -----------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.project_name}-igw"
  }
}

# -----------------------------------------------
# Public Subnets (2 AZs) - Frontend / ALB
# -----------------------------------------------
resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = local.az_1
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.project_name}-public-subnet-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.4.0/24"
  availability_zone       = local.az_2
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.project_name}-public-subnet-2"
  }
}

# -----------------------------------------------
# Private Subnets - App Tier (2 AZs)
# wallet-ms, transaction-ms, SNS/SQS
# -----------------------------------------------
resource "aws_subnet" "private_app_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = local.az_1

  tags = {
    Name = "${local.project_name}-private-app-subnet-1"
  }
}

resource "aws_subnet" "private_app_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.5.0/24"
  availability_zone = local.az_2

  tags = {
    Name = "${local.project_name}-private-app-subnet-2"
  }
}

# -----------------------------------------------
# Private Subnets - Data Tier (2 AZs)
# RDS PostgreSQL (Multi-AZ)
# -----------------------------------------------
resource "aws_subnet" "private_data_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = local.az_1

  tags = {
    Name = "${local.project_name}-private-data-subnet-1"
  }
}

resource "aws_subnet" "private_data_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.6.0/24"
  availability_zone = local.az_2

  tags = {
    Name = "${local.project_name}-private-data-subnet-2"
  }
}

# -----------------------------------------------
# Elastic IP for NAT Gateway
# -----------------------------------------------
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${local.project_name}-nat-eip"
  }
}

# -----------------------------------------------
# NAT Gateway (allows private subnets to reach
# AWS services: SNS, SQS, CloudWatch, DynamoDB)
# -----------------------------------------------
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_1.id

  tags = {
    Name = "${local.project_name}-nat-gw"
  }

  depends_on = [aws_internet_gateway.main]
}

# -----------------------------------------------
# Route Table — Public (direct to IGW)
# -----------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------
# Route Table — Private (via NAT Gateway)
# -----------------------------------------------
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${local.project_name}-private-rt"
  }
}

resource "aws_route_table_association" "private_app_1" {
  subnet_id      = aws_subnet.private_app_1.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_app_2" {
  subnet_id      = aws_subnet.private_app_2.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_data_1" {
  subnet_id      = aws_subnet.private_data_1.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_data_2" {
  subnet_id      = aws_subnet.private_data_2.id
  route_table_id = aws_route_table.private.id
}

# -----------------------------------------------
# VPC Endpoint - DynamoDB (Gateway type, free)
# Keeps DynamoDB traffic inside AWS network
# -----------------------------------------------
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.us-east-1.dynamodb"

  route_table_ids = [
    aws_route_table.private.id
  ]

  tags = {
    Name = "${local.project_name}-dynamodb-vpce"
  }
}

# -----------------------------------------------
# Outputs (for other modules)
# -----------------------------------------------
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_id_1" {
  value = aws_subnet.public_1.id
}

output "public_subnet_id_2" {
  value = aws_subnet.public_2.id
}

output "private_app_subnet_id_1" {
  value = aws_subnet.private_app_1.id
}

output "private_app_subnet_id_2" {
  value = aws_subnet.private_app_2.id
}

output "private_data_subnet_id_1" {
  value = aws_subnet.private_data_1.id
}

output "private_data_subnet_id_2" {
  value = aws_subnet.private_data_2.id
}
