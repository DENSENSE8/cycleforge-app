# Sheets-flush workbench cohort — verified execution plan

**Date:** 2026-08-04 (verified) · **Status:** ✅ **DONE — Waves 2–7 executed 2026-08-04** · **Lane:** main (WS-DOGFOOD)

> **Follow-on (2026-08-05):** residual full re-sweep (Band 3 exactness ·
> `surface="sheet"` · triage twin deletion · History Band-1 search) is owned by
> [`unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`](./unbox-history-sheets-full-resweep-SWEEP-PROMPT.md).
> The cohort [`SWEEP-PROMPT.md`](./sheets-flush-workbench-cohort-SWEEP-PROMPT.md)
> is **superseded** for new sessions — do not re-open Waves 0–7.

## Execution status (2026-08-04)

All of Waves 2–7 are ported and guarded. Per-wave result:

| Wave | Surface(s) | Ported | Guard |
|---|---|---|---|
| 2 | Triage / Arrival | ✅ `TriageWorkspaceView` + `TriageTriageBand`, KPI in `WorkbenchKpiBand` | `triage-workspace-sheet.guard.test.ts` (5/5) |
| 3 | Labels station | ✅ `LabelsWorkspaceView` + `LabelsTriageBand` | `labels-workspace-sheet.guard.test.ts` (5/5) |
| 4 | Scan-out / staged | ✅ `ScanOutWorkspace` flush (single-lane; honest KPI absence) | `scan-out-workspace-sheet.guard.test.ts` (1/1) |
| 5 | Review family (Packing · Pairing · Catalog-link) | ✅ Band 1 tabs · no KPI (honest absence) · Band 3 find | `review-workspace-sheet.guard.test.ts` (9/9) |
| 6 | Support | ✅ `SupportTicketsBoard` flush spreadsheet plane; `SupportTicketFocus` thread flushed (kept as service-workspace, not force-gridded) | `support-workspace-sheet.guard.test.ts` (4/4) |
| 7 | Pickup · Repair · Catalog · FBA (grids) · Photos · Labels-products · Walk-In hub + feed (tool/media/feed — flush only) | ✅ | `workbench-cohort-wave7-sheet.guard.test.ts` (16/16) |

Also added `WORKBENCH_KPI_SURFACE.triage` / `.labels` keys and cohort one-liners in
`.claude/rules/display/workbench-ops-queue.md`. New + related shared guards: **102 pass / 0 fail.**

**Gate status:** `npm run verify` — Lint ✓ · Typecheck ✓ · Knip ✓ · Route-permission ✓ ·
Route-auth ✓ · Schema ✓ · Doc-catalog ✓. The unit-test gate had 17 failures, **all in a
concurrent session's files** (`TestingWorkspaceHeader/View`, `ShippingWorkspaceHeader/View`,
`receiving-routes.ts` — all `M` in the tree, none touched by this work; their own guards now
expect `Urgent`/`All`/`TechAllTriageTable` tabs + `urange/uviz` params their code hasn't caught
up to). Left untouched — not this cohort's regressions. Every file this cohort edited typechecks
clean and its guards are green.

---

_Original plan preamble below (unchanged)._

**Answers / supersedes the "in progress" framing of:** [`sheets-flush-workbench-cohort-SWEEP-PROMPT.md`](sheets-flush-workbench-cohort-SWEEP-PROMPT.md)
(**that file is now itself superseded** by
[`unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`](./unbox-history-sheets-full-resweep-SWEEP-PROMPT.md)
for residual work). **Do not re-read the cohort sweep prompt's Wave 0/1 sections
as open work** — §1 below is why. Its §1 (mandatory stack), §2 (citations),
§4 (per-surface checklist), §6 (guard recipe), §7 (trailing-cluster note) and
§8 (done-when) remain useful historical recipe — the full-resweep prompt restates
and extends them for residual debt. This doc does not repeat them; it corrects
the inventory and hands you a verified Wave 2–7 task list (executed).

---

## 1. Corrections — verified against the running tree, not the doc's own text

### 1.1 Wave 0 (Testing + Pack) and Wave 1 (Shipping) are DONE, not "in progress"

The sweep prompt's "Paste this into a new session" block and its §5 Wave 0 section both read as
if Testing/Pack still need porting ("Finish Testing + Pack"). Its own §3 inventory table
contradicts that in the same file, listing all three as "Already green." I ran the actual guards
rather than trusting either table:

```
node --test src/components/tech/testing/testing-workspace-sheet.guard.test.ts \
             src/components/packer/pack-workspace-sheet.guard.test.ts \
             src/components/tech/shipping/shipping-workspace-sheet.guard.test.ts
# tests 17, pass 17, fail 0
```

All three guard files exist, are wired to their real components, and pass. **Do not open Wave 0
or Wave 1 as work.** The next session's job starts at Wave 2.

### 1.2 The "KPI-above-host guard false-positive" (sweep prompt §5, Wave 0) is already fixed

The prompt warns that a naive guard would match `WORKBENCH_SHEET_HOST` at its import line instead
of its body-JSX usage, and gives a "BAD"/"GOOD" `indexOf` pattern to apply. Both shipped guards
already use the GOOD form:

- `testing-workspace-sheet.guard.test.ts:80` — `src.indexOf('className={WORKBENCH_SHEET_HOST}', ...)`
- `dashboard-orders-sheet.guard.test.ts:79` — `src.indexOf('WORKBENCH_SHEET_HOST', src.indexOf('showOutboundChrome ?'))`

Both anchor on the JSX usage or a body marker, not the import line. **This is not a task** — it is
a description of a bug that never shipped in the guards that would have carried it. Keep the
pattern in mind when writing the new Wave 2–7 guards (§4 below), but there is nothing to fix in
the existing three.

### 1.3 `TRAILING_CLUSTER_ADOPTERS` already reflects the shipped waves correctly

`workbench-trailing-cluster.guard.test.ts:48-58` already drops `TestingWorkspaceHeader.tsx`
(comment: *"Band 1 has no trailing cluster (honest absence)"*) and keeps
`ShippingWorkspaceHeader.tsx` / `PackWorkspaceHeader.tsx` — exactly what the sweep prompt's §7
prescribes. No correction needed here; recorded so the next session doesn't re-derive it.

### 1.4 Every Wave 2–7 file path is real and still on the old (CLIP/gutter) shape

Checked all sixteen named files for both sheet-host adoption and CLIP markers:

| File | `WORKBENCH_SHEET_*` | CLIP markers (`WorkbenchTablePane` / `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` / `WORKBENCH_TABLE_VIEWPORT`) |
|---|---|---|
| `TriageWorkspaceView.tsx` | 0 | 4 |
| `LabelsWorkspaceView.tsx` | 0 | 4 |
| `ScanOutWorkspace.tsx` (`src/components/outbound/workspaces/`) | 0 | 3 |
| `ReviewPackingTable.tsx` | 0 | 4 |
| `ReviewPairingTable.tsx` | 0 | 4 |
| `ReviewCatalogLinkTable.tsx` | 0 | 4 |
| `SupportTicketsBoard.tsx` | 0 | 4 |
| `SupportTicketFocus.tsx` | 0 | 4 |
| `PickupWorkspace.tsx` | 0 | 4 |
| `ProductsCatalogWorkspace.tsx` | 0 | 4 |
| `FbaOutboundWorkspace.tsx` | 0 | 4 |
| `PhotoLibraryPage.tsx` | 0 | 4 |
| `LabelsProductsWorkspace.tsx` | 0 | 4 |
| `WalkInHistoryHub.tsx` | 0 | 3 |
| `WalkInFeedPane.tsx` | 0 | 4 |
| `RepairTable.tsx` | 0 | 2 |

All sixteen: zero sheet-host adoption, all still carrying CLIP markers. **§3's "Remaining cohort"
table is accurate as written** — the only correction in this whole plan is §1.1–§1.3 above. One
path note: Wave 4's `ScanOutWorkspace.tsx` actually lives at
`src/components/outbound/workspaces/ScanOutWorkspace.tsx` — the sweep prompt doesn't give a path,
just the filename; recorded here so nobody greps the wrong directory.

`RepairTable.tsx` carries only 2 CLIP markers against the others' 3–4 — worth a `git diff` glance
at wave time in case it's a smaller port than its siblings, not a sign it's already partially done
(0 sheet-host hits rules that out).

---

## 2. What this plan does NOT restate — cite, don't re-narrate

Per `pattern-evolution.md`'s documentation-shape law (decision tables over essays; don't retell a
still-true doc), the sweep prompt's own content stays load-bearing for everything §1 didn't
correct:

| Still authoritative in the sweep prompt | Section |
|---|---|
| The five-row mandatory stack + host wiring + failure list | §1 |
| Citations (recipe law, chrome law, hosts, surface, golden mounts, guard template) | §2 |
| Per-surface checklist (the 9-step recipe every wave follows) | §4 |
| Guard recipe (9 assertions every new `*-sheet.guard.test.ts` must carry) | §6 |
| Trailing-cluster note (when a surface may leave `TRAILING_CLUSTER_ADOPTERS`) | §7 |
| Done-when criteria | §8 |
| Related docs (FINISH-HANDOFF, UPGRADE-PROMPT out of scope, add-column track separate) | §9 |

Read those sections from the sweep prompt directly before starting Wave 2 — this plan's job is
only the inventory correction (§1) and the verified task list (§3 below).

---

## 3. Verified wave task list (Wave 2 → Wave 7)

Each wave is the sweep prompt's §5 wave section, unchanged in substance, with paths confirmed and
the false-positive warning dropped (§1.2). Execute one wave at a time; `npm run verify` before
calling any wave done, per the sweep prompt's per-surface checklist step 8.

### Wave 2 — Triage / Arrival

**Files (confirmed):**
- `src/components/receiving/triage/TriageWorkspaceView.tsx`
- `src/components/receiving/triage/TriageWorkspaceHeader.tsx`
- `src/components/receiving/triage/TriageKpiStrip.tsx`

Fold KPI into Band 2. Move find/refine onto Band 3. Feed/list mounts flush in
`WORKBENCH_SHEET_HOST` — no second card well inside the elevated host.

**Guard (new):** `src/components/receiving/triage/triage-workspace-sheet.guard.test.ts` — clone
`dashboard-orders-sheet.guard.test.ts`'s structure (§2/§6 of the sweep prompt), anchoring the
KPI-above-host assertion on the JSX marker per §1.2's confirmed-correct pattern, not the import
line.

**Note:** `TriagePanel.tsx` lives in the same directory and is unrelated to this port (it is not
imported by `TriageWorkspaceView.tsx`) — do not touch it under this wave.

### Wave 3 — Labels station

**Files (confirmed):**
- `src/components/outbound/labels/LabelsWorkspaceView.tsx`
- `src/components/outbound/labels/LabelsWorkspaceHeader.tsx`
- `src/components/outbound/labels/LabelsKpiStrip.tsx`

`LabelsQueueTable.tsx` (`src/components/outbound/labels/`) and `StagedQueueTable.tsx`
(`src/components/outbound/scan-out/`) already use sheet hosts internally per the sweep prompt —
the outer view must stop wrapping them in `WORKBENCH_*_COLUMN` + body KPI.

**Guard (new):** `src/components/outbound/labels/labels-workspace-sheet.guard.test.ts`

### Wave 4 — Scan-out / staged

**Files (confirmed — path corrected from §1.4):**
- `src/components/outbound/workspaces/ScanOutWorkspace.tsx`

Remove `WorkbenchTablePane`. Mount staged queue flush under the five-row chrome (or under Labels'
existing sheet chrome if Wave 3 already owns bands for this surface by the time Wave 4 starts —
compose, don't double-wrap).

**Guard (new):** colocated `*-sheet.guard.test.ts` next to the host.

### Wave 5 — Review family

**Files (confirmed):**
- `src/features/review/ReviewPackingTable.tsx`
- `src/features/review/pairing/ReviewPairingTable.tsx`
- `src/features/review/catalog-link/ReviewCatalogLinkTable.tsx`

Each still uses `WORKBENCH_CHROME_COLUMN` + `WORKBENCH_BODY_COLUMN` +
`WORKBENCH_TABLE_VIEWPORT_NO_KPI` (confirmed by the CLIP-marker count in §1.4). Port to the
five-row sheet stack; KPI band may be honest-absence only when the surface truly has no metrics —
prefer a real Band 2 when a strip already exists.

**Guards:** one per host, or one family guard pinning all three — sweep prompt leaves this
open; pick per how much the three views actually share once you're in them.

### Wave 6 — Support

**Files (confirmed):**
- `src/components/support/zendesk/SupportTicketsBoard.tsx`
- `src/components/support/service-workspace/SupportTicketFocus.tsx`

Same host swap. Ticket board stays a spreadsheet plane, not a padded card column.
`SupportTicketFocus.tsx` is the thread/focus view (see `display/workbench-service.md` — this is
Workbench branch `service-workspace`, not `ops-queue`); confirm the five-row stack still applies
to its shell before porting — if its primary surface is a thread rather than a grid, the sheet
recipe may only apply to the ticket **list**, not the focus pane. Check against
`workbench-service.md`'s composition table before assuming both files take the identical port.

### Wave 7 — Long tail

**Files (confirmed):**
- `src/components/receiving/pickup/PickupWorkspace.tsx`
- `src/components/products/catalog/ProductsCatalogWorkspace.tsx`
- `src/components/fba/FbaOutboundWorkspace.tsx`
- `src/components/photos/PhotoLibraryPage.tsx`
- `src/components/labels/LabelsProductsWorkspace.tsx`
- `src/components/walk-in/WalkInHistoryHub.tsx` / `src/components/walk-in/WalkInFeedPane.tsx`
- `src/components/repair/RepairTable.tsx`

Same five-row checklist as every prior wave. Walk-In `WorkbenchTablePane` feeds are CLIP debt per
the sweep prompt — convert, or document as an intentional CLIP escape with a comment + guard
allowlist entry (prefer convert).

**After Wave 7**, run the sweep prompt's own closing check:

```bash
rg 'WORKBENCH_CHROME_COLUMN|WORKBENCH_BODY_COLUMN|WorkbenchTablePane' \
  src/components src/features --glob '*.tsx'
```

Lifecycle workspaces should return empty, or only documented CLIP escapes.

---

## 4. Done when

Unchanged from the sweep prompt's §8 — repeated here only because this doc is the one to check
off against once Wave 7 lands:

- Every cohort page (Waves 2–7, sixteen files) shows the five-row stack.
- Zero gutter between context rail and sheet on ported surfaces.
- Every new `*-sheet.guard.test.ts` (six-plus, one per wave minimum) green.
- The Wave-7 `rg` sweep is clean or documented-escapes-only.
- `npm run verify` green.
- `workbench-ops-queue.md` lists each finished surface next to the existing To-ship / Testing /
  Pack / Shipping flush notes.
