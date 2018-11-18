data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

module "lambda_zip" {
  source = "github.com/baltpeter/terraform-package-lambda"
  code   = "${path.module}/lambda/index.js"
}

// AWS Lambda

//> postDonation

resource "aws_lambda_function" "post_donation" {
  filename         = "${module.lambda_zip.output_filename}"
  source_code_hash = "${module.lambda_zip.output_base64sha256}"
  function_name    = "post_donation"
  handler          = "index.postDonation"
  role             = "${aws_iam_role.lambda_exec.arn}"
  runtime          = "nodejs8.10"
  timeout          = 5

  environment {
    variables = {
      CUSTOMER_ID         = "${var.checkoutportal_customerId}"
      SECRET              = "${var.checkoutportal_secret}"
      CORS_ALLOWED_ORIGIN = "${var.cors_allowed_origin}"
      PAYSAFE_API         = "${var.paysafe_apiEndpoint}"
      PAYSAFE_API_KEY     = "${var.paysafe_apiKey}"
      BASE_URL            = "${var.base_url}"
    }
  }
}

resource "aws_lambda_permission" "post_donation" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.post_donation.arn}"
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_deployment.api.execution_arn}/*/*"
}

//> captureDonation

resource "aws_lambda_function" "capture_donation" {
  filename         = "${module.lambda_zip.output_filename}"
  source_code_hash = "${module.lambda_zip.output_base64sha256}"
  function_name    = "capture_donation"
  handler          = "index.captureDonation"
  role             = "${aws_iam_role.lambda_exec.arn}"
  runtime          = "nodejs8.10"
  timeout          = 5

  environment {
    variables = {
      CORS_ALLOWED_ORIGIN = "${var.cors_allowed_origin}"
      PAYSAFE_API         = "${var.paysafe_apiEndpoint}"
      PAYSAFE_API_KEY     = "${var.paysafe_apiKey}"
    }
  }
}

resource "aws_lambda_permission" "capture_donation" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.capture_donation.arn}"
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_deployment.api.execution_arn}/*/*"
}

// AWS API Gateway

resource "aws_api_gateway_rest_api" "api" {
  name = "${var.name}"
}

resource "aws_api_gateway_deployment" "api" {
  depends_on = [
    "aws_api_gateway_integration.post_donation",
    "aws_api_gateway_integration.capture_donation",
  ]

  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  stage_name  = "test"
}

//> postDonation

resource "aws_api_gateway_method" "post_donation" {
  rest_api_id   = "${aws_api_gateway_rest_api.api.id}"
  resource_id   = "${aws_api_gateway_rest_api.api.root_resource_id}"
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "post_donation" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  resource_id = "${aws_api_gateway_method.post_donation.resource_id}"
  http_method = "${aws_api_gateway_method.post_donation.http_method}"
  type        = "AWS_PROXY"

  integration_http_method = "POST"
  uri                     = "${aws_lambda_function.post_donation.invoke_arn}"
}

//>> postDonation CORS

module "post_donation_cors" {
  source  = "github.com/squidfunk/terraform-aws-api-gateway-enable-cors"
  version = "0.1.0"

  api_id          = "${aws_api_gateway_rest_api.api.id}"
  api_resource_id = "${aws_api_gateway_method.post_donation.resource_id}"
  allowed_origin  = "${var.cors_allowed_origin}"
}

resource "aws_api_gateway_method_response" "post_donation_response" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  resource_id = "${aws_api_gateway_method.post_donation.resource_id}"
  http_method = "${aws_api_gateway_method.post_donation.http_method}"
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  depends_on = ["module.post_donation_cors"]
}

//> captureDonation

resource "aws_api_gateway_resource" "pre_capture_donation" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  parent_id   = "${aws_api_gateway_rest_api.api.root_resource_id}"
  path_part   = "capture"
}

resource "aws_api_gateway_resource" "capture_donation" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  parent_id   = "${aws_api_gateway_resource.pre_capture_donation.id}"
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "capture_donation" {
  rest_api_id   = "${aws_api_gateway_rest_api.api.id}"
  resource_id   = "${aws_api_gateway_resource.capture_donation.id}"
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "capture_donation" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  resource_id = "${aws_api_gateway_method.capture_donation.resource_id}"
  http_method = "${aws_api_gateway_method.capture_donation.http_method}"
  type        = "AWS_PROXY"

  integration_http_method = "POST"
  uri                     = "${aws_lambda_function.capture_donation.invoke_arn}"
}

//>> captureDonation CORS

module "capture_donation_cors" {
  source  = "github.com/squidfunk/terraform-aws-api-gateway-enable-cors"
  version = "0.1.0"

  api_id          = "${aws_api_gateway_rest_api.api.id}"
  api_resource_id = "${aws_api_gateway_method.capture_donation.resource_id}"
  allowed_origin  = "${var.cors_allowed_origin}"
}

resource "aws_api_gateway_method_response" "capture_donation_response" {
  rest_api_id = "${aws_api_gateway_rest_api.api.id}"
  resource_id = "${aws_api_gateway_method.capture_donation.resource_id}"
  http_method = "${aws_api_gateway_method.capture_donation.http_method}"
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  depends_on = ["module.capture_donation_cors"]
}

// AWS IAM roles

resource "aws_iam_role" "lambda_exec" {
  name               = "lambda_exec"
  assume_role_policy = "${data.aws_iam_policy_document.lambda_assume_role.json}"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
