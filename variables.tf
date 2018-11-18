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
