# CocoCash Infrastructure Outputs

# Wallet Service
output "rds_endpoint" {
  value       = module.cococash_wallet_infra.rds_endpoint
  description = "RDS PostgreSQL endpoint"
}

output "rds_port" {
  value       = module.cococash_wallet_infra.rds_port
  description = "RDS PostgreSQL port"
}

output "wallet_alb_dns" {
  value       = module.cococash_wallet_infra.wallet_alb_dns
  description = "Wallet ALB DNS name"
}

output "sns_transfer_topic_arn" {
  value       = module.cococash_wallet_infra.sns_transfer_topic_arn
  description = "SNS Transfer Events Topic ARN"
}

output "sns_account_topic_arn" {
  value       = module.cococash_wallet_infra.sns_account_topic_arn
  description = "SNS Account Events Topic ARN"
}

output "sqs_transfer_queue_url" {
  value       = module.cococash_wallet_infra.sqs_transfer_queue_url
  description = "SQS Transfer Queue URL"
}

# Transaction Service
output "dynamodb_table_name" {
  value       = module.cococash_transaction_infra.dynamodb_table_name
  description = "DynamoDB transactions table name"
}

# API Gateway
output "api_gateway_url" {
  value       = module.cococash_api_gateway.api_gateway_url
  description = "API Gateway invoke URL"
}

# Cognito
output "cognito_user_pool_id" {
  value       = module.cococash_auth.user_pool_id
  description = "Cognito User Pool ID"
}

output "cognito_user_pool_client_id" {
  value       = module.cococash_auth.user_pool_client_id
  description = "Cognito User Pool Client ID"
}

# Frontend
output "wfe_alb_dns" {
  value       = module.cococash_wfe.wfe_alb_dns
  description = "Frontend ALB DNS name (public URL)"
}
