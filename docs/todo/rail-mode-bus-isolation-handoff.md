# Handoff: Rail mode bus isolation (allowlist writes, no cross-mode dumps)

**For:** Claude Code (or any agent continuing this lane)  
**Lane:** `main` (WS-DOGFOOD)  
**Status:** Unboxed + Testing + Receive qty + Triage age axis **landed**. Residual: Triage bus opt-out + title helpers; rename paths still invalidate-only; P1 invalidate scope.  
**Related:** [`unbox-triage-mode-separation-handoff.md`](./unbox-triage-mode-separation-handoff.md) (wrappers + axes — complementary; do not reopen Unboxed first-open axis).  
**Do not reopen:** Unboxed `acceptLineUpdateBus: false` + `patchUnboxRailTitleByCarton` unless a regression is proven. TestingRecentRail bus opt-out + `narrowTestingWorkspacePatch` / `patchTestingRailByLine` unless a regression is proven.

---

## Prompt (paste into Claude Code)

```text
You are continuing Cycle Forge receiving-station work on lane `main`.

## Mission

Apply the **rail mode bus isolation** design across remaining surfaces. Unboxed already
opts out of the shared `receiving-line-updated` bus and renames via an allowlisted
carton helper. Other rails (Testing, Triage, Queue) and producers (Receive, Zoho sync,
by-id refresh) still dump full rows onto that bus or chase strip-lists.

Goal: **each mode dock owns its writes** —
1. Mode docks either opt out of the shared bus OR subscribe only with a required
   `getActivityAt` + allowlisted merge.
2. Never `GET ?id=` / `GET ?receiving_id=` full row → `dispatchLineUpdated(fullRow)`
   for a mode rail. Workspace/accordion may still use narrow bus patches.
3. Prefer allowlisted RQ helpers (`patch*RailByCarton`) over strip-list dispatchers
   and over `invalidateReceivingFeeds` for rename-only updates.
4. Fix stale comments that claim Unboxed updates “within a frame” via
   `dispatchUnboxRailLineUpdated` (Unboxed no longer listens).

Read before coding:
- `AGENTS.md` (SoT + compose→grow)
- This handoff: `docs/todo/rail-mode-bus-isolation-handoff.md`
- Sibling SoC: `docs/todo/unbox-triage-mode-separation-handoff.md`
- Worklog: `pnpm worklog:tail`

Constraints:
- Stay on current branch/worktree; user owns commits; never stash.
- Do NOT fork a second SidebarRailShell — grow feed flags + patch helpers.
- Do NOT reopen Unboxed first-open axis / `preserveServerOrder` / `unbox_opened_at`.
- Do NOT raise DS-ratchet baselines. `npm run verify` green before done; append worklog.
- Shipping / Labels rails already use separate buses — leave them unless wiring
  `updateEvent` to receiving patches.

## Golden pattern (landed — copy this, don’t invent strip-lists)

1. Feed flag: `acceptLineUpdateBus: false` on the mode dock
   (`feeds.ts` → `ReceivingFeedRail` gates `updateEvent`).
2. Allowlisted write helper into that feed’s RQ segment only
   (Unboxed: `patchUnboxRailTitleByCarton` — title fields only; freezes age via
   `mergeRailRows`).
3. Workspace keeps `receiving-line-updated` for accordion/selection with **narrow**
   patches (`publishLineSerials`, `{id, serials}`, line_patch for siblings).
4. Strip helpers (`dispatchTestingLineUpdated` / `dispatchUnboxRailLineUpdated`) are
   **not** rail safety — they are workspace convenience. Rails that need isolation
   opt out or use allowlists.

## Done when (pick a P0 slice; don’t boil the ocean)

Pick ONE of:
A) Testing: stop `refreshLineWithSerials` full-row dump; allowlisted testing rail
   patch OR dedicated `testing-line-updated`; consider opting TestingRecentRail off
   the shared bus.
B) Receive + Zoho: ban full-row `dispatchLineUpdated` after mark-received / sync;
   narrow qty/workflow patches + scoped invalidate; fix stale Unboxed “within a
   frame” comments; if instant Unboxed qty is required, add
   `patchUnboxRailQtyByCarton` (allowlist), do not re-enable the shared bus.
C) Triage docks: required door-scan `getActivityAt`; stop default
   `last_activity_at ?? created_at`; prefer bus opt-out + title/PO carton helper
   for renames.

Plus: unit tests for the chosen slice; `npm run verify` green; worklog entry.
```

---

## What already landed (do not reopen)

| Piece | Location | Contract |
|---|---|---|
| Bus opt-out | `feeds.ts` `unboxRecent.acceptLineUpdateBus: false` | Unboxed ignores `receiving-line-updated` |
| Gate | `ReceivingFeedRail.tsx` | `updateEvent` undefined when flag false |
| Title helper | `receiving-queries.ts` `patchUnboxRailTitleByCarton` | Allowlist: `item_name`, catalog/zoho titles, `sku`, PO#; carton-keyed; preserves `unbox_opened_at` |
| Qty helper | `receiving-queries.ts` `patchUnboxRailQtyByCarton` | Allowlist: qty + `workflow_status`; wired from mark-received |
| Call sites | `useUnmatchedItems` (return serial), `useLineSerials` (line_patch title fields), `useReceiveAction` (qty) | Dock rename/qty without rich bus merge |
| Testing opt-out | `TestingRecentRail.tsx` (no `updateEvent`) | Testing dock ignores shared bus; age = `tested_at ?? last_activity_at` |
| Testing narrow hydrate | `testing-line-events.ts` `narrowTestingWorkspacePatch` | `refreshLineWithSerials` never dumps full by-id row |
| Testing dock patch | `patchTestingRailByLine` | Verdict success → workflow / `tested_count` only |
| Triage age | `feeds.ts` `triageDoorScanAt` on triage + door-queue feeds | Prefer `scanned_at` / `received_at`; stubs stamp `scanned_at` |
| Age defense (other feeds) | `mergeRailUpdatePatch` in shell | Still used by Triage/Queue/Viewed — **not** Unboxed/Testing shield anymore |
| Docs | `unbox-rail-events.ts`, `testing-line-events.ts` | Wrappers = workspace/accordion only |

**Operator value:** return-serial renames the Unboxed row; Receive flips Unboxed qty without bus; Testing open no longer jumps rail age; triage ages follow door-scan.

Tests: `receiving-queries.rail.test.ts`, `sidebar-rail-shared.test.ts`, `testing-line-events.test.ts`.

---

## Double-check (audit after land)

### Correct

- Unboxed does not subscribe to the shared bus.
- Return-serial title path uses the carton helper on stubs (`id = -receivingId`).
- `mergeRailRows` still freezes first-open `unbox_opened_at` on RQ upserts.
- Accordion/siblings still get serials via `publishLineSerials` + bus.

### Residual gaps (known; fix in follow-on slices)

| Gap | File | Notes |
|---|---|---|
| Rename paths skip title helper | `UnfoundMatchStrip.tsx`, `useUnboxLineController.ts` (sales-order import), PO link / matching `onLinked` | Title waits on invalidate/refetch; import path may stay stale until later refresh |
| Full-row upsert still mutates qty/workflow | `scan-apply.ts` hydrate into `upsertReceivingRailRows` | Not bus; still a non-title write into Unboxed cache (membership hydrate — usually OK) |
| Age after full refetch | `invalidateReceivingFeeds` → SQL `unbox_opened_at` | Bus isolation does not protect a null server stamp |
| Triage still on shared bus | triage feeds `acceptLineUpdateBus` default true | Age axis fixed; opt-out + `patchTriageRailByCarton` still open |
| Zoho / PATCH full-line dumps | `useZohoSync`, `useReceivingLineCore` | Prefer narrow patches next |
| Strip helpers still look like “rail safety” | `testing-line-events.ts`, `unbox-rail-events.ts` | Docs updated; prefer opt-out + allowlist |

---

## Design law (simpler / cleaner)

```
Mode dock display  ←—— allowlisted RQ helper (owned fields only)
                   ←—— authoritative refetch (membership / reconcile)

Workspace/accordion ←—— shared bus with NARROW patches only

NEVER: full by-id row → shared bus → mode dock merge
NEVER: grow strip-lists (`delete patch.foo`) as the isolation strategy
```

**Why strip-lists fail:** Testing stripped `last_activity_at`; Unbox axis moved to `unbox_opened_at` and the strip didn’t follow → blank ages. Opt-out + allowlist doesn’t chase renamed axes.

---

## Similar patterns (ranked next work)

### P0 — Testing full-row dump + shared bus

- `useTestingLineController.refreshLineWithSerials` → `GET ?id=` → `dispatchTestingLineUpdated(fullRow)`
- `testing-line-events.ts` strips only `last_activity_at`
- `TestingRecentRail` still `updateEvent="receiving-line-updated"`

**Apply:** allowlisted `patchTestingRail*` or dedicated event; stop full-row dump; consider bus opt-out for TestingRecentRail.

### P0 — Receive / Zoho full-row bus dumps

- `useReceiveAction` fire-and-forget `GET ?receiving_id=` → `dispatchLineUpdated(full row)`
- `useZohoSync` / `useReceivingLineCore` PATCH → full line on bus

**Apply:** narrow patches; scoped `invalidateUnbox*` / `invalidateTriage*`; optional `patchUnboxRailQtyByCarton` if instant dock qty is required.

### P0 — Triage still on shared bus + default age axis

- Triage feeds default `acceptLineUpdateBus: true`
- `triageCombined` often lacks explicit `getActivityAt` → shell default `last_activity_at ?? created_at`

**Apply:** required door-scan axis; bus opt-out + `patchTriageRailByCarton` for titles; keep sanctioned Queue bridge allowlisted (`upsertUnboxQueueRows` only).

### P1 — `invalidateReceivingFeeds` for rename-only

Many PO-link / matching callers refetch five roots to change a title. Prefer carton title helpers + scoped invalidate for membership moves only.

### P1 — RQ vs event merge asymmetry

`mergeRailRows` freezes only `unbox_opened_at`. Event `mergeRailUpdatePatch` restores whatever `getActivityAt` reads. Align per-feed freeze allowlists if docks stay on the bus.

### P2 — `unboxQueue`

Still accepts shared bus + triage refresh. Bridge should be allowlisted mirror writes only.

### P3 — Shipping / Labels

Already separate buses — leave alone.

---

## Architecture map

```
Workspace mutations
  ├─ publishLineSerials / narrow dispatchLineUpdated  → accordion, selection
  ├─ patchUnboxRailTitleByCarton                      → Unboxed RQ only (title)
  └─ (bad) full GET row → receiving-line-updated
        ├─ TestingRecentRail     ← still listens (P0)
        ├─ Triage / Queue / Viewed ← still listen (P0)
        └─ Unboxed               ← opted out ✓

Unboxed membership / reconcile
  └─ refreshEvents (app-refresh-data, …) → invalidate → view=unbox_opened refetch
```

---

## File map

| Role | Path |
|---|---|
| Feed flag | `src/lib/receiving/rail/feeds.ts` |
| Gate | `src/components/sidebar/receiving/ReceivingFeedRail.tsx` |
| Title helper | `src/lib/queries/receiving-queries.ts` |
| Return-serial wire | `src/components/receiving/workspace/unmatched-items/useUnmatchedItems.ts` |
| Line serials wire | `src/components/receiving/workspace/line-edit/hooks/useLineSerials.ts` |
| Workspace bus wrapper | `src/components/sidebar/receiving/unbox-rail-events.ts` |
| Event merge (other feeds) | `src/components/sidebar/rail-shell/sidebar-rail-shared.ts` |
| Stale Receive comments | `src/components/receiving/workspace/line-edit/hooks/useReceiveAction.tsx` |
| Testing dump | `src/components/tech/hooks/useTestingLineController.ts`, `testing-line-events.ts` |

---

## Verify recipes

```bash
npx tsx --test \
  src/lib/queries/receiving-queries.rail.test.ts \
  src/components/sidebar/rail-shell/sidebar-rail-shared.test.ts \
  src/lib/receiving/rail/feeds.unbox-opened.test.ts
npm run verify -- --fast   # inner loop
npm run verify             # before done
pnpm worklog:tail
```

Manual dogfood: Unbox → open unfound carton → scan return serial → title becomes `Return serial …` and age (`Nh`) stays; Receive qty may lag one refresh until P0-B lands.

---

## Compound opportunities

- **Do now (in-scope follow-on):** Testing dump ban; Receive comment + narrow reconcile; Triage `getActivityAt`.
- **Promote next:** registry of `patch*RailByCarton` helpers + `acceptLineUpdateBus` on every mode dock.
- **Deferred / ask first:** dedicated per-mode event names; full Unbox/Triage wrapper refactor (other handoff).
