# ---------------------------------------------------------------------------
# Project APIs
# ---------------------------------------------------------------------------

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "helius_api_key" {
  secret_id = "helius-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "helius_api_key" {
  secret      = google_secret_manager_secret.helius_api_key.id
  secret_data = var.helius_api_key
}

resource "google_secret_manager_secret" "cors_allow_origin" {
  secret_id = "cors-allow-origin"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "cors_allow_origin" {
  secret      = google_secret_manager_secret.cors_allow_origin.id
  secret_data = var.cors_allow_origin
}

# ---------------------------------------------------------------------------
# Cloud Run runtime service account
# ---------------------------------------------------------------------------

resource "google_service_account" "cloud_run" {
  account_id   = "wallet-api-runtime"
  display_name = "Wallet API Cloud Run Runtime SA"

  depends_on = [google_project_service.iam]
}

# Grant the runtime SA read access to both secrets
resource "google_secret_manager_secret_iam_member" "cloud_run_helius_api_key" {
  secret_id = google_secret_manager_secret.helius_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_cors_allow_origin" {
  secret_id = google_secret_manager_secret.cors_allow_origin.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run service
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name                = "wallet-api"
  location            = var.region
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run.email

    containers {
      image = var.image

      ports {
        container_port = 3000
      }

      env {
        name = "HELIUS_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.helius_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CORS_ALLOW_ORIGIN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.cors_allow_origin.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.run,
    google_secret_manager_secret_version.helius_api_key,
    google_secret_manager_secret_version.cors_allow_origin,
    google_secret_manager_secret_iam_member.cloud_run_helius_api_key,
    google_secret_manager_secret_iam_member.cloud_run_cors_allow_origin,
  ]

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# Allow unauthenticated invocations (public API)
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
