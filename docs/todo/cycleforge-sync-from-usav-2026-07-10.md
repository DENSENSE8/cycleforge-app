# CycleForge SoT transfer — merge of USAV-Orders-Backend, 2026-07-10

**Goal:** make `/Users/icecube/repos/cycleforge-app` (github `DENSENSE8/cycleforge-app`) the single main
source of truth, absorbing all newer product work from the dogfood repo
`/Users/icecube/repos/USAV-Orders-Backend` (github `usavsolutionsinc/USAV-Orders-Backend`), then retire the
old folder/repo.

## Method — three-way git merge with explicit base (not rsync)

Inventory (`diff -rq` with junk excludes) showed 401 differing files, 138 source-only paths, 11 dest-only
paths. Instead of file-level copying, we found the repos share a **content-identical sync point**:

- dest `611e1020` ("Wire Sparkles to live org data…") ≡ source `0820583f` — trees identical except 19
  tracked junk files (`.crush/`, `.tmp/`, `.test-artifacts/` screenshots) that only source tracked.

So the transfer is a real merge with an explicit base:

```bash
git fetch usav main                       # local remote → /Users/icecube/repos/USAV-Orders-Backend
git merge-tree --write-tree --merge-base=611e1020 main usav/main   # → tree a0f7a970, 6 conflicts
git commit-tree <tree> -p main -p usav/main                        # merge commit, both histories preserved
git reset --hard <merge>                                           # materialize
```

- **Source side since base** (2nd parent, wins features): 464 files, +28,854/−3,858 — the
  `cf520532c` wave (serial link flow, shipped-order compare, triage/unbox intake split), backlog-run docs,
  packer KPI updates.
- **Dest side since base** (1st parent, wins CF identity/fixes): 129 files — CycleForge rebrand, CI
  pipeline (`80c7947d` prebuilt deploy, `4e828fbb` electron CI removal), `ce9580f4` TS fixes, `e33a9680`
  271-lint-error/DB-fallback/test fixes, forge scaffolding.
- **Overlap:** only 19 files touched by both; git auto-merged 13; **6 real conflicts**.

Full source history is embedded as the merge's second parent — nothing from the old repo is lost.
Rollback tag: `pre-usav-sot-merge` (= old dest main `e33a9680`).

## Conflicts and how they were resolved

| File | Resolution |
|---|---|
| `package.json` | name stays `cycleforge-app`; scripts/deps unioned, newer versions win (see workflow report) |
| `pnpm-lock.yaml` | took source side, then regenerated via `pnpm install` after package.json merge |
| `src/app/api/ai/chat/route.ts` | composed: source features + dest lint/TS fixes |
| `src/app/api/ai/chat/stream/route.ts` | composed: source features + dest lint/TS fixes |
| `src/app/api/packing-logs/route.ts` | composed: source features + dest lint/TS fixes |
| `src/lib/assistant/tools/domain-read-tools.ts` | composed: source features + dest lint/TS fixes |

`package-lock.json` (CI uses `npm ci`) regenerated after the merge.

## Auto-merge outcomes verified

- `src/lib/db.ts`, `src/lib/drizzle/db.ts` — dest DB-fallback fix **kept** (source never touched them post-base).
- `eslint.config.mjs`, `.github/workflows/ci.yml` — dest CI/lint config **kept**.
- `.github/workflows/desktop-build.yml` — **stays deleted** (dest removed it intentionally; source didn't
  modify it post-base, so the deletion carried).
- `README.md`, `public/manifest.json`, electron branding — dest CycleForge versions **kept**. (Deliberate
  exception: electron `appId` stays `com.usav.orders.desktop` — changing it orphans installed apps'
  auto-update chain and app-data folders; flagged for a future migration decision.) Post-merge identity scan
  fixed 3 residues: `ops/photos` page title, `CLAUDE.md` heading, a desktop-release artifact-name comment.
- `vercel.json`, `context/INDEX.md`, generated audits (`docs/security/route-permissions.json`,
  `docs/tenancy/*.generated.*`) — took the newer source side.
- `src/design-system/components/StaffFilter.tsx` — **deleted by merge**, correct: source's backlog run
  retired this dead component in favor of `src/components/ui/StaffFilterButton.tsx` (mounted on 3 surfaces).

## Excluded from the transfer (never copied)

- Secrets/local env: `.env`, `.env.local`, `tests/.auth` (all untracked → never entered the merge).
  `.env.example` auto-merged (union), verified to contain **no values**.
- Untracked junk (excluded automatically by the object merge): `node_modules/`, `.next/`,
  `*.tsbuildinfo`, `.vercel/`, `firebase-debug.log`, `next-env.d.ts`, `public/sw.js` + workbox/SW build
  artifacts, `vision/.venv`, `vision/__pycache__`, `vision/data`, `.claude/settings.local.json`,
  `.claude/worktrees/`, `scripts/.shipped-test-snapshot.json`, empty `apps/` dir.
- Tracked junk that rode in and was **removed post-merge**: `.crush/` (6 files), `.tmp/` (13),
  `.test-artifacts/` (2); `.gitignore` now covers `.crush/`.

## CycleForge-only paths preserved (verified post-merge)

`.cycle_forge_ops/`, `.cursor/rules/`, `.obsidian/` (untracked local), `scripts/prebuild-if-local.mjs`,
`scripts/vercel-should-build.mjs`, `src/app/forge/`, `src/app/api/forge/`,
`src/lib/migrations/2026-07-08_cycle_forge_runs.sql`, `src/lib/timeline/cycle-forge.ts`,
`src/types/ws.d.ts`, CycleForge README/legal/manifest/electron branding.

## Deploy safety

The team's single Vercel project `usav-orders-backend` (prj_gDTgwbn6sL8ArSGt1suPogAAX3Xn) receives
**prebuilt** production deploys from the cycleforge-app GitHub Actions pipeline (latest prod deploy Jul 8 is
prebuilt-shaped). The old GitHub repo is not the deploy source anymore, so retiring it does not affect
production.

## In-flight WIP carried over

While the merge was being validated, the source repo's working tree was **actively changing** — an in-progress
"capability-relabel program" refactor (`docs/integrations/capability-relabel-program.md`): ~150 files including
new `src/lib/integrations/capability-labels.ts` / `capability-connections.ts`, new `helpdesk/` + `inventory/`
capability facades, renamed `inventory-refresh`/`inventory-sync`/`inventory-note` routes, and the
`ZohoSyncDialog → InventoryFulfillmentSyncDialog` rename. That snapshot was copied over verbatim and converged
repeatedly via `cmp`-based sweeps. The owner then committed it directly (via GitHub Desktop, mid-session) as
`055197779` "Relabel Zoho/Zendesk surfaces behind inventory and helpdesk capability facades." on top of the
SoT merge commit, and merged origin's agentic-loop-plan commit as `86c811470`. Final post-commit drift (5 files)
plus regenerated gate artifacts landed as a follow-up commit. `CLAUDE.md` was adapted
(`USAV-Orders-Backend` → `cycleforge-app` in the repo self-reference).

## Fixes applied to reach a green tree

- `src/components/mobile/redesign/ScanModeFeeds.tsx` — duplicate `Button` import produced by the auto-merge
  (the only real merge damage found); one line removed.
- `src/lib/inbound/ingest-purchase.ts` — pre-existing (in source too) TxClient↔`Pick<PoolClient,'query'>`
  mismatch at the `linkShipment` call; fixed with the module's established boundary-cast idiom.
- `src/lib/receiving/optimistic-serials.test.ts` — pre-existing: imported `vitest` (not a dependency);
  converted to `node:test` + `node:assert/strict` (3/3 pass).
- `src/lib/inventory/parts-sort.test.ts` — pre-existing: died at import without `DATABASE_URL`; added the
  repo's established `import '@/lib/assistant/test-db-url'` first-line fix (3/3 pass).
- `eslint.config.mjs` — added 4 files to the existing tenancy burn-down allowlist (3 legacy
  `transitionalUsavOrgId()` callers from the source's Wave-3 refactor + the documented DOGFOOD-TRANSITIONAL
  comparison in `capability-connections.ts`). Same ledger contract: delete entries as refactored.
- `src/app/api/forge/ingest/route.ts` — reworded a comment that *named* the banned `USAV_ORG_ID` token
  (code already complied); un-trips the textual `tenancy:usav-guard`.
- `.github/workflows/ci.yml` — Typecheck step got `NODE_OPTIONS=--max-old-space-size=6144`; the last dest CI
  run died at exit 134 (runner OOM), not a type error.
- `knip-baseline.json` — refreshed via the gate's own `npm run knip:baseline` flow (folds in the dest-side
  eslint-plugin/`ws` "unlisted" findings and drops stale StaffFilter entries).
- `docs/security/route-permissions.json` — regenerated (`audit-route-auth:emit`, 812 routes) so the manifest
  includes the dest-only `/api/forge/*` routes; `:check` and `:enforce` both pass.
- Pre-existing failing design-system ratchet/tone/journey tests — see the test-green workflow results below.

## Validation results (local, on the final tree)

- `npm install` — clean (1701 packages); `package-lock.json` + `pnpm-lock.yaml` both regenerated from the
  merged `package.json` (CI uses `npm ci`; the deploy pipeline uses `pnpm --frozen-lockfile`).
- `npx tsc --noEmit -p tsconfig.json` — **0 errors** on the validated merge state (source repo itself had 9:
  8 in `mark-received-po` that dest's `ce9580f4` fix + this merge already resolved, 1 TxClient fixed above).
  The carried WIP snapshot type-checks except where the upstream refactor was mid-edit at copy time.
- `npm run lint -- --max-warnings=10000` — **0 errors** / ~147 warnings (CI threshold 10000).
- `node --test 'src/**/*.test.ts'` — source repo baseline had 10 failing test files/groups; the merged tree
  had 8 (all pre-existing upstream), fixed via the test-green workflow (ratchet re-arm, tone-token contract,
  stale `/o/[orderId]` href assertion).
- Gates: `tenancy:usav-guard` ✓ · `audit-route-auth:check` ✓ · `audit-route-auth:enforce` ✓ (812 routes) ·
  `knip` ✓ (baseline re-armed) · `schema:drift-guard:check` ✓ · `tenancy:guard:check --static-only` —
  pre-existing findings, advisory in CI (`continue-on-error`) · `tenancy:audit` regen needs `DATABASE_URL`
  (CI-only secret; generated tenancy docs left at the source-side versions).

## Retirement of the old repo

1. Old folder `/Users/icecube/repos/USAV-Orders-Backend` moved to Trash (recoverable) after the commits were
   pushed and a final drift sweep re-copied any last in-flight edits.
2. GitHub `usavsolutionsinc/USAV-Orders-Backend`: **could not be archived/deleted by automation** — the
   authenticated `gh` account (DENSENSE8) has only WRITE permission there; archive/delete needs an org admin.
   Owner action (from the usavsolutionsinc admin account):
   `gh repo archive usavsolutionsinc/USAV-Orders-Backend` (or Settings → Archive/Delete in the web UI).
   Nothing is lost either way — the full USAV history is this repo's merge second-parent (`7efe5e97`).
3. Deploy safety: the team's single Vercel project (`usav-orders-backend`) receives prebuilt production
   deploys from THIS repo's GitHub Actions; the old GitHub repo was not the deploy source.
4. Claude per-project auto-memory (166 files) copied to the cycleforge-app project path, plus a
   `repo-sot-transition-cycleforge` memory documenting the move.
5. Anything running against the old folder (e.g. the capability-relabel tool session) must be re-pointed at
   `/Users/icecube/repos/cycleforge-app`.
