# Identification kernel — verifiable phase TODO (prod lane)

**Source of rulings:** Gemini 2026-09-10 (D1–D12) + live hash compare `cycleforge-app` (main) vs `cycleforge-lanes/prod` on 2026-09-10.

**Print-handle ruling (do not wait):** `/m/u/[id]` **already bypasses classifier**. `routeScan()` is step 0 of `/api/scan/resolve` — printed `U-{id}` / GS1 unit / Digital Link go straight to `entity` + `redirect: /m/u/…`. That is **not** the P1 picker adapter. P1 is `job: pick` + list-claim. Do not rewrite `/m/u` in P0 or P1 unless a unit JobFace is a later job PR.

**Locks:** D1 copy=desk / code=`station`. D2 freeze `src/lib/stations/` except D11 subject-kind extend. D7 no runtime LLM. No FilterRefinementBar, no funnel fold, no overlay `visibility`/`zIndex.panel` delete, no station rename sweep.

**Already same on both trees (do not re-port):**
- `src/app/api/shipped/scan-out/route.ts`
- `src/app/api/scan/resolve/route.ts`
- `src/lib/schemas/automations.ts` (TEST|PACK only)
- `src/lib/stations/scan-subject-store.ts` (kind `'unit'` only — P0 extends)
- pick queue pages + `useMobilePicker.ts`

---

## P0 — Kernel foundation (build on prod; main has **no** `src/lib/identification/`)

### Must do (new)

| ID | Task | Verify |
|---|---|---|
| **P0.1** | `src/lib/identification/types.ts`: `IdentificationResult`, `JobFace`, `identification_jobs` starting `{ scan_out }`, `IdentificationSource`. No `@/lib/db`. | tsc; grep no db import |
| **P0.2** | `src/lib/identification/scan-out-face.ts`: pure map POST/GET JSON → `JobFace`. `cancelled`/`canceled`/`blk` → `state: 'blocked'`, **no** SHIP_CONFIRM. Ambiguous → `state: 'ambiguous'`. | unit tests: blocked, ok, miss, dup |
| **P0.3** | Dual-entry: `source: 'scan'` and `source: 'claim'` call **the same mapper**. History row (GET `scope=mine`) opens the same face as a tracking POST that resolved that order. | test: same `entity` + `job` + `face.state` |
| **P0.4** | Tests: `organizationId` required on result; `clientEventId` present; mapper retry with same id is a no-op at the **type** layer (writer stays scan-out POST idempotency). | `tsx --test src/lib/identification/*.test.ts` |
| **P0.5** | D11: extend `ScanSubjectKind` with `'order'` in `scan-subject-store.ts` (same 120s TTL). Scan-out sets subject to order id after resolve. | existing subject tests + new order case |
| **P0.6** | Route `/m/id/scan-out/[orderId]` renders `JobFace` only (design-mcp before tsx). Not `/m/scan-out` tape. | load order id; cancelled paints blocked |
| **P0.7** | D10/D12: one view-model component, **two mounts** — mobile page + existing scan-out overlay/active panel consume `JobFace` for blocked. Do not merge overlay host with desk inspector. Do not touch overlay zIndex/visibility. | cancelled tracking: phone + desk overlay same state |
| **P0.8** | `cursor-eval --fast`. If overlay workspace changes: `pnpm run eval:station scan-out`. | stamps `ok: true` |

### Must **not** do in P0

- Pour `/m/scan-out` MobileScanOut as a substitute for `/m/id/…`
- Rename `StationComposerHost` / overlay cohort
- Automations triggers, picker list, AI, FilterRefinementBar

### Pour from main (P0 **adjacent**, after P0.1–P0.4 types exist)

Main-only (hash 2026-09-10). Port **after** JobFace mapper so tape rows can later display blocked faces — do not let tape chrome become the kernel.

| ID | Main path | Why | Verify |
|---|---|---|---|
| **P0.p1** | `src/app/m/(shell)/scan-out/page.tsx` | Gun tape route (sibling of per-ID face) | `/m/scan-out` 401/auth, title “Scan out” |
| **P0.p2** | `src/components/mobile/redesign/MobileScanOut.tsx` | Commit loop, undo-on-tape, onSettled | blocked ≠ shipped in tape |
| **P0.p3** | `scan-out-outbox.ts` + `.test.ts` | Offline queue; `clientEventId` | outbox tests green on prod |
| **P0.p4** | `useScanOutHistory.ts`, `mobile-scan-out-tape.ts` | GET history seed | tape opens on mine history |
| **P0.p5** | `src/components/mobile/station/*` **only if** MobileScanOut imports them and prod lacks them | Shared capture window/shell/tape | do not invent a second mouth |
| **P0.p6** | Diff (do **not** overlay blindly): `useScanOutStation.ts`, `ScanOutActivePanel.tsx`, `ScanOutComposerDock.tsx`, `ScanOutWorkspace.tsx`, `scan-out-active.ts` | Prod already has `blk`; main may have onSettled/outbox wiring | `diff` then port **settled-tape + clientEventId** only |

`barcode-routing.ts` DIFF — **do not overlay.** Prod is ahead on location/GS1. Print-handle bypass stays step 0.

---

## P1 — Role queues (same face) — **done 2026-09-10** (P1.3 deferred)

House jobs live in `src/lib/identification/jobs.ts` (lookup by id). Tenant methods (P3) publish into that same map — they do not add `*-face.ts` per org. Assignment `work_type` stays TEST|PACK (desk slots). Identification job id `pick` is the claim face, not a new Postgres enum.

| ID | Task | Status |
|---|---|---|
| **P1.1** | `pick` on the job registry. `/m/pick` + `/m/work` list-claim → `/m/id/pick/{orderId}` JobFace (`source: 'claim'`). Start pick → `/m/pick/{orderId}`. | done |
| **P1.2** | Scan-gate optional confirm; serial-bearing units still require a match. | done |
| **P1.3** | `assign_work` PICK enum / item-staff-rule pour | **deferred** — TEST remains the picker assignment slot; pouring `item-staff-rule.ts` is assistant-chokepoint, not JobFace |
| **P1.4** | Do not fold `/m/u/[id]` into pick | done — print-handle + scan match `/m/u/` unchanged |

## P2 — Automations event — **done 2026-09-10**

`identification.completed` is on `AUTOMATION_TRIGGER_KEYS` (create-body enum). Listing defaults / to-ship upserts stay `LISTING_AUTOMATION_TRIGGER_KEYS` only. `selectActionsForTrigger` returns `[]` for this key so TEST|PACK never assign on a dock scan. Writers: scan-out POST (matched, including blocked/dup) and pick session **start** (`reopen: false`). GET claim and pick-tasks do not emit. Subject kinds still `'unit' | 'order'`; TTL 120s. Pick claim + session set `setScanSubject('order', id)`.

| ID | Task | Verify |
|---|---|---|
| **P2.1** | Trigger `identification.completed` (not LLM) | done — Zod union; org-scoped emit; listing upserts listing-only |
| **P2.2** | Subject kinds as needed beyond order | done — no new kind; TTL 120s; pick sets order subject |

---

## P3 — Tenant grammar (compiled Zod) — **done 2026-09-11**

Barcode grammar is `IdentificationGrammarBody` (`src/lib/schemas/identification-grammar.ts`). Studio waist `compileIdentificationGrammar` rejects house ids and lookaround/nested quantifiers. `getIdentificationJob` resolves house first, then published tenant records (in-process or org `identification_methods`). Unknown id → `null`. Scan resolve step **0.5** runs **after** print-handle `routeScan`, **before** PO/`classifyInput`. GET `/api/identification/jobs/[jobId]` is org-scoped; generic claim is `/m/id/[job]/[entityId]` mounting the same `IdentificationJobFace` (no per-tenant `*-face.ts`). GET claim does not emit `identification.completed`. No hot-path LLM.

| ID | Task | Status |
|---|---|---|
| **P3** | Grammar table → Zod, Studio-compiled, published tenant ids in `getIdentificationJob`; resolve after print-handles; generic `/m/id` claim | done — p95 classify local &lt;150ms in unit test; unknown id → null; missing table → empty methods |

## P4 — AI author + human publish — **done 2026-09-11**

Studio `POST /api/identification/methods/author` returns `IdentificationGrammarBody` (AI JSON when org chat is configured, else local author). Human `POST` draft then `POST …/publish` stamps `published_at`. Gun path still only `compileIdentificationGrammar` / `classifyIdentificationScan`. Phone surface: `/m/id/methods`. No per-tenant `*-face.ts`.

| ID | Task | Status |
|---|---|---|
| **P4** | AI authors config; human publish; no hot-path LLM | done — same Zod as human; resolve does not import author |

**Later:** mechanical desk-copy; overlay cohort rename; one job PR at a time (pack, unbox, test).

---

## Success metric P0 (D12)

Cancelled tracking shows **blocked JobFace** on `/m/id/scan-out/{orderId}` **and** the scan-out overlay, from the same mapper. API writer unchanged.
