# GOAL — Google Sheets sync → inline data-table triage board

**Repo:** `cycleforge-app` · **Desk:** To-ship (`/shipping/orders`) · **Lane:** `main`  
**Plan of record (this ship):** [`docs/todo/sheets-sync-inline-triage-PLAN.md`](../todo/sheets-sync-inline-triage-PLAN.md)  
**Execution prompt:** [`docs/todo/sheets-sync-gutter-overlay-IMPLEMENTATION-PROMPT.md`](../todo/sheets-sync-gutter-overlay-IMPLEMENTATION-PROMPT.md)  
**Host JSON:** [`docs/eval/goals/sheets-sync-inline-triage.goal.json`](../eval/goals/sheets-sync-inline-triage.goal.json)  
**Sibling (do not expand into):** [`docs/todo/order-intake-acknowledgment-PLAN.md`](../todo/order-intake-acknowledgment-PLAN.md)

This is the OMP `/goal` object for one use case. It is **not** CYC-72 (live queue is already one sheet-like grid). It is **not** the full acknowledgment form. It is the **Sync Google Sheet result face**: manual-sheet rows must be triaged in the data table.

---

## OMP

```text
cd ~/Projects/cycleforge-app
omp
```

Attach the **plan**, not the acknowledgment prompt:

```text
@docs/todo/sheets-sync-inline-triage-PLAN.md
```

Then paste **only** the `## GOAL` block into `/goal`. Keep this GOAL file in-session for the `/goal` text:

```text
/goal Sync Google Sheet on To-ship lands the synced manual-sheet orders as an inline LedgerGrid triage board, not only as OrderSyncDialog lists. Each imported row is a data-table row: checkmark column on the far left (GridRowCheckbox, same square as the row); on the far right a green approve check and a reject X, equal width and height to each other and to the left check. Rows enter the middle of the table body: before writing that motion, use the Motion+ MCP (search-motion-docs then search-motion-source for React AnimatePresence, layout, stagger, list insert) and implement through @/design-system/motion DenseList / StaggerReveal / AnimatedCheck so existing rows make room. Approve and unapprove because this source is a human-maintained sheet, not an API connector. Compose CsvImportStagingHost + useOrdersSync + PRODUCT_TABLES. Done when src/lib/orders-sync/sheets-inline-triage.test.ts and verify:fast are green.
```

Do not paste this whole GOAL file as the objective. Scope and leases stay in `@docs/todo/sheets-sync-inline-triage-PLAN.md`.

---

## Strategic mapping (what already exists vs this goal)

| Layer | File | Role here |
|---|---|---|
| Plan of record | `docs/todo/sheets-sync-inline-triage-PLAN.md` | **This ship.** Scope, leases, Motion+ phases. |
| Sibling intake | `docs/todo/order-intake-acknowledgment-PLAN.md` | Compose its bulk grid only. Do not run that whole form. |
| Verify / testids | `docs/todo/order-intake-acknowledgment-VERIFY.md` | Keep `intake-bulk-grid`. Add testids for approve / reject if missing. |
| Sync engine | `src/hooks/useOrdersSync.ts`, `src/lib/jobs/google-sheets-transfer-orders.ts` | Already streams inserted/updated/skipped. **Do not replace the job.** Land those rows on the grid. |
| Current dump | `src/components/sidebar/OrderSyncDialog.tsx` | Progress / errors may stay. **Must not be the only place synced orders appear.** |
| Grid SoT | `CsvImportStagingHost` / `CsvImportStagingGridRow` / `LedgerGrid` | Reuse. No new `PRODUCT_TABLES` peer. |
| Left check | `GridRowCheckbox` (`flush` / `sheets`) | Far-left column. |
| Import motion (required) | **Motion+ MCP** `https://mcp.motion.dev/plus` then house wrappers | **Guide first, then code.** `search-motion-docs` → `search-motion-source` for React `AnimatePresence`, `layout`, `stagger`, list insert. Implement via `@/design-system/motion`: `DenseList` / `DenseListItem` (siblings spring so the new row lands **in the table body**), `StaggerReveal` / `staggerRevealRiseItem`, `LayoutGroup`, `AnimatedCheck`. Feature files never import `motion-plus`. Chrome still must not tween. Reduced-motion: final positions. |
| Status cell | `TableImportTriageStatusCell` | Ready vs action-required. Approve/reject are **row actions**, not a second status language. |
| Live To-ship grid | CYC-72 / `ORDERS_QUEUE_COLUMNS` | Released work. Sheet rows stay **caged / staging** until approve. |

API connectors (Ecwid / eBay / Zoho) stay auto-ingest. **Google Sheets is a human sheet** — every imported row is a triage decision: approve (commit toward release) or reject (do not enter the live queue). Unapprove must be possible on a still-caged row.

---

## GOAL

Sync Google Sheet on To-ship lands the synced manual-sheet orders as an **inline LedgerGrid triage board**, not only as OrderSyncDialog lists.

Each imported row is a data-table row:

1. **Far left:** checkmark column (`GridRowCheckbox`), square matching the row height/gutter.
2. **Far right:** two actions, **same width and height as each other and as the left check** — green approve check, reject X.
3. **Enter into the table body:** imported rows **insert in the middle of the LedgerGrid** (existing rows make room). Before writing that motion, use the **Motion+ MCP** (`https://mcp.motion.dev/plus`: `search-motion-docs` then `search-motion-source` for React list insert / `layout` / `AnimatePresence` / `stagger`). Implement through `@/design-system/motion` (`DenseList`, `StaggerReveal`, `AnimatedCheck`, `LayoutGroup`). Reduced-motion: final marks and positions, no travel.

Operator can **approve** and **unapprove** because the source is a manual sheet, not an API feed. Approve does not skip G1–G3; it only accepts the sheet row into the intake record. Reject keeps it out of live To-ship.

Compose `useOrdersSync` details + `CsvImportStagingHost` / `LedgerGrid` / `PRODUCT_TABLES`. `ds_contract` + `ds_tokens` before any new `src/**/*.tsx`. Motion+ MCP **before** any new motion in `src/**/*.tsx`.

**Done when** `src/lib/orders-sync/sheets-inline-triage.test.ts` and `verify:fast` are green.

---

## HOW IT MUST NOT FUNCTION

- Do **not** leave synced orders only in `OrderSyncDialog` stacked lists.
- Do **not** auto-release sheet rows the way a live API connector does.
- Do **not** fork a second grid, a new `PRODUCT_TABLES` peer, or a new create-order / buy-label engine.
- Do **not** tween chrome (`height` / `width` / `top` / `left` on header, KPI, dialog). **Do** run Motion+-guided **list layout** so sheet rows enter the **grid body** (`DenseList` / `layout` on rows only).
- Do **not** skip Motion+ MCP and invent a fly-in overlay, a toast, or a dialog-only list as the import motion.
- Do **not** import `motion-plus` / `@motionplus/*` / `framer-motion` from feature files — only `@/design-system/motion` (and `motion/plus` for `AnimateNumber`).
- Do **not** put approve/reject on the station floor, `StationComposerHost`, or new keybinds.
- Do **not** expand into CYC-72 columns, paperwork walk, or the full acknowledgment form (identity/parcel/buy).
- Do **not** unpack OMP agents or nest Codex → OMP → logins.
- `organizationId` from `withAuth` only.

---

## STOP

Gate green on the two success predicates. Do not open a follow-up ship inside this goal.
