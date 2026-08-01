# Worked examples (Cycle Forge)

Illustrative only — these paths and commit SHAs are **not** skill requirements. Use them to see how the portable contract landed in one codebase.

## Commits

| SHA | What it proved |
|-----|----------------|
| `90a94c37c` | Receiving isolation: specs + `buildRouteUrl` / `parseRouteParams`; three denylists deleted; e2e failed on hook-only fix |
| `8240762da` | Boundary-parse of a **copied** string was not enough — sibling shared keys (`open`, `q`, `sort`) still rode; emit target delta only |
| `3e42e8462` | Last denylists gone across Support / Dashboard / Operations / Home; ownership guard caught undeclared Support reads |

Through-line: **nine denylists, ~86 keys deleted, with zero surfaces moved to segments to achieve isolation.**

## Waist modules

### Param contract — `src/lib/routing/route-params.ts`

- `defineRouteParams` / `RouteParamsSpec` — `owns` + optional `carries`
- `buildRouteUrl(spec, values)` — construct; never reads current location
- `parseRouteParams(spec, params)` — boundary drop of unknown / invalid keys
- `paramRoundTrip(existingParser)` — compose house parsers (no second enum SoT)
- `AMBIENT_PARAMS` + `SHARED_OWNED_KEYS` — ambient carries and shrink-only shared ownership

### Live mode switch — `src/lib/sidebar-navigation.ts` (`applyModeTarget`)

The leak was copy-then-hand-delete. After migration:

1. Resolve `routeParamsFor(target.pathname)`.
2. Start an empty `URLSearchParams`.
3. Optionally carry explicit prefs (`staff` / legacy `staffId`).
4. Apply **only** `target.params` (the mode's declared delta).
5. Return `parseRouteParams(spec, next)`.

Comment in tree: sibling Shipping modes share key names, so parse-of-copy kept a stale `?open=` and the focused order followed the operator.

### Ownership guard — `src/lib/routing/param-ownership.guard.test.ts`

- Exactly one owner per key unless listed in `SHARED_OWNED_KEYS` (shrink-only).
- No ambient key re-owned by a route.
- No raw `.get('literal')` in governed trees unless declared (or on shrink-only `UNDECLARED_READS`).
- Every `*_PARAM = 'key'` constant declared or excused — closes the blind spot for `searchParams.get(CONSTANT)` (live defects: `?pane=`, station `layout` / `density` / `weekOffset`).

## Edge cases observed

### Hook-only miss

The **live** path is master nav → `useSidebarModeNav` → `applyModeTarget`, not the surface's `useReceivingMode.updateMode` (pill row suppressed under `MasterNavProvider`). Fixing only the hook left Triage→Unbox leaking; `tests/e2e/receiving-param-isolation.spec.ts` caught it.

### Construct-from-delta after schema

First cut boundary-parsed a copied search string. Shared keys across sibling modes still leaked. Second cut (`8240762da`) emits destination delta + staff preference only, then parses.

### Undeclared reads worse than leaks

When Support/Dashboard specs landed (`3e42e8462`), the guard found params Support actually reads (`createTicket`, `tq`, `tstatus`) that no spec declared — they would have been **dropped on arrival** (silent null), a worse bug than the leak being fixed. Also a `view` declaration nothing read.

### Segments are not isolation

External research asserted route segments would isolate query state. Next.js (and peers) strip nothing; `router.push('/unbox')` has an empty query only because nobody wrote one. Segments remain useful for layout ownership, remount identity, and server gating — not for this leak class.

## Anti-patterns deleted

- `MODE_SCOPED_PARAMS` / `OUTBOUND_MODE_SCOPED_PARAMS` / `SUPPORT_MODE_CLEAR_PARAMS` / …
- Receiving half of `stripCrossSurfaceParams`
- `clearReceivingHistoryUrlParams`
- Dashboard per-target `params: { …: null }` wipe maps used as denylists

Replace with: declare → construct on navigate → parse on land → ownership + undeclared-read ratchet.
