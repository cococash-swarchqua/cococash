# -----------------------------------------------
# CocoCash Auth Module - Amazon Cognito
# User Pool + App Client for JWT authentication
# -----------------------------------------------

locals {
  project_name = "cococash"
}

# -----------------------------------------------
# Cognito User Pool
# -----------------------------------------------
resource "aws_cognito_user_pool" "cococash" {
  name = "${local.project_name}-user-pool"

  # ---- Sign-in configuration ----
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # ---- Password policy ----
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # ---- Required attributes (set at sign-up) ----
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  schema {
    name                = "given_name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  schema {
    name                = "family_name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  schema {
    name                = "phone_number"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 10
      max_length = 15
    }
  }

  # ---- Optional custom attributes ----
  schema {
    name                = "document_type"
    attribute_data_type = "String"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 2
      max_length = 10
    }
  }

  schema {
    name                = "document_number"
    attribute_data_type = "String"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 5
      max_length = 20
    }
  }

  schema {
    name                = "birthdate"
    attribute_data_type = "String"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 10
      max_length = 10
    }
  }

  # ---- Email verification ----
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "CocoCash - Código de verificación"
    email_message        = "Tu código de verificación para CocoCash es: {####}"
  }

  # ---- Account recovery ----
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # ---- MFA (optional, can be enforced later) ----
  mfa_configuration = "OFF"

  tags = {
    Project   = "cococash"
    Component = "auth"
  }
}

# -----------------------------------------------
# Cognito User Pool Client (for frontend / API)
# -----------------------------------------------
resource "aws_cognito_user_pool_client" "cococash_app" {
  name         = "${local.project_name}-app-client"
  user_pool_id = aws_cognito_user_pool.cococash.id

  # No secret for public SPA / mobile clients
  generate_secret = false

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Token validity
  access_token_validity  = 1   # 1 hour
  id_token_validity      = 1   # 1 hour
  refresh_token_validity = 30  # 30 days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors (security best practice)
  prevent_user_existence_errors = "ENABLED"

  # Readable/writable attributes
  read_attributes = [
    "email",
    "given_name",
    "family_name",
    "phone_number",
    "custom:document_type",
    "custom:document_number",
    "birthdate"
  ]

  write_attributes = [
    "email",
    "given_name",
    "family_name",
    "phone_number",
    "custom:document_type",
    "custom:document_number",
    "birthdate"
  ]
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

output "app_client_id" {
  value       = aws_cognito_user_pool_client.cococash_app.id
  description = "Cognito App Client ID"
}
