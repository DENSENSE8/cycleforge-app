# HANDOFF — Exceptions: domain dropdown in the left contextual sidebar, pinned in the design system (written 2026-09-28)

Paste the **Prompt** block at the bottom into a fresh session. Scope is **Exceptions only**
(`/exceptions` and its lane doors). Dev origin `http://localhost:3050` only (AGENTS.md §1). Other
sessions edit this tree — re-read before every edit, touch only your lines, never commit.
**The `.env` database is the production Neon database**: resolve proofs only on `CF-TEST-` fixtures
you create, and delete them in one transaction with counts.

## 1. Owner ruling (2026-09-28, latest — supersedes the earlier "plain rows" ruling)

> Focus first on the roots of the design system. In the Exceptions left contextual sidebar,
> **Fulfillment · Inventory · Receiving must be a dropdown, exactly like the Fulfillment lane's left
> contextual sidebar** (the `FBM ▾` mode card that opens to FBA · Labels & docs). It must live in the
> MCP design-system server so it works that way on purpose, not by accident.

Kept from earlier rulings:
- `‹ Exceptions` back row = all exceptions.
- `G` then `F` / `I` / `R` jumps to the domains.
- Under the chosen domain, its views: Fulfillment → FBM · Labels & docs · Paperwork; Inventory →
  Missing pairs · Bin errors · Tracking; Receiving → Claim · Short · Unfound (digit keys 1–3).
- The desk list is the **triage card list** (`TriageCardList`, same as Allocate). Never the
  industrial `RecordLedger` / `IndustrialRecord` on a desk (industrial = phone operations only;
  see `docs/design-system/HANDOFF-remove-desk-floor.md`).

## 2. State of the code (built this session, uncommitted)

| Piece | Where |
|---|---|
| Shared vocabulary (domains, 9 kinds, row, params) | `src/lib/exceptions/types.ts` |
| Data: sources, hub, permissions, facts, list view | `src/lib/exceptions/**`, `GET /api/exceptions` (+ `count_only=1`), `GET /api/exceptions/[key]`, `POST /api/receiving/[id]/claims/resolve`; hooks `src/hooks/exceptions/index.ts` |
| Facet counts | `src/lib/nav/facets/exceptions.ts`; contexts `exceptions`, `exceptions.{fulfillment,inventory,receiving}`, `exceptions.<kind>` |
| Desk page + list | `src/app/exceptions/page.tsx`, `src/components/exceptions/ExceptionsDesk.tsx` (on `TriageCardList`), `cards/ExceptionCard.tsx`, `ExceptionRecordPane.tsx`, `resolvers/*` |
| Lane doors (same list, locked) | `/shipping/exceptions` (domain=fulfillment), `/inventory/sku-exceptions` (kind=pairs), `/inventory/triage` (kind=tracking; `/tracking-exceptions` redirects), `/incoming` Claim/Short/Unfound pills (`DockedReceiptsLedger.tsx`) |
| **Sidebar today (to replace)** | Plain-row levels, not a dropdown: `NavPageDecl.childLevels` (`src/lib/nav/context/pages.ts`), `childLevelRows()` (`build.ts`), `NavContext.bodyViews` + `back: {mode:'href'}` (`schema.ts`), renderer `src/components/sidebar/contextual/NavBodyViews.tsx` |
| Nav rows / gating | `src/lib/sidebar-navigation.ts` `exceptions` page: children = 3 domains (`requiresAny`) + 9 kinds (per-kind permission); `filterPageChildren` `requiresAny`; `hasChildDoor` |
| G keys | `src/lib/nav/go-keys.ts` `NAV_PAGE_GO_KEYS` (exceptions: f, i, r) + `navGoDestinations`; test `go-keys.test.ts`; `NavGoKeys.tsx` resolves child targets |
| Phone | `/m/exceptions` hub + `/m/exceptions/[key]` (`src/components/mobile/exceptions/**`), drawer L0 row |

The model to copy — the Fulfillment lane's mode card: `NavModeSwitcher.tsx` (`isNavModeSection`,
`.modes` section built by `laneModeRows` in `src/lib/nav/context/build.ts`, rows carry
`description`), with its G-key hints (`NavGoKeys`, `KeyHintPopover`). Pinned laws:
`src/design-system/pinned.json` → `ContextualSidebar`, `NavModeSwitcher`, `NavSwitcherMenu`,
`NavGoKeys`, `NavSectionList`.

## 3. Target

1. **Root first.** Make the mode card a declared, reusable shape: a page can declare
   `modes` (its own sub-destinations) and the resolver emits the same `.modes` section the lane
   modes use, so `NavModeSwitcher` renders it unchanged. Exceptions declares
   Fulfillment · Inventory · Receiving as its modes (label, icon, tone, count, description,
   `?domain=` href, gated by `requiresAny`). At bare `/exceptions` the card reads "All exceptions"
   (or the owner's word) with the three domains in the menu.
2. The chosen domain's three views render as the view rows under the card (digit keys 1–3),
   exactly as a lane page's views render under its mode card.
3. Delete what the dropdown replaces: `childLevels`, `childLevelRows`, `bodyViews`,
   `NavBodyViews.tsx`, and any `back {mode:'href'}` use that exists only for this. Clean cutover.
4. G F / G I / G R keep working through the one go-keys mechanism; hints show on the card.
5. **Pin it in the MCP design system**: update `pinned.json` (`NavModeSwitcher` useWhen/law gains
   "page-declared modes, e.g. Exceptions domains"; `ContextualSidebar` head order), so
   `node tools/design-mcp/ds.mjs contract "sidebar mode dropdown"` returns it. Run `ds_critique` on
   touched UI files.

## 4. Open items found this session (Exceptions scope)

- **Unfound count** now 1335 (was 259): the old desk capped lineless placeholders at `LIMIT 150`
  (`buildUnmatchedPlaceholdersSql`); 877 of the 1335 are older than 90 days. The hub is truthful;
  the owner has not picked between showing all, windowing, or lifting the ledger cap.
- `fbm` includes shipped orders from the existing 'actionable' scope (30 of 37 out-of-stock rows).
- Buyer Request and Shipping Issue `fbm` rows have no in-place write that clears them.
- 785 of 1069 `tracking` rows also appear as `unfound` cartons (both kinds as specified).
- `/exceptions` refetches `/api/nav/facets?context=exceptions` on window focus; CLS 0.178 from the
  contextual sidebar mounting after `/api/nav/context` (fix: seed nav context in the root layout).
- The locate "Exceptions" bucket (`src/lib/nav/locate/outbound.ts`) still counts the old
  order-exception scope, while FBM › Exceptions now lists the hub's fulfillment domain.
- Browser proof not yet done for resolves on Short / Unfound / Claim / Labels / Bins (no fixtures;
  labels + bins have 0 rows), nor for the phone legacy link `/m/exceptions/<orderId>`.

## 5. Acceptance

- `/exceptions` at 1440×900: the head shows `‹ Exceptions`, then a mode card identical in look and
  keys to Fulfillment's `FBM ▾`; its menu lists Fulfillment · Inventory · Receiving with counts and
  subtitles; choosing one lists its three views under the card; G F/I/R and 1–3 work; screenshots
  next to the Fulfillment lane's card for comparison.
- `resolve.test.ts` pins: bare `/exceptions` → back row + `.modes` section with the 3 domains;
  `?domain=inventory` → modes (Inventory current) + its 3 views. No `bodyViews` left.
- `ds.mjs contract "sidebar mode dropdown"` returns the updated law; `ds.mjs nav-names` passes.
- `pnpm verify:fast` green.

## Prompt

> You own the Exceptions left contextual sidebar in CycleForge. Read
> `docs/HANDOFF-exceptions-sidebar-dropdown.md` first, then every file in §2. Work on :3050 only in
> managed browser tabs; the database is production — fixtures only. Other sessions edit this tree:
> re-read before each edit, touch only your lines, never commit.
>
> Owner ruling (§1): Fulfillment · Inventory · Receiving are a **dropdown mode card exactly like the
> Fulfillment lane's** (`NavModeSwitcher`), declared through the nav context and pinned in the MCP
> design system so it is intentional. `‹ Exceptions` = all; G F/I/R; the chosen domain's views as
> rows with keys 1–3; desk list stays `TriageCardList`.
>
> Do, in order, proving each in the browser:
> 1. §3.1 the root: page-declared modes → the same `.modes` section and renderer.
> 2. §3.2–3.4 wire Exceptions onto it and delete the plain-row levels (clean cutover).
> 3. §3.5 pin the law in `pinned.json`; `ds_contract` / `ds_critique` / `nav-names`.
> 4. Tests (§5) and `pnpm verify:fast`.
> 5. Report as a table: item, evidence (screenshot / test), files changed. List §4 items untouched.
