# CLAUDE.md

## Project overview

A Fastify-based reverse proxy that sits in front of the Helius Solana RPC API. It handles both HTTP JSON-RPC requests and WebSocket connections, injects an API key server-side, and enforces CORS. Deployed to GCP Cloud Run via GitHub Actions + Terraform.

## Tech stack

- **Runtime**: Node.js ≥ 20, ESM modules (`"type": "module"`)
- **Framework**: Fastify 5 with `@fastify/websocket`
- **Language**: TypeScript 5, strict mode, target `es2022`, `NodeNext` module resolution
- **Tests**: Vitest (`tests/` directory, run with `npm test`)
- **Infrastructure**: Terraform (GCP Cloud Run + Artifact Registry + Secret Manager)
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`) — pushes to `dev` deploy to dev, pushes to `main` deploy to prod

## Commands

```bash
npm run dev    # tsx watch — hot reload during development
npm run build  # tsc — compile to dist/
npm start      # node dist/index.js — run compiled output
npm test       # vitest run — run all tests once
```

## Project structure

```
src/
  index.ts                  # App entry: registers plugins and routes
  plugins/
    cors.ts                 # Custom CORS plugin (fastify-plugin wrapped)
  routes/
    helius/
      index.ts              # Route plugin: registers HTTP + WS handlers
      rpc.ts                # HTTP RPC proxy handler
      websocket.ts          # WebSocket proxy handler
tests/
  cors.test.ts
  rpc.test.ts
terraform/
  main.tf                   # Cloud Run, Secret Manager, Artifact Registry
  variables.tf
  outputs.tf
  versions.tf
  environments/
    dev.tfvars
    prod.tfvars
```

## Key conventions

- **Imports use `.js` extensions** even for `.ts` source files (required by NodeNext module resolution)
- **Plugins** use `fastify-plugin` (`fp(...)`) so decorations/hooks scope to the parent instance
- **Plugin registration order** in `index.ts` matters: `redis` must come before `rateLimit` since `rateLimit` reads `fastify.redis`
- **Route plugins** registered with `{ prefix: '/helius' }` from `src/index.ts`
- **Raw body passthrough**: the helius route plugin registers a custom content-type parser that passes the raw string body to avoid re-serialization during proxying
- **No `@fastify/cors`** — CORS is handled by a hand-rolled plugin in `src/plugins/cors.ts`

## Environment variables

| Variable            | Description                                              |
|---------------------|----------------------------------------------------------|
| `HELIUS_API_KEY`    | Injected into all upstream Helius requests               |
| `CORS_ALLOW_ORIGIN` | Comma-separated allowlist of origins; omit for wildcard `*` |
| `REDIS_HOST`        | Memorystore Redis host IP (set by Terraform)             |
| `PORT`              | Server port (default: `3000`)                            |

`HELIUS_API_KEY` and `CORS_ALLOW_ORIGIN` are sourced from GCP Secret Manager. `REDIS_HOST` is a plain env var set directly by Terraform from the Memorystore instance output.

## Routing logic

- `POST /helius/` → proxied to `https://mainnet.helius-rpc.com/?api-key=...`
- `POST /helius/*` → proxied to `https://api.helius.xyz/<subpath>?api-key=...`
- `GET /helius/` (WebSocket upgrade) → proxied to `wss://mainnet.helius-rpc.com/?api-key=...`

## WebSocket proxy details

- Buffers up to 10 client messages while the upstream connection is opening (10 s timeout)
- Sends a `helius_keepalive` JSON-RPC message to the upstream every 20 s
- Forwards subprotocols from the client handshake to the upstream

## Deployment

- **Branch `dev`** → dev GCP project (secrets suffixed `_DEV` in GitHub)
- **Branch `main`** → prod GCP project (secrets with no suffix)
- Docker image built and pushed to GCP Artifact Registry, then deployed via `terraform apply`
- Terraform state stored in GCS; bucket must be created before first run (see `docs/gcp_project_setup.md`)
