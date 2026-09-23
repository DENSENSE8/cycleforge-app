# CycleForge — agent context

Short on purpose. Everything here changes what you do; nothing here is ceremony.
Deep detail lives in `docs/` and is read on demand, not injected every turn.

## 1. Dev origin — `http://localhost:3050`, and nothing else

`:3050` is the switchboard. It routes to the pinned lane and stamps the cookie
scope (`cf_kiosk` → `cf_kiosk__l7`), so a probe aimed at a lane port exercises a
different cookie namespace than the operator's browser.

- All curl / Playwright / browser probes / screenshots: `:3050`.
- Lane lifecycle: `systemctl --user {start,restart,status} cycleforge-lane@prod`,
  logs `journalctl --user -u cycleforge-lane@prod -f`.
- `:3050` dead or `503` with `x-switch-error` → the LANE is down. Start its unit.
  Never bind another port, never hand-start `next dev` on a lane port, never move
  `PW_BASE_URL`. `npm run dev` hitting `EADDRINUSE` on `:3050` is correct.
- DSNs live in the worktree `.env` only. A lane env file that sets `DATABASE_URL`
  silently overrides `.env` and splits reads across Neon branches.
- Exception: `request-shape` measures a production build on an isolated
  `NEXT_DIST_DIR` + throwaway port. Verify the result at `:3050`, then stop it.

## 2. Before you call it done

`pnpm verify:fast` (~60s: lint, typecheck, plus sub-second source-law gates).
`pnpm verify` for cross-cutting refactors. Fix or report — do not claim done on red.

## 3. Design system — opt-in, not a gate

`ds_contract` / `ds_tokens <axis>` / `ds_critique <file>` (MCP `design-mcp`, or
`node tools/design-mcp/ds.mjs <cmd>`) answer "does this primitive already exist"
and "what is the real token on this axis". Call them when you want the answer.
They no longer block writes — the PreToolUse stamp gate is removed.

Promotion path: build the component fast, prove it in the app, then pin it into
the design system when it is actually good.

## 4. Product facts worth remembering

- "Omni Composer" / station mouth = `StationComposerHost`. Dumb stations keep
  `showModeRow` and set `showModeFaces={false}`.
- Mobile-first is repo-wide: every operator verb should be completable on `/m/*`.
  Law: `docs/mobile-first/SURFACE_LAW.md`. Start URLs: `/m/pick`, `/m/work`.
- Nav: a lane is a `SidebarGroup`; icons at parent level only; a parent and a
  child never share a name. Detail: `src/lib/nav/lanes.ts`.
- SKU identity source of truth is the Zoho item — read through
  `resolveSkuIdentityTitle`, join with `SKU_CATALOG_JOIN_ON_SQL`.
- Ship-by / date-in-a-cell is `DateRangePickerField variant="compact"`.
  Staff pickers are `AssigneeCombobox` via `StageStaffAssignPopover`.

## 5. Optional tools

- Code graph (`find_symbol` → `impact_analysis`, or
  `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs"`) for blast radius on shared
  components. It indexes this repo only; cross-repo callers are invisible.
- Eval cohorts (`pnpm run eval:cohort <id>`, `pnpm run eval:station <id>`) are
  available when a cohort-wide check is worth the time. Not a per-change ritual.
