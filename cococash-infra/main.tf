# -----------------------------------------------
# Variables locales
# -----------------------------------------------
locals {
  project_name = "cococash"
  vpc_cidr     = "10.0.0.0/16"
  az           = "us-east-1a"
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
# Internet Gateway (necesario para la subnet pública)
# -----------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.project_name}-igw"
  }
}

# -----------------------------------------------
# Subnet Pública
# -----------------------------------------------
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = local.az
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.project_name}-public-subnet"
  }
}

# -----------------------------------------------
# Subnet Privada 1 (para ECS Fargate)
# -----------------------------------------------
resource "aws_subnet" "private1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = local.az

  tags = {
    Name = "${local.project_name}-private-subnet-1"
  }
}

# -----------------------------------------------
# Subnet Privada 2 (para RDS)
# -----------------------------------------------
resource "aws_subnet" "private2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = local.az

  tags = {
    Name = "${local.project_name}-private-subnet-2"
  }
}

# -----------------------------------------------
# Elastic IP para el NAT Gateway
# -----------------------------------------------
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${local.project_name}-nat-eip"
  }
}

# # -----------------------------------------------
# # NAT Gateway (permite salida a internet desde la subnet privada)
# # -----------------------------------------------
# resource "aws_nat_gateway" "main" {
#   allocation_id = aws_eip.nat.id
#   subnet_id     = aws_subnet.public.id

#   tags = {
#     Name = "${local.project_name}-nat-gw"
#   }

#   depends_on = [aws_internet_gateway.main]
# }

# -----------------------------------------------
# Route Table — Pública
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

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------
# Route Table — Privada
# -----------------------------------------------
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

#   route {
#     cidr_block     = "0.0.0.0/0"
#     nat_gateway_id = aws_nat_gateway.main.id
#   }

#   tags = {
#     Name = "${local.project_name}-private-rt"
#   }
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}
