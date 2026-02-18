variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev or prod)"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be 'dev' or 'prod'."
  }
}

variable "image" {
  description = "Full Artifact Registry image path including tag (e.g. us-central1-docker.pkg.dev/PROJECT/wallet-api/wallet-api:SHA)"
  type        = string
}

variable "helius_api_key" {
  description = "Helius API key stored in GCP Secret Manager"
  type        = string
  sensitive   = true
}

variable "cors_allow_origin" {
  description = "Allowed CORS origins, comma-separated. Defaults to wildcard."
  type        = string
  default     = "*"
}
