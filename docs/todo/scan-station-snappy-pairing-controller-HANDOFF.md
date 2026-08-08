# Handoff — Scan-station snappy: Pairing stops dual-mounting `useUnmatchedItems`

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Predecessor:** Scan-station snappy propagation Phases A–C (**SHIPPED** this session).
Plan (reference only — do not edit):
`~/.cursor/plans/scan-station_snappy_propagation_440a2015.plan.md`
**Status:** Classify dual-mount collapsed; **CartonMatchHub / Pairing** is the remaining receiving dual-mount.
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never start/restart/kill the dev server · **user owns commits**.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/scan-station-snappy-pairing-controller-HANDOFF.md and execute §2–§4.
Do NOT re-do Phases A–C (§0). Do NOT start Pack/Shipping Phase D unless Pairing
is green and operators still feel lag on those stations.

Golden recipe: never-blank select · no foreign-carton bleed · merge-preserve
serials · refreshLineSerialProjectionSafe. Never cross-receivingId keepPreviousData
on siblings keys.

Attach to :3050. npm run verify before done (do not raise knip / DS baselines).
```

---

## 0. What already shipped (do not redo)

### Phase A — Testing unfound → accordion
- [`UnmatchedItemsSection`](../../src/components/receiving/workspace/UnmatchedItemsSection.tsx) is a thin pass-through to `UnmatchedAccordionSurface` only — **no** `renderLineActions` / `UnmatchedItemsPerLineList` / `UnmatchedLineRow`.
- Shared props: `activeRowSlot`, `placeholderActiveRow`, `hideNoTestLines`, `activeSerialActions` on [`unmatched-items-shared.ts`](../../src/components/receiving/workspace/unmatched-items/unmatched-items-shared.ts).
- [`TestingPoItemsSection`](../../src/components/tech/testing-panel/TestingPoItemsSection.tsx) injects `TestingLineSlot` via `activeRowSlot`, binds **`line.id`**, seeds `activeLineId` + `placeholderActiveRow`.
- Guards: [`unified-unfound-surface.test.ts`](../../src/components/receiving/workspace/unmatched-items/unified-unfound-surface.test.ts), expanded [`po-lines-never-blank.guard.test.ts`](../../src/components/receiving/workspace/hooks/po-lines-never-blank.guard.test.ts).

### Phase B — Classify identify-only
- Classify no longer mounts `useUnmatchedItems`.
- Shared mutation: [`addUnmatchedLine`](../../src/lib/receiving/add-unmatched-line-client.ts) (POST + toast + refresh + optional siblings seed).
- [`TriageClassifySection`](../../src/components/receiving/triage/TriageClassifySection.tsx) → `handleRepairIdentifySelect` → `addUnmatchedLine`.
- Guards: [`classify-no-dual-unmatched.guard.test.ts`](../../src/components/receiving/triage/classify-no-dual-unmatched.guard.test.ts), repair-service-identify guard updated.

### Phase C — Shared SoT
- Unmatched Arrival reconcile in [`scan-apply.ts`](../../src/components/sidebar/receiving/scan-apply.ts): `fetchQuery(receivingSiblingsQueryKey)` + `include=serials` + `seedReceivingSiblingsCache`.
- Testing open seed in [`TestingSidebarPanel`](../../src/components/sidebar/TestingSidebarPanel.tsx) (`seedTestingOpenLine`); hydrate in [`TestingRecentRail`](../../src/components/sidebar/receiving/TestingRecentRail.tsx) via `useHydrateVisibleSerials`.
- Writers: `refreshLineSerialProjectionSafe` on [`log-serial`](../../src/app/api/receiving/log-serial/route.ts) + [`receiving/serials`](../../src/app/api/receiving/serials/route.ts) POST/DELETE.
- Guards: `scan-apply.guard.test.ts`, `serial-projection-writers.guard.test.ts`, `testing-rail-hydrate.guard.test.ts`.

### Phase D — deferred (out of scope for this handoff)
Pack / Shipping generic placeholder/preserve on **their** query keys only — **never** import `PoLinesAccordion` / `receivingSiblingsQueryKey`. Revisit only if those stations still flash after Pairing is green.

---

## 1. Gap (this handoff)

[`CartonMatchHub.tsx`](../../src/components/receiving/workspace/line-edit/CartonMatchHub.tsx) still mounts `useUnmatchedItems` (~L391) solely for:

| Call site | Use |
|---|---|
| `RepairServiceIdentify.onSelect` | `u.handleAddLine` |
| `ZohoItemPairTab.onAddSku` | `u.handleAddLine(sel, { allowOffPo: orderLinked })` |

Unlink / orderLinked / avenue UI already come from elsewhere (`useReceivingCartonUnlink`, `pkg` props) — **not** from the unmatched controller.

**Runtime cost when Pairing Displays is open on an unfound carton:**

| Mount | Who |
|---|---|
| Centre items | `UnmatchedAccordionSurface` → `useUnmatchedItems` |
| Pairing Displays | `CartonMatchHub` → `useUnmatchedItems` (**extra GET + `setLines([])`**) |

That second mount can flash empty lines against the centre accordion — same failure Classify had.

---

## 2. Mission

Collapse Pairing onto the **identify/add-line client** (same pattern as Classify). After this change, the only centre/Displays callers of `useUnmatchedItems(` should be:

1. Hook definition
2. `UnmatchedAccordionSurface` (centre items — the one controller)

`CartonMatchHub` must **not** call `useUnmatchedItems(`.

---

## 3. Concrete work

1. **In `CartonMatchHub`:** remove `useUnmatchedItems` mount. Replace `u.handleAddLine` with a local callback that calls `addUnmatchedLine({ receivingId, selection, opts, sourcePlatformHint, receivingTypeHint, listingUrlHint, queryClient, onLinked })` — keep the existing `onLinked` body (dispatchSelectLine / dispatchLineUpdated / invalidateReceivingFeeds / setForcePicker / optional focus-scan).
2. **Preserve `allowOffPo`:** ZohoItemPairTab path must still pass `{ allowOffPo: orderLinked }`.
3. **Unbox Classify Displays** already uses `addUnmatchedLine` — do not regress. Arrival Pairing + Unbox Linkage/Pairing both host `CartonMatchHub`.
4. **Guards (ratchet):**
   - Extend [`classify-no-dual-unmatched.guard.test.ts`](../../src/components/receiving/triage/classify-no-dual-unmatched.guard.test.ts) **or** add `pairing-no-dual-unmatched.guard.test.ts`:
     - `CartonMatchHub.tsx` must not match `useUnmatchedItems\s*\(`
     - must match `addUnmatchedLine`
   - Optional census guard: under `src/components/receiving/`, `useUnmatchedItems(` call sites = definition + `UnmatchedAccordionSurface` only (exclude test files).
5. **Do not** force CartonMatchHub onto a React context from the centre controller unless `addUnmatchedLine` is insufficient — prefer the thin client (Classify precedent).
6. **Verify:** `npm run verify` green. Do not raise knip / DS baselines for unrelated WIP. If untracked `*-table-definition.ts` files on the branch trip knip, leave them alone (not this task) or ask the user — do not baseline foreign debt.

---

## 4. Acceptance

| Check | Expect |
|---|---|
| Open unfound Arrival carton, open Pairing Displays | Centre PO items never flash empty from Pairing mount |
| Store / Repair identify from Pairing | Line lands; siblings/chips warm; same toast/refresh as before |
| Zoho Inventory Item add (Unbox tab set) | `allowOffPo` still honored when order already linked |
| Carton switch with Pairing open | No previous-carton lines for a frame; no double GET storm |
| `rg 'useUnmatchedItems\\s*\\(' src/components/receiving` | Only `useUnmatchedItems.ts` + `UnmatchedAccordionSurface.tsx` (+ tests) |

---

## 5. Explicit non-goals

- Pack / Shipping Phase D
- Cross-carton `keepPreviousData` on siblings keys
- New `units_projection` migration
- Centralizing `refreshLineSerialProjectionSafe` into `serial-attach` (optional follow-up after this)
- StationDisplaysPushStack shell work
- Reintroducing `renderLineActions` / `UnmatchedLineRow`

---

## 6. Suggested paste checklist (operator)

1. Arrival → unfound carton → centre items visible → Open displays → Pairing → Store identify → confirm centre row amends, no blank flash.
2. Same carton → switch to another unfound → back → never-blank.
3. Unbox → Pairing → Inventory Item add on a linked carton (`allowOffPo`).
4. `npm run verify`.

---

## 7. After green (optional next)

- Phase D only if Pack/Shipping select still feels laggy.
- Writer centralization in `serial-attach` if attach paths still drift.
- Dogfood Testing unfound return-serial (Phase A acceptance) if not already signed off.
