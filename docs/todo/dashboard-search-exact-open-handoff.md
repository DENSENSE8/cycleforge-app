# Handoff: Dashboard Search exact-open flash (Playwright + fix)

**For:** Claude Code (or any agent continuing this lane)  
**Lane:** `main` (WS-DOGFOOD)  
**Status:** **Fixed (2026-07-22)** — `useDashboardSearchOrder` bridges lookup miss → sole matching ORDER from retrieve (stays `resolving` until settled); `useAiQuickJump` clears stale hits on retype; e2e lock in `tests/e2e/dashboard-search-exact-open.spec.ts` (human # `27-14721-28101` / `PW_SEARCH_ORDER_HUMAN`). Dogfood IDs `27-14721-28101` + `08-14924-82211` both exist as exact `orders.order_id` rows.  
**Do not edit:** prior plan files `search_exact-open_fix_*.plan.md` / `remove_search_pills_*.plan.md` (already implemented).

---

## Prompt (paste into Claude Code) — historical; fix landed

```text
You are continuing Cycle Forge Dashboard Search work on lane `main`.

## Mission

Dogfood still fails for eBay order id `08-14924-82211`:
1. Search lands on grouped results ("1 result for … · ORDERS 1") instead of Search order detail.
2. Clicking the ORDER row flashes (Loading…) then returns to the results list / shows nothing useful.

Category pills are already removed. Do NOT re-add them.

Goal:
1. **Prove the bug with Playwright** against the live dogfood tenant (USAV auth via global-setup).
2. **Fix the root cause** so identifier Enter + row click stably open `SearchOrderDetailView` → `SearchOrderDetailShell`.
3. Leave the e2e green as the regression lock.

## Read first

- `AGENTS.md` (SoT + compose→grow; user owns commits; never stash)
- This handoff: `docs/todo/dashboard-search-exact-open-handoff.md`
- Code:
  - `src/components/dashboard/search/DashboardSearchView.tsx` (identifier resolve + sole-hit)
  - `src/components/dashboard/search/SearchOrderDetailView.tsx` (resolve + notfound redirect)
  - `src/lib/search/resolve-search-order.ts` (lookup + `/api/orders/:id` mapping)
  - `src/lib/search/search-hit.ts` (`orderSearchHref`, `looksLikeIdentifier`, `shouldAutoOpenSearchOrder`)
  - `src/components/sidebar/dashboard/DashboardSearchSidebar.tsx` (sole-order auto-open + attempt guard)
- Playwright house patterns: `tests/e2e/order-full-page.spec.ts`, `tests/e2e/global-setup.ts`, `playwright.config.ts`
- Worklog: `pnpm worklog:tail`

## Primary hypothesis (verify first — likely Strict Mode race)

In `DashboardSearchView` identifier effect:

```ts
identifierAttemptRef.current = q;   // set BEFORE await
void (async () => {
  const next = await resolveSearchOrder(q);
  if (cancelled) return;            // Strict Mode cleanup sets cancelled
  if (next.status === 'ok') router.replace(orderSearchHref(...));
})();
return () => { cancelled = true; };
```

React Strict Mode (dev): mount → set attempt ref → start fetch → cleanup `cancelled=true` → remount → `identifierAttemptRef.current === q` → **early return, never opens**. First fetch completes cancelled. Matches "stuck on 1 result list".

Fix pattern: only set `identifierAttemptRef` after a successful navigate, OR clear attempt ref in the cleanup when cancelled before success, OR use an incrementing generation token instead of a sticky attempt key that blocks remount.

Also verify network:
- `GET /api/orders/lookup/08-14924-82211` → 200 + `order.id` + `order.order_id`
- `GET /api/orders/{numericId}` → 200 + mappable payload (`toShippedOrderFromApi` needs `id` + `order_id`)
- If lookup 403/404 → paint stays on list (by design for Zoho PO); this eBay id MUST succeed.

Click flash path: `handleSelectHit` → `openOrderId={numeric}` → `SearchOrderDetailView` → resolve. Numeric `notfound` must NOT redirect (already gated). If you still see results list after click, something is clearing `openOrderId` (sidebar attempt loop, human redirect, or router race). Trace URL + Network in the e2e.

## Constraints

- Stay on current branch/worktree; user owns commits; never `git stash`.
- Compose/grow SoT — keep `resolveSearchOrder` as the only resolve path; do not resurrect inline resolve or shipped panel.
- Do not reintroduce category pills / `?type=` Overview tabs.
- Zoho PO false-open must stay fixed: identifier with **no** sales-order lookup hit stays on grouped results (never force dead `openOrderId`).
- Add `data-testid`s only if selectors are brittle — prefer role/text already in the shell.
- `npm run verify` green before done; append `pnpm worklog`.

## Playwright acceptance (ship `tests/e2e/dashboard-search-exact-open.spec.ts`)

Env (optional overrides; defaults target dogfood fixture from screenshot):
- `PW_SEARCH_ORDER_HUMAN=08-14924-82211` (human eBay order #)
- `PW_SEARCH_ORDER_TITLE` substring optional (e.g. `Bose Two-pin`)

Project: `--project=desktop` (skip mobile).

### Spec A — deep-link with human q only (auto-open)

1. `page.goto('/dashboard?mode=search&q=08-14924-82211&map=search')`
2. Wait until URL has `openOrderId=` matching `/^\d+$/` (timeout ≥ 20s).
3. Assert **not** stuck on results: `getByText(/1 result for/i)` is hidden.
4. Assert detail shell: header shows human order # `08-14924-82211` (copy button / Order # eyebrow).
5. Assert section tabs visible (`Timeline` default among Shipping/Product/Documents/Timeline/Customer…).
6. Capture screenshot on failure to `test-results/`.

### Spec B — row click from results (if auto-open disabled or as force path)

1. Navigate with a query that lists the hit **without** auto-open, OR temporarily block auto-open by going to results after a deliberate back — prefer: intercept/abort lookup once so list paints, then click.
   Simpler path if A fails: `goto` results URL, wait for row with text `08-14924-82211`, click the ORDER row link.
2. Expect URL `openOrderId=\d+` and detail shell as in A within 15s.
3. Assert no bounce: after settle, URL still has `openOrderId` for ≥ 2s; results copy stays hidden.

### Spec C — API smoke (same storageState)

1. `request.get('/api/orders/lookup/08-14924-82211')` → ok, `body.order.id` finite, `body.order.order_id` matches.
2. `request.get('/api/orders/' + id)` → ok, `body.order.order_id` present.
3. Fail the suite early with a clear skip/message if fixture missing (404) — do not soft-pass.

### Network assertions (in A or B)

Listen for:
- lookup and/or `/api/orders/:id` responses
- Fail if detail URL appears then disappears (flash regression)

Run:
```bash
pnpm exec playwright test tests/e2e/dashboard-search-exact-open.spec.ts --project=desktop
```
Dev server must already be up on this worktree's port (`pnpm dev`). Auth: `tests/.auth/admin.json` via global-setup.

## Done when

- [x] Root cause identified (dual-engine: lookup miss / race + identifier sole-hit auto-open blocked; sidebar click wrote numeric `openOrderId`).
- [x] Fix landed; identifier Enter/deep-link opens `SearchOrderDetailShell` without list flash (lookup → retrieve bridge).
- [x] Lookup-miss path still opens via retrieve bridge and stays there (`dashboard-search-exact-open.spec.ts` Spec B).
- [x] `tests/e2e/dashboard-search-exact-open.spec.ts` added (human # + API smoke).
- [x] Zoho-PO case still does not force openOrderId when retrieve has no matching sole ORDER (`soleMatchingOrderHit` returns null).
- [x] `npm run verify` passes (run on land).
- [x] `pnpm worklog "…"` appended.
```

---

## Observed dogfood (2026-07-21)

Screenshot after pill removal:

- URL mode: Search results (no `openOrderId` in chrome)
- Copy: `1 result for "08-14924-82211" · keyword`
- Group: `ORDERS 1` — Bose Two-pin speaker cable… · `08-14924-82211 · 00210-P-1 · EBAY` · badge `ORDER`
- Pills: gone (correct)
- Click: flash, no durable detail

So retrieve **finds** the order; display path fails to **open or keep** detail.

---

## Code map (current)

| Path | Role |
|---|---|
| `DashboardSearchView` | Identifier → `resolveSearchOrder(q)` → `orderSearchHref`; sole-hit `onResults` backup for non-identifiers |
| `SearchOrderDetailView` | Resolve `openOrderId`; numeric notfound stays empty; human notfound → results |
| `resolve-search-order.ts` | Human → `/api/orders/lookup/:id`; numeric → dashboard queue then `/api/orders/:id` |
| `orderSearchHref` | `/dashboard?mode=search&openOrderId=…&map=search&q=…` |
| `SearchOrderDetailShell` | Two-column detail (header + summary + section tabs) |
| `DashboardSearchSidebar` | Sole ORDER auto-open + attempt guard (map=search) |

---

## Fix sketch (if hypothesis confirms)

Prefer generation token over sticky attempt-before-await:

```ts
const genRef = useRef(0);
useEffect(() => {
  if (openOrderId || !q || !looksLikeIdentifier(q)) return;
  const gen = ++genRef.current;
  let cancelled = false;
  void (async () => {
    const next = await resolveSearchOrder(q);
    if (cancelled || gen !== genRef.current) return;
    if (next.status === 'ok') {
      router.replace(orderSearchHref(next.order.id, q));
    }
  })();
  return () => {
    cancelled = true;
  };
}, [openOrderId, q, router]);
```

Do **not** set `identifierAttemptRef = q` before the await in a way that blocks Strict Mode remount. If you keep an attempt ref, set it only after successful `replace`, or clear it in cleanup when `!openOrderId`.

---

## Out of scope

- Rebuilding Overview/Orders/Units category pills
- Journey Trace as Enter default (secondary only)
- Unifying sidebar `useAiQuickJump` vs Overview `/api/ai/retrieve` into one fetch
