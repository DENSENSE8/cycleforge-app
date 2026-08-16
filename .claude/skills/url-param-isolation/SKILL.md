---
name: "url-param-isolation"
description: "Isolate query params across mode/surface switches by constructing destination URLs from declared sets and parsing with per-route schemas — never copy-then-denylist. Use when: adding or changing mode navigation, declaring query-param ownership, hardening cross-surface URL hygiene, or debugging params that follow the user between modes or pages."
---

# URL Param Isolation

> Construct destination query params from a declared set; drop unknowns at a schema boundary. Never copy the current search string and hand-delete keys.

**Not this skill:** mount-gated open **paint** (pending until soft-replace) lives in
`src/lib/routing/optimistic-url-param.ts` + `useOptimisticUrlParam` — see
`AGENTS.md` + `src/lib/routing/optimistic-url-param.ts`. Isolation owns
construct/parse; paint owns click→mount latency. Do not merge the two jobs.

## Quick Reference

| Problem | Solution |
|---------|----------|
| Params leak across mode switches | Construct destination URL from declared delta only — never copy current search |
| Denylist always lags new keys | Delete denylists; own params via per-route schema |
| "Segments will isolate us" | Segments are layout/remount — not isolation; router still needs empty or constructed query |
| Shared keys across sibling modes | Emit only target delta (+ explicit preference carries); do not rely on parse alone |
| Spec drift / undeclared reads | Ownership guard + shrink-only undeclared-read ratchet |
| Open overlay waits on soft-replace | Paint-pending SoT (`optimistic-url-param`) — not isolation |

## The Problem

Mode or surface switches that copy `location.search` (or `URLSearchParams`) and then denylist-delete keys leak shared params (`open`, `q`, `sort`, …) into the destination. Denylists (`MODE_SCOPED_*`, `stripCrossSurface*`) always lag new params — every undeclared key is a silent leak until someone remembers to list it. Moving the surface to route segments does **not** fix this: frameworks strip nothing on their own. Isolation is **construct-from-declared-set** plus **boundary-parse with a schema**.

## Solutions

### Option 1: Declare → construct → parse → guard (Recommended)

Three rules:

1. **Navigation never copies the current query string.** Build the target from a declared value set.
2. **Every route declares the params it owns** (schema). Unknown keys and invalid values are dropped at the boundary.
3. **A param is owned by exactly one route** (exceptions are an explicit shrink-only shared list).

```ts
import { z } from 'zod';

type ParamSchema = z.ZodType<string>;

interface RouteParamsSpec {
  route: string;
  owns: Readonly<Record<string, ParamSchema>>;
  /** Operator prefs / ambient keys this route accepts on arrival. */
  carries?: readonly string[];
}

function declaredKeys(spec: RouteParamsSpec): string[] {
  return [...Object.keys(spec.owns), ...(spec.carries ?? [])];
}

/** Construct — never reads current location. */
function buildRouteUrl(
  spec: RouteParamsSpec,
  values: Readonly<Record<string, string | number | null | undefined>> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === '') continue;
    const schema = spec.owns[key]; // or ambient schema for carries
    const parsed = schema?.safeParse(String(value));
    if (parsed?.success) params.set(key, parsed.data);
  }
  const qs = params.toString();
  return qs ? `${spec.route}?${qs}` : spec.route;
}

/** Boundary parse — keep only declared keys that pass schema. */
function parseRouteParams(
  spec: RouteParamsSpec,
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of declaredKeys(spec)) {
    const raw = params.get(key);
    if (raw === null) continue;
    const schema = spec.owns[key]; // or ambient for carries
    const parsed = schema?.safeParse(raw);
    if (parsed?.success) next.set(key, parsed.data);
  }
  return next;
}
```

**Mode-switch path** — emit target delta only, then boundary-parse:

```ts
function applyModeTarget(
  current: { pathname: string; params: URLSearchParams },
  target: { pathname: string; params?: Record<string, string | null> },
  spec: RouteParamsSpec | null,
  preferenceKeys: readonly string[] = ['staff'], // explicit carries only
): { pathname: string; search: string } {
  if (!spec) {
    // Legacy: still prefer construct when you can; avoid copy+denylist.
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(target.params ?? {})) {
      if (v !== null) params.set(k, v);
    }
    return { pathname: target.pathname, search: params.toString() };
  }

  const next = new URLSearchParams();
  for (const key of preferenceKeys) {
    const v = current.params.get(key);
    if (v) next.set(key, v);
  }
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value !== null) next.set(key, value);
  }
  return {
    pathname: target.pathname,
    search: parseRouteParams(spec, next).toString(),
  };
}
```

**Ownership guard** (CI): one owner per key; fail on `searchParams.get('…')` / `*_PARAM` constants whose keys are not declared; `UNDECLARED_READS` and shared-key exceptions **only shrink**.

### Option 2: Preference carry (explicit allowlist)

Some operator prefs (staff filter, density) may ride a mode switch. List them by name on the navigate call — never "copy everything except …".

```ts
// ✅ Explicit preference carry
const PREFERENCE_CARRIES = ['staff'] as const;

// ❌ Denylist — always lags
const STRIP_ON_MODE_SWITCH = ['open', 'q', 'sort', 'triq', /* … */];
```

`carries` on a route spec governs what a **pasted deep-link or back entry** may keep on arrival. It does **not** mean "survives every navigation" — rule 1 still applies unless the navigate path opts in.

### Option 3: Compose existing parsers (`paramRoundTrip`)

Do not re-type a vocabulary that already has a source of truth (tab ids, sort options). A duplicated enum is a second SoT and drifts on the next add.

```ts
function paramRoundTrip(
  parse: (raw: string) => string | null | undefined,
): z.ZodType<string> {
  return z
    .string()
    .transform((raw) => raw.trim())
    .pipe(z.string().refine((value) => parse(value) === value));
}

// Existing SoT stays the only list:
const tabParam = paramRoundTrip((raw) =>
  parseMyTab(raw) === raw ? raw : null,
);
```

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Construct + schema + guard | Denylists deletable; new keys cannot silently leak; invalid values dropped | Upfront specs; navigate paths must be audited |
| Copy + denylist | Fast to ship once | Always lags; every new param is a leak until listed |
| Segments alone | Layout ownership, remount identity, server gating | **Zero** query isolation — still need empty or constructed query |
| Boundary-parse of a copied string | Drops unknown keys | Shared sibling keys (`open`, `q`) still ride — construct-from-delta required |

## Edge Cases

- Fix the **live** nav path (master nav / central `applyModeTarget`), not only the surface's own `updateMode` hook — e2e often catches the hook-only miss.
- Sibling modes may own the **same key name**; construct-from-delta is required even with a schema.
- Ownership guard catching **undeclared reads** is as important as catching leaks — undeclared keys are dropped on arrival and read as `null` (silent revert).
- Constant-based reads (`searchParams.get(SOME_PARAM)`) evade literal greps; guard `*_PARAM = 'key'` declarations too.
- Presence flags (`?shipped` with empty value) need a schema that accepts `''` if the UI uses `.has()`, not only `.get()`.
- Ambient / shared-shell params (`pane`, layout density) must be declared where hygiene runs, or the hygiene hook strips them and controls snap back.

## Related

- See `reference/examples.md` for a concrete worked migration (construct + schema + ownership guard).
- Prefer composing existing parse helpers over duplicating enum lists in the route spec.
