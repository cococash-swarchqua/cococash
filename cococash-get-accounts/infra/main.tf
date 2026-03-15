# -----------------------------------------------
# CocoCash Get Accounts Lambda Infrastructure
# Fetches active accounts and publishes batches to SNS
# -----------------------------------------------

locals {
  service_name = "cococash-get-accounts"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "api_gateway_url" {
  type        = string
  description = "API Gateway invoke URL"
}

variable "sns_report_users_topic_arn" {
  type        = string
  description = "ARN of the SNS topic for report user batches"
}

variable "api_gateway_id" {
  type        = string
  description = "API Gateway ID for IAM permissions"
}

# -----------------------------------------------
# IAM Role for Lambda
# -----------------------------------------------
resource "aws_iam_role" "get_accounts_lambda" {
  name = "${local.service_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Project   = "cococash"
    Component = "get-accounts"
  }
}

# CloudWatch Logs
resource "aws_iam_role_policy_attachment" "get_accounts_basic_execution" {
  role       = aws_iam_role.get_accounts_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SNS Publish + API Gateway Invoke
resource "aws_iam_role_policy" "get_accounts_permissions" {
  name = "${local.service_name}-permissions"
  role = aws_iam_role.get_accounts_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = [var.sns_report_users_topic_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["execute-api:Invoke"]
        Resource = [
          "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${var.api_gateway_id}/*"
        ]
      }
    ]
  })
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "get_accounts" {
  name              = "/aws/lambda/${local.service_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "get-accounts"
  }
}

# -----------------------------------------------
# Lambda Function
# -----------------------------------------------
resource "aws_lambda_function" "get_accounts" {
  function_name = local.service_name
  role          = aws_iam_role.get_accounts_lambda.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  timeout       = 900 # 15 minutes (max Lambda timeout)
  memory_size   = 128

  # Placeholder — will be replaced by CI/CD or manual zip upload
  filename         = "${path.module}/bootstrap.zip"
  source_code_hash = filebase64sha256("${path.module}/bootstrap.zip")

  environment {
    variables = {
      API_GATEWAY_URL               = var.api_gateway_url
      SNS_REPORT_USERS_TOPIC_ARN    = var.sns_report_users_topic_arn
      AWS_REGION_OVERRIDE           = "us-east-1"
    }
  }

  depends_on = [aws_cloudwatch_log_group.get_accounts]

  tags = {
    Project   = "cococash"
    Component = "get-accounts"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "lambda_arn" {
  value       = aws_lambda_function.get_accounts.arn
  description = "Get Accounts Lambda ARN"
}

output "lambda_function_name" {
  value       = aws_lambda_function.get_accounts.function_name
  description = "Get Accounts Lambda function name"
}
