# Optimistic URL-param paint — industry research adoption + next HANDOFF

**Date:** 2026-08-07  
**Source:** Gemini Pro response to
[`optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md`](./optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md)  
**Status:** Research adopted for planning. Rank-1 engineering task is ready to implement
(§3 HANDOFF). Do **not** rewrite App Router, adopt nuqs wholesale, or unify with sync-guard.

---

## 1. Executive adoption (what we keep / evolve)

| Gemini verdict | Adoption |
|---|---|
| Keep URL durable + ephemeral pending bridge | **Adopt** — already law |
| Do not unify paint-pending with sync-guard | **Adopt** — already law |
| Biggest smell = `shareKey` module Map | **Adopt as #3** — replace with layout Context when mount point is proven; do not block rank-1 |
| Biggest ROI = row snapshot payload + compound hook | **Adopt** — compound hook = next PR; snapshot = follow-on |
| One plural hook for compound selection | **Adopt** — see §3 |
| Do not adopt Remix / write-behind / View Transitions as state bridge | **Adopt** |
| React 19 `useOptimistic` wholesale | **Reject as SoT** — wrap-only if ever; clear-on-URL-match stays ours |

### Critique we accept

1. **Dual recipes** (scalar hook vs hand-rolled compound pending in My Day / Review) will drift.
2. **Empty shell flash** after id paint undercuts the optimistic win — selection paint ≠ payload.
3. **`paint(null)` is a fragile consumer contract** — long-term bake into a safer replace helper;
   short-term keep documenting + guarding.

### Critique we refine (do not over-claim)

| Gemini claim | Our note |
|---|---|
| A→B→A soft-replace can falsely clear via `shouldClear` | Current clear is **URL equals pending**. An older hop that lands as a value ≠ pending does **not** clear. Risk is real when pending returns to a prior id (A→B→A) and a stale replace for A lands while pending is A again — document + add a write-generation / transition id if we see it in the wild. Rank below compound + snapshot. |
| `shareKey` “breaks hydration” | Pending channels start empty (`undefined`); mismatch risk is lower than a pre-filled store, but ownership/test isolation smells are still real. Context replacement remains correct direction. |

---

## 2. Ranked engineering backlog (from research)

| Rank | Change | Effort | When |
|---|---|---|---|
| **1** | `useOptimisticUrlParams` (plural) — compound record pending | ~0.5–1 day | **Next** — §3 |
| **2** | Row snapshot in pending (`{ id, payload? }`) so chrome paints from clicked row | ~1–2 days | After #1; start with one Workbench (Signals or Support tickets) |
| **3** | Replace `shareKey` Map with `OptimisticUrlProvider` above MasterNav + children | ~1–2 days | After mount-point audit; migrate inventory/support shareKeys |
| 4 | Safer multi-field clear (wrapped replace that auto-paints cleared keys) | Larger | After #1 API stabilizes |
| later | RUM click→paint; residual migrates (Roles `roleId`, Logs `eventId`, pairing `sku`) | — | Opportunistic |

### Non-goals (next quarter)

- Framework rewrite (Remix / RR v7 loaders as the paint bridge)
- View Transitions as a substitute for pending state
- Merging sync-guard into paint-pending
- Optimistic paint for destructive / paid / AI-gate actions
- Facet / `view=` / photo library density params

### Acceptance checklist (any new mount-gated open)

Copy into PRs / agent sessions:

- [ ] UI paints open/close in the click commit (no wait on Network soft-nav alone)
- [ ] Refresh on the open URL still shows the detail (URL durable SoT)
- [ ] Open then quick Close before soft-replace settles → UI ends Closed
- [ ] Multi-field clears that drop this key call `paint(null)` / compound paint (or use the plural hook)
- [ ] No feature-local `pendingOpen` twin; guard extended if new consumer
- [ ] Sync-guard desks untouched unless the task is explicitly Support-scoped

---

## 3. Paste this into a new session — Rank 1 HANDOFF

> Read `docs/todo/optimistic-url-paint-INDUSTRY-ADOPTION-AND-HANDOFF.md` §1–§3 and
> `docs/todo/optimistic-url-paint-MIGRATE-HANDOFF.md` pattern section before editing.
>
> **Goal:** Evolve the paint-pending SoT with a **plural** compound hook so My Day (and later
> Review) stop hand-rolling pending. Keep scalar `useOptimisticUrlParam` working. Do **not**
> replace `shareKey`, do **not** touch sync-guard, do **not** add row snapshots in this PR.
>
> Attach `:3050` — never start/restart/kill the dev server. Stay on the checkout branch.
> Do not commit unless asked.
>
> ### Implement
>
> 1. **Pure helpers** in `src/lib/routing/optimistic-url-param.ts` (or sibling):
>    - `resolveOptimisticParams(url: T, pending: Partial<T> | undefined): T` — pending keys
>      overlay url (pending wins per key; missing pending key → url).
>    - `shouldClearOptimisticParams(url, pending, equals?)` — clear only when **every** key
>      present in `pending` matches `url` (custom per-key equals optional).
>    - Unit tests next to existing `optimistic-url-param.test.ts`.
>
> 2. **Hook** `useOptimisticUrlParams` in `src/hooks/useOptimisticUrlParam.ts` (same file or
>    adjacent) with shape:
>    ```ts
>    useOptimisticUrlParams<T extends Record<string, unknown>>({
>      urlValues: T,
>      equals?: (a: T, b: T) => boolean, // or per-key
>      replace: (mutate: (params: URLSearchParams) => void) => void,
>      write: (params: URLSearchParams, next: T) => void,
>      // no shareKey in this PR
>    }): { value: T; setValue: (next: T) => void; paint: (patch: Partial<T>) => void }
>    ```
>    - `setValue` paints full next + `startTransition(replace(write))`
>    - `paint` merges patch into pending without replace (multi-field / mutual exclusion)
>    - Clear when `shouldClearOptimisticParams` says so
>
> 3. **Migrate golden compound consumer:** `src/features/my-day/useMyDayView.ts`
>    - Detail snap `{ taskId, watchOpen }` goes through the plural hook
>    - Preserve mutual exclusion (open watch → task null; open task → watch false)
>    - Lane clear still paints task null
>
> 4. **Guard** — extend `optimistic-url-param.guard.test.ts`:
>    - plural helpers + hook exist
>    - `useMyDayView` composes `useOptimisticUrlParams` (or resolveOptimisticParams), not a
>      bare `useState` pending twin for detail
>
> 5. **Verify**
>    ```bash
>    npx tsx --test \
>      src/lib/routing/optimistic-url-param.test.ts \
>      src/lib/routing/optimistic-url-param.guard.test.ts
>    npm run verify
>    ```
>
> 6. Append a Landed row on `optimistic-url-paint-MIGRATE-HANDOFF.md`. Do not edit the industry
>    briefing or this adoption file’s §1 verdicts.
>
> ### Done when
>
> - My Day task ↔ watch swap paints both sides in one click commit
> - Scalar consumers unchanged
> - No `shareKey` / provider work in this PR
> - `npm run verify` green

---

## 4. Follow-on sketches (not this session)

### Rank 2 — Row snapshot (after compound lands)

- Extend pending value type to `T | { id: T; preview: P }` **or** a parallel `preview` channel
  owned by the consumer (prefer keeping SoT id-typed and letting Workbench pass preview via
  context/event — research left this open).
- Pilot: Signals browse or Support ticket row → identity chrome from list row before detail fetch.
- Never treat preview as durable SoT; drop when URL clears or fetch supersedes.

### Rank 3 — Context provider (after mount-point audit)

- Find the real layout that wraps **both** MasterNav context panel and page `children`.
- `OptimisticUrlProvider` holds channel state; `shareKey` becomes a context key or goes away.
- Migrate inventory `inventory:open` + Support ticket/vm/issue shareKeys first.
- Prove SSR: no prefilled pending on server HTML.

---

## 5. Gemini raw summary (compressed)

**Industry:** nuqs ≈ our transition+merge idea; Linear write-behind flips URL-SoT (reject);
Remix loaders need rewrite (reject); Parallel routes alone don’t fix soft-nav lag;
`useOptimistic` is mutation-shaped (wrap only).

**Next three tasks Gemini named:** (1) plural compound hook, (2) row snapshot payload,
(3) Context instead of `shareKey` Map.

Sources cited by Gemini: nuqs docs, Linear eng blog (URL sync), Next `useSearchParams` soft
nav, React 19 `useOptimistic` docs.
