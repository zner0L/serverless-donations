variable "name" {
  type        = "string"
  default     = "serverless-checkoutportal-donation"
  description = "A name for your serverless-checkoutportal-donation instance. This is primarily necessary if you want to run multiple instances alongside one another."
}

variable "checkoutportal_customerId" {
  description = "Your Checkoutportal customerId. You can find it in your Checkoutportal backend."
}

variable "checkoutportal_secret" {
  description = "The secret for the Checkoutportal API. You can find it in your Checkoutportal backend."
}

variable "cors_allowed_origin" {
  description = "The value for the `Access-Control-Allow-Origin` header. Can only be a single origin or wildcard."
}

variable "paysafe_apiEndpoint" {
  description = "The API endpoint to initiate and collect payments with paysafecards at. Add a trailing slash."
}

variable "paysafe_apiKey" {
  description = "The API key provided for you by paysafe."
}

variable "base_url" {
  description = "The base url of the API. Add a trailing slash."
}

variable "mollie_apiKey" {
  description = "The API key provied by mollie."
}
