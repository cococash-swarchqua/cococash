# Módulo Terraform: cococash-wallet

Módulo Terraform para el microservicio `cococash-wallet` desplegado en ECS Fargate.

Este módulo incluye:

- Cluster ECS Fargate en una subnet privada (subnet1).
- Servicio y task definition básicos (imagen placeholder).
- Base de datos PostgreSQL dedicada (RDS Multi-AZ) en otra subnet privada (subnet2).

Uso recomendado:

- Preferible mantener la base de datos en un módulo/stack separado si:
  - La base de datos puede ser compartida por otros servicios.
  - El ciclo de vida de la BD difiere del del servicio (p. ej. persistencia a largo plazo).
  - Quieres que el equipo de plataforma gestione la BBDD.

- Incluir la BD dentro del mismo módulo del servicio tiene sentido si:
  - La BD es dedicada exclusivamente a este servicio y su ciclo de vida debe atarse al microservicio.
  - El equipo que despliega el servicio también gestiona la BD.

Este módulo asume que la conexión a la BD se provee como variables (`db_endpoint`, `db_port`).

Ejemplo de llamada al módulo (en el `main.tf` raíz):

```hcl
module "cococash_wallet" {
  source      = "./cococash-wallet/terraform"
  providers   = { aws = aws }

  project_name    = "cococash-wallet"
  vpc_id          = module.cococash_infra.vpc_id
  # Subnet privada 1 para ECS Fargate
  service_subnet_id = module.cococash_infra.private_subnet_id_1
  service_port    = 3000
  allowed_cidr    = "0.0.0.0/0"

  # --- Base de datos dentro del mismo módulo ---
  # Subnet privada 2 para RDS
  db_subnet_id   = module.cococash_infra.private_subnet_id_2
  db_name        = "cococash_wallet_db"
  db_username    = "cocouser"
  db_password    = "<secure>" # buscar en secret manager o variable segura
  db_port        = 5432
}
```

Modifica y extiende este módulo para añadir ECS/EKS/Lambda, roles, task definitions
y cualquier otro recurso necesario para tu despliegue.
