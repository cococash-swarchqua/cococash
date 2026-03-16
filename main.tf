module "cococash_infra" {
  source = "./cococash-infra"

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

  # Report pipeline integration
  sqs_report_users_queue_url = module.cococash_reports_infra.sqs_report_users_queue_url
  sqs_report_users_queue_arn = module.cococash_reports_infra.sqs_report_users_queue_arn
  sns_report_txns_topic_arn  = module.cococash_reports_infra.sns_report_txns_topic_arn

  providers = {
    aws = aws
  }
}

# -----------------------------------------------
# Report Generation Pipeline
# -----------------------------------------------

# Get Accounts Lambda (triggered by EventBridge)
module "cococash_get_accounts" {
  source = "./cococash-get-accounts/infra"

  api_gateway_url            = module.cococash_api_gateway.api_gateway_url
  sns_report_users_topic_arn = module.cococash_reports_infra.sns_report_users_topic_arn
  api_gateway_id             = module.cococash_api_gateway.api_gateway_id

  providers = {
    aws = aws
  }
}

# PDF Maker Lambda + S3 Bucket (triggered by SQS)
module "cococash_pdf_maker" {
  source = "./cococash-pdf-maker/infra"

  sqs_report_txns_queue_arn = module.cococash_reports_infra.sqs_report_txns_queue_arn
  sqs_report_txns_queue_url = module.cococash_reports_infra.sqs_report_txns_queue_url

  providers = {
    aws = aws
  }
}

# Link Generator Lambda (invoked by API Gateway)
module "cococash_link_generator" {
  source = "./cococash-link-generator/infra"

  s3_bucket_name = module.cococash_pdf_maker.s3_bucket_name
  s3_bucket_arn  = module.cococash_pdf_maker.s3_bucket_arn

  providers = {
    aws = aws
  }
}

# Reports Infrastructure (EventBridge, SNS, SQS)
module "cococash_reports_infra" {
  source = "./cococash-reports-infra"

  get_accounts_lambda_arn           = module.cococash_get_accounts.lambda_arn
  get_accounts_lambda_function_name = module.cococash_get_accounts.lambda_function_name

  providers = {
    aws = aws
  }
}

# API Gateway (HTTP API v2)
module "cococash_api_gateway" {
  source = "./cococash-ag"

  vpc_id                  = module.cococash_infra.vpc_id
  private_app_subnet_id_1 = module.cococash_infra.private_app_subnet_id_1
  private_app_subnet_id_2 = module.cococash_infra.private_app_subnet_id_2
  wallet_alb_listener_arn = module.cococash_wallet_infra.wallet_alb_listener_arn
  wallet_alb_dns          = module.cococash_wallet_infra.wallet_alb_dns
  wallet_alb_sg_id        = module.cococash_wallet_infra.wallet_alb_sg_id

  # Cognito integration
  cognito_user_pool_arn       = module.cococash_auth.user_pool_arn
  cognito_user_pool_client_id = module.cococash_auth.user_pool_client_id
  cognito_user_pool_endpoint  = module.cococash_auth.user_pool_endpoint

  # Link Generator Lambda integration
  link_generator_lambda_invoke_arn    = module.cococash_link_generator.lambda_invoke_arn
  link_generator_lambda_function_name = module.cococash_link_generator.lambda_function_name

  providers = {
    aws = aws
  }
}

# Frontend Infrastructure (ECS Fargate + ALB)
module "cococash_wfe" {
  source = "./cococash-wfe/infra"

  vpc_id              = module.cococash_infra.vpc_id
  public_subnet_id_1  = module.cococash_infra.public_subnet_id_1
  public_subnet_id_2  = module.cococash_infra.public_subnet_id_2
  private_app_subnet_id_1 = module.cococash_infra.private_app_subnet_id_1
  private_app_subnet_id_2 = module.cococash_infra.private_app_subnet_id_2
  ecs_cluster_id      = module.cococash_wallet_infra.ecs_cluster_id
  ecs_task_execution_role_arn = module.cococash_wallet_infra.ecs_task_execution_role_arn
  api_gateway_url     = module.cococash_api_gateway.api_gateway_url
  cognito_user_pool_id    = module.cococash_auth.user_pool_id
  cognito_client_id       = module.cococash_auth.user_pool_client_id

  providers = {
    aws = aws
  }
}