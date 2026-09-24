# Environment Variables

All env vars are set in Vercel secrets (production) and `.env` (local development).

## Database
```
DATABASE_URL=postgresql://user:pass@host/db
PGHOST=
POSTGRES_USER=
POSTGRES_PASSWORD=
# RLS Phase E — the app's tenant pool DSN (the non-BYPASSRLS `app_tenant` role).
# When set, src/lib/db.ts routes withTenantTransaction/tenantQuery through this
# pool so Postgres RLS is genuinely enforced (the GUC app.current_org gates every
# row). UNSET (default today) → the app connects as the owner (BYPASSRLS) and RLS
# is inert; the explicit org predicates + guards are the only protection. Flip this
# on ONLY after the app_tenant role + grants are live (HUMAN GATE #5,
# src/lib/migrations/2026-06-21_app_tenant_role.sql.template).
TENANT_APP_DATABASE_URL=
```

## Realtime & Caching
```
ABLY_API_KEY=           # Ably realtime
QSTASH_TOKEN=           # Upstash QStash job scheduling
KV_REST_API_TOKEN=      # Upstash Redis cache
```

## Motion+ (private npm registry)
```
MOTION_TOKEN=           # Motion+ access token — required at install time for motion-plus / @motionplus/*
```
Used by committed `.npmrc` (`${MOTION_TOKEN}`). Set in Vercel (Production + Preview + Development)
and CI secrets. pnpm/npm do **not** load `.env` for `.npmrc` substitution — export in the shell
(or direnv) before local `pnpm install`. Token: https://motion.dev/dashboard/tokens

## eBay Integration
```
EBAY_APP_ID=
EBAY_CERT_ID=
EBAY_REFRESH_TOKEN_*=   # Per-account tokens
```

## Zoho Inventory
```
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_ORG_ID=
```

## Google Sheets
```
GOOGLE_PRIVATE_KEY=
GOOGLE_CLIENT_EMAIL=
```

## Shipping Carriers
```
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
CONSUMER_KEY=           # USPS
CONSUMER_SECRET=        # USPS
```

## Ecwid / Square
```
ECWID_STORE_ID=
ECWID_API_TOKEN=
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
```

## File Storage
```
BLOB_READ_WRITE_TOKEN=  # Vercel Blob
```

## Photos platform (GCS catalog — docs/photos-platform-plan.md)

Primary photo bytes land in Google Cloud Storage; Neon holds the catalog (`photos`, `photo_entity_links`, `photo_storage`).

**Platform fallback (orgs without `photo_storage_providers` row):**
```
PHOTOS_GCS_BUCKET=usav-photos-dev          # use usav-photos-prod in production
PHOTOS_GCS_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS_JSON=       # full service-account JSON, single line
PHOTOS_DEFAULT_PROVIDER=gcs
PHOTOS_UPLOAD_PROVIDER=adapter             # adapter | legacy — legacy keeps NAS/Blob capture paths
PHOTOS_SIGNED_URL_TTL_SECONDS=3600
PHOTOS_SHARE_DEFAULT_TTL_DAYS=30
PHOTOS_THUMB_MAX_PX=256
PHOTOS_UPLOAD_MAX_BYTES=8388608            # 8 MB
PHOTOS_VIDEO_MAX_BYTES=524288000          # 500 MB default — entity videos (POST /api/photos/upload/video)
PHOTOS_NAS_MIRROR_AFTER_DAYS=90          # future NAS cold-mirror cron
NEXT_PUBLIC_PHOTOS_UPLOAD_PROVIDER=adapter
PHOTOS_ANALYZE_ENABLED=false
PHOTOS_ANALYZE_ON_UPLOAD=false
PHOTOS_ANALYZE_PROVIDER=hermes          # hermes (default) | vision | catalog
PHOTOS_JOB_MAX_ATTEMPTS=5
```

**Client:** when `NEXT_PUBLIC_PHOTOS_UPLOAD_PROVIDER=adapter`, mobile/desktop capture POSTs multipart to `/api/photos/upload` instead of NAS WebDAV PUT + URL attach.

**Analysis (opt-in):** set `PHOTOS_ANALYZE_ENABLED=true` to process `photo_jobs` via cron. Default provider is **Hermes** (`HERMES_API_URL`) — no GCP Vision required. Set `PHOTOS_ANALYZE_PROVIDER=vision` only if you want Cloud Vision OCR instead. Cron: `/api/cron/photos/analyze`.

**NAS cold mirror:** `/api/cron/photos/nas-mirror` runs daily; requires `NAS_AGENT_URL` + `NAS_AGENT_TOKEN` (or `NAS_DEV_ROOT` locally).

**Legacy URL attach:** `POST /api/receiving-photos` with `photoUrl` still works for NAS picker flows but returns a `Deprecation` header — prefer `POST /api/photos/upload`.

**Video (entity videos):** `POST /api/photos/upload/video` signs a direct-to-GCS PUT (same bucket, `{org}/videos/{entity flow}/…`), then `POST /api/photos/upload/video/{id}/finalize` checks the stored object. GCS-only (503 when `isGcsConfigured()` is false). The browser PUT needs a bucket CORS rule allowing `PUT` with `content-type` + `x-goog-content-length-range` from the app origin.

## NAS (Synology — receiving / shipping photos)

Storage lives on the **Synology NAS**, mounted on the office Mac at `/Volumes/USAV Media`.
The NAS Media Agent (`deploy/nas-media-agent/`) runs on that Mac behind the
`nas-photos.michaelgarisek.com` tunnel. Vercel never touches the LAN directly.

**Vercel (production / preview):**
```
# Photo read/write proxy upstream — the Cloudflare tunnel ROOT that serves browse + WebDAV
# (NOT /_agent/file/receiving unless that agent route is actually mounted)
NAS_RW_URL=https://nas-photos.michaelgarisek.com
NAS_RW_TOKEN=           # Optional; only if the tunnel requires x-agent-token
NAS_AGENT_URL=https://nas-photos.michaelgarisek.com/_agent
NAS_AGENT_TOKEN=        # Same secret as NAS Media Agent (Zendesk archive, agent APIs)
```

**Office Mac (agent process):**
```
# Optional bootstrap defaults — Admin → NAS Photos → Workflow folders is the live source of truth.
# NAS_ROOT_* are used only until the agent receives PUT /roots from Vercel after an admin save.
NAS_ROOT_RECEIVING="/Volumes/USAV Media/Puchasing photos/2026"
NAS_ROOT_SHIPPING="/Volumes/Shipping/2026"
NAS_ROOT_CLAIMS="/Volumes/USAV Media/Puchasing photos/2026/2 Zendesk 2026"
NAS_AGENT_TOKEN=
NAS_AGENT_PORT=8787
```

**Local dev** (Synology share must be mounted):
```
NAS_DEV_ROOT="/Volumes/USAV Media/Puchasing photos/2026"
NAS_RW_URL=http://localhost:3000/api/nas-dev
```

**Admin UI** (per org, not env vars): Admin → NAS Photos
- `nasPhotoServers` — active tunnel base URL (`https://nas-photos.michaelgarisek.com`)
- `nasStorageTargets` — workflow mount roots (`receiving`, `shipping`, `claims`) and subfolders
- `stationNasPhotoFolders` — month subfolder per station (e.g. `JUN 2026`)

See `deploy/nas-media-agent/README.md` and `docs/nas-receiving-write-tunnel-plan.md`.

## AI
```
OLLAMA_BASE_URL=
HERMES_API_URL=         # Production/preview: https://hermes.michaelgarisek.com/v1
HERMES_API_KEY=         # Server-only bearer expected by Hermes gateway
HERMES_MODEL=           # Usually hermes-agent
CLOUDFLARE_ACCESS_CLIENT_ID=      # Optional if Cloudflare Access protects Hermes
CLOUDFLARE_ACCESS_CLIENT_SECRET=  # Optional if Cloudflare Access protects Hermes
AI_CHAT_RATE_LIMIT=
```

## App Config
```
NEXT_PUBLIC_APP_URL=    # Base URL for the app
```

## Authentication
```
AUTH_PINLESS_SIGNIN=    # true/1/on/yes → empty PIN signs an active staff in by name (org-scoped since org-login-gate wave 1). Rollout only; OFF in prod.
AUTH_V2_ENABLED=        # Edge session gate: unset/shadow = log-only, true = enforce (src/proxy.ts).
DEFAULT_TENANT_SLUG=    # Apex-host tenant bridge for the dogfood DNS cutover. Set to one org slug (e.g. usav) so the apex host resolves to it; EMPTY = apex → nil org (fail-closed, no staff/PIN leak). Read by src/lib/tenancy/resolve-org-from-request.ts. Blank in prod apex.
AUTH_DUAL_WRITE_LEGACY_SID=  # (wave 4) true → also write legacy usav_sid cookie during cf_sid migration. Default off (clear-legacy-on-touch).
```

## Platform social login (Google / Microsoft — NOT Drive/Gmail)
Separate OAuth clients from the tenant Google Drive / PO Gmail integration — request only `openid email profile`.
Read by `src/lib/auth/platform-oauth.ts`; buttons appear on /signin only when the client id+secret are set.
```
GOOGLE_OAUTH_CLIENT_ID=      # Platform "Continue with Google" client (Google Cloud OAuth 2.0 Web client)
GOOGLE_OAUTH_CLIENT_SECRET=  #
GOOGLE_OAUTH_REDIRECT_URI=   # Optional; blank → derived as {origin}/api/auth/oauth/google/callback
MICROSOFT_OAUTH_CLIENT_ID=       # Platform "Continue with Microsoft" (Entra ID app registration)
MICROSOFT_OAUTH_CLIENT_SECRET=   #
MICROSOFT_OAUTH_REDIRECT_URI=    # Optional; blank → derived as {origin}/api/auth/oauth/microsoft/callback
MICROSOFT_OAUTH_TENANT=          # Optional; default "common" (multi-tenant)
```

## Cycle Forge — agentic loop (forge runs, master-plan sync, Neon verify)
```
FORGE_INGEST_TOKEN=     # Shared secret for POST /api/forge/ingest + /api/forge/master-plan/sync (header x-forge-token)
FORGE_ORG_ID=           # Tenant UUID stamped on ingested runs / machine sync (defaults to USAV org #1)
FORGE_APP_URL=          # Base URL for machine scripts (master-plan-set-status → ops-plans sync); falls back to NEXT_PUBLIC_APP_URL
MASTER_PLAN_PATH=       # MDX path watched by master-plan-sync-daemon.mjs (default <repo>/master-plan.mdx)
MASTER_PLAN_ORG_ID=     # Org for the org:{uuid}:forge:master-plan channel (falls back to FORGE_ORG_ID)
NEON_API_KEY=           # Neon Control Plane key — Phase 4 ephemeral verify branches only
NEON_PROJECT_ID=        # Neon project owning the verify branches (already in .env.example)
FORGE_NEON_VERIFY=      # =1 → forge.sh VERIFY runs on an ephemeral Neon branch (never prod)
```

Staff home for the projected plan is **Operations ▸ Plans** (`/operations?mode=plans`);
`/forge` redirects to the Live console for the bridged plan. Machine status flips
call `POST /api/forge/master-plan/sync` so Neon `ops_plans*` refresh without a viewer.

The sync daemon (`.cycle_forge_ops/scripts/master-plan-sync-daemon.mjs`, PM2 app
`master-plan-sync`) publishes with the server `ABLY_API_KEY` — the key never
reaches the browser; web clients get scoped tokens from `/api/realtime/token`.
Agent VERIFY (Phase 4) must run against an ephemeral Neon branch connection
string minted with `NEON_API_KEY`, never the production `DATABASE_URL`.
NOTE: mirror any new vars here into `.env.example` by hand — a repo hook blocks
automated edits to env files.

## Post-Deploy
After deploying, bootstrap QStash schedules:
```
POST /api/qstash/schedules/bootstrap
```
