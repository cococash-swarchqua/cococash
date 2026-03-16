# -----------------------------------------------
# CocoCash Reports Infrastructure Module
# EventBridge Scheduler + SNS Topics + SQS Queues
# (S3 bucket lives in cococash-pdf-maker module)
# -----------------------------------------------

locals {
  project_name = "cococash"
}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "get_accounts_lambda_arn" {
  type        = string
  description = "ARN of the get-accounts Lambda function"
}

variable "get_accounts_lambda_function_name" {
  type        = string
  description = "Name of the get-accounts Lambda function"
}

# -----------------------------------------------
# EventBridge Rule — Monthly Trigger (cococash-trigger)
# Fires on the 1st day of each month at 00:00 UTC
# NOTE: aws_cloudwatch_event_rule IS the Terraform 
# resource for Amazon EventBridge (legacy resource name)
# -----------------------------------------------
resource "aws_cloudwatch_event_rule" "monthly_report" {
  name                = "${local.project_name}-monthly-report-trigger"
  description         = "Triggers monthly report generation on the 1st of each month"
  schedule_expression = "cron(0 0 1 * ? *)"

  tags = {
    Project   = "cococash"
    Component = "reports-trigger"
  }
}

resource "aws_cloudwatch_event_target" "invoke_get_accounts" {
  rule      = aws_cloudwatch_event_rule.monthly_report.name
  target_id = "InvokeGetAccountsLambda"
  arn       = var.get_accounts_lambda_arn

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 3
  }
}

# Allow EventBridge to invoke the get-accounts Lambda
resource "aws_lambda_permission" "eventbridge_invoke_get_accounts" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.get_accounts_lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly_report.arn
}

# -----------------------------------------------
# SNS Topic — Report User Batches
# Receives batches of ~100 account IDs from get-accounts
# -----------------------------------------------
resource "aws_sns_topic" "report_users" {
  name = "${local.project_name}-report-users-topic"

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

# -----------------------------------------------
# SQS Queue — Report User Batches (consumed by transaction-ms)
# -----------------------------------------------
resource "aws_sqs_queue" "report_users_dlq" {
  name                      = "${local.project_name}-report-users-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

resource "aws_sqs_queue" "report_users_queue" {
  name                       = "${local.project_name}-report-users-queue"
  visibility_timeout_seconds = 300     # 5 min — accounts for processing time per batch
  message_retention_seconds  = 345600  # 4 days
  receive_wait_time_seconds  = 20      # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_users_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

# SQS Policy — Allow SNS to publish to report-users-queue
resource "aws_sqs_queue_policy" "report_users_queue_policy" {
  queue_url = aws_sqs_queue.report_users_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSPublish"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.report_users_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.report_users.arn
          }
        }
      }
    ]
  })
}

# SNS → SQS Subscription
resource "aws_sns_topic_subscription" "report_users_to_sqs" {
  topic_arn = aws_sns_topic.report_users.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.report_users_queue.arn
}

# -----------------------------------------------
# SNS Topic — Consolidated Transaction Data
# Receives per-user transaction data from transaction-ms
# -----------------------------------------------
resource "aws_sns_topic" "report_txns" {
  name = "${local.project_name}-report-txns-topic"

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

# -----------------------------------------------
# SQS Queue — Consolidated Txns (consumed by pdf-maker Lambda)
# -----------------------------------------------
resource "aws_sqs_queue" "report_txns_dlq" {
  name                      = "${local.project_name}-report-txns-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

resource "aws_sqs_queue" "report_txns_queue" {
  name                       = "${local.project_name}-report-txns-queue"
  visibility_timeout_seconds = 900     # 15 min — matches Lambda max timeout
  message_retention_seconds  = 345600  # 4 days
  receive_wait_time_seconds  = 20      # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.report_txns_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Project   = "cococash"
    Component = "reports-event-bus"
  }
}

# SQS Policy — Allow SNS to publish to report-txns-queue
resource "aws_sqs_queue_policy" "report_txns_queue_policy" {
  queue_url = aws_sqs_queue.report_txns_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSNSPublish"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.report_txns_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.report_txns.arn
          }
        }
      }
    ]
  })
}

# SNS → SQS Subscription
resource "aws_sns_topic_subscription" "report_txns_to_sqs" {
  topic_arn = aws_sns_topic.report_txns.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.report_txns_queue.arn
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "sns_report_users_topic_arn" {
  value       = aws_sns_topic.report_users.arn
  description = "ARN of the report users SNS topic"
}

output "sqs_report_users_queue_url" {
  value       = aws_sqs_queue.report_users_queue.url
  description = "URL of the report users SQS queue"
}

output "sqs_report_users_queue_arn" {
  value       = aws_sqs_queue.report_users_queue.arn
  description = "ARN of the report users SQS queue"
}

output "sns_report_txns_topic_arn" {
  value       = aws_sns_topic.report_txns.arn
  description = "ARN of the report transactions SNS topic"
}

output "sqs_report_txns_queue_url" {
  value       = aws_sqs_queue.report_txns_queue.url
  description = "URL of the report transactions SQS queue"
}

output "sqs_report_txns_queue_arn" {
  value       = aws_sqs_queue.report_txns_queue.arn
  description = "ARN of the report transactions SQS queue"
}
