# Main nav — Overview / Stock / Library sub-headers (handoff)

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/main-nav-overview-stock-HANDOFF.md` and start at §3.
> Compose from the Stations Floor/Desk recipe already shipped — do not invent a second
> eyebrow system. Verify by call sites in `sidebar-navigation.ts` + `SidebarNavList.tsx`.

**Lane:** current checkout — no ad-hoc branch. User owns commits. Attach to `:3050`;
never start / restart / kill the dev server.

**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Sibling (done — do not re-litigate):**
[`station-nav-floor-desk-PLAN.md`](./station-nav-floor-desk-PLAN.md) shipped Floor/Desk
under Stations + L1 type hierarchy + Main↔Stations hairline. That plan **deferred Main
subheads**; this handoff picks that up.

**Status as of 2026-07-30 (evolved):** Main nests **Overview / Library** only.
**Stock** is a Vercel-style **drill-in** after Stations (root chevron → back + Products →
Inventory → Warehouse). Stations Floor/Desk stay static on the root map. See
[`spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md`](./spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md).

---

## 0. What already shipped (keep — compose from it)

| Concern | Where | Behavior |
|---|---|---|
| L1 parents | `SidebarNavList` `SCROLL_GROUPS` | **Main** / **Stations** use `text-role-eyebrow` + `text-text-soft` |
| Stations nest | `STATION_GROUPS` + `stationGroup` | Floor → Desk; micro + `text-text-faint`; `role="group"` + `aria-labelledby` |
| L1 separation | `groupIndex > 0` | Hairline + air between Main and Stations (`mt-1.5 border-t border-border-soft pt-1.5`) |
| Type discrimination | `SidebarNavItem` | `kind: 'station'` **requires** `stationGroup` |
| Guard | `station-nav-groups.guard.test.ts` | Presence, pipeline order, no Floor/Desk label twin, type hierarchy |

**Visual law (do not regress):** parent L1 outranks nested subtitles. Nested = micro + faint.
No cards, no group icons, no collapsible folders. Emphasis via contrast, not `font-bold`
(weight ceiling 600 — roles bake it).

---

## 1. Current Main inventory (measured 2026-07-30)

Dogfood-visible `kind: 'main'` rows in `APP_SIDEBAR_NAV` (parked filtered out):

| id | Label | Proposed `mainGroup` |
|---|---|---|
| `dashboard` | Dashboard | `overview` |
| `products` | Products | `stock` |
| `inventory` | Inventory | `stock` |
| `warehouse` | Warehouse | `stock` |
| `ops-photos` | Media | `library` |

Parked / unlock-gated (still declare `mainGroup` so unlock does not flat-list them):

| id | Label | Proposed `mainGroup` | Gate |
|---|---|---|---|
| `home` | Home | `overview` | `parkedSurface: 'home'` |
| `operations` | Operations | `overview` | `parkedSurface: 'operations'` |
| `studio-catalog` | Catalog | `library` | `parkedSurface: 'studio'` |

`SIDEBAR_PAGE_NAV` also has modeful Main pages (`sourcing`, `fba`, …) that are **off**
prod nav today. When annotating, every `kind: 'main'` in **both** arrays gets `mainGroup`.
Propose: `sourcing` → `stock` (or `overview` if you treat it as planning — default **stock**);
`fba` → `stock`. If unsure, match the Stations discipline: one registry, guard asserts
membership — do not leave Main rows without a group.

---

## 2. Decisions locked for this handoff

| Decision | Verdict |
|---|---|
| Parent L1 | Keep **Main** eyebrow (already `text-role-eyebrow`) |
| Main sub-taxonomy (v1) | **Overview** + **Stock** + **Library** only |
| Label vocabulary | Operator language, parallel to Floor/Desk — not Studio lifecycle labels |
| Overview membership | Dashboard; Home + Operations when unparked |
| Stock membership | Products → Inventory → Warehouse (stable order); Sourcing / FBA when present |
| Library membership | Media; studio Catalog when unparked |
| Visual chrome | **Identical** to Floor/Desk nest: micro + `text-text-faint`, static, skip empty |
| Collapsible | **No** |
| Lifecycle / Intake splits under Stations | Still deferred (Floor N > 8) — out of scope here |

> **Main keeps its parent eyebrow. Under it: Overview, then Stock, then Library.
> Data in SoT (`mainGroup`); list renders sub-eyebrows; TypeScript requires every
> `kind: 'main'` row to declare a group.**

---

## 3. Implementation (mirror Stations)

### Phase 0 — SoT

In [`src/lib/sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts):

1. Widen the nav discriminant (same shape as stations):
   ```ts
   export type MainGroupId = 'overview' | 'stock' | 'library';

   export const MAIN_GROUPS = [
     { id: 'overview', label: 'Overview' },
     { id: 'stock', label: 'Stock' },
     { id: 'library', label: 'Library' },
   ] as const satisfies ReadonlyArray<{ id: MainGroupId; label: string }>;

   export type SidebarNavItem =
     | (SidebarNavItemFields & { kind?: 'bottom' })
     | (SidebarNavItemFields & { kind: 'main'; mainGroup: MainGroupId })
     | (SidebarNavItemFields & { kind: 'station'; stationGroup: StationGroupId });
   ```
   Note: today’s `kind?: 'main' | 'bottom'` must become **required `main` + `mainGroup`**
   for Main rows (bottom stays without `mainGroup`). Prefer making `kind: 'main'`
   required on Main rows the same way stations require `kind: 'station'`.

2. Annotate every `kind: 'main'` in **both** `APP_SIDEBAR_NAV` and `SIDEBAR_PAGE_NAV`.
3. Reorder Main rows so filtered order is Overview → Stock → Library:
   - Overview: `dashboard` (then `home`, `operations` when present)
   - Stock: `products` → `inventory` → `warehouse` (then sourcing/fba if present)
   - Library: `ops-photos` (then `studio-catalog` when present)

**Done when:** typecheck green; every Main row has `mainGroup`.

### Phase 1 — Render

In [`SidebarNavList.tsx`](../../src/components/sidebar/master-nav/SidebarNavList.tsx):

1. Extract a shared nest helper (or twin `renderMainGroups` beside `renderStationGroups`)
   that maps a group registry → filter → skip empty → eyebrow `id` +
   `<ul role="group" aria-labelledby>` + `<li>` rows.
2. In the `SCROLL_GROUPS` branch: `kind === 'main'` → nest `MAIN_GROUPS`;
   `kind === 'station'` → existing `STATION_GROUPS`. **Do not** flat-map Main anymore.
3. Keep L1 parent eyebrow + Main↔Stations hairline unchanged.
4. Nested subtitle classes stay:
   `text-role-micro uppercase tracking-widest text-text-faint`
   (same as Floor/Desk — never peer-weight Main/Stations).

**Done when:** spine shows Main → Overview / Stock / Library; permission- or
park-filtered empty groups vanish; Stations Floor/Desk unchanged.

### Phase 2 — Guard

Extend [`station-nav-groups.guard.test.ts`](../../src/components/sidebar/master-nav/station-nav-groups.guard.test.ts)
**or** add `main-nav-groups.guard.test.ts` sibling:

- Every `kind: 'main'` in both arrays has `mainGroup ∈ {overview,stock,library}`.
- Stock filtered ids include `products` → `inventory` → `warehouse` in that order.
- `SidebarNavList` imports `MAIN_GROUPS` (no hard-coded `"Overview"` / `"Stock"` / `"Library"` twin).
- Nested Main subtitles still use micro + faint; L1 parents still use eyebrow + soft.

**Done when:** guard green under `npm run verify`.

### Phase 3 — Display law

One paragraph in [`.claude/rules/display/workbench.md`](../../.claude/rules/display/workbench.md)
next to the Stations Floor/Desk bullet, plus a SoT row in
[`source-of-truth.md`](../../.claude/rules/source-of-truth.md):

> Main pages under the Main parent use required `mainGroup`
> (`overview` | `stock` | `library`). Overview = day boards; Stock = catalog/bin
> workbenches in Products → Inventory → Warehouse order; Library = media/catalog
> assets. Same nest chrome as Stations Floor/Desk. No page-local Main folders.

---

## 4. Explicit non-goals

- Collapsing Main into Stations (older
  [`page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md`](./page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md)).
- Renaming Floor/Desk or changing Stations membership.
- Main subheads beyond Overview / Stock / Library (no fourth group without product ask).
- Collapsible folders, group icons, colored section cards.
- GlobalHeader / Mode / Recents changes.
- Committing unless the user asks.

---

## 5. Verify

```bash
npm run verify
# inner loop:
node --test --import tsx src/lib/sidebar-navigation.test.ts
node --test --import tsx src/components/sidebar/master-nav/station-nav-groups.guard.test.ts
# + main-nav-groups.guard.test.ts if split out
```

Manual: spine shows Main → Overview / Stock / Library, then hairline, then Stations →
Floor / Desk; packing-only or media-denied roles hide empty Library; parked unlock
puts Home under Overview without flattening.

---

## 6. Paste checklist for the implementer

1. Discriminate `mainGroup` on `kind: 'main'` (mirror `stationGroup`).
2. Add `MAIN_GROUPS`; annotate + reorder both nav arrays.
3. Nest Main in `SidebarNavList` with the same micro-subtitle + ARIA group recipe.
4. Guard + display-law paragraph + SoT row.
5. `npm run verify` green. Do not raise ratchets. Do not commit unless asked.
