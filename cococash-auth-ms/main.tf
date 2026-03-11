# -----------------------------------------------
# CocoCash Auth MS — Amazon Cognito
# User Pool + App Client (SRP auth, email login)
# -----------------------------------------------

locals {
  project_name = "cococash"
}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "frontend_url" {
  type        = string
  description = "Frontend URL for Cognito callback (not used for SRP but good practice)"
  default     = "*"
}

# -----------------------------------------------
# Cognito User Pool
# -----------------------------------------------
resource "aws_cognito_user_pool" "cococash" {
  name = "${local.project_name}-user-pool"

  # Sign-in: email only (no username)
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Email verification
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "CocoCash - Código de verificación"
    email_message        = "Tu código de verificación de CocoCash es: {####}"
  }

  # Schema: email required
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Schema: name (preferred_username mapped to display name)
  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Account recovery via email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Project   = "cococash"
    Component = "auth"
  }
}

# -----------------------------------------------
# Cognito User Pool Client (SRP — for frontend)
# -----------------------------------------------
resource "aws_cognito_user_pool_client" "frontend" {
  name         = "${local.project_name}-frontend-client"
  user_pool_id = aws_cognito_user_pool.cococash.id

  # SRP (Secure Remote Password) — no client secret
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors (security)
  prevent_user_existence_errors = "ENABLED"

  supported_identity_providers = ["COGNITO"]
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "user_pool_id" {
  value       = aws_cognito_user_pool.cococash.id
  description = "Cognito User Pool ID"
}

output "user_pool_arn" {
  value       = aws_cognito_user_pool.cococash.arn
  description = "Cognito User Pool ARN"
}

output "user_pool_endpoint" {
  value       = aws_cognito_user_pool.cococash.endpoint
  description = "Cognito User Pool endpoint"
}

output "user_pool_client_id" {
  value       = aws_cognito_user_pool_client.frontend.id
  description = "Cognito User Pool Client ID (frontend)"
}
