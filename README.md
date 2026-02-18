# Zol RPC Proxy

A Node.js proxy server for [Helius](https://helius.xyz) RPC and API endpoints. Keeps your Helius API key off the client by forwarding requests server-side. Deployed to GCP Cloud Run via Terraform and GitHub Actions.

Supports both JSON-RPC over HTTP and WebSocket.

---

## API Endpoints

All endpoints are prefixed with `/helius`.

### `POST /helius`

Proxies JSON-RPC requests to Helius mainnet.

**Upstream:** `https://mainnet.helius-rpc.com`

```bash
curl -X POST https://YOUR_SERVICE_URL/helius \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

---

### `POST /helius/{path}`

Proxies requests to the Helius REST API. Any subpath after `/helius` is forwarded as-is.

**Upstream:** `https://api.helius.xyz/{path}`

```bash
# Example: enhanced transactions
curl -X POST https://YOUR_SERVICE_URL/helius/v0/transactions \
  -H "Content-Type: application/json" \
  -d '{"transactions":["your_tx_signature"]}'
```

---

### `GET /helius` (WebSocket)

Proxies WebSocket connections to Helius mainnet. Connect with any standard WebSocket client.

**Upstream:** `wss://mainnet.helius-rpc.com`

```js
const ws = new WebSocket('wss://YOUR_SERVICE_URL/helius')

ws.onopen = () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'accountSubscribe',
    params: ['YOUR_ACCOUNT_ADDRESS']
  }))
}

ws.onmessage = (event) => console.log(event.data)
```

WebSocket features:
- Message buffering (up to 10 messages, 10s timeout) while the upstream connection opens
- Keepalive ping every 20s to prevent idle disconnects
- Subprotocol negotiation passthrough
- Bidirectional forwarding with full cleanup on close/error

---

### `OPTIONS *`

CORS preflight handler — returns `200` with appropriate headers on all routes.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HELIUS_API_KEY` | Yes | — | Your Helius API key |
| `CORS_ALLOW_ORIGIN` | No | `*` | Comma-separated list of allowed origins. Defaults to wildcard. |
| `PORT` | No | `3000` | Port the server listens on |

To restrict CORS to specific domains:
```
CORS_ALLOW_ORIGIN=https://yourapp.com,https://beta.yourapp.com
```

---

## Local Development

Requires the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension and Docker Desktop.

1. Open the repo in VS Code and select **Reopen in Container**
2. The container includes Node.js 20, Terraform, and Docker-in-Docker
3. `npm install` runs automatically on container start

Copy `.env.example` to `.env` and fill in your key:

```bash
cp .env.example .env
```

Start the dev server:

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

---

## Deployment

Infrastructure is managed with Terraform and deployed via GitHub Actions on push to `dev` or `main`.

| Branch | Environment |
|--------|-------------|
| `dev` | GCP project `wallet-backend-dev` |
| `main` | GCP project `wallet-backend-prod` |

See [`docs/gcp_project_setup.md`](docs/gcp_project_setup.md) for the one-time GCP and Workload Identity Federation bootstrap steps.

### GCP Infrastructure (managed by Terraform)

- **Cloud Run** — hosts the container, scales to zero
- **Secret Manager** — stores `HELIUS_API_KEY` and `CORS_ALLOW_ORIGIN`
- **Artifact Registry** — Docker image storage (created by the workflow on first run)
- **Service Account** — runtime identity for Cloud Run with least-privilege secret access

### Manual deploy

```bash
cd terraform

terraform init \
  -backend-config="bucket=YOUR_TF_STATE_BUCKET" \
  -backend-config="prefix=helius-rpc-proxy/dev"

terraform apply \
  -var-file="environments/dev.tfvars" \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="image=us-central1-docker.pkg.dev/YOUR_PROJECT/wallet-api/wallet-api:latest" \
  -var="helius_api_key=YOUR_KEY"
```

---

## Project Structure

```
src/
├── index.ts                  # Fastify app entry point
├── plugins/
│   └── cors.ts               # CORS plugin (reads CORS_ALLOW_ORIGIN)
└── routes/
    └── helius/
        ├── index.ts          # Registers HTTP + WebSocket routes
        ├── rpc.ts            # HTTP proxy handler
        └── websocket.ts      # WebSocket proxy handler
terraform/
├── main.tf                   # Cloud Run, Secret Manager, IAM
├── variables.tf
├── outputs.tf
├── versions.tf
└── environments/
    ├── dev.tfvars
    └── prod.tfvars
.github/workflows/
├── deploy.yml                # Build, push, terraform apply
└── pr-checks.yml             # tsc, docker build, tf fmt/validate
docs/
└── gcp_project_setup.md      # GCP + WIF bootstrap guide
```
