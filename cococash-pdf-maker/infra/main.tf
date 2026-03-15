# -----------------------------------------------
# CocoCash PDF Maker Lambda Infrastructure
# Generates PDF reports and stores them in S3
# S3 bucket (cococash-pdf-odb) lives here following
# the pattern of DB-in-microservice module
# -----------------------------------------------

locals {
  service_name = "cococash-pdf-maker"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "sqs_report_txns_queue_arn" {
  type        = string
  description = "ARN of the report transactions SQS queue"
}

variable "sqs_report_txns_queue_url" {
  type        = string
  description = "URL of the report transactions SQS queue (for reference)"
}

# -----------------------------------------------
# S3 Bucket — cococash-pdf-odb (report storage)
# -----------------------------------------------
resource "aws_s3_bucket" "pdf_odb" {
  bucket        = "cococash-pdf-odb-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Project   = "cococash"
    Component = "pdf-odb"
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "pdf_odb" {
  bucket = aws_s3_bucket.pdf_odb.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption (SSE-S3)
resource "aws_s3_bucket_server_side_encryption_configuration" "pdf_odb" {
  bucket = aws_s3_bucket.pdf_odb.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle rules: Standard → Standard-IA (90d) → Glacier (365d)
resource "aws_s3_bucket_lifecycle_configuration" "pdf_odb" {
  bucket = aws_s3_bucket.pdf_odb.id

  rule {
    id     = "report-lifecycle"
    status = "Enabled"

    filter {
      prefix = "reportes/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

# -----------------------------------------------
# IAM Role for PDF Maker Lambda
# -----------------------------------------------
resource "aws_iam_role" "pdf_maker_lambda" {
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
    Component = "pdf-maker"
  }
}

# CloudWatch Logs
resource "aws_iam_role_policy_attachment" "pdf_maker_basic_execution" {
  role       = aws_iam_role.pdf_maker_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# S3 PutObject + SQS consume
resource "aws_iam_role_policy" "pdf_maker_permissions" {
  name = "${local.service_name}-permissions"
  role = aws_iam_role.pdf_maker_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = [
          "${aws_s3_bucket.pdf_odb.arn}/reportes/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [var.sqs_report_txns_queue_arn]
      }
    ]
  })
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "pdf_maker" {
  name              = "/aws/lambda/${local.service_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "pdf-maker"
  }
}

# -----------------------------------------------
# Lambda Function
# -----------------------------------------------
resource "aws_lambda_function" "pdf_maker" {
  function_name = local.service_name
  role          = aws_iam_role.pdf_maker_lambda.arn
  handler       = "bootstrap"
  runtime       = "provided.al2023"
  timeout       = 900  # 15 minutes
  memory_size   = 256

  # Placeholder — will be replaced by CI/CD or manual zip upload
  filename         = "${path.module}/bootstrap.zip"
  source_code_hash = filebase64sha256("${path.module}/bootstrap.zip")

  environment {
    variables = {
      S3_BUCKET_NAME = aws_s3_bucket.pdf_odb.bucket
    }
  }

  depends_on = [aws_cloudwatch_log_group.pdf_maker]

  tags = {
    Project   = "cococash"
    Component = "pdf-maker"
  }
}

# -----------------------------------------------
# SQS Event Source Mapping → Lambda
# -----------------------------------------------
resource "aws_lambda_event_source_mapping" "report_txns_to_pdf_maker" {
  event_source_arn = var.sqs_report_txns_queue_arn
  function_name    = aws_lambda_function.pdf_maker.arn
  batch_size       = 1  # 1 message per invocation (each PDF can take time)
  enabled          = true

  maximum_batching_window_in_seconds = 5
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "s3_bucket_name" {
  value       = aws_s3_bucket.pdf_odb.bucket
  description = "S3 bucket name for PDF reports"
}

output "s3_bucket_arn" {
  value       = aws_s3_bucket.pdf_odb.arn
  description = "S3 bucket ARN for PDF reports"
}

output "lambda_arn" {
  value       = aws_lambda_function.pdf_maker.arn
  description = "PDF Maker Lambda ARN"
}
