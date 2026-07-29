# Nav / routing refactor — validated plan + fresh-session execution prompt

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/nav-routing-refactor-EXECUTION-PROMPT.md` and execute Slice 1.

**Lineage:** probe brief → `docs/todo/sidebar-routing-probe-BRIEF.md` (the measured evidence).
Dashboard-scoped sibling plan → `docs/todo/dashboard-ia-rework-PLAN.md`.
This file supersedes the external Gemini response where they disagree; §1 says exactly where.

---

## 0. Verdict

**Adopt the architecture. Do not adopt the stated mechanism or the slice order.**

The decision rule, the per-surface disposition table, the collision fix, the event-bus mapping, and
the non-goals are sound and should be executed. But the plan's **central claim about *why* segments
fix the leak is false**, and it contradicts the plan's own §3.2. If the team believes segments alone
provide isolation, they will skip the schema work and the leak returns. Nine corrections below;
V1 and V2 are load-bearing.

---

## 1. Corrections (bake these in — do not inherit the originals)

**V1 — Segments do not isolate query params. This is the important one.**
The plan says *"Next.js naturally clears unpreserved query parameters upon hard navigation"* and
*"Next.js drops all query params not explicitly mapped, structurally stopping the leak."* **False.**
Next.js strips nothing. `router.push('/dashboard/outbound')` has no query string because you wrote
none — that is not a framework guarantee, it is the absence of a copy.

The actual leak source is one function:

```ts
// src/lib/sidebar-navigation.ts:978
export function applyModeTarget(current, target) {
  const params = new URLSearchParams(current.params.toString());  // ← copies EVERYTHING
  for (const [k, v] of Object.entries(target.params ?? {})) {
    if (v === null) params.delete(k); else params.set(k, v);      // ← then hand-deletes
  }
  return { pathname: target.pathname, search: params.toString() };
}
```

Every mode switch copies the whole namespace forward, then hand-deletes. **That is why the four
denylists exist, and segments do not change it** — `applyModeTarget` will happily carry `?triview=`
onto `/unbox`. Conversely, isolation is achievable *today, with zero routing changes*, by not
copying and validating at the boundary.

> **Corrected mechanism:** isolation = **(a) stop copying `searchParams` on navigation** +
> **(b) per-route param schema that drops unknown keys.** Segments are still worth doing — for
> layout ownership, server-side permission gating, code-splitting, and remount identity — but they
> are **not** the isolation mechanism. Never state that they are.

**V2 — Slice 1 is Receiving, not Dashboard.**
Receiving is the only surface where route segments **already exist** (`/unbox`, `/triage`,
`/incoming`, `/pickup`, `/repair`, `/receiving/history`), it carries the **largest denylist**
(17-key `MODE_SCOPED_PARAMS`), and it is **the surface with the reported bug** (Triage → Unbox).
Starting there proves the corrected V1 mechanism with **no routing change at all** — the clean
experiment. Dashboard/Operations first proves less and costs more.

**V3 — Dynamic-route collision hazard (unaddressed).**
`src/app/products/` contains only `page.tsx` and `[sku]/`. Adding `/products/catalog|manuals|
labels|pairing|qc|kit` **reserves six SKU values** — static segments beat dynamic in Next.js, so a
SKU named `kit` becomes unreachable. Every surface that pairs mode-segments with a dynamic child
needs an explicit answer (namespace the views, or namespace the dynamic child). Audit before
migrating: `products/[sku]`, `o/[orderId]`, `inventory/sku/[sku]`, `inventory/location/[barcode]`,
`receiving/lines/[id]`, `receiving/unfound/[kind]/[id]`.

**V4 — `nuqs` is not installed.** `package.json` has **zod ^4.3.6**, no `nuqs`. Adding a dependency
is a decision, not a given. A ~40-line zod parse-at-the-boundary helper covers the contract in §2
without a new dep. Default to zod-only unless Slice 1 shows it's insufficient.

**V5 — There is no `src/middleware.ts`.** The redirect plan requires creating one (runs on every
request, on Vercel) *or* using `next.config.ts` `redirects()` with `has: [{ type: 'query' }]` —
that file already has a `redirects()` block (`next.config.ts:96`). Also: **308 is cached by
browsers permanently.** Use **307 during migration**; switch to 308 only at sunset, once the
mapping is proven.

**V6 — "Nested layouts solve the god-component problem" only if the layout doesn't branch.**
Moving `ReceivingSidebarPanel`'s `mode === 'incoming' ? … : mode === 'repair' ? …` chain
(`:253-361`) into `layout.tsx` **relocates** the god component. Each segment must own its panel
content; the shared rail engine (`SidebarRailShell` / `RecentActivityRailBase`) stays composed
underneath. Splitting the branch is the work; the layout is just where the shared part lands.

**V7 — The uniform-rail recommendation is under-specified.** It is now at least house-legal
(applied to all 15 surfaces, no fork). But the dormant code is **horizontal `HorizontalButtonSlider`
pills in `SidebarShell headerAbove`**, not a vertical rail — Products (6 modes) and Support (6) will
overflow a 360px column. And it reverses a deliberate completed migration
(`MasterNavContext.tsx:18`). **Keep it out of Slices 1–4; it is its own decision** (see §5 D1).

**V8 — `app-refresh-data` → one key is wrong.** There is no `['app-data']` query key. 38 emit sites
each need mapping to their real domain key, plus `router.refresh()` where server components are
involved. Budget it as a per-site sweep, not a one-line swap.

**V9 — Five gaps to add.**
(a) `warmActiveView(queryClient, window.location.search)` (`dashboard/page.tsx:126`) reads the
**search string** — segment migration breaks boot warm-up.
(b) `getSidebarRouteKey()`'s ~45-branch ladder (`sidebar-navigation.ts:289+`) should largely **die**
once each segment's `layout.tsx` owns its panel — the plan under-sells this; it's the biggest
deletion available.
(c) Permission gating should move **into each segment's `layout.tsx`, server-side** — a real win the
plan never mentions. Keep the route-prefix table + its `verify` drift check coherent.
(d) Test blast radius is unlisted: `tests/e2e/dashboard-inbound-mode.spec.ts`,
`sidebar-navigation.test.ts:308`, plus every e2e that navigates by `?mode=`.
(e) **Five API routes read `?mode=`** (`support/tickets/link`, `fba/logs/summary`,
`repair/ecwid-products`, two Zoho crons). These are unrelated domain params —
**do not migrate them**, do not "helpfully" rename them.

---

## 2. The isolation contract (the thing being built)

Three rules. Everything else in this refactor exists to make these enforceable.

1. **Navigation never copies the current query string.** A target URL is constructed from a
   declared param set only. `applyModeTarget`'s copy-then-delete is deleted, not extended.
2. **Every route declares the params it owns**, as a zod schema. Reading a param not in the
   owning route's schema is a bug. Unknown params are dropped at the boundary.
3. **A param is owned by exactly one route.** Collisions are a build-time failure, not a
   convention.

**Guardrail tests (ship with Slice 1, they only ratchet tighter):**
- `param-ownership.guard.test.ts` — every declared param maps to exactly one owner; two owners = fail.
- `route-mode-registry.guard.test.ts` — mode ids unique after namespacing (§4); every mode's target
  resolves to a real route.
- Lint rule (or a guard test grepping `src/`): raw `searchParams.get('<key>')` outside the owning
  route's schema module is banned. Seed the allowlist from today's reality and **only shrink it** —
  same discipline as the DS ratchets in `npm run verify`.

---

## 3. Slice plan (corrected order)

Each slice is independently shippable and ends green on `npm run verify`.

### Slice 1 — Receiving isolation, no routing change *(start here)*
**Proves V1's corrected mechanism on the surface with the actual bug.**
1. Write the zod param-schema helper (`src/lib/routing/route-params.ts`): declare-owned-params,
   parse, drop unknown. No new dependency.
2. Declare schemas for the six receiving segments (`/unbox`, `/triage`, `/incoming`, `/pickup`,
   `/repair`, `/receiving/history`) — owners for `unboxview`, `triview`, `incview`, `triq`,
   `state`, `sort`, `dir`, `colsort`, `coldir`, `po_from`, `po_to`, `page`, `ticketView`, `job`.
3. Rewrite receiving navigation to **construct, not copy**.
4. **Delete** `MODE_SCOPED_PARAMS` (`useReceivingMode.ts:47`) and the receiving half of
   `stripCrossSurfaceParams` (`surface-isolation.ts`).
5. Add the three guardrail tests from §2.
6. Add an e2e that fails on the reported bug: set a Triage-only param, switch to Unbox, assert it
   is gone and that Unbox's list is unaffected.

**Done when:** the Triage→Unbox leak is gone, two denylists are deleted, and no route moved.

### Slice 2 — Event-bus paydown
Map all 38 `app-refresh-data` sites and 11 `dashboard-refresh` sites to real domain query keys
(V8). Convert `receiving-scan-resolved` / `receiving-package-updated` / `sku-pairing-updated` to
mutation `onSuccess`. **Keep** `receiving-focus-scan` and scan-hotkey events — imperative DOM focus
is legitimate. Delete `receiving-clear-line` once Slice 1 makes it redundant.

### Slice 3 — One surface to segments (proving run: Outbound `/shipping`)
`/shipping/layout.tsx` owns the shell + panel; `labels|ready|fba|scan-out` become `page.tsx`
siblings. Split `OutboundSidebarPanel`'s mode branch per V6. Move the permission gate into the
layout, server-side (V9c). Redirect legacy `?mode=` per §6. Chosen because it has no dynamic child
route — **no V3 collision risk** — so it isolates the routing variable.

### Slice 4 — Registry rewrite
Namespaced mode ids (§4). `SIDEBAR_PAGE_NAV` targets become paths. Delete the remaining denylists
(`SUPPORT_MODE_CLEAR_PARAMS`, the dashboard `params: {…: null}` literals). Collapse
`getSidebarRouteKey` as segment layouts take over panel dispatch (V9b). Fix `warmActiveView` (V9a).

### Slice 5+ — Remaining surfaces, behind flags
Order by risk: no-dynamic-child first (`operations`, `sourcing`, `review`, `packer`, `warehouse`,
`support`, `admin`, `walk-in`, `tech`), then the V3-hazard ones (`products`, `inventory`,
`dashboard`) once V3 has a decided answer.

---

## 4. Naming / collisions

Adopt the namespaced ids: `outbound.labels`, `warehouse.labels`, `products.labels`,
`receiving.triage`, `inventory.triage`, `receiving.pickup`, `walk-in.pickup`, `products.pairing`,
`review.pairing`, `operations.history`, `receiving.history`. Enforced by the registry guard test
(§2). URL-level collisions resolve naturally once modes are segments.

---

## 5. Decisions still open — do not proceed past Slice 4 without answers

- **D1 — Persistent mode rail vs. MasterNav dropdown.** Reverses a completed migration; the dormant
  code is horizontal pills that will overflow at 6 modes (V7). Own decision, own rationale.
- **D2 — V3 collision policy.** How `/products/qc` and a SKU named `qc` coexist. Blocks Slice 5 for
  products/inventory/dashboard.
- **D3 — Middleware vs. `next.config.ts` redirects** (V5), and the 307→308 sunset date.
- **D4 — nuqs or zod-only** (V4). Default zod-only; revisit after Slice 1.

---

## 6. URL compatibility

Per surface: legacy `?mode=`/`?view=`/`?tab=`/`?section=`/`?packMode=`/`?fbaMode=` → the new
segment. **307 during migration, 308 at sunset** (V5). Keep `resolveMode` as a dual-read shim only
while its surface is mid-migration; delete it with that surface's slice. Update the e2e/unit specs
in V9d in the same slice that changes their URLs — never leave them asserting a dead contract.

---

## 7. Hard constraints for the executing session

- **Never state that route segments strip query params** (V1). Isolation is no-copy + schema.
- **Never raise a `verify` ratchet baseline** to land a slice. Baselines only shrink.
- **Do not touch the five API `?mode=` params** (V9e).
- **Do not restyle.** No new visual language, no token changes, no geometry changes.
- **Do not swap the router.** Next.js App Router stays.
- Preserve `SidebarShell`, `SidebarRailShell`/`useSidebarRail`, route-level code-splitting, the
  permission model, and the Station/Workbench/Monitor/Canvas region contracts.
- Mobile (`/m/*`) stays a parallel tree. Not in scope.
- One worktree lane; `main` is the integration lane. `npm run verify` green before each slice lands.
- Commits only when the user asks.
