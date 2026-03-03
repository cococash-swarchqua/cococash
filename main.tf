module "cococash_infra" {
  source = "./cococash-infra"

  providers = {
    aws = aws
  }
}

module "cococash_wallet" {
  source    = "./cococash-wallet/terraform"
  providers = { aws = aws }

  # Pasa aquí los valores reales de tu entorno
  project_name = "cococash-wallet"
  # vpc_id proveniente del módulo de infra principal
  vpc_id = module.cococash_infra.vpc_id
  # Subnet privada 1 para ECS Fargate
  service_subnet_id = module.cococash_infra.private_subnet_id_1
  service_port = 3000
  allowed_cidr = "0.0.0.0/0"

  # Configuración de la BD (subnet privada 2)
  db_subnet_id = module.cococash_infra.private_subnet_id_2
  db_name      = "cococash_wallet_db"
  db_username  = "cocouser"
  db_password  = "" # REPLACE with a secure secret (do not commit)
  db_port      = 5432
}