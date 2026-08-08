# Research briefing — Optimistic URL-param paint: industry 2026 + design evolution

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Subject:** Critique and improve our **optimistic URL-param paint** SoT — the pattern that
makes mount-gated detail opens paint in the click commit before Next.js App Router
soft-replace updates `useSearchParams`. Ask: what is industry-standard in 2026 for
URL-as-state + instant selection paint in dense B2B / ops UIs; where is our design weak;
what should we evolve next **inside this codebase’s constraints**.
**Status:** RESEARCH RETURNED (2026-08-07) — adoption + rank-1 HANDOFF live in
[`optimistic-url-paint-INDUSTRY-ADOPTION-AND-HANDOFF.md`](./optimistic-url-paint-INDUSTRY-ADOPTION-AND-HANDOFF.md).
Do not re-run this brief unless overturning an adopted verdict with new evidence.

**Do not re-litigate — already decided and shipped (2026-08-07):**

| Prior decision | Already shipped |
|---|---|
| Mount-gated opens must not wait on soft-replace | Law in `AGENTS.md` + `source-of-truth.md` → Optimistic URL-param paint |
| Paint-pending ≠ sync-guard (two jobs) | Explicit split; Dashboard `openOrderId` / Receiving `openReceivingId` stay sync-guard |
| Named SoT, no feature-local pending twins | `optimistic-url-param.ts` + `useOptimisticUrlParam`; guard ratchet |
| Param isolation (construct/parse) is orthogonal | `route-params.ts` / `url-param-isolation` skill — not this job |
| Must-migrate #1–11 + several nice-to-haves | See migrate handoff Landed table |
| Cross-tree pending via optional `shareKey` | Module channel + `useSyncExternalStore` for sidebar∥shell |

Handoff / implementation map: [`optimistic-url-paint-MIGRATE-HANDOFF.md`](./optimistic-url-paint-MIGRATE-HANDOFF.md).

---

## 0. How to use this brief

You do **not** have the codebase. Facts below were measured 2026-08-07 against the live SoT
and consumer set. Treat §2–§4 as ground truth for “what we built”; do not invent a second
product (USAV is dogfood tenant only; Cycle Forge is multi-tenant reseller-ops SaaS).

**Three deliverables (required):**

1. **Industry pattern catalog (2026)** — How do dense B2B / WMS / helpdesk / spreadsheet-like
   apps make “list click → detail open” feel instant while keeping URL shareable/reloadable?
   Name products and **mechanisms** (nuqs, React Router loaders, Remix, TanStack Router,
   Next App Router + `useOptimistic` / `startTransition`, local selection + URL sync, View
   Transitions API, parallel routes, etc.). Separate **selection paint** from **data fetch**.
2. **Critique of our SoT** — Strengths, failure modes, API smell, concurrency hazards,
   cross-tree `shareKey` vs React context / provider, compound pending (My Day task↔watch,
   Review packerLogId+orderId) vs scalar hook. Compare to React 19 `useOptimistic` and to
   “URL as only SoT with zero pending.”
3. **Actionable evolution plan for Cycle Forge** — Ranked improvements that fit our laws
   (compose SoT first; never unify paint-pending with sync-guard; never invent page-local
   twins; Next App Router on `:3050`; DS/motion/token constraints). Prefer a migration order
   an engineer can paste into a HANDOFF — not a framework rewrite.

Also answer every numbered question in §7 with sources. Prefer concrete APIs and failure
stories over slogans (“just use nuqs”).

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS. House identity is **Kinetic Ledger**: dense,
state-colored, scan-aware chrome — legible throughput over document calm. Four region
contracts: **Station** (scanner act-and-clear) · **Workbench** (pointer pick+edit) ·
**Monitor** (observe) · **Canvas** (graph).

**Mount-gated URL open** — a column, overlay, thread, or detail shell that only mounts when a
query key is present, e.g. `{ticketId != null && <SupportTicketFocus />}`,
`{sidebar.open && <InventoryDetailsOverlay />}`, `{signalId && <Detail />}`. Soft-replace lag
on that key produces a dead beat after click.

**Paint-pending** — UI value = `resolve(url, pending)` until `useSearchParams` matches the
write. Pending is a paint bridge; URL remains durable SoT for reload / share / back-forward.

**Sync-guard** — different job: UI is already local entity state; refs suppress URL→entity
reconcile while a close/open is in flight (`useDashboardSelectedOrder`,
`useReceivingWorkspacePane`). **Do not unify** with paint-pending.

**Param isolation** — construct destination query from a declared set; drop unknowns at a
schema boundary. Orthogonal to paint latency.

**shareKey** — optional channel string so two React trees (MasterNav context sidebar + main
pane) that each call `useOptimisticUrlParam` share one pending via `useSyncExternalStore`.

---

## 2. What we shipped (measured)

### 2.1 Pure SoT

| Piece | Path | Role |
|---|---|---|
| Helpers | `src/lib/routing/optimistic-url-param.ts` | `resolveOptimisticParam`, `shouldClearOptimisticParam`, `readLiveSearchParams` |
| Hook | `src/hooks/useOptimisticUrlParam.ts` | `urlValue` + `replace` + `write` → `{ value, setValue, paint }`; optional `shareKey` |
| Guard | `src/lib/routing/optimistic-url-param.guard.test.ts` | Source ratchet: consumers must compose SoT, not fork local pending |
| Law | `AGENTS.md` + `.claude/rules/source-of-truth.md` | Hard law for mount-gated opens |

Lifecycle:

```
click → setPending(next) → startTransition(() => replace(write))
UI = resolveOptimisticParam(url, pending)
soft-replace lands → shouldClearOptimisticParam(url, pending) → pending = undefined
```

Clear rule: clear **only** when URL equals pending (custom `equals` allowed). Intermediate hops
must not drop a newer pending (index → leaf race).

### 2.2 Hook API shape (current)

```ts
useOptimisticUrlParam<T>({
  urlValue,           // already-parsed from useSearchParams
  equals?,            // default Object.is
  replace,            // surface owns path + isolation + router.replace
  write,              // mutates params bag for next
  shareKey?,          // cross-tree pending channel
}): { value, setValue, paint }
```

- `setValue` = paint + replace in `startTransition`
- `paint` = paint only (multi-field clears that also drop this key — then caller’s own replace)
- Domain parsing / mutual exclusion / path builders stay in the caller (SoT stays vocabulary-free)

### 2.3 Consumer shapes in the wild

| Shape | Example | Notes |
|---|---|---|
| Scalar URL-state hook | `useOutboundUrlState` (`open`, `new`) | Golden |
| Page-owned pending, child gets setter | Search `sel` (`useSearchSelParam` at page) | Parent unmounts browse on open |
| Open-only optimistic; multi-field uses `paint(null)` | Inventory `sidebar.open` | Mode routes must preserve pathname |
| Domain snapshot + SoT resolve | Unbox Displays `useUnboxDisplayView` | Nested display actions local |
| Compound pending via helpers (not scalar hook) | My Day `{ taskId, watchOpen }`; Review `{ packerLogId, orderId }` | Mutual exclusion in one paint |
| Cross-tree `shareKey` | Support ticket, inventory open, Kit/QC `skuId`, Labels `historyId` | Sidebar and shell are separate trees |
| One-shot pulse | Repair `?new=true` → local form then strip | URL is trigger, not sticky overlay |

### 2.4 Explicit non-goals (still)

- Sync-guard desks; local Displays tabs; AI dock; facet/mode swaps; isolation rewrites;
  pairing `sku` async resolve (half URL / half fetch); Studio `focus`/`z` compound L2;
  photo library `view` (facet).

---

## 3. Constraints you must respect

1. **Next.js App Router** — client navigation uses soft-replace; `useSearchParams` lags the
   click. We attach to an existing `:3050` dev server; no “just switch frameworks” answers
   without a migration cost model.
2. **URL remains durable SoT** for mount-gated opens (reload, share, deep link). Pending must
   not become a second long-lived store that diverges after navigation settles.
3. **One module per concern / compose SoT** — page-local `useState(pendingOpen)` forks are bugs.
4. **Paint-pending ≠ sync-guard** — proposals that “unify everything under `useOptimistic`”
   must show how close/reopen races on entity objects still work.
5. **Sidebar and main are often separate trees** — MasterNav context rail vs page body. Any
   “pending lives in a provider” design must name where the provider mounts in a layout that
   wraps both (inventory layout today is only `SurfaceParamHygiene` + children — sidebar is
   outside many page trees).
6. **Kinetic Ledger / DS** — motion from `@/design-system/motion` only; no inventing a second
   visual language for “optimistic loading.” Selection paint is data readiness of the **gate**,
   not a skeleton fashion show.
7. **Tier-1 paint order** — P0 shell → P1 primary work → … LCP surfaces must not hide behind
   client-only gates without SSR stand-ins. Optimistic open must not regress LCP (don’t
   client-gate the entire centre behind pending).
8. **Scan / wedge speed** — operators scan barcodes; open latency compounds with fetch. Separate
   **selection paint** from **detail data**.

---

## 4. Known tension points (research targets)

Use these as critique hooks — confirm, refute, or refine with industry evidence.

| # | Tension | Why it hurts |
|---|---|---|
| T1 | **`shareKey` module Map** | Global mutable channels; typing is `unknown`; no React ownership; SSR/hydration story thin; hard to reason about teardown |
| T2 | **Scalar hook vs compound selection** | My Day / Review reimplement pending with `useState` + SoT helpers — two recipes for “paint before replace” |
| T3 | **`paint` + caller `startTransition(replace)`** | Easy to forget `paint(null)` on multi-field clears → one-frame stale detail |
| T4 | **Double hook instances without shareKey** | Silent lag on the tree that didn’t write (shell waits on soft-replace) |
| T5 | **Async resolve after open** | Pairing `sku`, manuals/detail fetch — open paints empty shell; industry often pairs optimistic selection with placeholder/cached row |
| T6 | **Back/forward & concurrent clicks** | Rapid open A→B→A; soft-replace reorder; `shouldClear` keeps pending across hops — is that enough vs React `useOptimistic` / transition lanes? |
| T7 | **`readLiveSearchParams` underused** | Documented for stale seed; not wired into every `replace` — when does window.location seed matter? |
| T8 | **Push vs replace** | Some writers historically used `push`; hook prefers `replace` — history / Back UX trade-offs |
| T9 | **Sync-guard coexistence on same key** | Support `openOrderId` optimistic only under `context=support`; desk fulfillment stays sync-guard — sharp edge for future “unify” proposals |
| T10 | **Guard is string ratchet** | Catches obvious forks; won’t catch a clever local pending disguised as “draftId” |

---

## 5. Industry questions (answer with named products / APIs)

### 5.1 Selection + URL patterns (2026)

1. What is the dominant pattern in 2025–2026 for **URL-synced master-detail** in React SPAs
   (Linear, Height, Attio, Salesforce Lightning, Zendesk agent workspace, Shopify admin,
   Retool, internal WMS tools)? Local selection first vs URL first vs dual-write?
2. How do **nuqs**, **TanStack Router**, **Remix**, and **Next.js parallel routes /
   intercepting routes** each solve (or ignore) soft-replace paint lag?
3. Does React 19 **`useOptimistic`** map cleanly onto URL params, or is it aimed at server
   action mutations? When is `useOptimistic` wrong for query-string selection?
4. View Transitions API / Next.js `<ViewTransition>` — do they replace paint-pending, or only
   decorate after both states are already decided?
5. Spreadsheet / sheet UIs (Google Sheets, Notion DB, Airtable): how do they make row→detail
   feel instant when the URL also updates?

### 5.2 Cross-tree state

6. Industry approaches when **nav chrome and work surface are separate React roots / portals /
   layout slots** but must share selection? Context at app shell? Event bus? URL-only? Zustand
   slice? What fails under SSR?
7. Is a module-level `Map` + `useSyncExternalStore` (our `shareKey`) considered acceptable in
   2026, or is it a smell vs a layout-scoped store?

### 5.3 Ops-floor specifics

8. WMS / helpdesk / packing stations: evidence for **optimistic selection** vs **wait for
   confirmation** before mounting a heavy detail (ticket thread, claim dossier)? Failure modes
   when the optimistic id 404s?
9. How do products handle **scan-driven open** (wedge fires enter) differently from mouse click
   for URL sync?

### 5.4 Concurrency & history

10. Best-practice for **stale transition** when user clicks row B while A’s replace is in flight?
11. When should selection use **`history.push` vs `replace`** in ops tools (Back should restore
    queue scroll vs Back should leave the app)?
12. How do teams test this? Integration vs source guards vs Playwright “no blank frame”?

---

## 6. Codebase-contextual improvement axes

Rank these (or better ones you invent) by ROI for Cycle Forge specifically:

| Axis | Question for you |
|---|---|
| A. API unification | Should compound selection become a first-class SoT (`useOptimisticUrlParams` / snapshot type) so My Day / Review stop hand-rolling? |
| B. Cross-tree ownership | Replace `shareKey` with a layout `OptimisticUrlProvider`? Where must it mount given sidebar-outside-page? |
| C. React 19 alignment | Adopt `useOptimistic` under the hood, or keep explicit pending + clear? |
| D. Row snapshot paint | Pass clicked row data through pending so detail chrome paints from cache before fetch (selection ≠ payload)? |
| E. Live seed | Mandate `readLiveSearchParams` inside every `replace` to avoid clobber — or prove it’s obsolete? |
| F. Transition UX | Pair paint-pending with a named `motionRole` settle only — never a second loading gate? |
| G. Residual migrates | Priority for pairing `sku`, Studio L2, Roles `roleId`, Logs `eventId`, mobile checklist `orderRowId`? |
| H. Observability | Should we measure click→paint ms (RUM) and ratchet regressions? |
| I. Escape hatches | Formalize “one-shot pulse” (Repair `new`) and “deep-link only” as documented archetypes so agents don’t over-migrate? |
| J. Anti-patterns doc | Grow SoT with a short “never” list (pending as entity store, optimistic facet toggles, double replace)? |

---

## 7. Required answers (numbered)

Answer **each** item. Cite products, RFCs, or library docs where possible.

1. One-sentence definition of the problem we solved, as an industry peer would phrase it.
2. Top 3 industry mechanisms for 2026 that solve the same problem — pros/cons vs our SoT.
3. Is keeping **URL as durable SoT + ephemeral pending** still best practice, or have leaders
   moved to local selection with URL as a write-behind?
4. Verdict on **`shareKey`**: keep / replace / hybrid — with mount-point recommendation for
   Cycle Forge’s shell.
5. Verdict on **scalar vs compound** API — one hook or two documented recipes?
6. Should sync-guard and paint-pending ever share infrastructure? If yes, where is the seam?
7. What must **never** be optimistically painted (facets, destructive confirms, paid actions)?
8. Recommended **next 3 engineering tasks** (ordered), each ≤ half-day or 1–2 days, that improve
   the design without rewriting App Router.
9. Recommended **non-goals** for the next quarter (things that look clever but fight our laws).
10. A paste-ready **acceptance checklist** for any new mount-gated open (agent + human).

---

## 8. Engineering defaults (overturn with evidence)

| Decision | Default lean | Why |
|---|---|---|
| Keep URL durable + pending paint bridge | **Keep** | Matches share/reload; already lawed |
| Do not unify with sync-guard | **Keep split** | Different failure modes (entity vs scalar id) |
| Evolve compound into SoT helper | **Lean yes** | Removes dual recipes (My Day / Review) |
| Replace `shareKey` Map with shell provider | **Lean investigate** | Cleaner ownership if a real mount point exists; don’t force a fake provider |
| Adopt React `useOptimistic` wholesale | **Lean no / wrap only** | URL clear semantics ≠ action optimistic UI |
| Optimistic row payload (not just id) | **Lean yes for Station/Workbench** | Kills empty-shell flash after selection paint |
| Migrate photo `view` / facets | **No** | Not mount-gated opens |
| Measure click→paint | **Lean yes** | Prevent silent regressions as consumers grow |

---

## 9. Output format (please follow)

```markdown
## Executive verdict
<8–12 lines: keep / evolve / rewrite; biggest risk; biggest win>

## Industry catalog (2026)
| Mechanism | Who uses it | Solves paint lag? | Fits App Router + our laws? | Notes |

## Critique of Cycle Forge SoT
### Strengths
### Failure modes / smells
### shareKey assessment
### Compound vs scalar

## Ranked improvements
| Rank | Change | Effort | Blast radius | Why |

## Answers to §7
1. …
10. …

## Proposed HANDOFF skeleton
Paste-ready next session prompt (≤40 lines) for the top engineering task only.

## Sources
Links / product names / docs — no vibes-only claims.
```

---

## 10. Paste block (start of Gemini session)

> You are advising Cycle Forge (multi-tenant reseller-ops SaaS, Kinetic Ledger UI, Next.js App
> Router) on the evolution of our **optimistic URL-param paint** SoT.
>
> Read the full briefing `optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md` end-to-end.
> Facts in §2–§4 are ground truth. Do not propose unifying paint-pending with sync-guard without
> addressing entity close/reopen races. Do not propose abandoning URL durability for mount-gated
> opens without migration cost. Do not recommend raising DS/knip baselines or inventing a second
> search/router stack.
>
> Deliver §9’s output format. Prefer named 2025–2026 industry mechanisms and a paste-ready
> HANDOFF for the single highest-ROI next engineering task.

---

## Related files (for implementers after research — not required for Gemini)

| File | Role |
|---|---|
| `src/lib/routing/optimistic-url-param.ts` | Pure resolve / clear / live seed |
| `src/hooks/useOptimisticUrlParam.ts` | Scalar lifecycle + shareKey |
| `src/hooks/useOutboundUrlState.ts` | Golden scalar consumer |
| `src/hooks/useSearchSelParam.ts` | Parent-owned pending |
| `src/components/inventory/useInventoryUrlState.ts` | Open + paint(null) + shareKey |
| `src/features/my-day/useMyDayView.ts` | Compound pending via helpers |
| `docs/todo/optimistic-url-paint-MIGRATE-HANDOFF.md` | Migration status |
| `.claude/skills/url-param-isolation/SKILL.md` | Orthogonal isolation job |
| `.claude/rules/source-of-truth.md` → Optimistic URL-param paint | Law text |
