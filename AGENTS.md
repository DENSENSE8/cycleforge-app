# CycleForge — agent context

Short on purpose. Everything here changes what you do; nothing here is ceremony.
Deep detail lives in `docs/` and is read on demand, not injected every turn.

## 1. Dev origin — `http://localhost:3050`, and nothing else

`:3050` is the switchboard. It routes to the pinned lane and stamps the cookie
scope (`cf_kiosk` → `cf_kiosk__l7`), so a probe aimed at a lane port exercises a
different cookie namespace than the operator's browser.

- All curl / Playwright / browser probes / screenshots: `:3050`.
- **Lane lifecycle is operator-only.** Agents never start, restart, stop, kill,
  clear, or switch any `cycleforge-lane@…` service — including to test their own
  worktree. Use read-only `status` and logs only. Never hand-start `next dev`.
- Test only the one lane the operator has already selected. If another worktree
  owns the active testing lane, finish non-runtime work and wait for the
  operator to complete it and explicitly hand off the lane. A dead or `503`
  lane is reported with evidence; it is never automatically or agent-started.
- Never bind another port or move `PW_BASE_URL`. `npm run dev` hitting
  `EADDRINUSE` on `:3050` is correct.
- DSNs live in the worktree `.env` only. A lane env file that sets `DATABASE_URL`
  silently overrides `.env` and splits reads across Neon branches.
- `request-shape` is an operator-only exception for an isolated production-build
  measurement. It does not authorize an agent to start a lane, bind a port, or
  stop a process.

## 2. Before you call it done

`pnpm verify:fast` (~60s: lint, typecheck, plus sub-second source-law gates).
`pnpm verify` for cross-cutting refactors. Fix or report — do not claim done on red.

## 3. Design system — primitives opt-in

`ds_contract` / `ds_tokens <axis>` / `ds_critique <file>` (MCP `design-mcp`, or
`node tools/design-mcp/ds.mjs <cmd>`) answer "does this primitive already exist"
and "what is the real token on this axis". Call them when you want the answer.
They no longer block writes — the PreToolUse stamp gate is removed.

Promotion path: build the component fast, prove it in the app, then pin it into
the design system when it is actually good.

**Placement default.** Filters, sort, date/time, staff, facets, views and modes
usually live in the left contextual sidebar, declared in `NAV_PAGE_DECLS`
(NavControls); the page body shows records. `ds_contract '<the job>'` returns a
placement suggestion and `ds_display_method` scores the display method — inputs,
not gates. The operator's spec wins. Run `ds_critique` on touched UI files.

Before adding a table action, destructive control, or local component wrapper,
read `docs/design-system/CONSOLIDATION_LEDGER.md`. Its JSON ledger is the living
delete/simplification list: reuse the named replacement, or add a queued entry
with an exit criterion before creating a fork. Retired forks fail `verify:fast`.

- **Routes and domain words** live in `src/lib/nav/route-tree.ts` (`ds_route` / `ds_vocabulary` /
  `ds_route_tree` look them up; verify `Routes` checks them). A new page is a new route-tree node:
  pick the path and label yourself, register it there, and build hrefs through its builder.

## 4. Product facts worth remembering

- "Omni Composer" / station mouth = `StationComposerHost`. Dumb stations keep
  `showModeRow`. Header tasks own Ticket versus station work; the bottom row has no Unbox|Ticket faces.
- Mobile-first is repo-wide: every operator verb should be completable on `/m/*`.
  Law: `docs/mobile-first/SURFACE_LAW.md`. Start URLs: `/m/pick`, `/m/work`.
- Nav: a lane is a `SidebarGroup`; icons at parent level only; a parent and a
  child never share a name. Detail: `src/lib/nav/lanes.ts`.
- SKU identity source of truth is CycleForge's own catalog (`sku_catalog.id`);
  Zoho is a demoted external fact (`catalog_external_ids`). Read titles through
  `resolveSkuIdentityTitle`, join with `SKU_CATALOG_JOIN_ON_SQL`.
- Inbound orders enter through ONE writer: `InboundOrderDraft` →
  `ingestInboundOrder` (`src/lib/inbound/`), identity `inbound_order`.
- Ship-by / date-in-a-cell is `DateRangePickerField variant="compact"`.
  Staff pickers are `AssigneeCombobox` via `StageStaffAssignPopover`.

## 5. Optional tools

- Code graph (`find_symbol` → `impact_analysis`, or
  `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs"`) for blast radius on shared
  components. It indexes this repo only; cross-repo callers are invisible.
- Eval cohorts (`pnpm run eval:cohort <id>`, `pnpm run eval:station <id>`) are
  available when a cohort-wide check is worth the time. Not a per-change ritual.
