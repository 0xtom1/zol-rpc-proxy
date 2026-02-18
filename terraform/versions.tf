terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0"
    }
  }

  # Partial backend config — bucket is supplied at init time via -backend-config.
  # Create the GCS bucket manually before the first `terraform init`, then run:
  #   terraform init -backend-config="bucket=YOUR_TF_STATE_BUCKET" \
  #                  -backend-config="prefix=helius-rpc-proxy/dev"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
