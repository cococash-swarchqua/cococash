# -----------------------------------------------
# CocoCash Auth - Login Lambda
# Cognito Authentication → Return JWT tokens
# -----------------------------------------------

locals {
  function_name = "cococash-auth-login"
}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "cognito_app_client_id" {
  type        = string
  description = "Cognito App Client ID"
}

# -----------------------------------------------
# IAM Role for Lambda
# -----------------------------------------------
resource "aws_iam_role" "login_lambda" {
  name = "${local.function_name}-role"

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
    Component = "auth-login"
  }
}

resource "aws_iam_role_policy_attachment" "login_lambda_logs" {
  role       = aws_iam_role.login_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# -----------------------------------------------
# Lambda Source Code (zipped for upload)
# AWS SDK v3 is pre-installed in nodejs20.x runtime
# -----------------------------------------------
data "archive_file" "login_lambda" {
  type        = "zip"
  output_path = "${path.module}/login_lambda.zip"

  source {
    content  = <<-EOF
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({});
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "email y password son requeridos",
        }),
      };
    }

    const response = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      })
    );

    const result = response.AuthenticationResult;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: result.AccessToken,
          idToken: result.IdToken,
          refreshToken: result.RefreshToken,
          expiresIn: result.ExpiresIn,
          tokenType: result.TokenType,
        },
      }),
    };
  } catch (error) {
    console.error("Login error:", error);

    let statusCode = 500;
    let message = error.message;

    switch (error.name) {
      case "NotAuthorizedException":
        statusCode = 401;
        message = "Email o contraseña incorrectos";
        break;
      case "UserNotFoundException":
        statusCode = 401;
        message = "Email o contraseña incorrectos";
        break;
      case "UserNotConfirmedException":
        statusCode = 403;
        message = "La cuenta no ha sido verificada";
        break;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: message,
      }),
    };
  }
};
EOF
    filename = "index.mjs"
  }
}

# -----------------------------------------------
# Lambda Function
# -----------------------------------------------
resource "aws_lambda_function" "login" {
  function_name = local.function_name
  role          = aws_iam_role.login_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 15
  memory_size   = 256

  filename         = data.archive_file.login_lambda.output_path
  source_code_hash = data.archive_file.login_lambda.output_base64sha256

  environment {
    variables = {
      COGNITO_CLIENT_ID = var.cognito_app_client_id
    }
  }

  tags = {
    Project   = "cococash"
    Component = "auth-login"
  }
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "login_lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "auth-login"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "lambda_function_name" {
  value = aws_lambda_function.login.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.login.arn
}

output "lambda_invoke_arn" {
  value = aws_lambda_function.login.invoke_arn
}
