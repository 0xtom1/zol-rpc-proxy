# GCP Project Setup Guide

This guide covers how to set up a new GCP project for the Helius RPC Proxy. Each environment (production and development) needs its own GCP project with completely separate infrastructure.

## Architecture

Each GCP project has its own:
- Terraform state bucket (`{project-id}-terraform-state`)
- Artifact Registry (`wallet-api`)
- Cloud Run service
- Secret Manager secrets (`helius-api-key`, `cors-allow-origin`)
- Cloud Run runtime service account
- Workload Identity Federation pool (for GitHub Actions)

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed and configured
- GitHub repository access

## Step 1: Create GCP Project

```bash
# For production
gcloud projects create wallet-backend-prod --name="Wallet API"

# For development
gcloud projects create wallet-backend-dev --name="Wallet API Dev"
```

Link billing account in the GCP Console.

## Step 2: Enable Required APIs

Run this for each project:

```bash
# Set your project (replace with your project ID)
export PROJECT_ID="YOUR_PROJECT_ID"  # e.g. wallet-backend-dev or wallet-backend-prod

gcloud config set project $PROJECT_ID

gcloud services enable \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project=$PROJECT_ID
```

**Wait 2–3 minutes** after enabling APIs before proceeding.

## Step 3: Set Up Workload Identity Federation

This allows GitHub Actions to authenticate to GCP without using service account keys.

```bash
# Set variables
export PROJECT_ID="YOUR_PROJECT_ID"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export GITHUB_ORG="0xtom1"
export GITHUB_REPO="zol-rpc-proxy"

# 1. Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 2. Create OIDC Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == '${GITHUB_ORG}/${GITHUB_REPO}'"

# 3. Create the GitHub Actions service account
gcloud iam service-accounts create "github-actions-sa" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions Service Account"

# 4. Grant permissions to the service account
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/editor"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# roles/run.admin is needed for Terraform to set the allUsers invoker policy on Cloud Run
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"


# 5. Allow GitHub Actions to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"
```

## Step 4: Get Values for GitHub Secrets

```bash
# GCP_WORKLOAD_IDENTITY_PROVIDER (or GCP_WORKLOAD_IDENTITY_PROVIDER_DEV)
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"

# GCP_SERVICE_ACCOUNT (or GCP_SERVICE_ACCOUNT_DEV)
echo "github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

## Step 5: Create Terraform State Bucket

```bash
export BUCKET_NAME="${PROJECT_ID}-terraform-state"

gsutil mb -p $PROJECT_ID -l us-central1 gs://$BUCKET_NAME
gsutil versioning set on gs://$BUCKET_NAME

echo "TF_STATE_BUCKET = $BUCKET_NAME"
```

## Step 6: Add GitHub Secrets

Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**

### For Production (`main` branch)

| Secret Name | Value |
|-------------|-------|
| `GCP_PROJECT_ID` | `wallet-backend-prod` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Output from Step 4 |
| `GCP_SERVICE_ACCOUNT` | `github-actions-sa@wallet-backend-prod.iam.gserviceaccount.com` |
| `HELIUS_API_KEY` | Your production Helius API key |
| `CORS_ALLOW_ORIGIN` | e.g. `https://yourapp.com` or `*` |
| `TF_STATE_BUCKET` | `wallet-backend-prod-terraform-state` |

### For Development (`dev` branch)

| Secret Name | Value |
|-------------|-------|
| `GCP_PROJECT_ID_DEV` | `wallet-backend-dev` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_DEV` | Output from Step 4 (dev project) |
| `GCP_SERVICE_ACCOUNT_DEV` | `github-actions-sa@wallet-backend-dev.iam.gserviceaccount.com` |
| `HELIUS_API_KEY_DEV` | Your dev Helius API key |
| `CORS_ALLOW_ORIGIN_DEV` | e.g. `*` |
| `TF_STATE_BUCKET_DEV` | `wallet-backend-dev-terraform-state` |

## Step 7: Deploy

Push to the appropriate branch — Terraform runs in CI and creates all remaining infrastructure (Artifact Registry, Cloud Run, Secret Manager, etc.) automatically.

```bash
# Deploy to dev
git push origin dev

# Deploy to production
git push origin main
```

## Troubleshooting

### "Cloud Resource Manager API has not been used"

```bash
gcloud services enable cloudresourcemanager.googleapis.com --project=$PROJECT_ID
```

Wait 2–3 minutes and retry.

### "Identity and Access Management (IAM) API has not been used"

```bash
gcloud services enable iam.googleapis.com --project=$PROJECT_ID
```

### "IAM Service Account Credentials API has not been used"

```bash
gcloud services enable iamcredentials.googleapis.com --project=$PROJECT_ID
```

### "Unable to acquire impersonated credentials"

Check that:
1. The service account email is correctly formatted (full email address)
2. The Workload Identity User binding is set up correctly (Step 3, item 5)
3. The `attribute_condition` matches your GitHub org and repo exactly

### "Permission denied on run.services.setIamPolicy"

The service account needs `roles/run.admin` (Step 3, item 4). Terraform uses this to make the Cloud Run service publicly accessible.

### "Artifact Registry repository already exists"

If the repo was created outside Terraform and now conflicts with Terraform state:

```bash
cd terraform
terraform state rm google_artifact_registry_repository.api
```

Then re-import it:

```bash
terraform import google_artifact_registry_repository.api \
  projects/YOUR_PROJECT_ID/locations/us-central1/repositories/wallet-api
```
