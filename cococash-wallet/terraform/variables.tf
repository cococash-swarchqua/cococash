variable "project_name" {
  description = "Nombre del proyecto/módulo"
  type        = string
  default     = "cococash-wallet"
}

variable "vpc_id" {
  description = "ID de la VPC donde desplegar recursos"
  type        = string
}

variable "service_subnet_id" {
  description = "Subnet privada donde se desplegará el cluster ECS Fargate (subnet 1)"
  type        = string
}

variable "db_subnet_id" {
  description = "Subnet privada donde se desplegará el RDS (subnet 2)"
  type        = string
}

variable "service_port" {
  description = "Puerto en el que corre el servicio"
  type        = number
  default     = 3000
}

variable "allowed_cidr" {
  description = "CIDR permitido para ingreso al servicio (ALB/Internet)"
  type        = string
  default     = "0.0.0.0/0"
}

# --- Database configuration (Postgres RDS) ---
variable "db_name" {
  description = "Nombre de la base de datos"
  type        = string
  default     = "cococash_wallet_db"
}

variable "db_username" {
  description = "Usuario maestro de la base de datos"
  type        = string
  default     = "cocouser"
}

variable "db_password" {
  description = "Password maestro para la base de datos (sensitive)"
  type        = string
  default     = ""
}

variable "db_port" {
  description = "Puerto de la base de datos"
  type        = number
  default     = 5432
}

variable "allocated_storage" {
  description = "Almacenamiento inicial en GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Máximo almacenamiento permitidos por auto-scaling (GB)"
  type        = number
  default     = 100
