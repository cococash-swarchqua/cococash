# -----------------------------------------------
# CocoCash Auth - Register Lambda
# Cognito SignUp → Create Wallet → Rollback on failure
# -----------------------------------------------

locals {
  function_name = "cococash-auth-register"
}

# -----------------------------------------------
# Variables
# -----------------------------------------------
variable "cognito_user_pool_id" {
  type        = string
  description = "Cognito User Pool ID"
}

variable "cognito_app_client_id" {
  type        = string
  description = "Cognito App Client ID"
}

variable "api_gateway_url" {
  type        = string
  description = "API Gateway invoke URL (for POST /v1/accounts)"
}

# -----------------------------------------------
# IAM Role for Lambda
# -----------------------------------------------
resource "aws_iam_role" "register_lambda" {
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
    Component = "auth-register"
  }
}

resource "aws_iam_role_policy_attachment" "register_lambda_logs" {
  role       = aws_iam_role.register_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Cognito permissions (SignUp + AdminConfirmSignUp + AdminDeleteUser for rollback)
resource "aws_iam_role_policy" "register_cognito" {
  name = "${local.function_name}-cognito-policy"
  role = aws_iam_role.register_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:SignUp",
        "cognito-idp:AdminConfirmSignUp",
        "cognito-idp:AdminDeleteUser"
      ]
      Resource = "arn:aws:cognito-idp:*:*:userpool/${var.cognito_user_pool_id}"
    }]
  })
}

# -----------------------------------------------
# Lambda Source Code (zipped for upload)
# AWS SDK v3 is pre-installed in nodejs20.x runtime
# -----------------------------------------------
data "archive_file" "register_lambda" {
  type        = "zip"
  output_path = "${path.module}/register_lambda.zip"

  source {
    content  = <<-EOF
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  let cognitoUsername = null;

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, password, givenName, familyName, phoneNumber,
            documentType, documentNumber, birthdate } = body;

    if (!email || !password || !givenName || !familyName || !phoneNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Campos requeridos: email, password, givenName, familyName, phoneNumber",
        }),
      };
    }

    // 1. Registrar usuario en Cognito
    const userAttributes = [
      { Name: "email", Value: email },
      { Name: "given_name", Value: givenName },
      { Name: "family_name", Value: familyName },
      { Name: "phone_number", Value: phoneNumber },
    ];

    if (documentType) userAttributes.push({ Name: "custom:document_type", Value: documentType });
    if (documentNumber) userAttributes.push({ Name: "custom:document_number", Value: documentNumber });
    if (birthdate) userAttributes.push({ Name: "custom:birthdate", Value: birthdate });

    const signUpResponse = await cognitoClient.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: userAttributes,
      })
    );

    const userSub = signUpResponse.UserSub;
    cognitoUsername = email;

    // 2. Auto-confirmar usuario
    await cognitoClient.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
      })
    );

    // 3. Crear wallet en wallet-ms via API Gateway
    const accountResponse = await fetch(
      API_GATEWAY_URL + "/v1/accounts/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userSub,
          initialBalance: 100000,
        }),
      }
    );

    const accountData = await accountResponse.json();

    if (!accountResponse.ok) {
      console.error("Error creating wallet, rolling back Cognito user:", accountData);

      // ROLLBACK: Eliminar usuario de Cognito
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
        })
      );

      console.log("Cognito user deleted successfully (rollback complete)");

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Error al crear la wallet. El registro fue revertido, intente nuevamente.",
        }),
      };
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          userSub,
          confirmed: true,
          account: accountData.data,
          message: "Usuario registrado y wallet creada exitosamente",
        },
      }),
    };
  } catch (error) {
    console.error("Register error:", error);

    // Si el usuario ya se creó en Cognito pero falló algo después, hacer rollback
    if (cognitoUsername && error.name !== "UsernameExistsException") {
      try {
        console.log("Attempting rollback: deleting Cognito user", cognitoUsername);
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
          })
        );
        console.log("Rollback successful: Cognito user deleted");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
    }

    const statusCode = error.name === "UsernameExistsException" ? 409 : 500;
    const message = error.name === "UsernameExistsException"
      ? "El email ya esta registrado"
      : error.message;

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
resource "aws_lambda_function" "register" {
  function_name = local.function_name
  role          = aws_iam_role.register_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.register_lambda.output_path
  source_code_hash = data.archive_file.register_lambda.output_base64sha256

  environment {
    variables = {
      COGNITO_USER_POOL_ID = var.cognito_user_pool_id
      COGNITO_CLIENT_ID    = var.cognito_app_client_id
      API_GATEWAY_URL      = var.api_gateway_url
    }
  }

  tags = {
    Project   = "cococash"
    Component = "auth-register"
  }
}

# -----------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------
resource "aws_cloudwatch_log_group" "register_lambda" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 7

  tags = {
    Project   = "cococash"
    Component = "auth-register"
  }
}

# -----------------------------------------------
# Outputs
# -----------------------------------------------
output "lambda_function_name" {
  value = aws_lambda_function.register.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.register.arn
}

output "lambda_invoke_arn" {
  value = aws_lambda_function.register.invoke_arn
}
