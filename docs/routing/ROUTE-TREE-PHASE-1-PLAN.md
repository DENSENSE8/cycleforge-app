# Route tree — phase 1 plan (Warehouse lane, phone)

Owner brief 2026-10-03: every coding session takes route paths, nav names and
domain words from ONE source, served by the design-system MCP, so a session
that is unsure looks the answer up (or asks the operator) instead of inventing
a path or a synonym. Phase 1 builds that source for the Warehouse lane on the
phone and adopts it in the warehouse/stock pages. **No URL changes in phase 1.**

Continuous improvement after the build: `docs/handoff/PROMPT-route-tree-continuous-improvement-loop-2026-10-03.md`.

---

## 1. Why the MCP alone is not the enforcement

The MCP answers only when asked, cannot block a harness without a pre-write
hook (`tools/design-mcp/README.md`), and prose in the profile drifts: the
`mobile-stock` preflight still taught "horizontal room filters" and "adjacent
shelf rack swipe or cursor" after both were deleted. So the source is a typed
module in `src/lib`, and the MCP is one of five consumers:

| Layer | Phase 1 | Catches | Bypassable |
|---|---|---|---|
| 1 Types | Path constants + builders in `src/lib/nav/route-tree.ts`; warehouse/stock phone files use them | A hand-typed or misspelt Warehouse path in adopted files | No |
| 2 Literal ratchet | `literal-path` rule in the `Routes` gate; baseline `scripts/route-tree-literals.baseline.json` may only shrink | A new file hand-typing `/m/stock…`, `/m/loc/…`, `/m/labels…`, `/m/racks…`, `/m/h/…` | No |
| 3 verify `Routes` | `scripts/route-tree-guard.ts` over `src/lib/nav/route-tree-law.ts`, profile `always` | Unregistered page, missing page, parent/child name clash, menu row outside its owner, banned word in a nav label | No |
| 4 Runtime aliases | Phase 2 (no paths move in phase 1) | Old URLs and printed QR codes | No |
| 5 MCP + session start | `ds_route`, `ds_vocabulary`, `ds_route_tree` (profile `gates`, same module as the gate); `SessionStart` digest; `route-surface` preflight; `mobile-stock` preflight rewritten | Indecision before writing | Yes — advisory |

Deferred with reason:
- **Next.js `typedRoutes`** (stable in Next 16; repo on 16.3.3, off). Turning it
  on types every `Link`/`router.push` across ~137 pages at once. It becomes the
  layer-1 backstop once builders cover a lane; enable lane by lane is not
  possible, so it waits for phase 3.
- **ESLint literal rule.** ESLint has no baseline; the guard's ratchet does the
  same job with a shrink-only baseline, the pattern `boundary-guard` already uses.
- **Preflight calling `ds_route`.** The pre-write door
  (`~/Projects/Garisek-OS/tools/agent-contract/design-contract-preflight.mjs`)
  only queries `ds_contract`. Making a preflight rule name a profile gate is an
  engine change in Garisek-OS (shared by other projects) — proposed, not done.

## 2. Vocabulary (owner rulings 2026-10-03)

Source: `VOCABULARY` in `src/lib/nav/route-tree.ts`. Research basis: Zoho bin
locations (zone = "an area or a room … that contains multiple bins"), D365
location formats (segment naming), SAP EWM (storage type › bin; *quant* = stock
of one material in one bin), Google AIP-122 (plural collections, lowercase ids,
aliases resolve to one canonical name), Google URL structure (readable words,
hyphens, few params), NN/g breadcrumbs (hierarchy not history; every crumb a
page; one canonical path in a polyhierarchy).

| Term | UI word | Segment / param | Banned |
|---|---|---|---|
| Warehouse | Warehouse | `warehouse` | Inventory (as lane name) |
| Stock | Stock | `stock` | quant, inventory row, bin contents |
| Room | Room / Rooms | `room` | zone, area, storage type |
| Aisle · Bay · Level · Position | same | `aisle` `bay` `level` `position` | row; rack/shelf for fixed racking; slot, spot |
| Location | Location | `locations` | bin, storage bin, slot |
| Rack | Rack (movable, RK12) | `racks` | bay racking; desktop `?tab=racks` stays the legacy BAY alias |
| Container | Tote | `containers` | LPN (for a tote), licence-plated box |
| LPN (Receiving) | LPN | `lpns` | licence (spelling), carton — **pending ruling** |
| Location labels | Location labels | `labels` under locations | Labels (unqualified), bin tags |

## 3. Tree (phase 1 records live paths and phase-2 targets)

```
warehouse (planned lane; menu group `inventory` today)
├─ stock              /m/stock                     → /m/warehouse/stock            ?q · room · aisle · bay
│  ├─ stock-photos    /m/stock/[stockId]/photos    → /m/warehouse/stock/[stockId]/photos
│  └─ stock-detail    /m/stock/detail (compat → location)
├─ locations          (planned)                    → /m/warehouse/locations        ?room · aisle · bay · status
│  ├─ location        /m/loc/[code]                → /m/warehouse/locations/[code]
│  │  └─ location-info /m/loc/[code]/info
│  ├─ location-cleanup /m/stock/locations          → /m/warehouse/locations?status=empty
│  ├─ location-labels /m/labels                    → /m/warehouse/locations/labels
│  │  └─ rack-labels  /m/stock/labels (compat → location-labels ?kind=rack)
│  └─ racks           /m/racks                     → /m/warehouse/locations/racks
│     ├─ rack-new     /m/racks/new
│     └─ rack         /m/loc/[code] (RK12)
└─ containers         (planned)                    → /m/warehouse/containers
   └─ container       /m/h/[id]                    → /m/warehouse/containers/[code]
```

Routing rules the tree encodes:
1. `/m/{lane}/{collection}/{id}/{sub-collection}` — plural lowercase hyphenated nouns, no abbreviations.
2. Path = which thing (ownership). Query = which slice of a list (filter, drill level, search, open sheet).
3. Every parent is a page (its landing lists its children).
4. One canonical URL per thing; old paths are permanent aliases.
5. Segment = slug of the nav label; a parent and a child never share a name.
6. No verbs in paths except `/new`; Adjust, Move, Delete, Print are stages or `•••` items.

## 4. Phase 1 deliverables

| # | Deliverable | Files |
|---|---|---|
| 1 | Source module | `src/lib/nav/route-tree.ts` |
| 2 | Law + CLI | `src/lib/nav/route-tree-law.ts`, `scripts/route-tree-guard.ts` (`--json`, `--mode route|vocabulary|tree --input`, `--digest`, `--write-baseline`), `scripts/route-tree-literals.baseline.json` |
| 3 | verify gate `Routes` (`always`) | `scripts/verify-profile.mjs` |
| 4 | MCP tools + preflight | `tools/design-mcp/design-mcp.profile.json` (`ds_route`, `ds_vocabulary`, `ds_route_tree`; `route-source` first in the rule list so `route-tree*.ts` is not swallowed by `navigation-structure`; `route-surface` before `mobile-surface`; `mobile-stock` rewritten), `tools/design-mcp/ds.mjs` CLI, `tools/design-mcp/README.md` |
| 5 | Session start | `.claude/settings.json` `SessionStart` → `--digest`; one bullet in `AGENTS.md` |
| 6 | Stock page owns only stock | `MobileV2StockLocations.tsx`, `src/app/m/(shell)/stock/page.tsx`: Labels / Racks / Manage doors deleted; every aisle · bay · level stays in the walk (empty ones read `Empty`), an aisle opens on two full-height buttons split down the middle (Odd bays · Left side | Even bays · Right side, `?side=`), then that side lists its bays in number order (`BAY_SIDE_FACE`, `stockDrillSides`); never `(Left)` per bay; search lists stocked places; a typed code offers `Open <face>` at every level |
| 7 | Menu homes for what left | `mobile-v2-destinations.tsx`: Inventory = Stock · Manage locations · Location labels · Racks |
| 8 | Builders adopted | warehouse/stock phone files; `locationHubPath`, `stockDrillHref` built from the tree |
| 9 | Tote copy | `HandlingUnitV2Record.tsx`, location record meta: Tote, never LPN |

## 5. Acceptance

1. `pnpm verify:fast` green except failures owned by other sessions; `Routes` is a listed gate and passes.
2. `node tools/design-mcp/ds.mjs route '{"intent":"print a bay sticker"}'` → `location-labels`; `vocabulary zone` → Room via banned; `route-tree warehouse` → the tree above.
3. A fresh Claude session shows the digest at start.
4. At 430×932 on `:3050`: `/m/stock` has no Labels / Racks / Manage buttons; no aisle or bay row reads `0 units`; search `C0310300` in a room offers `Open C-03-10-3`; the phone menu lists the four Inventory destinations; a tote record says Tote.
5. `ds_critique` adds no new problem on touched UI files.

## 6. Phase 2 (next, not in this plan's scope)

- Lane rename Inventory → Warehouse on both surfaces (`DOMAIN_GROUPS`), desktop row "Warehouse" → "Locations" in the same change.
- Move the phone routes to the `target` paths; old paths become permanent redirects in `src/proxy.ts` generated from the tree.
- Build `/m/warehouse` (landing), `/m/warehouse/locations` (list incl. empty; absorbs the cleanup page as `?status=`), `/m/warehouse/containers`.
- Merge rack labels into Location labels (`?kind=rack`).
- Location record: configuration (arrival urgency, movable rack, labels) behind `•••`; stock first.
- Room level of the stock drill: room rows read units and SKUs, not location counts (needs a stock-room facet read).
- Preflight → `ds_route` engine change in Garisek-OS (approval needed).

Open rulings: retire "carton" for R-* plates (→ LPN)? Are the stock "home tote" and desktop Locations › Totes plates the same H-#### containers?
