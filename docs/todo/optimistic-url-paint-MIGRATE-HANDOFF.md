# Optimistic URL-param paint — migrate HANDOFF

**Status (2026-08-07):** SoT landed. Must-migrate #1–11 complete. Nice-to-have
#12 · #14–17 · #19 landed; #13 pairing `sku`, #18 Studio `focus`/`z`, #20 photo
`view` remain opportunistic (async / compound / facet). **Do not invent a second
pending twin** — compose the named SoT.

| Piece | Path |
|---|---|
| Pure helpers | [`src/lib/routing/optimistic-url-param.ts`](../../src/lib/routing/optimistic-url-param.ts) |
| Hook | [`src/hooks/useOptimisticUrlParam.ts`](../../src/hooks/useOptimisticUrlParam.ts) |
| Law | [`AGENTS.md`](../../AGENTS.md) + [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) → **Optimistic URL-param paint** |
| Isolation (orthogonal) | [`url-param-isolation` skill](../../.claude/skills/url-param-isolation/SKILL.md) — construct/parse, not paint |
| Guard (shrink) | [`optimistic-url-param.guard.test.ts`](../../src/lib/routing/optimistic-url-param.guard.test.ts) |
| Scan artifact | Cursor canvas `optimistic-url-paint-scan.canvas.tsx` |

Plan (SoT extract — done, do not re-open): `.cursor/plans/optimistic_url_paint_sot_b1b765ab.plan.md`

---

## Paste this into a new session

> Read `docs/todo/optimistic-url-paint-MIGRATE-HANDOFF.md` end-to-end before editing.
>
> Goal: migrate the next **must-migrate** wave onto `useOptimisticUrlParam` /
> `resolveOptimisticParam` so mount-gated URL opens paint in the click commit
> (no soft-replace dead beat). Simplify — do not invent a feature-local pending.
>
> **Start with Wave 1** unless the operator names a different wave. One wave per
> session preferred. Attach the user's `:3050` — never start/restart/kill the
> dev server. Stay on the checkout branch. Do not commit unless asked.
>
> When the wave is done: extend `optimistic-url-param.guard.test.ts` for the
> new consumer, run the wave's unit/guard tests, then `npm run verify`. Update
> the "Landed" table in this handoff (do not edit the plan file).

---

## Pattern (two jobs — never unify)

```
Paint-pending (THIS work):
  UI value = resolveOptimisticParam(url, pending)
  setPending(next) → startTransition(() => replace(write))
  clear when shouldClearOptimisticParam(url, pending)

Sync-guard (LEAVE ALONE):
  UI is already local entity state
  refs suppress URL→entity reconcile
  examples: useDashboardSelectedOrder, useReceivingWorkspacePane
```

**Golden consumers (copy these):**

| Surface | How |
|---|---|
| Outbound `open` / `new` | [`useOutboundUrlState.ts`](../../src/hooks/useOutboundUrlState.ts) — scalar hook |
| Search `sel` | [`useSearchSelParam.ts`](../../src/hooks/useSearchSelParam.ts) — pending at **page**; browse receives `setSel` |
| Inventory ledger `open` | [`useInventoryUrlState.ts`](../../src/components/inventory/useInventoryUrlState.ts) — open-only → `setOpen`; tab/mode → `paint(null)` |
| Unbox Displays | [`useUnboxDisplayView.ts`](../../src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts) — domain snapshot local; resolve/clear from SoT |

Multi-field replaces that also clear the open key: use hook `paint(next)` then
your existing `router.push/replace` in `startTransition` — do not double-replace
via `setValue`.

---

## Already landed (do not redo)

| # | Surface | Param | Module |
|---|---|---|---|
| ✓ | Unbox Displays | `display` | `useUnboxDisplayView` |
| ✓ | Labels / ScanOut | `open`, `new` | `useOutboundUrlState` |
| ✓ | Search browse→detail | `sel` | `useSearchSelParam` + page |
| ✓ | Inventory **ledger** open | `open` | `useInventoryUrlState` |

---

## Must-migrate waves

### Wave 1 — Support (highest ops lag)

| # | Surface | Param | Files |
|---|---|---|---|
| 1 | Support ticket thread | `ticket` | `SupportTicketsWorkspace.tsx`, `SupportTicketsBoard.tsx`, `SupportTicketsRecentRail.tsx` |
| 2 | Support order focus | `openOrderId` (**Support `context=` only**) | `OutboundOrdersDesk.tsx` → `SupportOrdersFocusHost.tsx` |

**Do not** migrate non-Support desk `openOrderId` (`useDashboardSelectedOrder` — sync-guard).

**Done when:** click ticket / support order paints thread/focus in the same commit;
guard asserts Support writers compose the SoT; `npm run verify` green.

### Wave 2 — `?new=true` family (reuse Outbound golden)

| # | Surface | Param | Files |
|---|---|---|---|
| 9 | Pack / Shipping / Dashboard intake | `new` | `useNewOrderParam.ts`, Dashboard search controller → `NewOrderEntryOverlay` |
| 10 | Repair intake | `new` | `RepairSidebarPanel.tsx` (+ header write) |

Labels already optimistic via `useOutboundUrlState.newOpen`. Prefer thinning
`useNewOrderParam` onto the same hook shape rather than a third twin.

### Wave 3 — Warranty + My Day

| # | Surface | Param | Files |
|---|---|---|---|
| 3 | Warranty claim detail | `open` | `useWarrantyClaims.ts` / warranty URL state, `WarrantyWorkspace.tsx` |
| 4 | My Day inspector / Watch | `task`, `watch` | `useMyDayView.ts`, My Day workspace / watch rail / task inspector |

My Day: task ↔ watch share one detail slot (mutual exclusion already in `push`).
Optimistic paint must preserve that exclusion.

### Wave 4 — Support voicemail + Issues

| # | Surface | Param | Files |
|---|---|---|---|
| 5 | Voicemail detail | `vm` | `SupportWorkspace.tsx`, `VoicemailQueue.tsx` |
| 6 | Issues focus | `issueId` | `IssuesWorkspace.tsx`, `IssuesQueue.tsx` |

### Wave 5 — Review + Inventory Triage/Pulse residual

| # | Surface | Param | Files |
|---|---|---|---|
| 7 | Review packer / pairing overlays | `packerLogId`, `orderId` | `ReviewWorkspace.tsx` |
| 8 | Review catalog link rails | `choreId`, `exceptionId` | `ReviewCatalogLinkTable.tsx` |
| 11 | Inventory Triage / Pulse **writers** | `open` | `InventoryTriageSidebar.tsx`, `InventoryPulseSidebar.tsx` |

**#11 is the cheapest residual under “done”:** shell already reads optimistic
`sidebar.open`, but Triage/Pulse still `router.replace(?open=)` and never call
`setOpen` / `setSidebarUrl({ open })`. Route writers through the inventory hook —
do not add a second pending.

---

## Nice-to-have (migrate when touching the surface)

| # | Surface | Param |
|---|---|---|
| 12 | Kit Parts / QC Checklist | `skuId` |
| 13 | Products pairing hub | `sku` (also async resolve — soft-replace is only half) |
| 14 | Unit detail / labels history | `historyId` |
| 15 | Signals browse | `signalId` |
| 16 | Community catalog | `selectedId` |
| 17 | Home tasks | `task` |
| 18 | Studio inspector / L2 | `focus`, `z` |
| 19 | Manuals viewer | `id` |
| 20 | Photo / media library view | `view` (+ filters) — weak mount case |

---

## Explicit non-goals (skip)

- Dashboard `openOrderId` / Receiving `openReceivingId` **sync-guard** refs
- Arrival / Testing / Pack Displays (already local `setActiveSideTab`)
- AI dock local state; `global-search-pending` (async resolve pulse)
- Repair row / FBA board **click** paths (local selection; URL is deep-link only)
- Facet / mode swaps: Tech `view=`, Ready `rtab`, Saved views, `q` / `sort` / filters
- Param **isolation** rewrites (construct/parse) — different skill
- Shortening Displays edge-toggle FLIP
- Raising knip / DS ratchet baselines

---

## Per-wave recipe

1. Find the URL **read** that gates mount (`searchParams.get` → `{open && <Panel/>}`).
2. Find every **writer** (click / scan / rail) that `router.replace`s that key.
3. Prefer one URL-state hook (like Outbound / Search / Inventory):
   - parse `urlValue` from `searchParams`
   - `useOptimisticUrlParam({ urlValue, replace, write, equals? })`
   - export painted `value` + `setValue` (and `paint` if multi-field clears)
4. If parent unmounts the writer on open (Search pattern): hold pending in the
   **parent** and pass `setValue` down — never a second hook instance with its
   own pending.
5. Keep domain builders local (nested actions, mutual exclusion). SoT never
   learns Support/Warranty vocabulary.
6. Extend [`optimistic-url-param.guard.test.ts`](../../src/lib/routing/optimistic-url-param.guard.test.ts)
   so the new consumer cannot regress to a local pending fork.
7. Verify:

```bash
npx tsx --test \
  src/lib/routing/optimistic-url-param.test.ts \
  src/lib/routing/optimistic-url-param.guard.test.ts \
  # + wave-specific unit/guard tests
npm run verify
```

---

## Landed this handoff (agents: append rows)

| Wave | Date | Notes |
|---|---|---|
| SoT + Unbox / Outbound / Search / Inventory ledger | 2026-08-07 | Extract + first consumers |
| #11 Inventory Triage/Pulse residual | 2026-08-07 | Pathname-safe `setOpen`; Triage/Pulse via `setSidebarUrl`; `shareKey: inventory:open` |
| Wave 1 #1 Support ticket | 2026-08-07 | `useSupportTicketParam` + shareKey; board/rail/workspace |
| Wave 1 #2 Support openOrderId | 2026-08-07 | `useSupportOrderOpenParam` under context=support; queue via open-shipped-details |
| Wave 2 #9–10 `?new=true` | 2026-08-07 | `useNewOrderParam` + Dashboard intake + Repair one-shot `useRepairNewParam` |
| Wave 3 #3–4 Warranty + My Day | 2026-08-07 | warranty `open` shareKey; My Day compound task/watch pending |
| Wave 4 #5–6 vm + issueId | 2026-08-07 | `useSupportVmParam` / `useSupportIssueParam` shareKeys |
| Wave 5 #7–8 Review | 2026-08-07 | ReviewWorkspace + CatalogLink compound resolve |
| Nice-to-have #12,14–17,19 | 2026-08-07 | Kit/QC skuId · Labels historyId · Signals · Community · Home task · Manuals id |
| Rank-1 plural compound hook | 2026-08-07 | `useOptimisticUrlParams` + helpers; My Day `{ taskId, watchOpen }` migrated off hand-rolled pending |
| Rank-2 row snapshot pilot | 2026-08-07 | Signals browse: ephemeral list-row identity chrome while detail fetches; SoT stays id-typed |

---

## Success criteria (whole program)

- No new feature-local “pending until soft-replace” twins for mount-gated opens
- Must-migrate #1–11 compose `useOptimisticUrlParam` or `resolveOptimisticParam`
- Guard covers each migrated consumer
- Paint-pending vs sync-guard still documented; Dashboard/Receiving not “unified”
- `npm run verify` green after each wave
