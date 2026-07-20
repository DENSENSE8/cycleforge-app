# Prompt: Debug Unbox refresh stickiness (Playwright + browser)

Copy everything below the line into Claude Code.

---

## Mission

Unbox PO edit refresh stickiness is **still broken** after a supposed fix. Prove it with Playwright against the live dogfood app, find **why**, fix the root cause in the SoT (not a page-local hack), add a regression e2e, and leave `npm run verify` green.

**Expected UX:** On `/unbox`, select a carton/PO and enter the edit overlay. Hard refresh (or `page.reload()`). Land back on the **same editing PO workspace**, not the browse Queue/Viewed/History crossfade dashboard.

**Broken UX today:** Refresh returns the browse workbench underlay.

## Repo / lanes

- Repo: `cycleforge-app` (this checkout)
- Branch: stay on current lane; do not create ad-hoc branches or stash
- Dev server: `pnpm dev` on main lane (usually `http://localhost:3000`)
- Auth: Playwright `tests/.auth/admin.json` from `global-setup.ts` (pinless USAV admin)
- Desktop project only (`test.skip` mobile)

## What was already implemented (suspect — verify, don't trust)

| Piece | Path |
|---|---|
| URL helper | `src/lib/receiving/unbox-selection-url.ts` (`applyUnboxOpenReceivingParams`, `pickReceivingLineForDeepLink`) |
| Pane sync + restore | `src/components/receiving/useReceivingWorkspacePane.ts` — writes `?openReceivingId=` + `?lineId=` on `receiving-workspace-open`; clears on close; restore fetch prefers `lineId` |
| Overlay shell | `src/components/receiving/unbox/UnboxLineWorkspace.tsx` — browse underlay always mounted; edit when `workspace` set |
| Edit mount hook | `[data-testid="receiving-workspace"]` |
| Browse underlay | `UnboxWorkspaceView` (tabs + KPI + table) — visible when overlay absent |
| Plan | `.cursor/plans/unbox_refresh_stickiness_0db2064b.plan.md` |

Known footguns to check first:

1. **Bridge mount close wipe** — `useReceivingWorkspaceBridge` dispatches `receiving-workspace-close` when `selectedLine` is null on mount. If that clears URL params before the deep-link restore effect runs, refresh always lands browse-first. The close handler tries to guard this (`workspaceRef` / `pendingOpenKeyRef`); confirm it actually works in the browser timeline.
2. **`isUnboxSurface` gate** — sync only runs when `receivingSurfaceBasePath(pathname) === UNBOX_SURFACE_ROUTE`. Confirm pathname is `/unbox` when selecting (not legacy `/receiving`).
3. **Race: URL write vs restore** — `pendingOpenKeyRef` / `ignoredOpenKeyRef` / `deepLinkedKeyRef` may skip restore or clear params incorrectly.
4. **`receiving_id` null** — unmatched / optimistic rows may open workspace without a carton id → sync no-ops → nothing in URL.
5. **Dual deep links** — share uses `?recvId=`; session SoT uses `?openReceivingId=`. Don't break share; fix session stickiness.
6. **Table deep-link path** — `useReceivingDeepLink` (`?recvId=`) is separate; refresh stickiness must not depend on the table finishing load.

## Phase 0 — Reproduce in Playwright (mandatory before coding)

1. Ensure dev server is up on `:3000` (or the lane port). If not, start `pnpm dev`.
2. Create `tests/e2e/unbox-refresh-stickiness.spec.ts` (desktop-only) that:

```ts
test.use({ storageState: 'tests/.auth/admin.json' });
// skip mobile project
```

**Test A — live open → URL → reload (primary bug)**

1. `page.goto('/unbox', { waitUntil: 'networkidle' })`
2. Open a carton via one of:
   - Click first row in Unboxed rail: `ul[aria-label="Unboxed activity"] li[role="option"]` (if rows exist), OR
   - Click a row in the Queue/History table once it paints, OR
   - If empty tenant data: seed via API / reuse mock patterns from `tests/e2e/receiving-scan-resolution.spec.ts`
3. Assert edit overlay: `await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15000 })`
4. **Capture URL immediately** after open:
   - `const url = new URL(page.url())`
   - Log `openReceivingId`, `lineId`, `recvId`, full search
   - **Assert** `openReceivingId` is a digit string (THIS is the first failure point if sync never writes)
5. `await page.reload({ waitUntil: 'networkidle' })`
6. Assert again: `receiving-workspace` visible within ~15s
7. Assert URL still has the same `openReceivingId` (and preferably same `lineId`)
8. Assert browse underlay is NOT the interactive surface (workspace overlay present). Soft check: `aria-label="Unbox attention"` KPI may still be in DOM (underlay stays mounted) — **do not** treat KPI presence as failure; the fail signal is missing `receiving-workspace`.

**Test B — cold deep link (control)**

1. From Test A, keep the `openReceivingId` (+ `lineId` if present)
2. Fresh `page.goto(`/unbox?openReceivingId=${id}&lineId=${lineId}`)`
3. Expect `receiving-workspace` visible
4. If B passes and A fails after reload → write path or close-wipe bug
5. If B fails → restore fetch / `dispatchSelectLine` / bridge bug

**Test C — instrumentation (while debugging)**

Before goto, optionally `page.addInitScript` to log:

- `receiving-workspace-open` / `receiving-workspace-close` / `receiving-clear-line` CustomEvents
- `history.replaceState` / `pushState` URL changes
- Or use Playwright `page.on('console')` after adding temporary `console.debug` in `useReceivingWorkspacePane`

Record a short timeline: mount → bridge close? → URL stripped? → restore fetch? → select? → open?

Run:

```bash
npx playwright test tests/e2e/unbox-refresh-stickiness.spec.ts --project=desktop --reporter=list
```

Headed when useful:

```bash
npx playwright test tests/e2e/unbox-refresh-stickiness.spec.ts --project=desktop --headed --debug
```

## Phase 1 — Diagnose from evidence

Do **not** guess-fix. From Test A/B output, classify:

| Symptom | Likely root |
|---|---|
| After open, URL has no `openReceivingId` | Sync never fires / `isUnboxSurface` false / `receiving_id` null / open event not reaching pane |
| URL set, then briefly cleared before reload | Mount/bridge close wipe, tab clear, or mode effect |
| URL survives reload but workspace never opens | Restore effect skipped (refs), fetch fail, `dispatchSelectLine` not bridging to open |
| Workspace flashes then browse | Open then close race; ignored/pending key wrong |
| B works, A reload fails | Something about reload order vs first paint (Suspense table? paint mark?) |

Read and trace:

- `src/components/receiving/useReceivingWorkspacePane.ts`
- `src/components/sidebar/receiving/useReceivingWorkspaceBridge.ts`
- `src/components/sidebar/receiving/useReceivingSelection.ts`
- `src/lib/receiving/unbox-selection-url.ts`
- `src/components/receiving/unbox/UnboxLineWorkspace.tsx`

## Phase 2 — Fix

- Fix the **SoT** (`useReceivingWorkspacePane` / `unbox-selection-url` / bridge contract), not a one-off in `UnboxLineWorkspace`
- Keep browse-first when URL has no open param
- Preserve `unboxview` / `ticketView` on replace
- Clear params on intentional close / exit-to-list / delete recovery
- Do **not** raise knip/DS baselines; do not `--no-verify`

## Phase 3 — Lock with e2e + verify

1. Keep `tests/e2e/unbox-refresh-stickiness.spec.ts` green (at least Test A + B)
2. Prefer deterministic data: mock `GET /api/receiving-lines?receiving_id=` like `receiving-scan-resolution.spec.ts` if live data is flaky; still exercise real URL sync + reload
3. Unit tests for helper already exist — extend if restore pick logic changes
4. `npm run verify` must pass
5. `pnpm worklog "…"` with result when done

## Success criteria

- [ ] Playwright proves: open carton → URL has `openReceivingId` → reload → `receiving-workspace` visible with same carton
- [ ] Cold `?openReceivingId=` deep link still works
- [ ] Close/exit returns to browse and strips the params
- [ ] Root cause named in the worklog / final reply (one sentence)
- [ ] `npm run verify` green

## Out of scope

- Triage stickiness (unless the same bug is free to fix in the shared hook)
- Unifying `recvId` vs `openReceivingId` forever
- localStorage last-carton restore
- Unrelated Unbox siderail stagger / flush work

## Compound note (after fix)

If dashboard `openOrderId` and Unbox `openReceivingId` share the same pending/ignored race pattern, consider a tiny shared `useUrlSelectionParam` later — recommend only; don't expand scope mid-fix.
