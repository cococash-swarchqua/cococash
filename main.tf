module "cococash_infra" {
  source = "./cococash-infra"

  providers = {
    aws = aws
  }
}

# Wallet Service Infrastructure (ECS Fargate, SNS, SQS, RDS)
module "cococash_wallet_infra" {
  source = "./cococash-wallet-ms/infra"

  vpc_id                   = module.cococash_infra.vpc_id
  private_app_subnet_id_1  = module.cococash_infra.private_app_subnet_id_1
  private_app_subnet_id_2  = module.cococash_infra.private_app_subnet_id_2
  private_data_subnet_id_1 = module.cococash_infra.private_data_subnet_id_1
  private_data_subnet_id_2 = module.cococash_infra.private_data_subnet_id_2
  public_subnet_id_1       = module.cococash_infra.public_subnet_id_1
  public_subnet_id_2       = module.cococash_infra.public_subnet_id_2
  db_password              = var.db_password

  providers = {
    aws = aws
  }
}

# Transaction Service Infrastructure (ECS Fargate, DynamoDB)
module "cococash_transaction_infra" {
  source = "./cococash-transaction-ms/infra"

  vpc_id                         = module.cococash_infra.vpc_id
  private_app_subnet_id_1        = module.cococash_infra.private_app_subnet_id_1
  private_app_subnet_id_2        = module.cococash_infra.private_app_subnet_id_2
  ecs_cluster_id                 = module.cococash_wallet_infra.ecs_cluster_id
  ecs_task_execution_role_arn    = module.cococash_wallet_infra.ecs_task_execution_role_arn
  sqs_transaction_audit_queue_url = module.cococash_wallet_infra.sqs_transaction_audit_queue_url
  sqs_transaction_audit_queue_arn = module.cococash_wallet_infra.sqs_transaction_audit_queue_arn

  providers = {
    aws = aws
  }
}

# Auth Service (Cognito User Pool)
module "cococash_auth" {
  source = "./cococash-auth-ms"

  providers = {
    aws = aws
  }
}

# Auth - Register Lambda
module "cococash_auth_register" {
  source = "./cococash-auth-ms/cococash-auth-ms-register"

  cognito_user_pool_id  = module.cococash_auth.user_pool_id
  cognito_app_client_id = module.cococash_auth.app_client_id
  api_gateway_url       = module.cococash_api_gateway.api_gateway_url

  providers = {
    aws = aws
  }
}

# Auth - Login Lambda
module "cococash_auth_login" {
  source = "./cococash-auth-ms/cococash-auth-ms-login"

  cognito_app_client_id = module.cococash_auth.app_client_id

  providers = {
    aws = aws
  }
}

# API Gateway (HTTP API v2)
module "cococash_api_gateway" {
  source = "./cococash-ag"

  vpc_id                     = module.cococash_infra.vpc_id
  private_app_subnet_id_1    = module.cococash_infra.private_app_subnet_id_1
  private_app_subnet_id_2    = module.cococash_infra.private_app_subnet_id_2
  wallet_alb_listener_arn    = module.cococash_wallet_infra.wallet_alb_listener_arn
  wallet_alb_dns             = module.cococash_wallet_infra.wallet_alb_dns
  wallet_alb_sg_id           = module.cococash_wallet_infra.wallet_alb_sg_id
  cognito_user_pool_endpoint = module.cococash_auth.user_pool_endpoint
  cognito_app_client_id      = module.cococash_auth.app_client_id

  # Lambda integrations
  register_lambda_invoke_arn    = module.cococash_auth_register.lambda_invoke_arn
  register_lambda_function_name = module.cococash_auth_register.lambda_function_name
  login_lambda_invoke_arn       = module.cococash_auth_login.lambda_invoke_arn
  login_lambda_function_name    = module.cococash_auth_login.lambda_function_name

  providers = {
    aws = aws
  }
}