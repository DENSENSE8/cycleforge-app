# QA Org Playbook

Dedicated sandbox tenant for feature validation, sellability checks, and E2E — **not** USAV dogfood data.

## Quick start

```bash
# 1. Ensure global roles exist (one-time)
node scripts/seed-roles.mjs

# 2. Provision the QA org (idempotent — safe to re-run)
pnpm provision:qa-org

# 3. Sign in at /signin with email+password (lands in CycleForge QA Sandbox, org …0002)
```

## Identity

| Field | Value |
|-------|-------|
| Org ID | `00000000-0000-0000-0000-000000000002` (`QA_ORG_ID`) |
| Slug | `cycleforge-qa` |
| Name | CycleForge QA Sandbox |
| Plan | `enterprise` (all entitlements) |
| Admin email | `qa-admin@cycleforge.test` (override via `QA_ADMIN_EMAIL`) |
| Admin password | `CycleForge-QA-local!` (override via `QA_ADMIN_PASSWORD`) |
| Admin PIN | `847291` (station fallback; override via `QA_ADMIN_PIN`) |

Constants live in `src/lib/tenancy/qa-org.ts` and `src/lib/tenancy/constants.ts`.

**Sign in (recommended):** `/signin` → email `qa-admin@cycleforge.test` + password → session is org `…0002` only (not USAV). Station PIN remains a secondary path.

## What provisioning does

1. **Org** — fixed UUID, enterprise plan, Pacific timezone settings
2. **Admin** — account + membership + staff + admin role wiring
3. **Station personas** — Receiver, Packer, Technician, Shipper (pinless)
4. **Feature flags** — `studio`, `surface_composed_render`, `incoming_universal`, `ai_search_commandbar`, `buyer_note_signals`
5. **Catalog + workflow** — `seedOrgCatalog()` + `seedDefaultWorkflowForOrg()`
6. **Fixtures** — SKUs (E2E + demo catalog), matched receiving PO, E2E outbound orders (`QA-TEST-*`), plus demo volume (`QA-DEMO-ORD-*`) across Awaiting / Pending / Packed / Shipped

### Fixture cheat sheet

| Artifact | Value |
|----------|-------|
| Receiving tracking | `QA-MOCK-TRK-PO` |
| Overlap SKU (isolation probe) | `BOSE-SLM2-BK` (same string as USAV; must succeed in QA only) |
| Awaiting order (E2E) | `QA-TEST-UNSHIP-AWAIT` |
| Pending order (E2E) | `QA-TEST-UNSHIP-PENDING` (+ `-2` / `-3`) |
| Packed order (E2E) | `QA-TEST-PACKED` |
| Demo volume prefix | `QA-DEMO-ORD-A###` / `P###` / `K###` / `S###` (12 + 24 + 8 + 16) |
| Demo tracking block | `940010000000000003xxxx` (does not overlap E2E `…0199`–`…0229`) |

Re-run `pnpm provision:qa-org` or `--fixtures-only` to refresh fixtures and demo volume (idempotent).

## Commands

```bash
pnpm provision:qa-org                    # full provision
pnpm provision:qa-org -- --fixtures-only # re-seed data only
pnpm provision:qa-org -- --verify        # isolation smoke checks
```

## Environment variables

Add to `.env` (see `.env.example`):

```bash
QA_ORG_ID=00000000-0000-0000-0000-000000000002
QA_ADMIN_EMAIL=qa-admin@cycleforge.test
QA_ADMIN_PASSWORD=CycleForge-QA-local!
QA_ADMIN_PIN=847291

# Playwright QA project
PW_QA_STAFF_NAME=QA Admin
PW_QA_OWNER_EMAIL=qa-admin@cycleforge.test
PW_QA_OWNER_PASSWORD=CycleForge-QA-local!
```

## E2E

Playwright has two auth states:

| Project | Storage | Staff |
|---------|---------|-------|
| `desktop` / `mobile` | `tests/.auth/admin.json` | USAV admin (default) |
| `qa-desktop` | `tests/.auth/qa-admin.json` | QA Admin |

```bash
# Run specs against the QA tenant
pnpm test:e2e:qa -- tests/e2e/receiving-scan-resolution.spec.ts
```

`global-setup.ts` mints both sessions when the QA org is provisioned.

## Isolation checklist

After provisioning, confirm tenant safety (see also `docs/second-tenant-onboarding-checklist.md`):

- [ ] Logged into QA → `/outbound` shows **only** QA orders (not USAV's queue)
- [ ] SKU `BOSE-SLM2-BK` exists in QA and is invisible to USAV
- [ ] `GET /api/orders/<usav-order-id>` while in QA → **404**
- [ ] `npm run tenancy:guard:check` passes

Run `pnpm provision:qa-org -- --verify` for automated counts.

## Sandbox integrations

Connect **per-org** sandbox credentials under Settings → Integrations:

| Provider | Sandbox |
|----------|---------|
| Stripe | Test mode (`4242…`) |
| eBay | eBay sandbox seller |
| Square | `SQUARE_ENV=SANDBOX` |
| Zoho | Separate dev org or mock fixtures |

USAV-coupled paths (Zendesk, PO-Gmail) may degrade gracefully — document, don't treat as QA failures.

## Neon branch strategy

For destructive testing, use a dedicated Neon branch:

```bash
neon branches create --name qa-sandbox
# Point DATABASE_URL at the branch, then pnpm provision:qa-org
```

Reset by deleting/recreating the branch instead of polluting shared dev.

## Do not

- Use **USAV** (`…0001`) for feature QA — plan-exempt, real ops data
- Use **test-iso-a/b** (`…00aa`/`…00bb`) — RLS harness only, no workflows
- Hardcode `QA_ORG_ID` as a runtime fallback (unlike transitional `USAV_ORG_ID`)
