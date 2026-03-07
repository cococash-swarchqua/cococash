# -----------------------------------------------
# CocoCash API Gateway Module
# Amazon API Gateway HTTP (v2) → ALB (wallet-ms)
# -----------------------------------------------

locals {
  project_name = "cococash"
}

# -----------------------------------------------
# Variables (passed from root module)
# -----------------------------------------------
variable "vpc_id" {
  type        = string
  description = "VPC ID for VPC Link"
}

variable "private_app_subnet_id_1" {
  type        = string
  description = "Private app subnet AZ1 (for VPC Link)"
}

variable "private_app_subnet_id_2" {
  type        = string
  description = "Private app subnet AZ2 (for VPC Link)"
}

variable "wallet_alb_listener_arn" {
  type        = string
  description = "Wallet ALB HTTP listener ARN"
}

variable "wallet_alb_dns" {
  type        = string
  description = "Wallet ALB DNS name"
}

variable "wallet_alb_sg_id" {
  type        = string
  description = "Wallet ALB security group ID"
}

variable "cognito_user_pool_endpoint" {
  type        = string
  description = "Cognito User Pool endpoint for JWT issuer"
}

variable "cognito_app_client_id" {
  type        = string
  description = "Cognito App Client ID for JWT audience"
}

variable "register_lambda_invoke_arn" {
  type        = string
  description = "Register Lambda invoke ARN"
}

variable "register_lambda_function_name" {
  type        = string
  description = "Register Lambda function name"
}

variable "login_lambda_invoke_arn" {
  type        = string
  description = "Login Lambda invoke ARN"
}

variable "login_lambda_function_name" {
  type        = string
  description = "Login Lambda function name"
}

# -----------------------------------------------
# Security Group for VPC Link
# -----------------------------------------------
resource "aws_security_group" "api_gw_vpc_link" {
  name        = "${local.project_name}-apigw-vpclink-sg"
  description = "Security group for API Gateway VPC Link"
  vpc_id      = var.vpc_id

  egress {
    description     = "Allow traffic to ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [var.wallet_alb_sg_id]
  }

  tags = {
    Project   = "cococash"
    Component = "api-gateway"
  }
}

# Allow ALB to receive traffic from VPC Link SG
resource "aws_security_group_rule" "alb_from_vpclink" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.api_gw_vpc_link.id
  security_group_id        = var.wallet_alb_sg_id
  description              = "Allow API Gateway VPC Link traffic"
}

# -----------------------------------------------
# VPC Link - Private connectivity to ALB
# -----------------------------------------------
resource "aws_apigatewayv2_vpc_link" "wallet" {
  name               = "${local.project_name}-wallet-vpclink"
  subnet_ids         = [var.private_app_subnet_id_1, var.private_app_subnet_id_2]
  security_group_ids = [aws_security_group.api_gw_vpc_link.id]

  tags = {
    Project   = "cococash"
    Component = "api-gateway"
  }
}

# -----------------------------------------------
# API Gateway HTTP API
# -----------------------------------------------
resource "aws_apigatewayv2_api" "cococash" {
  name          = "${local.project_name}-api"
  protocol_type = "HTTP"
  description   = "CocoCash API Gateway - Wallet MS routes"

  cors_configuration {
    allow_headers = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 3600
  }

  tags = {
    Project   = "cococash"
    Component = "api-gateway"
  }
}

# -----------------------------------------------
# Integration - ALB via VPC Link
# -----------------------------------------------
resource "aws_apigatewayv2_integration" "wallet_alb" {
  api_id             = aws_apigatewayv2_api.cococash.id
  integration_type   = "HTTP_PROXY"
  integration_uri    = var.wallet_alb_listener_arn
  integration_method = "ANY"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.wallet.id

  payload_format_version = "1.0"

  description = "Forward to Wallet ALB via VPC Link"
}

# -----------------------------------------------
# JWT Authorizer - Cognito
# -----------------------------------------------
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.cococash.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.project_name}-cognito-authorizer"

  jwt_configuration {
    audience = [var.cognito_app_client_id]
    issuer   = "https://${var.cognito_user_pool_endpoint}"
  }
}

# -----------------------------------------------
# Integration - Register Lambda
# -----------------------------------------------
resource "aws_apigatewayv2_integration" "register_lambda" {
  api_id                 = aws_apigatewayv2_api.cococash.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.register_lambda_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  description            = "Forward to Register Lambda"
}

# -----------------------------------------------
# Integration - Login Lambda
# -----------------------------------------------
resource "aws_apigatewayv2_integration" "login_lambda" {
  api_id                 = aws_apigatewayv2_api.cococash.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.login_lambda_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  description            = "Forward to Login Lambda"
}

# -----------------------------------------------
# Lambda Permissions (allow API Gateway to invoke)
# -----------------------------------------------
resource "aws_lambda_permission" "apigw_register" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.register_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.cococash.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_login" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.login_lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.cococash.execution_arn}/*/*"
}

# -----------------------------------------------
# Routes - Auth (NO JWT - public endpoints)
# -----------------------------------------------

# POST /v1/auth/register → Register Lambda
resource "aws_apigatewayv2_route" "auth_register" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "POST /v1/auth/register"
  target    = "integrations/${aws_apigatewayv2_integration.register_lambda.id}"
}

# POST /v1/auth/login → Login Lambda
resource "aws_apigatewayv2_route" "auth_login" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "POST /v1/auth/login"
  target    = "integrations/${aws_apigatewayv2_integration.login_lambda.id}"
}

# -----------------------------------------------
# Route - Internal account creation (used by Register Lambda)
# -----------------------------------------------
resource "aws_apigatewayv2_route" "post_accounts_internal" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "POST /v1/accounts/internal"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"
}

# -----------------------------------------------
# Routes - Transfers
# -----------------------------------------------

# POST /v1/transfers
resource "aws_apigatewayv2_route" "post_transfers" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "POST /v1/transfers"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# GET /v1/transfers/{transferId}
resource "aws_apigatewayv2_route" "get_transfer_by_id" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "GET /v1/transfers/{transferId}"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# GET /v1/transfers/account/{accountId}
resource "aws_apigatewayv2_route" "get_transfers_by_account" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "GET /v1/transfers/account/{accountId}"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# -----------------------------------------------
# Routes - Accounts
# -----------------------------------------------

# POST /v1/accounts
resource "aws_apigatewayv2_route" "post_accounts" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "POST /v1/accounts"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# GET /v1/accounts/{accountId}/balance
resource "aws_apigatewayv2_route" "get_account_balance" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "GET /v1/accounts/{accountId}/balance"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# GET /v1/accounts/user/{userId}
resource "aws_apigatewayv2_route" "get_account_by_user" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "GET /v1/accounts/user/{userId}"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# -----------------------------------------------
# Route - Health Check (pass-through)
# -----------------------------------------------
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.cococash.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_alb.id}"
}

# -----------------------------------------------
# Stage - Default ($default auto-deploy)
# -----------------------------------------------
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.cococash.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  tags = {
    Project   = "cococash"
    Component = "api-gateway"
  }
}

# -----------------------------------------------
# CloudWatch Log Group for API Gateway
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "api_gw" {
  name              = "/apigateway/${local.project_name}-api"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "api-gateway"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "api_gateway_url" {
  value       = aws_apigatewayv2_api.cococash.api_endpoint
  description = "API Gateway invoke URL"
}

output "api_gateway_id" {
  value       = aws_apigatewayv2_api.cococash.id
  description = "API Gateway ID"
}
