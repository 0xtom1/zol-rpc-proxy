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

resource "google_project_service" "redis" {
  service            = "redis.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "vpcaccess" {
  service            = "vpcaccess.googleapis.com"
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Serverless VPC Access connector (lets Cloud Run reach Memorystore)
# ---------------------------------------------------------------------------

resource "google_vpc_access_connector" "connector" {
  name          = "wallet-api-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = "default"

  depends_on = [google_project_service.vpcaccess]
}

# ---------------------------------------------------------------------------
# Memorystore Redis (rate limiting + future response caching)
# ---------------------------------------------------------------------------

resource "google_redis_instance" "cache" {
  name           = "wallet-api-cache"
  tier           = "BASIC"
  memory_size_gb = var.redis_memory_size_gb
  region         = var.region
  redis_version  = "REDIS_7_0"

  depends_on = [google_project_service.redis]
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

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

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

      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.cache.host
      }
    }
  }

  depends_on = [
    google_project_service.run,
    google_secret_manager_secret_version.helius_api_key,
    google_secret_manager_secret_version.cors_allow_origin,
    google_secret_manager_secret_iam_member.cloud_run_helius_api_key,
    google_secret_manager_secret_iam_member.cloud_run_cors_allow_origin,
    google_vpc_access_connector.connector,
    google_redis_instance.cache,
  ]

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# Allow unauthenticated invocations (public API)
# Uses --no-invoker-iam-check instead of allUsers IAM binding to avoid
# org policy restrictions on Domain Restricted Sharing
resource "null_resource" "allow_unauthenticated" {
  triggers = {
    image = var.image
  }

  provisioner "local-exec" {
    command = "gcloud run services update ${google_cloud_run_v2_service.api.name} --region=${var.region} --project=${var.project_id} --no-invoker-iam-check"
  }

  depends_on = [google_cloud_run_v2_service.api]
}
