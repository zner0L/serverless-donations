output "base_url" {
  value = "${aws_api_gateway_deployment.api.invoke_url}"
}

output "api_id" {
  value = "${aws_api_gateway_rest_api.api.id}"
}

output "iam_role" {
  value = "${data.aws_iam_policy_document.lambda_assume_role.json}"
}
