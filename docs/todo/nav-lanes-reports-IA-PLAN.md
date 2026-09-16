# PLAN — Lane IA (Inbound / Outbound), Reports surface, PO-Mailbox deletion

**For:** Claude Code / coding agents — one increment per session, never batch.
**Date:** 2026-09-14
**Parent program:** [`mobile-first-foundation-PLAN.md`](./mobile-first-foundation-PLAN.md) — this file
adds **Track N4+ (nav IA)**, **Track R (Reports)**, **Track X (deletions)** to that ledger. Its
increment rules R1–R6 bind here verbatim (≤6 files, strangler, reversible, `verify:fast` green,
unbox 56/56, ledger note per increment).
**Supersedes:** [`station-nav-floor-desk-PLAN.md`](./station-nav-floor-desk-PLAN.md) — that plan
describes a spine (`Main · Stations · More`, `stationGroup: 'floor' | 'desk'`) that no longer
exists. Its Floor/Desk taxonomy shipped and was then replaced by
`STATION_GROUPS` + `DESK_GROUPS` + `DOMAIN_GROUPS`. Do not execute it.

**Binding rules:** [`AGENTS.md`](../../AGENTS.md) ·
[`docs/mobile-first/SURFACE_LAW.md`](../mobile-first/SURFACE_LAW.md) · design-mcp
(`ds_contract` before / `ds_critique` after any `src/**/*.{tsx,jsx,css}` write).

**Operator directives (verbatim, binding):**
- "the workspaces should be moved up above scan stations and it should be displayed in terms of
  inbound, outbound, maybe marketing … parent level components of the routing and sidebar then
  child for receiving and shipping"
- "Focus more on a mobile-friendly, task-first design."
- "I want to add a reports page where I would be able to view all of the staff … view all of the
  daily reports for all of the staff as well."
- "Remove the PO mail admin section. It is not used and it is bloat."

---

## 0. Ground truth (measured 2026-09-14 — do not re-derive)

### 0.1 The spine renders, top → bottom

`SidebarNavList.tsx:382-508`:

1. **Structural top rows** — `spineStructuralTopPages` → Daily (`/`), Media Library (`/ops/photos`).
2. **Reorderable blocks** from `spineOrder` (per-staff, `staff_preferences.prefs.spineSlots`),
   default from `defaultSpineOrder` (`spine-slots.ts:65-80`) = `['floor', 'desks', …loose]`:
   - `floor` → **"Scan Stations"** collapsible, 8 rows (Arrival, Unbox, Local Pickup, Repair
     Service, Quality Control, Picker, Packing, Scan out).
   - `desks` → **"Workspaces"** collapsible, **flat** 8 rows: `otherPages.filter(isSpineDeskItem)`
     in `APP_SIDEBAR_NAV` order (Operations, Inbound, Products, Inventory, Sourcing, Shipping,
     Sales, Support).
   - loose → Automations, Admin.
3. `StaffAccountFooter`.

### 0.2 Four defects this plan fixes

| # | Defect | Evidence |
|---|---|---|
| **D1** | Scan Stations sits **above** Workspaces — the app opens on an input model, not on work | `spine-slots.ts:68-73` pushes `floor` then `desks` |
| **D2** | Workspaces is a **flat 8-row list**. `DOMAIN_GROUPS` already declares 7 domains and the spine ignores them | `SidebarNavList.tsx:443-445` maps `deskPages` flat |
| **D3** | **Two orders exist.** `SPINE_SECTIONS` (Shipping → Sales → Inbound → Operations → Support → Sourcing → Products → Inventory) drives ⌘K bands and `nav-destinations` context, but the spine's Workspaces group renders in `APP_SIDEBAR_NAV` order | `command-bar-nav-groups.ts:20-26` vs `SidebarNavList.tsx:238-241` |
| **D4** | `SPINE_SECTIONS` composes `DOMAIN_GROUPS` **positionally** (`DOMAIN_GROUPS[0]`…`[6]`) — reordering or removing one entry silently re-labels sections | `sidebar-navigation.ts:256-268` |

### 0.3 Orphan surfaces found (real front doors missing)

| Route | State | Real door today |
|---|---|---|
| `/reports` | Full desk page, 3 registered DataTable families (Bin Utilization · Velocity · Dead stock) | **none** — zero `href`/`push` to `/reports` anywhere in `src` |
| `/receiving/unfound` | `redirect('/admin?section=po_mailbox')` | Admin › PO Mailbox › Queue |
| `/m/work` | Mobile **landing default** (`/m/home` redirects here; `LandingPageCard` default) | **no drawer row** — absent from `MOBILE_NAV_DESTINATIONS` |

`/reports` tabs are local `useState`, so no tab deep-links. That is a second defect on the same page.

### 0.4 Twins: eight, and they are a migration in flight (not bloat)

`src/components/admin/admin-sections.ts` and `src/lib/admin/admin-sections.ts` are
**byte-identical**, and so are seven more `src/lib/**` ↔ `src/components/**` pairs (see X3 for the
list). They are the strangler state of the parent plan's **Track C8**, not duplication to delete
here. The consequence that matters for this plan: an edit to the admin section registry must be
applied to **both** copies in one commit.

### 0.5 Rulings already written down — do NOT re-litigate

| Ruling | Source |
|---|---|
| A scan bench must never be reachable **only** through the domain it feeds | `sidebar-navigation.ts:441-443` |
| Bottom nav is dead; the **drawer replaced it** | `MobileSidebarDrawer.tsx:39`; `RedesignedBottomNav` does not exist |
| Scan is a permanent top-right CTA, never a drawer row | `nav-registry.ts:47-49` |
| Print is **not** a section — it is a task every domain performs | `sidebar-navigation.ts:204-209` |
| Carrier postage is a Fulfillment act, not a print destination | `sidebar-navigation.ts:210-215` |
| Sales is its own root — front-desk history, **not** a fulfillment lane | `sidebar-navigation.ts:463-467` |
| `next.config` `redirects()` stays **empty** — 308s pin clients indefinitely | `next.config` redirect block |
| A nav row that 403s is worse than an absent one ("absent, not a disabled pill") | `sidebar-navigation.ts:1208`, `:464-466` |
| `/reports` keeps **one `tableId` per report family** — never one shared `reports` table | `src/app/reports/page.tsx` docblock |

---

## 1. Target IA

### 1.1 Spine order (L0)

```
Daily                         ← top pin, unchanged
Media Library                 ← top pin, unchanged
▾ Workspaces                  ← MOVED UP  (was 2nd)
▾ Scan Stations               ←           (was 1st)
  Automations
  Admin
[ staff identity footer ]
```

### 1.2 Workspaces lanes (L1) and their pages (L2)

A **lane** is not a new type. It is the existing `DomainGroupId`, finally rendered.

| Lane id | Lane label | Pages | Rendering |
|---|---|---|---|
| `inbound` | **Inbound** | Purchasing (`/sourcing`) · On the way (`/incoming`) · Unfound (`/receiving/unfound`) | header + 3 rows |
| `fulfillment` | **Outbound** | Shipping (`/shipping/orders`) | **collapsed** → one row reading *Outbound* |
| `inventory` | Inventory | Inventory (`/inventory`) | collapsed → *Inventory* |
| `catalog` | Products | Products (`/products`) | collapsed → *Products* |
| `sales` | Sales | Sales (`/dashboard?mode=sales`) | collapsed → *Sales* |
| `support` | Support | Support (`/support`) | collapsed → *Support* |
| `monitor` | `'Operations'` → **`'Monitor'`** in R1 | Operations (`/operations`) · **Reports (`/reports`)** | header + 2 rows |

**Single-page-lane collapse rule — SUPERSEDED 2026-09-14 (operator).** *"Ensure that all the sidebar
names and icons are under one parent … exactly like inbound and outbound, create different parents
and expand them into different childs … have sales under one parent and then have it drop down to
different navigable child components."*

A single-page lane now **EXPANDS into that page's own children** instead of collapsing to one row.
The children already existed as `deskChrome` in-page tabs in `SIDEBAR_PAGE_NAV`, so the spine was
hiding a whole altitude of the IA: Sales → Counter · Sales Board · Local Pickup · Repair Service;
Inventory → 9 rows; Products → 7; Support → 5; Operations → 13.

The old rule survives in exactly ONE case: a lone page that declares **no** children (a
`SidebarGroupLabel` over nothing), plus `spineFlat` pages (Automations) which opt out by
declaration. *Outbound* still reads as the operator's word — it has two pages (Shipping · FBA), so
§1.4's label policy is untouched.

Implementation: `SidebarNavList.renderLane`. Registry invariant (every lane is expandable) pinned by
two tests in `src/lib/sidebar-navigation.test.ts`. The `Rendering` column above is therefore stale
for rows 111-114 — each is now *header + its desk children*.

`MAIN_GROUPS.monitor.label` is **already `'Operations'`** (`sidebar-navigation.ts:152`). Renaming it
to `'Monitor'` in **N4** would ship a transient: until R1 adds Reports the lane is single-page, so
the collapse rule would paint one row reading *Monitor* where the operator expects *Operations* —
and the ⌘K band heading would change with it. **R1 does the rename**, in the same increment that
gives the lane its second page. N4 leaves the label alone.

**Sourcing moves under Inbound.** Demand → PO → on the way → received is one lane. The 2026-08-03
ruling was that Sourcing is not a child of *Inventory*; it said nothing about direction. The row
survives unchanged — only its parent moves. **This is the one debatable move in the plan.** If the
operator rejects it, `sourcing` keeps its own lane and Inbound holds 2 pages; nothing else changes.

**Marketing is refused for now.** `grep -rn "marketing" src/lib/sidebar-navigation.ts src/lib/nav`
→ zero hits. There is no listings desk, no channel-pricing surface, no promotions page. Declaring an
empty lane violates "absent, not a disabled pill" (§0.5). **Trigger to add it:** the first real page
in that vocabulary (channel listings, price rules, or promotions). At that point `marketing` joins
`DomainGroupId` and `DOMAIN_GROUPS` and nothing else in this plan changes — which is the test that
the lane layer is right.

### 1.3 What does NOT move

- **Scan Stations keeps all 8 benches**, including Scan out and Packing, even though they are
  outbound acts. §0.5 forbids a bench reachable only via its domain.
- **Print** does not become a lane.
- **Sales** does not fold into Outbound.

### 1.4 Label policy (why "Shipping" is not renamed)

The lane is labelled *Outbound*; the `outbound` page row keeps the label *Shipping* for the header
identity chip, ⌘K, recents, and `masterNavLabelForPath`. Under §1.2's collapse rule the spine row
reads *Outbound* and the desk header reads *Shipping* — parent then child.

Renaming the page would leak into station vocabulary: `grep -rln "'Shipping'" src` → 20 files, and
`surface-keys.ts`, `timeline-glyphs.ts`, `order-station-sections.ts`, `milestone-pipeline-types.ts`
use "Shipping" as a **station/milestone** word, not a nav label. **Optional follow-up N4b** renames
the desk row to *Outbound* in `sidebar-navigation.ts` + `sidebar-titles.ts` + `header-page-face.ts`
+ 4 test files, touching no station vocabulary. Ship it only on an explicit operator call.

### 1.5 Reports vs Operations — the boundary that stops a twin

| Surface | Owns |
|---|---|
| **Operations** (`/operations`) | **Live / now.** Observe-only monitor, TV altitude. Live, Checks, Analytics, Insights, History, Signals, Reconcile. |
| **Reports** (`/reports`) | **Dated, per-entity, exportable tables.** A day key, a staff roster, a row per thing, a Fields menu, an export. |

A metric belongs to exactly one. `/operations?mode=checks` stays the live day view;
`/reports?tab=staff` is the dated per-staff table. Neither links to the other as an alias.

### 1.6 Desktop route → lane inventory (every `src/app/**/page.tsx`, measured 2026-09-14)

`PAGE` = renders. `→ x` = `redirect()` stub. **Row** = has a spine row. **Tab** = reachable as a
desk tab. **—** = reachable by URL / link only. Route-group segments are shown as authored
(`/shipping/(desk)/orders`); the **URL is `/shipping/orders`** — groups do not appear in paths, which
is exactly why N7 can add `(inbound)` / `(outbound)` parents without moving a single URL.

**Coverage: 172 `page.tsx` routes total** — 128 desktop, 44 under `/m`. Every one is accounted for
below: assigned to a lane, named as a Scan Station, listed as off-lane by design, or flagged in
§1.9. A route absent from these tables is a gap in this plan, not a route without an opinion.

**Lane: Inbound**

| Route | Kind | Nav position after this plan |
|---|---|---|
| `/sourcing` | PAGE (`deskChrome`) | **Row** "Purchasing" (was its own lane) |
| `/incoming` | PAGE (`deskChrome`, `railless`) | **Row** "On the way" · tabs Inbound · History · Unfound |
| `/receiving/unfound` | `→ /admin?section=po_mailbox` | **Tab** "Unfound" — becomes PAGE in **N8** |
| `/receiving/unfound/[kind]/[id]` | `→ /admin?section=po_mailbox` | — detail; becomes PAGE in **N8** |
| `/receiving/history` | 308 `→ /incoming?lane=docked` | **Tab** "History" (already) |
| `/receiving` | PAGE (`ReceivingSurfacePage` legacy alias) | — back-compat, no row |
| `/receiving/lines/[id]` | PAGE | — detail |
| `/tracking-exceptions` | PAGE | — linked from Operations › Reconcile. **See §1.9** |

**Lane: Outbound**

| Route | Kind | Nav position after this plan |
|---|---|---|
| `/shipping` | `→ SHIPPING_ORDERS_PATH` | — bookmark hop |
| `/shipping/(desk)/orders` | PAGE | **Row** "Outbound" lands here · tab "To ship" |
| `/shipping/(desk)/shortage` | PAGE | **Tab** "Pending" |
| `/shipping/(desk)/fba` | PAGE | **Tab** "Amazon Prep" |
| `/shipping/(desk)/shipped` | PAGE | **Tab** "Shipped" |
| `/shipping/(desk)/exceptions` | PAGE | **Tab** "Exceptions" |
| `/fba` | `→ fbaOutboundHref(…)` | — off-spine by ruling (no second front door) |

**Lanes: Inventory · Products · Sales · Support · Monitor**

| Route | Kind | Lane | Nav position |
|---|---|---|---|
| `/inventory` + **13** children (`locations`, `locations/print/special-bin`, `skus`, `units`, `bins`, `counts`, `alerts`, `activity`, `pulse`, `graph`, `triage`, `sku/[sku]`, `location/[barcode]`) | PAGE | Inventory | **Row** "Inventory" + desk tabs / details |
| `/warehouse` | `→ /inventory/locations` | Inventory | — |
| `/warehouse/rma`, `/warehouse/rma/disposition`, `/warehouse/replenishment` | PAGE | Inventory | — **self-declared orphans** (§1.9) |
| `/replenish` | `→ /inventory?…` | Inventory | — |
| `/products`, `/products/sku/[sku]` | PAGE | Products | **Row** "Products" + detail |
| `/manuals` | `→ /products` | Products | — |
| `/manuals/library` | PAGE | Products | — retired bookmark-only twin (§1.9) |
| `/dashboard` | PAGE (`deskChrome`) | Sales | **Row** "Sales" · tabs Counter · Sales Board · Local Pickup · Repair Service |
| `/counter` | PAGE | Sales | **Tab** "Counter" (maps to `sales` in `getSidebarNavPageId`) |
| `/walk-in` | redirect shell → `/dashboard?mode=sales` | Sales | — |
| `/support` | PAGE (`deskChrome`) | Support | **Row** "Support" · 5 tabs |
| `/operations` | PAGE (`deskChrome`) | Monitor | **Row** "Operations" · 8 tabs |
| `/review` | PAGE | Monitor | **Tab** "Packing Review" |
| `/signals` | `→ /operations?…` | Monitor | — |
| **`/reports`** | PAGE, 3 registered families | Monitor | **Row** "Reports" — **new in R1** |

**Scan Stations — unchanged, and deliberately NOT lanes** (§0.5: a bench must never be reachable
only through the domain it feeds):
`/triage` · `/unbox` · `/pickup` · `/repair` · `/test` (+ `/tech` alias) · `/pack` (+ `/packer`
alias) · `/shipping/scan-out`. Note `/pack` and `/shipping/scan-out` are outbound *acts* that stay
on the bench list.

**Off-lane by design** — these belong to no domain and get no lane:

| Class | Routes |
|---|---|
| Top pins | `/` (Daily) · `/ops/photos` (Media Library) · `/search` · `/ai-chat` · `/forge` · `/settings/**` (**26** routes incl. `/settings`) |
| End of map | `/studio`, `/studio/catalog` (Automations) · `/admin` + `/admin/inventory/**` (**11** routes) |
| Entity detail / resolver | `/bin/[barcode]` · `/carton/[id]` · `/serial/[id]` · `/s/[sku]` · `/o/[orderId]` · `/p/[tracking]` · `/l/[ref]` · `/q/[payload]` · `/qr` · `/01/[gtin]`, `/01/[gtin]/21/[serial]` · `/414/[gln]/254/[code]` · `/share/photos/[token]` |
| Device | `/kiosk`, `/kiosk/v2` |
| Auth / lifecycle | `/signin`, `/signin/reset`, `/signup`, `/account/signin` · `/invite/[token]` · `/onboarding`, `/onboarding/template` · `/not-authorized` · `/offline` · `/release-notes` · `/open-links` · `/wipe` |

### 1.7 `/m` route → lane inventory (every `src/app/m/**/page.tsx`)

**This table is subject to the U2 ruling, and that changes what it may say.** The parent plan
records (U2, 2026-09-14, binding): *"the mobile surface is the unbox photo feed, picks, location
scanning, and the identification kernel; **everything else deletes, one batch at a time,
operator-gated**."* `/m/pack`, `/m/search` and `/m/home` were deleted under it; U3 revived `/m/home`
as a redirect stub because load-bearing dependents pointed at it.

Therefore **a lane assignment is not a survival warrant**. Giving a drawer row to a route the ruling
has queued for deletion resurrects it through the back door. Each row below carries its standing:

- **LIVE** — inside the ruling's four keeps, or explicitly kept by name.
- **KEPT** — outside the four, retained by a recorded operator exception.
- **GATED** — outside the four, no recorded exception. **Do not give it a drawer row** until the
  operator either keeps or deletes it. Listing it here is inventory, not endorsement.

N9's two drawer groups, mapped to real routes:

| Drawer group | Routes | Standing |
|---|---|---|
| **Inbound** | `/m/receiving` (**the unbox photo feed**) · `/m/receiving/po/[poId]` (+ `item/[itemId]`) · immersive `/m/receiving/po/[poId]{/photos,/gallery}`, `…/item/[itemId]{/photos,/gallery}`, `/m/r/[id]{/photos,/gallery}` · `/m/r/[id]` | **LIVE** — the ruling's first keep, and explicitly kept for dogfood by the 2026-09-14 intake directive |
| **Inbound** | `/m/receiving/history` | **LIVE** — Track G2 names it the pattern ScanHistory-L2 generalizes |
| **Inbound** | **`/m/unbox`** · **`/m/receive`** · **`/m/triage`** | **DELETE — Track U (§4b).** The 2026-09-14 directive: one identification scan kernel. `/m/receive` + `/m/triage` are already `redirect('/m/scan')` stubs; `/m/unbox` is a live second scan door |
| **Inbound** | `/m/consult` · `/m/rs/[id]` | **GATED** — consult intake / repair-service record. `/m/consult` is in `MOBILE_FIRST_ROUTE_PREFIXES` and has a drawer row; neither is inside the four keeps |
| **Outbound** | `/m/pick` · `/m/pick/[orderId]` | **LIVE** — "picks", the ruling's second keep |
| **Outbound** | **`/m/work`** (drawer row is NEW) | **KEPT** — U3 repointed every near-nav exit and the auth landing here; it cannot be deleted without breaking sign-in |
| **Outbound** | `/m/print` | **KEPT** — named as kept in the H1 handoff's ground truth |
| **Outbound** | `/m/orders/new` · `/m/orders/[orderId]` · `/m/on-hold`, `/m/on-hold/[sku]` · immersive `/m/p/[id]/photos` | **GATED** — `orders-new` has a drawer row today; the other three do not |
| Cross-lane leaves | `/m/home` — **redirect stub → `/m/work` today**; becomes Daily in H1 | **KEPT** (U3: never 404 this URL) |
| Cross-lane leaves | **`/m/reports`** (new, R2) | **NEW — needs the amendment in §1.8** |
| Cross-lane leaves | `/m/settings` | **KEPT** — the account footer's destination (U1) |
| Corner CTA, never a row | `/m/scan` | **LIVE** — "location scanning"; U3 restored its prefix after the U2 prune |
| Identification kernel — no lane | `/m/id/methods` · `/m/id/[job]/[entityId]` · `/m/id/pick/[orderId]` · `/m/id/scan-out/[orderId]` · `/m/identify` · `/m/b/[barcode]` · `/m/u/[id]` · `/m/h/[id]` · `/m/unit-photos/[id]` · `/m/pair/[code]`, `/m/pair/[code]/[sku]` | **LIVE** — the ruling's fourth keep |
| Auth | `/m/signin` · `/m/qr-auth` · `/m/claim` · `/m/enroll/[token]` | **LIVE** — session lifecycle, out of IA scope |
| ~~Redirect stub~~ | `/m/checklist` (never actually a stub — it was the SKU kit-parts / QC-template editor) | **DELETED 2026-09-15** — operator gated it: *"remove the checklist from the mobile display and the checklist components."* Route + 5 components + dead hook gone; row, title and prefix rewired. Was **KEPT** *"operator will repurpose"* — repurposing is what got refused. [`DELETED-MANIFEST.md`](../warehouse-os/DELETED-MANIFEST.md) § *2026-09-15* |

**N9 consequence.** The drawer may only row up **LIVE** and **KEPT** routes, so N9 and Track U are
coupled: **U5 removes the `unboxing` leaf and promotes `Photo feed` (`/m/receiving`) to the Inbound
group's first child.** N9's group therefore lands as `{Photo feed, Walk-In, Consult, Repair}`.
`Consult` and the `?mode=local-pickup` / `?mode=repair` children sit on GATED routes that already
have rows, so N9 preserves them (behaviour-preserving, the N2 precedent) and adds no rows for
`/m/on-hold` or `/m/orders/[orderId]`. **Sequencing: U4 → U5 → N9**, or N9 ships a row onto a route
U5 then deletes.

**Mobile-first debt this inventory exposes.** `/m` has an Inbound lane that is nearly complete and an
Outbound lane that stops at the to-ship queue. **No `/m` SoT exists for:** Shipping's Pending /
Shipped / Exceptions lanes, Sourcing, Inventory, Products, Support, Operations, or the three
`/reports` inventory families. Under SURFACE_LAW §1 each is an incomplete verb, not "desktop-only" —
register them in `MOBILE_FIRST_VERB_GAPS` (N9) and close them one per increment under the parent
plan's **Track G**. `/m/reports` (R2) is the first one closed the right way round: phone first.

### 1.8 The third route surface: Expo `MOBILE_MODULES` (and the ratchets that bind R2)

§1.6 and §1.7 counted 172 Next.js routes and **missed a whole surface**. `apps/` and `packages/`
exist on disk (Track A scaffold), and `apps/mobile/src/navigation/routes.ts` declares its own IA:

| Expo module | `/m` counterpart | State |
|---|---|---|
| `Receiving` | `/m/receiving` | aligned |
| `PickLists` | `/m/pick` | aligned |
| `WorkspaceSettings` | `/m/settings` | aligned |
| `ItemLookup` | `/m/b/[barcode]`, `/m/identify` | partial — the kernel covers it |
| `ScanHistory` | `/m/receiving/history` | partial — Track G2 generalizes it |
| **`PackShip`** | **`/m/pack` — DELETED by U2** | **stale: a module pointing at a route that no longer exists** |
| `FieldAcquisitions` | none | Track G1 registers it as a gap |
| `BinTransfers` | none | Track G1 registers it as a gap |

Three consequences for this plan:

1. **N9 is a native IA change, not a drawer change.** Locked verdict: *"Expo may lead the IA: **NO** —
   native consumes; module map derives from `MOBILE_NAV_DESTINATIONS`"*, and Track **F4** rewrites
   `MOBILE_MODULES` to consume that shape. So the moment N9 regroups the drawer into Inbound /
   Outbound, **those become the native app's top-level modules too.** N9 must therefore add a note
   to F4, and the lane ids must survive being a React Navigation param-list key
   (`RootDrawerParamList = { [K in ModuleKey]: undefined }`) — `inbound` / `outbound` do.
2. **`PackShip` is the drift proof.** A hand-written module map already disagrees with the web
   routes. That is the argument for F4 deriving rather than mirroring — and it means N9 should not
   hand-edit `MOBILE_MODULES`; it should leave the stale entry for F4 to delete by derivation.
3. **The boundary ratchet constrains R2's implementation.** `Boundary` is a `profiles: 'always'` gate
   in `verify-profile.mjs` running `boundary-guard.ts --enforce` against a **shrink-only** baseline
   (`scripts/boundary-exemptions.ts`). Mobile surfaces may not import desktop feature components.
   **So `/m/reports` may not reuse `useReportBinUtilizationSpreadsheet` or any
   `src/components/reports/*` grid** — those are desktop feature code. R2 composes the mobile kit and
   shares only the *fetch + parse* layer (`src/lib/reports/report-rows.ts`, which is `lib` and
   therefore platform-neutral). Run `ds_boundary <file>` before the first import, not after.

**Amendment R2 needs, recorded here.** U2's ruling is "everything else deletes"; `/m/reports` is a
**new** `/m` surface outside the four keeps. It is authorised by the operator directive of
2026-09-14 — *"I want to add a reports page … view all of the daily reports for all of the staff as
well"* plus *"mobile-friendly and mobile first"* — which **extends** the kept set rather than
contradicting it. Append that as a ledger line when R2 lands, or the next agent reading U2 will
read `/m/reports` as a violation and delete it.

### 1.9 Orphans and duplicates this inventory turned up

Beyond the three in §0.3. Each is a **separate decision**, not swept into this plan:

| Finding | Evidence | Recommendation |
|---|---|---|
| `/calendar` | **Zero references of any kind** in `src` — no `href`, no `push`, no docblock mention | Delete-increment candidate; probe usage first |
| `/photos` | No `href` anywhere; only `pathname.startsWith('/photos')` chrome checks. Distinct from `/ops/photos` (Media Library) | Confirm it is not the kiosk/photo-station URL, then delete or give it the Media Library row |
| `/warehouse/rma`, `/warehouse/rma/disposition`, `/warehouse/replenishment` | `warehouse/page.tsx:5` and `query-mode-routes.ts:591` both call them **"orphan children"** in prose | Either an Inventory lane row or a delete-increment — the code already admits the problem |
| `/manuals/library` | Its own docblock: "a second, bookmark-only copy of the manuals library" | Delete-increment |
| **Two inbound exception queues** | `/tracking-exceptions` = "receiving scans that did not resolve to a Zoho PO"; `/receiving/unfound` = "emails not in Zoho, unmatched receiving, exceptions" | **Operator call.** Same family, two tables, two front doors (one via Operations › Reconcile, one via Admin › PO Mailbox). If they are one queue, N8 mounts one tab and the other route deletes. **Do not merge unilaterally** |

`pnpm run debt:surfaces` is the tool for the rest of this sweep — see §5.2.

---

## 1b. Phase M0 — **START HERE**: teach design-mcp the mobile-first law

**Operator directive (2026-09-14):** *"what would be the starting point … so I would be able to
verify everything step by step Then add it to the MCP server design system It must be structured as
a mobile-first design and so I would be able to access everything mobile first."*

**Why this is first and not N4.** A project hook **denies every write under
`src/**/*.{tsx,jsx,css}` without a fresh design-mcp session stamp**, and design-mcp currently
**cannot answer a mobile question**. Measured: `ds_contract({ intent: "mobile phone queue shell with
sticky primary CTA and bottom sheet detail" })` returns `ItemRecordMobileMeta`,
`ItemRecordMobileStage`, `Button` — and **no phone shell at all**. So every mobile increment in this
plan (R2, U5, N9) would be authored against a design system that cannot say what the phone frame is,
and the agent hand-rolls one. M0 is pure data + config, zero UI risk, and it is what makes steps
N4→R4 verifiable rather than reviewable-by-eye.

### 1b.-1 LEDGER — executed 2026-09-14 → 2026-09-15 (in `cycleforge-lanes/prod`)

| Step | State | Files |
|---|---|---|
| **M0.2** register the phone kit as primitive homes | ✅ **done** | `tools/design-mcp/server.mjs` (+3 `PRIMITIVE_HOMES` entries) |
| **M0.3** the leaf pins | ✅ **done** | `src/design-system/pinned.json` (59 → 66 entries; 7 pins, not 6 — `MobileSidebarDrawer` owns the nav-registry-SoT law) |
| **N5** Workspaces above Scan Stations | ✅ **done — first operator-visible change** | `spine-slots.ts` · `spine-slots.test.ts` · `staff-preferences.ts` (zod) · `staff-preferences-queries.ts` · `MasterNav.tsx` |
| **N4** lane registry (id-based composition · Outbound face · Sourcing → Inbound) | ✅ **done** | `sidebar-navigation.ts` · `sidebar-navigation.test.ts` · `command-bar-nav-groups.test.ts` |
| **N6** lane sub-headers inside Workspaces | ✅ done, then **superseded by N6b** | `SidebarNavList.tsx` · `sidebar-navigation.ts` (`DESK_SPINE_SECTIONS`) |
| **N6b** **dissolve the Workspaces parent — lanes ARE the L0 groups** | ✅ **done** (slot model v3) | `spine-slots.ts` · `spine-slots.test.ts` · `SidebarNavList.tsx` |
| **N6c** **icon at the parent level only** (operator 2026-09-14) | ✅ **done** | `sidebar-spine.ts` (`SPINE_CHILD_ROW_INDENT_CLASS`) · `SidebarNavList.tsx` |
| **S1** port the shadcn `Sidebar*` component layer | ✅ **done** | `ui/sidebar.tsx` *(new)* · `ui/sheet.tsx` *(new)* · `spine-section-accent.ts` (`SPINE_ACCENT_DATA_ACTIVE`) · `sidebar-spine.ts` (export `SIDEBAR_SPINE_WIDTH_PX`) |
| **S2 + S3** mount the shell · lanes become `SidebarGroup` | ✅ **done** (one increment — same two files, no useful state between them) | `MasterNavView.tsx` · `SidebarNavList.tsx` |
| **S4** Outbound gets FBA (both rulings retired, Amazon Prep tab deleted) | ✅ **done** | `sidebar-navigation.ts` · `sidebar-navigation.test.ts` |
| **S5** shared lane source for `/m` (+ the icon law moved into the registry) | ✅ **done** | `nav/lanes.ts` *(new)* · `sidebar-navigation.ts` · `nav/spine-slots.ts` · `mobile/nav-registry.ts` · `mobile/nav-registry.test.ts` · `MobileSidebarDrawer.tsx` |
| **N6d** nav chrome at full ROW ink (no gray label / count / chevron) | ✅ **done** | `ui/sidebar.tsx` · `SidebarNavList.tsx` |
| **N6e** **a child never wears its parent's name** — Inbound › **Deliveries** › *On the way*, enforced by a gate + MCP face | ✅ **done** | `sidebar-navigation.ts` · `sidebar-navigation.test.ts` · `nav-destinations.test.ts` · `nav/nav-name-collisions.ts` *(new)* · `nav/nav-name-collisions.test.ts` *(new)* · `scripts/nav-name-guard.ts` *(new)* · `design-mcp/server.mjs` · `design-mcp/ds.mjs` · `design-mcp/smoke.mjs` |
| **N6f** child **hairline** on the desk spine (converges with the `/m` drawer; `SPINE_CHILD_ROW_INDENT_CLASS` deleted) | ✅ **done** | `SidebarNavList.tsx` · `sidebar-spine.ts` · `ui/sidebar.tsx` · `MobileSidebarDrawer.tsx` |
| **N6g** **MOBILE-FIRST GATE** — Sales · Support · Operations lose every door; Inbound · Outbound · Inventory · Products kept and queued | ✅ **done** | `nav/lanes.ts` (`LANE_MOBILE_FIRST`) · `sidebar-navigation.ts` · `nav/nav-mobile-first.test.ts` *(new)* · `scripts/mobile-first-guard.ts` *(new)* · `scripts/verify-profile.mjs` (+2 `always` gates) · `design-mcp/{server,ds,smoke}.mjs` |
| **N6h** child rail moves into the **parent glyph's column** (one derived token, both surfaces) | ✅ **done** | `sidebar-spine.ts` (`SPINE_CHILD_RAIL_INSET_CLASS`) · `SidebarNavList.tsx` · `MobileSidebarDrawer.tsx` |
| **N6i** the **⌘K gate leak** — palette read raw `APP_SIDEBAR_NAV` on the no-permissions path | ✅ **done** | `nav/command-bar-nav-groups.ts` · `nav/nav-mobile-first.test.ts` · `nav/command-bar-nav-groups.test.ts` |
| **X1** *(operator-gated deletion)* `/m/checklist` **removed** — route + 5 components + dead hook; row, title, prefix and packer CTA rewired | ✅ **done** | *deleted:* `app/m/(shell)/checklist/page.tsx` · `components/mobile/checklist/**` (5) · `hooks/useResolveCatalogByItemNumber.ts` — *edited:* `mobile/nav-registry.ts` · `mobile-context-navigation.ts` (+test) · `mobile/mobile-first-surface.ts` · `mobile/packer/MobilePackingSheet.tsx` · `api/sku-catalog/by-item-number/route.ts` (docblock) |
| **M1** *(mobile unification)* the phone top bar gains a **page-action slot** — title-left / action-right / SCAN keeps the corner | ✅ **done** | `mobile/redesign/MobileActionSlot.tsx` *(new)* · `MobileTopBar.tsx` (`actions` prop **deleted**) · `MobileShell.tsx` · `mobile/redesign/mobile-action-slot.test.ts` *(new, 6 mounted contracts)* |
| **M2** Picks tells the truth — feed is `picked_at IS NULL`, not "not packed" | ⏭ **next** | — |
| **M3** Orders gains *Add order* → `/m/orders/new` (closes Q5 contextually) | ⏭ after M2 | — |
| **S6** drawer becomes a `Sidebar` mobile variant | ⏭ after S5 | — |
| M0.1 shim reconcile | ⛔ **withdrawn — see the correction below** | — |
| M0.4 `mobile-first` refuse cohort | 🚫 **blocked in this worktree** — no `router.json` machinery here | — |
| M0.5 `mobile-first` token axis | ⏭ next | — |

**N5 — what landed.** `defaultSpineOrder` now emits `desks` before `floor`; `SPINE_SLOTS_VERSION`
1 → **2**; the previously **dead** `migrateSpineSlots` is wired into `MasterNav` and gained a
`liftDesksAboveStations` v1→v2 transform; `spineSlotsVersion` persists in the `prefs` JSONB bag
(zod + interface, **no SQL migration**). A `stampedRef` guards the PUT→refetch window so the write
cannot fire twice.

**Proven against the real 24-row catalog** (throwaway probe, `getSidebarNavItems()` + the real
`resolveSpineMapEntries`, not test fixtures):

| Case | Result |
|---|---|
| fresh staffer, no saved order | `Workspaces → Scan Stations → studio → admin`, **no write** |
| saved on v1 (`floor` first) | lifted to `Workspaces → Scan Stations → …`, **one write `v2`** |
| dragged `admin` to top on v1 | `admin → Workspaces → Scan Stations → studio` — **their arrangement survives**, only the two groups swap |
| already on v2, `floor` first by choice | **unchanged, no write** — a staffer who drags the benches back keeps them |

`node --import tsx --test src/lib/nav/spine-slots.test.ts` → **19/19**; `pnpm verify:fast` →
**PASSED** (Lint 0 errors · Typecheck · Boundary 95/95 ratchet clean).

**Visual verification could NOT be performed** — the dev server answers on `:3050` but the omp
browser relay extension is not connected, so no screenshot was taken. The probe exercises the exact
order `SidebarNavList` consumes (`resolveSpineMapEntries` over the migrated slots), which is the
honest substitute; the paint itself is unverified by eye. **Operator: open the spine and confirm.**

**Two existing tests were updated, not re-pinned to new text.** `null / empty / absent hydrate to
Stations, Workspaces…` and `defaultSpineOrder does not hoist studio above Stations` asserted the
default-order contract that v2 deliberately changes, so they moved with it (and the studio-hoist
guard was kept inside the rewritten case). A third was added: a benches-only role yields only the
stations slot.

**N4 — what landed.** `SPINE_SECTIONS` no longer indexes `DOMAIN_GROUPS` positionally: a generic
`domainSection<T extends DomainGroupId>(id)` looks lanes up by id and preserves the literal type, so
`SpineSectionId` stays a union of ids rather than widening to `string`. `fulfillment` is faced
**Outbound**; `sourcing` was dropped from `DomainGroupId` and its row repointed to
`domainGroup: 'inbound'` in **both** arrays. Desk band order is now the operator's reading:
`Scan Stations → Inbound → Outbound → Inventory → Products → Sales → Support → Operations → Automations`.

**N6 — what landed.** `DESK_SPINE_SECTIONS` (a const, not a wrapper function — the
`ts-no-tiny-functions` rule is right) is the one ordered lane list, so the render path never filters
`SPINE_SECTIONS` inline; that inline filter was defect **D3**. `SidebarNavList` grew `renderLanes()`
with the single-page collapse rule, `desks/<laneId>` collapse keys, and empty lanes rendering
nothing. `SortableSectionTrigger` was split into `SectionTriggerFace` + the sortable wrapper —
lanes are not draggable (staff reorder stays at L0) and `useSortable` cannot be called conditionally,
so one face with two wrappers beats a second trigger that drifts.

**Rendered structure, proven against the real catalog** (throwaway probe over `getSidebarNavItems()`
→ `migrateSpineSlots` → `resolveSpineMapEntries` → `DESK_SPINE_SECTIONS`):

```
▾ Workspaces                 ══ shipping.view only ══     ══ receiving+sourcing only ══
  ▾ Inbound  (2)             ▾ Workspaces                 ▾ Workspaces
      Inbound                    Outbound                   ▾ Inbound  (2)
      Sourcing               ▾ Scan Stations  (1)               Inbound
    Outbound                                                   Sourcing
    Inventory                                              ▾ Scan Stations  (4)
    Products
    Sales
    Support
    Operations
▾ Scan Stations  (8)
  Automations
```

Empty lanes vanish under permission filtering — a `shipping.view` role sees **Outbound** alone, with
no header over nothing.

**Gates.** `eslint` on all four touched files → clean · nav suites **34 + 10 + 19 + 15 pass** ·
`pnpm verify:fast` → **PASSED** (Lint · Typecheck · Boundary 95/95) · `ds_critique` on
`SidebarNavList.tsx` → **zero new problems** (identical 4-problem set before and after, literals
unchanged at 2; only the pre-existing size warning moved 511 → 621 lines).

**N6b — the Workspaces parent is gone (operator 2026-09-14: *"it must be a bigger change overall
like not one workspace parent, like different parent names for the groups not workspaces name"*).**

N6 grouped the lanes *inside* a `Workspaces` disclosure. That kept a generic wrapper an operator had
to open before they could read the domain they came for — "Workspaces" named the software's idea of
itself. N6b deletes it and promotes the lanes to **L0 groups in their own right**, which is a change
to the SLOT MODEL, not the render:

| | v2 | **v3** |
|---|---|---|
| Desk slots | one `'desks'` slot | **one slot per lane** (`SPINE_LANE_SLOT_IDS`) |
| Staff reorder | the whole desk block moves as one | **each domain drags independently** |
| `SpineMapEntry` | `{ kind: 'desks' }` | `{ kind: 'lane'; id: SpineSectionId }` |
| Render | `Workspaces › lane › page` (3 levels) | **`lane › page` (2 levels)** |
| `DESK_GROUPS` / `desksGroup` | the spine's parent label | **no longer imported by the render path** |

`LEGACY_DESKS_SLOT_ID` replaces `SPINE_DESKS_SLOT_ID`: it is a **persisted wire token**, not a
deprecated API alias — no caller navigates by it and nothing emits it. `hydrateSpineSlots` recognises
it in a saved order and **expands it in place** into the lane band, so a staffer who had moved the
desk block keeps where they put it. It deletes once no row carries `spineSlotsVersion < 3`.

**Rendered structure, proven against the real catalog** (probe over `getSidebarNavItems()` →
`migrateSpineSlots` → `resolveSpineMapEntries`):

```
A) fresh staffer            B) v2 staffer (had        C) v2 staffer who put
                               the Workspaces block)     Automations first
▾ Inbound  (2)              ▾ Inbound  (2)              Automations
    Inbound                     Inbound                ▾ Inbound  (2)
    Sourcing                    Sourcing                   Inbound
  Outbound                    Outbound                     Sourcing
  Inventory                   Inventory                  Outbound  …
  Products                    Products                 ▾ Scan Stations  (8)
  Sales                       Sales
  Support                     Support                  D) shipping.view only
  Operations                  Operations                 Outbound
▾ Scan Stations  (8)        ▾ Scan Stations  (8)       ▾ Scan Stations  (1)
  Automations                 Automations
stamp: none                 stamp: WRITE v3            stamp: WRITE v3
```

Case **C** is the one that matters: the lift moves the **band**, it does not re-sort. A staffer's own
lane order survives too (`the v3 lift keeps a staffer own LANE order`).

**Gates.** `spine-slots.test.ts` **24/24** (was 19 — +5 v3 cases, the v2 cases rewritten to the new
contract rather than re-pinned) · nav suites `34 + 10 + 15` · `staff-preferences.test.ts` 11 ·
`eslint` clean · `pnpm verify:fast` **PASSED** · prod `ds_critique` → same 4 pre-existing problems,
literals still 2, and the file **shrank 621 → 598 lines** because the wrapper came out.

**Two rule corrections taken during the build.** `ts-no-deprecated-leftovers` rejected a
`@deprecated SPINE_DESKS_SLOT_ID` alias — right, so it became the honestly-named
`LEGACY_DESKS_SLOT_ID` data token with every call site updated in the same change. `ts-no-tiny-functions`
rejected a `deskSpineSections()` wrapper — right, so it is the `DESK_SPINE_SECTIONS` const.
Separately, tsc rejected an `as SidebarNavItem` cast in `resolveSpineMapEntries`; the fix was to
**widen the generic to the SoT literal unions** rather than cast through `unknown`.

#### Two open items this build surfaced

1. **`Inbound` lane contains a row also faced `Inbound`** (the `/incoming` desk). §1.2 proposed
   facing that row *On the way*, but `sidebar-navigation.ts` carries a written ruling —
   *"Face is Inbound everywhere (wire id / path stay `incoming`)"*. Renaming it would contradict
   that ruling, so **the stutter was left in place for an operator call**, not silently resolved.
   Options: (a) accept `Inbound › Inbound · Sourcing`; (b) re-face the row *On the way* and retire
   the 2026-09-13 ruling; (c) re-face the lane.
2. **`ds_critique` via the MCP reported 795 lines for a 620-line file** — it described
   `cycleforge-app`, not this worktree. That is §1b.1's finding showing up in practice: the live MCP
   critiques the wrong tree. prod's own `ds.mjs critique` was used instead and is the trustworthy
   verdict here.

**Pre-existing failure, not this lane's.** `command-bar-nav-groups.test.ts` →
`pin contains Home Search Media Plans Chat Settings; Studio and Admin are map bands` fails on
`idsIn('admin')`. The **admin row and `MAIN_GROUPS[2]` were already removed** by uncommitted
in-flight work before N4 began (`git stash` of `sidebar-navigation.ts` restores the suite to 8/8);
my diff never touches `admin`. Left for that increment's author. My own additions to that file
(Sourcing now in the Inbound band, the retired `sourcing` band) pass.

**Measured before → after** (`node tools/design-mcp/ds.mjs contract …`, prod):

| Intent | BEFORE | AFTER |
|---|---|---|
| "phone shell for an /m page" | **`DeskPageChrome`** ← the desk frame the law forbids on `/m` | **`MobileShell`** `[mobile shell (house)]` |
| "phone list row opens a detail" | `SearchResultRow` | **`BottomSheet`** |
| "phone step progress dots" | `StepProgressHeader` | **`ProgressDots`** `[mobile kit (house)]` |
| "universal scanner door on mobile" | `ItemRecordMobileMeta` | **`mobile-scan-cta`** `[mobile shell (house)]` |

`node tools/design-mcp/smoke.mjs` → **1 failed, pre-existing and not attributable to this change**:
`tools/list returns 3 tools` now sees four because the working tree carries an **uncommitted
`ds_boundary` increment** (absent from `git show HEAD:tools/design-mcp/server.mjs`, present in the
working file). My diff is confined to hunk `@@ -165,0 +169,47 @@ const PRIMITIVE_HOMES = [` and adds
no tool. Left unfixed: it is the `ds_boundary` author's stale assertion, and the parent plan's rule
is *fix only this-lane regressions.*

#### Four corrections this build forced on the plan as written

1. **Catalog ids are FILENAMES, not export names.** The pin key is `MobileShell`, not
   `RedesignedMobileShell`; and `mobile-scan-cta` (kebab file) is its own id. Every occurrence in
   §1b.2–§1b.4 is corrected. A pin keyed on the export name would have merged onto nothing —
   silently, which is the failure mode this phase exists to stop.
2. **The catalog walk does NOT recurse.** With only the two planned homes,
   `ds_contract("MobilePhotoCountBadge")` returned **NO MATCH** — it lives in
   `src/components/mobile/receiving/`. A **third** home was required, naming the face the way the
   `item-record` block already does. The general `src/components/mobile` + `match: /\.tsx$/` home
   catches **flat files only**.
3. **M0.2 alone does not fix ranking — it is necessary, not sufficient.** After the homes landed and
   before the pins, "phone shell for an /m page" **still** answered `DeskPageChrome` first. `score()`
   pays `useWhen` **+10** and a filename substring only **+2**, so a catalogued component with no pin
   cannot outrank a pinned desk frame. **Rung 4 requires M0.2 *and* M0.3**, and the ladder is
   corrected to say so.
4. **The BEFORE state was worse than §1b.0 claimed.** It is not that design-mcp returned *no* phone
   shell — it returned **the wrong one, first**: an agent asking the design system for the `/m` frame
   was told to mount `DeskPageChrome`, the single component `SURFACE_LAW` §4/§7 forbids there. The
   gap was a wrong answer, not a silence.

**N6c — icon at the parent level only.** Operator directive (2026-09-14, verbatim, binding):
*"icon at the parent level only and more build"*. Before this the band carried TWO icon ladders — a
glyph on every lane member AND on every bench — while the lane headers carried none, so the level
that named the group was the only level with no mark. Now a glyph means PARENT: an L0 row (Daily,
Media Library, a single-page lane, Automations) or a group header (Inbound · Outbound · Scan
Stations). Rows inside a group carry no glyph and indent to the parent's label column.

`SPINE_CHILD_ROW_INDENT_CLASS = 'pl-8'` is **derived, not chosen**: `px-2` (8px) + a 16px glyph +
the 8px row gap. Two mechanics were proven rather than assumed —
`twMerge('px-2','pl-8') === 'px-2 pl-8'` (only `px` lists `pl` as conflicting, not the reverse) and
Tailwind emits `pl` after `px`, so the indent wins the left edge while the shell keeps its right pad.
**Appending `px-2` AFTER the indent WOULD eat it**, which is why the token's docblock says compose it
last. A collapsed single-page lane now wears the **lane's** glyph, not a member page's — the icon
marks the parent, so it must name the parent.

**S1 — the shadcn component layer, ported (not vendored stock).** `src/components/ui/sidebar.tsx`
and `src/components/ui/sheet.tsx` are new; **`src/hooks/use-mobile.ts` was NOT ported** because
`useIsMobile` already exists in `src/hooks/_ui.ts` (SSR-safe, `(max-width: 767px)`) and a second
breakpoint hook is a second convention. **`radix-ui` (the umbrella) was NOT added**: `Slot` comes
from `@radix-ui/react-slot` and the Sheet is built on `@radix-ui/react-dialog`, both already
installed — the umbrella would ship a second copy of the same primitives. Every upstream
`bg-sidebar` / `sidebar-accent` / `bg-background` literal is mapped to house tokens, because **those
tokens do not exist in this app's Tailwind theme** — vendoring stock shadcn here would have painted
an unstyled column.

Four upstream pieces were deliberately dropped, each with the reason in the docblock: the `fixed`
overlay/gap desktop machinery and its `offcanvas`/`icon`/`floating`/`inset` modes (this spine is a
resident, **drag-resizable** push column — the host owns width, collapse and persistence, and a
second answer is how two sources of truth start), `SidebarRail` + `SidebarTrigger` (the host already
owns the edge handle and the collapse gesture), `SidebarMenuSkeleton` (it picks a `Math.random()`
width during render — a guaranteed hydration mismatch), and `SidebarInput` / `SidebarInset` /
`SidebarSeparator` / `SidebarGroupAction` / `SidebarMenuAction` (no consumer).

**This answers plan/handoff open question 3: no `⌘B`.** The ported provider binds no chord at all,
so it cannot collide with `⌘;` (nav leader), `⌘1-9` (pins) or `?`.

**S2 + S3 — shipped as ONE increment**, because they touch the same two files and the intermediate
state (a provider mounted around an unported render) has no value to anyone. `MasterNavView` mounts
`SidebarProvider`; `SidebarNavList` now paints `Sidebar → SidebarContent → SidebarGroup →
SidebarGroupLabel / SidebarGroupContent → SidebarMenu → SidebarMenuItem → SidebarMenuButton`, which
is the tree the operator named. A **lane IS a `SidebarGroup`** — that is the whole translation.

What survived the port, all four verified: the single-page collapse rule (**since
SUPERSEDED — see §1.2 and the S5 note below: a lone page with children now
EXPANDS into them**), the `desks/<laneId>`
collapse keys via `useSpineSectionCollapse`, empty-lane omission, and the dnd-kit invariant. The
`accent` parameter is **gone** rather than threaded: `SidebarMenuButton` bakes in
`SPINE_ACCENT.idlePage` + `SPINE_ACCENT_DATA_ACTIVE`, so "am I the current page?" is the `data-active`
attribute. `SPINE_ACCENT_DATA_ACTIVE` pins the active row's hover
(`data-[active=true]:hover:bg-surface-canvas`) because `idlePage` carries `hover:bg-surface-hover`
for every row; the pin wins by **specificity** (class+attr+`:hover` = 0,3,0 beats class+`:hover` =
0,2,0), confirmed by compiling both utilities rather than reasoning about source order.
`data-spine-nav` and `data-spine-scrollport` are kept on the `Sidebar` and `SidebarContent` — they
are load-bearing, `SidebarNavColumn` re-measures the collapsed hover-peek card through them.

**S4 — Outbound is a parent of Shipping + FBA, and two rulings are retired, not bent.**

| Was | Now |
|---|---|
| *"`/fba` stays off the spine — it redirects into Shipping, no second front door"* | The ruling was about the **redirect hop**, not the surface. The row points at `/shipping/fba`, the real desk route. `/fba` still owns no row. |
| Amazon Prep is a **tab** on the Shipping desk | Tab **deleted**. Keeping both would be two doors to one page — exactly what the `deskChrome` law forbids, read in the other direction: once the nav owns the page, the desk must stop tabbing it. |

Shipping's band is now **Pending · To ship · Shipped · Exceptions** (4 tabs). `getSidebarNavPageId`
resolves `/shipping/fba` → **`fba`**, so the spine lights the FBA row and the desk frame reads its
title from the FBA entry; the route KEY stays `outbound`, so panel chrome is untouched. The FBA page
gained `railless: true` — that flag is answered by the PAGE the path resolves to, and the path now
resolves to a different page, so without it the board would have grown back the 360px context column
the desk retired. `outbound.resolveChild` returns **`null`** for every FBA path and its legacy
`?mode=fba|ready` residue rather than falling through to the `orders` catch-all: a tab claiming to be
somewhere you are not is worse than an unlit band. FBA is **not** `deskChrome` — the board draws its
own `?fbaMode=` stage strip (Ready · Plan · Combine · Shipped · Catalog), so a desk tab row would
state the same navigation twice.

The row is faced **FBA**, the operator's word (*"it should display FBA page and shipping"*) —
**that answers open question 2.** `fba` is not in `MOBILE_RESTRICTED_SIDEBAR_IDS`, so the Outbound
lane reads `Shipping · FBA` on the phone spine too, which is directive 3 (*"it must be the same for
the mobile and the desktop"*) rather than an oversight.

**Proof — the real component tree, rendered.** Every prior nav increment was verified by a probe over
*data* (`getSidebarNavItems()` → `migrateSpineSlots` → `resolveSpineMapEntries`). This one renders
**`SidebarNavList` itself** to static markup against the real 24-row catalog with a full permission
set, and asserts the icon law per row:

```
row                      kind   glyphs indent      ← 23 rows, 0 violations
Daily                    L0          1 —           (before AND after the S2/S3 port:
Media Library            L0          1 —            byte-identical row table)
Inbound                  GROUP       1 —
  Inbound                child       0 pl-8
  Sourcing               child       0 pl-8
Outbound                 GROUP       1 —           ← S4: was a single L0 row
  Shipping               child       0 pl-8
  FBA                    child       0 pl-8
Inventory · Products · Sales · Support · Operations  L0  1 —
Scan Stations            GROUP       1 —
  Arrival … Scan out     child       0 pl-8   (8 benches)
Automations              L0          1 —
```

Structural counts from the same markup: `data-slot` = sidebar 1 · sidebar-content 1 · sidebar-group
**10** · sidebar-group-label **3** · sidebar-group-content 3 · sidebar-menu 10 · sidebar-menu-item
**20** · sidebar-menu-button 20 · sidebar-footer 1; `data-spine-nav` 1 · `data-spine-scrollport` 1;
**9 `spineOrder` ids → exactly 9 sortable nodes** (the dnd invariant `spine-slots.test.ts` asserts on
the data side, now confirmed on the render side); exactly **1** `data-active="true"`.

**Gates.** `eslint` on all touched files → clean · Boundary **95/95 ratchet clean** (the new
`src/components/ui/**` files add no crossing) · nav suites **117 run / 116 pass** · unbox **56/56** ·
`ds_critique` → `SidebarNavList.tsx` keeps its pre-existing 4-problem set with literals unchanged at
2; `ui/sidebar.tsx` reports **0 arbitrary literals** and one size note; `ui/sheet.tsx` clean.

**Two honest failures, neither caused by this work, neither fixed here.**

1. `sidebar-spine-peek.test.ts` › *"leaves the open spine inert while closed, and the reopen door
   outside it"* fails. It is a `readFileSync` + regex guard over `SidebarNavColumn.tsx` — a file this
   increment never touched, and which is **clean in git** — asserting a
   `data-testid="sidebar-spine-open-strip"` that no longer exists anywhere in the file. A rotted
   source-text guard of exactly the kind AGENTS.md forbids adding. Retargeting or deleting it is the
   peek host's own increment.
2. `pnpm verify:fast` → **Lint ✓ · Boundary ✓ · Typecheck ✗**, every error in
   `features/daily-checks/*`, `lib/daily-checks/queries.ts`, `components/mobile/daily/*` and
   `features/home/HomeDailyMode.tsx` — dirty files being edited in parallel during this session (the
   error set *changed between two runs minutes apart*). Zero typecheck errors in any nav, sidebar or
   `ui/` file.

**Visual proof still not possible, and now for a second reason.** The dev server answers (`:3050`
307 → `:3000` 200), but the omp browser relay extension is still not connected AND no Chrome/Chromium
executable is installed for the managed path (`/opt/google/chrome/chrome` absent). The rendered-markup
probe above is the honest substitute — it is the actual DOM, minus CSS — plus two CSS mechanics
proven by compiling Tailwind directly (`px-2`/`pl-8` order, active-hover specificity).
**Operator: open the spine and confirm the paint.**

**Twin note (plan §0.4 / X3).** `src/lib/sidebar/sidebar-spine.ts` is a `src/components/**` twin —
but it has **already diverged** (no `cn` import, no `SPINE_DRILL_SCROLL_END_CLASS`, no
`SIDEBAR_SPINE_PEEK_INSET_PX`) and has **zero importers**. The new tokens were therefore NOT mirrored
into it: syncing a token into dead, already-forked code is worse than leaving it for the deletion
increment that owns it.

**S5 — the lane registry is now ONE module, and the icon law lives in it.**

The correction that drove this: N6c put the icon law in the desk RENDERER, which
left the two surfaces free to disagree — and they did. The `/m` drawer carried
the inverse rule (`NAV_ITEM_ICONS`, a renderer-side map keyed by destination id,
under the old chrome law *"pages are text; modes own icons"*): glyphs on the
CHILDREN, none on the parents. Two renderers, two icon sources, one operator
ruling. So:

1. **`src/lib/nav/lanes.ts` (new)** — `DomainGroupId`, `DOMAIN_GROUPS`,
   `domainLane(id)` (was the private `domainSection`). It left
   `sidebar-navigation.ts` so the PHONE can read a lane's face without importing
   the 2000-line desk registry; two surfaces can only agree on something both
   can cheaply import. The cutover is clean — no re-export shim: `SPINE_SECTIONS`
   composes with `domainLane`, `spine-slots.ts` takes `DomainGroupId` from the new
   module, and `DOMAIN_GROUPS` had exactly **one** external consumer (type-only),
   which is why the extraction was cheap. `lanes.ts` imports
   `SidebarIconComponent` **`import type`** from `sidebar-navigation`, so the
   cycle exists only in the type graph and is erased at build — the phone bundle
   gains no runtime edge to the desk registry.
2. **The icon law is now a TYPE, not a convention.** `MobileNavChild` has no
   `icon` field at all; `MobileNavLeaf` (an L0 row) and `MobileNavGroup` (a lane)
   both REQUIRE one. A child glyph is unrepresentable rather than merely
   discouraged, and the renderer has no conditional left to get wrong — it paints
   `item.icon` unconditionally. `NAV_ITEM_ICONS` is deleted, not re-keyed.
3. **Lane faces are read, never retyped.** `domainLane('inbound')` /
   `domainLane('fulfillment')` supply the drawer group's label AND parent icon, so
   the `receiving` group became **Inbound** with the lane's own glyph. A
   hand-copied `'Outbound'` string on the phone is precisely the drift the
   function exists to prevent, and `nav-registry.test.ts` now asserts
   `group.label === lane.label && group.icon === lane.icon`.
4. **Outbound exists on the phone, and `/m/work` finally has a front door.** It
   was the mobile landing default with **no drawer row at all** (§0.3 orphan).
   The lane holds exactly the two rows §1.7's U2 survival table clears:
   **`/m/work` (KEPT** — U3 repointed every near-nav exit and the auth landing
   there, so it cannot be deleted without breaking sign-in) and **`/m/pick`
   (LIVE** — "picks", the ruling's second keep).

   **`Add order` (`/m/orders/new`) — the row is REMOVED, and that is an open
   operator question, not settled law.** The facts, so the next agent inherits
   the tension rather than one side of it:

   - §1.7 line 28 marks the route **GATED** — outside the U2 ruling's four keeps,
     no recorded exception — and notes *"`orders-new` has a drawer row today"*.
     So the row was **pre-existing**, not something S5 invented; S5 found it in
     the flat list and had to decide whether to carry it into the new lane.
   - **The law reads against keeping it.** §1.7's N9 consequence: *"the drawer
     may only row up LIVE and KEPT routes."* Relocating it into a lane I was
     authoring would have re-granted it by coat-tails, which is how an anomaly
     becomes precedent.
   - **Continuity reads for keeping it.** It is a live door an operator uses
     today, and removing it is an operator-visible deletion nobody asked for.
   - **What shipped:** removed, because the written law is the only recorded
     decision and grandfathering is not. The ROUTE is untouched and still
     resolves; `matchPrefixes` still claims `/m/orders`, so a deep-link there
     still lights the lane. **Reversing this is one line in
     `MOBILE_NAV_DESTINATIONS`.**

   The Inbound group's own GATED rows (`Consult`, `?mode=local-pickup`,
   `?mode=repair`) are pre-existing too and §1.7 sequences their removal behind
   **U4 → U5 → N9** — deliberately not swept in here, which does leave the
   drawer briefly inconsistent: one GATED row removed, three still standing.
   That inconsistency is the plan's own sequencing, recorded rather than
   resolved unilaterally.
5. **The drawer's auto-expand is derived from the registry.** It used to
   hard-code the five receiving prefixes AND the group id in the component, so a
   second lane meant editing two files to keep one behaviour.

**The phone's ROWS stay phone routes.** `/m` owns its own verbs and is not a desk
mirror — there is no `/m` FBA or `/m/shipping` surface, and inventing one would
be a desk IA pushed onto a phone, which SURFACE_LAW forbids in that direction
too. What is shared is the **lane taxonomy and the icon altitude**, which is what
"one nav for phone and desk" actually means for a registry.

**Two child marks, one icon law — on purpose.** The drawer marks a child with the
rail LINE (`spineRailLineClass`: one element, two colour tokens); the desk spine
has no rail and indents with `SPINE_CHILD_ROW_INDENT_CLASS`. Stacking the indent
on top of the rail would push the phone's labels 32px past their own mark, so
each surface keeps its existing child affordance and only the GLYPH rule is
shared. Both call sites say so, so a later "consistency" edit does not add one to
the other.


**One recorded ruling was OVERTURNED, deliberately and on the record.** The
drawer's own chrome law (`MobileSidebarDrawer.tsx:75-79`) read *"pages are text;
modes own icons"* — glyphs on the mode CHILDREN, none on the parents. That is the
exact inverse of *"icon at the parent level only"*, so the two could not both
stand; the operator's 2026-09-14 ruling is the later one and it names no
exception for the phone. The old law is quoted in the replacement comment with
the date that retired it, so this reads as a supersession rather than as an agent
quietly deleting a surface's ruling. **If the operator wants the phone to keep
mode glyphs, this is the one line to reverse** — the registry types are where it
lives now, not the renderer.

**`packages/shared` note.** The old registry docblock claimed it was "the routing
SoT shared … via `packages/shared`, the native app". Measured: **no consumer
outside `MobileSidebarDrawer`** — `packages/` and `apps/mobile` import nothing
from it. That matters for one reason: the registry now holds React icon
components, which a native consumer could not use as-is. Today that costs
nothing; if the Expo surface (§1.8) ever consumes this list, split the icon field
out rather than re-adding a renderer-side map.

**Gates.** `eslint` clean on all six files · `tsc --noEmit` **zero errors
repo-wide** (the parallel `daily-checks` edits landed green too) · Boundary
**95/95 ratchet clean** — `src/lib/nav/lanes.ts` adds no crossing · nav suites
**118/118** (up 4: the icon law, the lane-face identity, the `/m/work` row, and
Scan's continued absence) · unbox **56/56** · `ds_critique` on
`MobileSidebarDrawer.tsx` → **0 arbitrary literals**, one size note.

**Evidence for the phone differs in kind from the desk's, deliberately.** The
drawer cannot be render-probed here (`useAuth` has no exported context and the
component returns `null` without a user), so the phone's icon law is proven by
**type + test at the registry** rather than by markup — which is the stronger
guarantee for this particular question, since the renderer has no branch. The
desk probe was re-run after the extraction: **0 violations, 1 active row**.

**Two open items recorded rather than silently decided.**

1. **`fba.view` IS granted in the seed** — measured, not inferred. The static
   role-permission matrix in `src/lib` is gone by design (`permissions-shared.ts`
   says so): runtime grants live in the DB `roles.permissions` column, and the
   only seed copy is `scripts/seed-roles.mjs`, which grants `fba.view` to **two
   roles** (lines 62 and 74) — plus `admin` short-circuits to `ALL_PERMISSIONS`.
   `fba` is also a registered permission **category** ("Amazon Prep") in the
   Roles editor. So the gate is real, seeded and grantable; an org whose roles
   pre-date the seed needs `fba.view` ticked in Settings › Roles for a non-admin
   to see the row.
2. **`'fba'` in `CONTEXT_PANEL_ROUTE_KEYS` is NOT a contradiction** — it is keyed
   by ROUTE KEY, and `getSidebarRouteKey('/shipping/fba') === 'outbound'`. Probed
   HEAD vs now: `isRaillessSurface('/shipping/fba')` = **true → true** (preserved,
   which is what `railless: true` on the fba entry buys) and
   `hasSidebarContextPanel('/shipping/fba')` = **false → false**. The one flip is
   `isRaillessSurface('/fba')` false → true, and `/fba` is a server `redirect()`
   that never paints, so the flag is observationally dead there. Nothing dropped
   from the set.

**N6d — nav chrome reads at full ROW ink (operator 2026-09-14).** *"The icons and
the text should not display as a gray text. It should display the same font size
and the same font color as the top three items … all black, all consistent."*

Three soft-ink sources, all now `text-text-default`: `SidebarGroupLabel`'s
`text-text-soft` (`ui/sidebar.tsx`), the collapsed-lane row count, and the
disclosure chevron's `text-text-faint`. `SidebarMenuBadge` went with them (no
consumer yet, but the law should hold the moment one mounts), and its redundant
`peer-data-[active=true]` ink rule was deleted. The trigger's
`hover:text-text-default` is gone too — a hover-ink rule only means something if
the idle state is quieter.

**Why upstream is wrong here, so a future port does not re-grey it:** shadcn
greys the group label because it is a CAPTION sitting behind its rows. A lane
header in this spine is a destination the operator reads and clicks, so quieter
ink read as disabled. The docblock says this at the call site.

The font-size half of the ask needed no change — `SidebarGroupLabel` already
carried `SPINE_LABEL_CLASS` (`text-role-body`), same as every row — so **nothing
geometric moved** and the `SPINE_CHILD_ROW_INDENT_CLASS` derivation plus the
`data-spine-nav` / `data-spine-scrollport` peek selectors are untouched.

Side effect worth naming: `SPINE_ACCENT`'s docblocks claim an icon carries "the
SAME ink value as its label". That was true of rows and false of section chrome;
**it is now true of the whole band**, which is one ink value end to end.

**Proof.** Throwaway render probe over the real catalog, scanning each row
button's FULL class set (icon + label + count + chevron): every row and every
lane header reports ink `text-default` and size `role-body`; **rows with
non-default ink: 0**. `eslint` clean · `tsc --noEmit` **0 errors** · Boundary
**95/95** · suites **93/93** · `ds_critique`: `ui/sidebar.tsx` **0 arbitrary
literals**, one size note; `SidebarNavList.tsx` **3 problems** (down from the
4-problem baseline — the `no-system-usage` finding cleared when the render
started importing `@/components/ui/sidebar`), literals unchanged at 2.

**A concurrent agent is editing this worktree.** `SidebarNavList.tsx` gained a
**newer** operator ruling mid-session — *"Ensure all the sidebar names and icons
are under one parent … exactly like inbound and outbound, create different
parents and expand them into different childs"* — which supersedes §1.2's
single-page-lane collapse rule: a lone page with children now paints the lane
label plus that page's own children (Sales → Counter · Sales Board · Local Pickup
· Repair Service). That work builds ON this increment's primitives
(`renderSection`, `renderMenuRow`, `SidebarGroup`, lane icons) and the re-run
probe confirms the icon law still holds under it: **0 violations**. Not reverted,
not fought — recorded.

**N6e — the stutter is renamed, and the law is now a machine.** Operator:
*"There should never be something like a display for the inbound, it should never
display the same child and parent name … how would I be able to make it a hard
law within the MCP Design System server?"*

**The rename.** One word stood at three altitudes — lane `Inbound` → row
`Inbound` → tab `Inbound` — so the nav said the same thing three times and
answered none of the three questions a hierarchy exists to answer. Each altitude
now answers a different one:

| Altitude | Question | Face |
|---|---|---|
| Lane | which direction of work? | **Inbound** (unchanged) |
| Row | which object? | **Deliveries** · Sourcing |
| Tab | which state of it? | **On the way** · History · PO Mailbox |

`Deliveries` over `On the way` for the ROW because the desk holds in-transit
cartons **and** landed activity **and** the PO mailbox; "On the way" names only
the first, which is exactly why it is the right word for that TAB. Rejected:
*Arrivals* (collides with the Arrival scan station), *Receiving* (collides with
the station subgroup and the route key), *Incoming* (a synonym of Inbound — the
stutter with extra letters). Wire id and path stay `incoming`; this retires the
older written ruling *"Face is Inbound everywhere"*, which is what produced the
stutter. **`keywords: ['inbound', 'incoming', 'arrivals', …]`** carry the retired
face so ⌘K still answers "inbound" — a rename without that reads as a deletion.

**The law, and why it is NOT a design-mcp refuse rule.** The server's own
docblock is the answer: *"a tool that answered 'allowed' while nothing enforced
anything would manufacture confidence … ESLint and the Boundary gate are this
repo's machines."* Two things follow:

1. **A refuse pattern could never see this.** `diffPattern` is a regex over ONE
   file's text; a collision is two declarations in two arrays (and one of them is
   in the `/m` registry). It is a REGISTRY INVARIANT, not a text smell.
2. **So the machine is a test, and the MCP tool is its face** — the same shape
   `ds_boundary` already has. One rule module, three consumers:

| Consumer | What it is |
|---|---|
| `src/lib/nav/nav-name-collisions.test.ts` | **the hard gate** — verify's `Unit tests` gate (`profiles: 'full'`), so `pnpm verify` fails on a re-introduced stutter |
| `npx tsx scripts/nav-name-guard.ts [--json]` | CLI; exit 1 = collisions, exit 2 = the guard broke (never a verdict) |
| **`ds_nav_names`** / `node tools/design-mcp/ds.mjs nav-names` | the MCP face, spawning the script exactly as `ds_boundary` spawns `boundary-guard.ts` |

It checks the **painted** pairings only, which is the whole subtlety: lane→row,
lane→**expanded child** (the 2026-09-14 expansion ruling), page→desk tab, and
`/m` group→row. That is why `Products` (lane) over `Reference · Manuals · …` is
legal even though a page labelled *Products* exists — a single-page lane paints
the page's CHILDREN, never the page's own label. Comparison is trimmed and
case-insensitive, the way a reader is.

**Proof that the gate can actually fail.** With the old labels restored by `sed`,
the test named both collisions and failed:

```
- lane → row: "Inbound" (inbound) → "Inbound" (incoming)
- page → tab: "Inbound" (incoming) → "Inbound" (pipeline)
```

Restored, it passes. A green test that cannot go red is not a gate.

**Gates.** `eslint` clean (`scripts/**` is outside the eslint gate's `src` scope,
same as `boundary-guard.ts`) · `tsc --noEmit` **0 errors** · nav suites
**120/120** · `ds_nav_names` returns `ok: true` · `node tools/design-mcp/smoke.mjs`
→ **"smoke: all good"** with `TOOLS_EXPECT` updated to the 5-tool set (the smoke
asserts the exact set precisely so a new tool cannot land unannounced).

**This answers handoff §9 Q1** (the Inbound lane/row stutter) — the last of the
four original open questions.

**N6f — the child hairline, and one law painted one way.** Operator: *"when a
parent level design sidebar is open, it should display a hairline exactly like
the pasted page component … a hairline on the left of all the child components
on the right side."*

I had shipped this as a per-surface affordance and said so out loud: drawer =
rail line, desk = `pl-8` indent, *"one law, two child marks, on purpose."* The
operator overruled it, correctly — a law painted two ways is two laws. The desk
now renders the SAME element the `/m` drawer always had: `spineRailLineClass`
(one physical line, `w-0.5 self-stretch`, two colour tokens — `border-soft`
idle → `text-default` on the row you are on) as a flex sibling inside a `pl-2`
`SidebarGroupContent`. `SPINE_CHILD_ROW_INDENT_CLASS` is **deleted**, not
deprecated, and its slot in `sidebar-spine.ts` carries a tombstone comment so
the next agent does not reintroduce an indent beside the rail.

**SUPERSEDED in part, 2026-09-15 (N6h).** The rail element and its two colour
tokens stand; the `pl-2` group body above does **not**. The rail sat under the
parent's left PAD, ~7px shy of the parent's glyph, and the operator asked for it
under the glyph. The body now carries `SPINE_CHILD_RAIL_INSET_CLASS`.

**N6g — the MOBILE-FIRST GATE.** Operator, verbatim: *"everything should be
mobile first … everything must be mobile friendly. If it is not mobile friendly,
then it should not even display anywhere within the front end, there should not
even be any front end routing or links to it … first of all, just hide the
operations, support, and sales, and keep the products, inventory, outbound, and
inbound. That is still being used on desktop, and it must be ported over to a
mobile first design system language."*

`LANE_MOBILE_FIRST` (`src/lib/nav/lanes.ts`) is a porting **ledger**, not a
feature flag, and the three states are the whole point:

| Status | Meaning | Door? |
|---|---|---|
| `ported` | the phone genuinely runs this lane | yes |
| `desk-only` | in daily desktop use, **queued** for its port | **yes** |
| `hidden` | not mobile-friendly and not in the keep list | **no — none, anywhere** |

Today: `hidden` = **sales · support · monitor** (Operations); `desk-only` =
**inbound · fulfillment · inventory · catalog**. Porting a lane is **one line**.

Three decisions inside it worth naming:

1. **The gate is applied at `getSidebarNavItems()`**, not in the spine. That one
   function is the funnel the spine, the ⌘K palette, `nav-destinations`, the
   header page switcher and recents all read — filtering only the spine would
   have left three other doors open, and the operator said *"no links to it"*.
   `DESK_SPINE_SECTIONS` is filtered too, so no header sits over nothing.
2. **`monitor` needed the gate widened.** Operations is a `MAIN_GROUPS` entry,
   not a `DomainGroupId`, so a domain-only ledger would have left the lane the
   operator named first fully visible. `GatedLaneId = DomainGroupId | 'monitor'`
   is exactly `DESK_SPINE_SECTIONS`, and a test asserts every lane the registry
   can produce carries a status — a new lane cannot slip in ungated.
3. **`hidden` hides the DOOR, not the route.** `/operations`, `/support` and
   `/dashboard?mode=sales` still resolve for a bookmark, and a test asserts the
   three rows are still IN `APP_SIDEBAR_NAV` — i.e. hidden, not deleted.
   Deleting a surface is Track X and needs its own ruling; doing it here would
   turn a nav decision into data loss.

**Verified, as asked.** Render probe over the real catalog (throwaway, deleted):

```
LANE HEADERS: Inbound · Outbound · Inventory · Products · Scan Stations
rows: 31 · icon-law violations: 0 · hidden-lane text present? false

Daily / Media Library / Automations   L0     1 glyph   no hairline
every other row                       child  0 glyphs  │ hairline
```

`ds_mobile_first` prints the same verdict as data: `paintedLaneHeaders`, the
ledger, and any leak.

**The MCP server now carries both laws — as FACES, per its own doctrine.**
`ds_nav_names` and `ds_mobile_first` each spawn a guard script that shares its
rule module with a test, exactly as `ds_boundary` spawns `boundary-guard.ts`.
`smoke.mjs`'s `TOOLS_EXPECT` is the 6-tool set (it asserts the exact set so a
tool cannot land unannounced) → **"smoke: all good"**.

**And both became `always` verify gates.** `Unit tests` is `profiles: 'full'`,
so a test alone would not bite on `verify:fast` — which is what every increment
runs. Both guards are registry reads (<1s), so they mirror the Boundary gate's
shape instead:

```
✓ Lint  ✓ Typecheck  ✓ Boundary  ✓ Nav names  ✓ Mobile-first
verify PASSED (fast)
```

**Two lanes the ruling did not name, left standing and flagged:** **Scan
Stations** (`floor` — the scan benches ARE the phone surface, so hiding them
would be backwards) and **Automations** (`studio`, a desktop pan/zoom canvas
already `MOBILE_RESTRICTED`). Both are ungated on purpose; hiding either needs
an operator ruling, not an inference from this one.

---

**N6h — the child rail's COLUMN (2026-09-15).** Operator: *"it should display
the sidebar component like this, for example, with the hairline on the left side
and aligned with the icon of the parent to the left of the child and then the
name on the right side"*, with the shadcn `Sidebar` docs pasted as reference.

N6f got the MARK right and the COLUMN wrong. Measured before:

| | geometry | rail x | label x |
|---|---|---|---|
| parent row | `px-2` + 16px glyph + `gap-2` | glyph 8→24, **centre 16** | 32 |
| child, N6f | body `pl-2` + rail `w-0.5` + button `px-2` | **8→10** | 18 |
| child, N6h | body `pl-[15px]` + rail `w-0.5` + button `px-2` | **15→17, centre 16** | 25 |

One derived token, `SPINE_CHILD_RAIL_INSET_CLASS`, whose docblock carries the
arithmetic: `px-2` (8) + half a 16px glyph (8) − half a 2px rail (1) = **15px**.
It is off the spacing scale because a 2px line cannot be centred on an even
offset; shadcn spells the identical geometry as `mx-3.5 … translate-x-px
border-l`, and this states it once as one number. `ds_critique`'s literal
detector covers type size, z-index, hex and radius — a padding arbitrary value
is not one of them, and the counts on all three touched files are unchanged
(2 / 0 / 0, same problem sets as baseline).

**The one decision the handoff demanded be explicit: per-row spans were KEPT.**
The pasted reference draws ONE continuous `border-l` on `SidebarMenuSub`'s
`<ul>`. This repo draws one span per row because the line is a **state marker**
(`border-soft` idle → `text-default` on the row you are on), and a single border
on the list cannot highlight one row. Adopting `SidebarMenuSub` verbatim would
match the reference structurally, lose the active-row mark, and collide with a
standing AGENTS.md rule (*"`SidebarMenuSub` is for a page's own CHILD MODES,
never for a lane's pages"*) — retiring that rule needs an operator ruling, so
the geometry moved and the structure did not.

**ONE token serves both surfaces**, which is the N6f ruling held: the `/m`
drawer's `<nav>` adds `px-2`, so it shifts the parent glyph (centre 24) and the
child rail (23→25) by the SAME 8px. The inset is measured from the group body
either way, so a per-surface value would have been a fork with no cause.

**Verified by render probe on BOTH surfaces** (throwaway, deleted; no browser in
this environment — no relay, no Chromium binary, so this is markup, not an eye):

```
desk   SidebarNavList  →  lane headers: Inbound · Outbound · Inventory · Products · Scan Stations
                          group bodies 5 · with pl-[15px] 5 · still pl-2 0
                          rows 31 · railed 28 · railed rows carrying a glyph 0
                          hidden-lane text present? false
/m     MobileSidebarDrawer (open, /m/receiving)
                          inset group bodies 1 · still pl-2 0
                          child rows 5 (Unbox · Photo feed · Walk-In · Consult · Repair)
                          railed 5/5 · railed rows carrying a glyph 0
```

**N6i — the ⌘K gate leak (2026-09-15).** N6g put the gate in
`getSidebarNavItems()` precisely because it is the one funnel — but
`buildCommandBarNavGroups` did not always use the funnel:

```ts
const base = permissions ? getSidebarNavItems({ permissions }) : APP_SIDEBAR_NAV;
```

So a no-arg `buildCommandBarNavGroups()` — the unauthenticated / shadow-mode
path — still emitted Sales · Support · Operations rows under their own band
headings. The lane with the least right to a door had one. Fixed to
`getSidebarNavItems({ permissions })`: the function already no-ops permission
filtering when the set is undefined, so the legacy semantics survive, and the
`SPINE_SECTIONS` loop's existing `if (sectionItems.length === 0) continue` makes
the band self-cleaning. The now-unused `APP_SIDEBAR_NAV` import is gone, so the
bypass cannot be typed back in by reflex.

`nav-destinations.ts`'s `SPINE_SECTIONS.find(...)` was checked and left: it is a
pure label lookup for an item that can no longer exist.

**Two assertions, and the red proven.** `nav-mobile-first.test.ts` now pins the
palette on both paths (`buildCommandBarNavGroups()` and `…(new Set())`: no
hidden-lane band, no hidden-lane row) and the second unpinned path — a **stale
persisted spine order**. `prefs.spineSlots` outlives a gate change, so a staffer
who arranged the spine before N6g still has `sales` / `support` / `monitor` ids
in storage; the test feeds those through `migrateSpineSlots` →
`resolveSpineMapEntries` over gated items and asserts no hidden lane resolves to
a lane or page entry. Red proven per §8.4: restoring the ternary fails the
palette test by name, and restoring the fix returns 6/6.

**Two existing palette tests were re-pinned to the gated contract, not to new
text.** `command-bar-nav-groups.test.ts` asserted *"every spine section with
pages ships a band"* and *"Support missing its page"* — both were green only
because of the leak. They now assert the gate: a visible lane must emit a band,
a hidden one must not, and a hidden lane owns no palette rows.

`verify:fast` green on all five gates (`Lint · Typecheck · Boundary · Nav names
· Mobile-first`; boundary 95/95, unchanged). Nav battery 103/103 across
`sidebar-navigation` · `spine-slots` · `command-bar-nav-groups` ·
`nav-destinations` · `nav-search` · `nav-mobile-first`;
`nav-name-collisions` + `nav-registry` + `spine-section-accent` 23/23; unbox
invariant 56/56.

**`smoke.mjs` is RED and it is not this increment — 4 fails, all `kiosk` axis.**
Handoff §8.2's close-out expects *"smoke: all good"*, so this is recorded rather
than glossed. The four checks (`kiosk axis reads all three counter token files`,
`… lists the utility sheet and the one stage canvas`, `… carries the token
docblock as prose`, `the utility sheet is FLAT`) were authored **today** —
`smoke.mjs` carries the comment `// The kiosk's home + axis (2026-09-15)` — and
expect `ds_tokens({ axis: 'kiosk' })` to source `kiosk-pos-surface.ts` /
`kiosk-counter-surface.ts`. Those files exist; `server.mjs` does not read them
yet. A parallel session is mid-increment on exactly that work
(`docs/todo/kiosk-ds-unification-HANDOFF.md` and `src/app/kiosk/**` are dirty
in-tree), so this is **their proven red** in the §8.4 sense, not a regression
here: this increment touched no kiosk file, no token axis and no design-mcp
source. **Every non-kiosk smoke check passes.** Left alone per hazard §10.1 —
do not revert another session's work; when the kiosk axis lands, smoke returns
to "all good" on its own.

---

**X1 — `/m/checklist` deleted (2026-09-15).** Operator: *"Start with just
removing items, so remove the checklist from the mobile display and the
checklist components, they are old components from the mobile app itself. I'm
removing and simplifying the display in general so I can build upon a
simplified display language."*

This is the **operator gate four documents were waiting for.** The row had
survived three passes on a written refusal — `mobile-first-foundation-PLAN.md`
Track H (*"A future agent reading H3 as incomplete must not delete the
Checklists row"*), `daily-tasks-page-HANDOFF.md` §6, §1.7's U2 row (**KEPT** —
*"operator will repurpose"*) and `daily-checklist-kinds-and-mobile-HANDOFF.md`
(*"leave it alone"*). Every one of those refusals was correct: the route was the
SKU kit-parts / QC-template editor, a different job that merely shared the word,
so deleting it on an inference from "Daily exists now" would have destroyed a
surface on a pun. All four are now struck with dated supersession lines that
quote the ruling — **the refusal is retired, not forgotten**, so the next agent
cannot read the old note and restore the row.

**Deleted (7 files):** `src/app/m/(shell)/checklist/page.tsx`;
`src/components/mobile/checklist/{MobileChecklistPage, MobileChecklistOrderQueue,
MobileChecklistEditor, MobileKitPartsCrud, MobileQcChecksCrud}.tsx`; and
`src/hooks/useResolveCatalogByItemNumber.ts`, which had exactly one importer
(the editor) and became dead with it — a clean cutover, not a shim.

**Rewired (5 files)** — the point being that restoring the files alone will NOT
bring the row back:

| File | Change |
|---|---|
| `lib/mobile/nav-registry.ts` | `checklist` leaf removed; `ClipboardList` import dropped; the "it stays until the operator gates its fate" paragraph replaced with a tombstone that quotes the ruling |
| `lib/mobile-context-navigation.ts` | the `'Checklists'` title line removed — `/m/checklist` now falls through to the desk page label |
| `lib/mobile-context-navigation.test.ts` | the `=== 'Checklists'` pin became `notEqual`, so a silent re-add fails the gate |
| `lib/mobile/mobile-first-surface.ts` | `/m/checklist` dropped from `MOBILE_FIRST_ROUTE_PREFIXES`; the *"Checklist is kept for repurposing"* note retired |
| `components/mobile/packer/MobilePackingSheet.tsx` | the *Edit kit / QC checklist* `<Link>` removed — it pointed at the deleted route, so leaving it would have been a dead door in the live pack flow |

**Kept deliberately, and why** — a deletion pass is where adjacent things get
swept by accident:

- `/api/sku-catalog/by-item-number` + `lib/packing/resolve-catalog-by-item-number.ts`
  — **still live**: `components/outbound/orders/intake/useOrderTriage.ts` calls the
  endpoint directly. The route's docblock named `/m/checklist` as its consumer and now
  names intake instead, so the next reader does not delete it as orphaned.
- `OrderPackChecklist` (`variant="mobile"`) — the packing-checklist **execution**
  surface inside the live pack flow, with `enforcement` policy. Shares the word, not
  the job. Removing it would break packing.
- `MobileDailyChecklist` / `/m/home` = **Daily** — different verb, and a parallel
  session was editing `src/components/mobile/daily/**` the same day (mtimes 2026-09-15
  01:03). Untouched.
- Desk QC surfaces (`/api/serial-units/[id]/checklist`, `qc-checks`, `pack-checklist`)
  — never in scope.

**Capability moved, not lost — state it plainly:** kit-parts and QC-template
authoring is now **desk-only** (SKU catalog admin). The phone had an authoring
door and no longer does. Under SURFACE_LAW that is normally a refusal; here it
is the operator's explicit simplification, so it is recorded as a deliberate
narrowing rather than smuggled in as cleanup.

**Verified.** Drawer render probe (throwaway, deleted) over the real registry:

```
rows painted: Daily → /m/home · Inbound (Unbox · Photo feed · Walk-In ·
              Consult · Repair) · Outbound (Orders · Picks) · Print → /m/print
"Checklists" text in markup? false      /m/checklist href in markup? false
Daily row survives? true                getMobileAppTitle('/m/checklist') → "Cycle Forge"
MOBILE_FIRST_ROUTE_PREFIXES has /m/checklist? false
```

`grep -rln` over `src/` for `m/checklist` · `mobile/checklist` · `MobileChecklist*`
· `useResolveCatalogByItemNumber` returns only the five tombstone/docblock
mentions and the test's `notEqual` — no live reference survives. Gates: **Lint ✓ ·
Boundary 95/95 ✓ · Nav names ✓ · Mobile-first ✓**; nav + title 22/22; unbox 56/56.

**Typecheck ✗ — one error, not from this increment:**
`src/components/repair/ReasonSelector.tsx(93,12): TS2304: Cannot find name
'KioskEntryField'`. That file is dirty from the concurrent kiosk-DS session (its
own inline note quotes an operator line from 2026-09-15 about reusing the notes
component) and is missing an import for a component that exists in
`components/kiosk/KioskCustomerIntake.tsx`. Nothing here touches `repair/` or
`kiosk/`. Left alone per hazard §10.1 — **do not "fix" another session's
half-written file**; re-run `verify:fast` once they land it.

One stale pin was fixed in passing, in a file this increment already had open:
`mobile-context-navigation.test.ts` asserted `getMobileAppTitle('/incoming') ===
'Inbound'`, which the N6e name law had already renamed to **Deliveries**. The
assertion now follows the label (the SoT) rather than preserving the retired
word — the same treatment N6e's own docblock prescribes.

---

**M1 — the phone top bar's page-action slot (2026-09-15).** Operator: *"there
must be something like an add order button. What would be best for this use
case? A top right CTA … the top left title and then a top right action CTA …
The code base needs to be unified under one consistent design system."*

**The bar was already that shape. Nothing could reach it.** `MobileTopBar`
declared `actions?: ReactNode` — *"page-specific controls, placed left of the
scan CTA"* — and it was **unreachable for its entire life**: the only mount
site is `RedesignedMobileShell`, which renders the page as `children` and
cannot know its verbs. Zero callers, ever. That is why every phone page with a
corner verb had to either mount its own bar (which is how
`OWN_TOP_BAR_PREFIXES` pages silently lost the SCAN CTA) or go without.

So M1 is not a new control. It is the **seam** that makes the existing shape
usable, and the prop is deleted rather than left as a decoy.

**Mirrored, not invented.** `ds_contract "mobile top bar page action button
beside the scan CTA"` returned `DeskActionSlot` — the desk already solved this
exact problem with a registrar + provider + a locked face (`DeskHeaderAction`,
radius not a call-site choice). `MobileActionSlot` is its phone twin, same
names, same last-writer-wins semantics, same memoize-or-loop hazard documented
in the same words. That is what "unified under one design system" has to mean
at the mechanism level, not just the pixel level.

| | Desk | Phone |
|---|---|---|
| Provider | `DeskActionSlotProvider` | `MobileActionSlotProvider` (in the shell, wrapping bar **and** page) |
| Registrar | `DeskActionSlotRegistrar` | `MobileActionSlotRegistrar` |
| Locked face | `DeskHeaderAction` — `radius="pill"` | `MobileTopBarAction` — `radius="surface"`, `variant="secondary"`, `size="sm"` |
| Roles | **three** (`primary` · `overall` · `leading`) | **one** |

**Three decisions worth naming:**

1. **One action, no roles.** The desk header has room for a cluster; a 390px
   bar already spends pixels on menu + title + the permanent SCAN seat, and
   R1/R2 say one job, one CTA. A page with a second verb uses `BottomSheet`.
   Typed as one slot so a cluster cannot be added by accident.
2. **SCAN keeps the corner.** The slot paints to its LEFT. Starting a scan is
   the act a warehouse phone exists for and its position is muscle memory
   (ruling 2026-08-21); an action that displaced it would move the one control
   that must never move. Pinned by a test asserting DOM order.
3. **The action is NOT louder than scan.** `secondary`, same 32px-paint /
   44px-hit ladder, copied from `mobile-scan-cta` rather than re-derived. The
   affordance is the fixed corner and the label — the spine's *"no hue,
   anywhere"* holds on the phone, and a saturated block here would out-shout
   the permanent control. Painting the full 44px is also what once made this
   bar 60px tall; the locked face is what stops a page doing it again.

**Verified by a MOUNTED test** (`mobile-action-slot.test.ts`, 6/6) — jsdom +
`createRoot` + `act`, following `composer-ticket-inset.test.ts`. It has to be
mounted: registration happens in an effect, so `renderToStaticMarkup` — this
folder's convention for pure faces — can never observe it. `.test.ts` not
`.test.tsx`, because `run-unit-tests.mjs` collects `*.test.ts` only, so the
file is in the **Unit tests** gate rather than orphaned beside it.

Contracts pinned: no registration → cluster is SCAN alone · a page's verb
reaches the bar and precedes SCAN in DOM order · exactly one SCAN CTA · title
left / action right · **the action leaves with its page** · last writer wins ·
both controls paint at one ladder height.

**Red proven** (§8.4), two independent laws:

```
swap {pageAction} / <MobileScanCta /> in the bar  → ✖ "paints LEFT of scan"
drop `return () => setAction(null)` in the slot   → ✖ "the action LEAVES with its page"
                                                     ✖ "last writer wins"
                                        restored  → 6/6
```

The cleanup one is the bug that would actually have bitten: a stale *Add order*
surviving the route change onto Picks is a wrong tap, not a cosmetic defect.

`ds_critique` clean on all three touched files (0 literals, no forks);
`ds_boundary` on the new module: **pass, zero crossings**. Unbox 56/56; mobile
nav + title + footer 28/28.

**No page registers an action yet — on purpose.** M1 is pure mechanism, so it
ships with no visual change and nothing to roll back if M2/M3 change their
minds. M2 (Picks) and M3 (Orders) are the first consumers.

#### What M1's recon settled about Orders and Picks

Both routes render the **same component** — `MobileToShipQueue`, differing by
one prop — so the two rows are one table with a filter:

```
/m/work  → MobileToShipQueue                 → unshippedOrdersQuery
/m/pick  → MobileToShipQueue feed="pending"  → pendingOrdersQuery
```

- **Orders is correct.** `unshippedOrdersQuery` is *"the merged Unshipped queue
  (Awaiting ∪ Pending), single source behind `UnshippedTable`"* — literally the
  desk shipping table's query. Same data, one API, no second orders endpoint.
- **Picks is misnamed, and this is M2.** `pendingOrdersQuery` is *"label-assigned,
  **not yet packed**"* — a **packed**-state filter, and a strict SUBSET of
  Orders. The real pick datum exists and is unused here: `picked_at`
  (`orders-queries.ts:280`, COALESCE over allocation · pick session · pick
  station), written by `POST /api/pick/scan` on `ALLOCATED → PICKED`. So Picks
  today answers a different question than its name, which is exactly the kind
  of quiet lie that makes staff stop trusting a phone app.
- **Open for the operator:** with Orders ⊃ Picks, is Picks a drawer ROW or a
  TAB of Orders? Not inferred here.

**Cleanup find, queued for the removal pass:** `MobileToShipQueue` is `/m/work`
and `/m/pick`, which leaves **`MyWork.tsx` orphaned** — zero importers, and its
docblock still claims to be `/m/work`. ~200 lines of plausible-looking dead
code that a next agent would read as live.

### 1b.0 Root cause, measured

`tools/design-mcp/design-mcp.profile.json` → `primitiveHomes` registers 12 directories.
**`src/components/mobile/**` is not one of them.** That is the whole defect: `BottomSheet` is
catalogued only because it happens to live in `src/components/ui`, and `RedesignedMobileShell`
(`src/components/mobile/redesign/MobileShell.tsx`) is invisible to the catalog.

Second finding: **`SURFACE_LAW` §7's kit is 4/6 aspirational.** Measured —

| §7 component | Exists? |
|---|---|
| `RedesignedMobileShell` | ✅ `src/components/mobile/redesign/MobileShell.tsx` — **catalog id is `MobileShell`** (the file, not the export) |
| `BottomSheet` | ✅ `src/components/ui/BottomSheet.tsx` |
| `MobilePhoneFrame` | ❌ |
| `MobileRecentStrip` | ❌ |
| `MobileStepShell` | ❌ |
| `MobileQueueShell` | ❌ |

A law that names four components that do not exist cannot be enforced. M0 registers **what is real**
and leaves the four as declared gaps — it does not scaffold empty shells to make the table true.

### 1b.1 M0.1 — ⛔ **WITHDRAWN**: prod's design-mcp is not a stale fork, it is a live parallel build

**This section as first written was wrong, and acting on it would have destroyed work.** It called
prod's `tools/design-mcp/server.mjs` a stale monolith to be replaced by the shim. Measured
2026-09-14 before building:

- prod's `server.mjs` carries **112 lines of uncommitted, actively-developed work** dated
  2026-09-12→14 — the `src/components/search` primitive home, the `ds_boundary` MCP tool, and the
  item-record identity-band heuristics. **Overwriting it with the 37-line shim would have deleted
  all of it.**
- prod's monolith already **reads `src/design-system/pinned.json`** (`OVERRIDES`, `server.mjs:223`)
  and owns `PRIMITIVE_HOMES` directly (`:87`). It is fully functional — it is not missing the law
  layer, only the `router.json` cohort layer.
- prod and `main` have **diverged hard**: 1429 prod-only commits, 1586 main-only commits, `main` is
  **not** an ancestor. And `cycleforge-app`'s own working tree has **909 modified files**, including
  uncommitted edits to `design-mcp.profile.json` **and** `router.json`. Neither side is a clean base
  to copy from.

**Revised ruling.** M0.2 and M0.3 land in **prod's own monolith + `pinned.json`**, which is exactly
how the in-flight `src/components/search` home landed three days earlier — the established pattern in
this worktree. No shim swap, no cross-worktree file copy, nothing clobbered. The operator's "law
lives in the checkout's own design system" decision holds unchanged; *this* checkout's design system
is the monolith.

**Consequence for M0.4.** prod's monolith has **no `router.json` and no refuse-rule registry** — that
machinery belongs to the Garisek engine. So the `mobile-first` **cohort cannot land here** without
either porting the engine into prod or authoring the cohort in `cycleforge-app`. Until then the
pattern-map root is unavailable and the shared law rides the **leaf `doNot` prose** instead (which is
why the six pins shipped with their full law rather than the thin inheriting version of §1b.3).
**This is a real, recorded downgrade — not a silent one.**

The upstream architecture, for when that decision is taken:

| Piece | Where | Owns |
|---|---|---|
| Engine | `$GARISEK_OS_ROOT/tools/design-mcp/target-engine.mjs` (+ `project-server.mjs`) | generic; owns **no** law |
| Shim | `<checkout>/tools/design-mcp/server.mjs` — **37 lines**, sets `DESIGN_MCP_REPO` and imports the engine | aim |
| **Law** | `src/design-system/pinned.json` · `tools/design-mcp/router.json` (generated) · `tools/design-mcp/design-mcp.profile.json` · the four cohort modules | **everything this phase edits** |

Measured drift in **this** worktree:

| File | `cycleforge-app` (live) | `cycleforge-lanes/prod` (here) |
|---|---|---|
| `tools/design-mcp/server.mjs` | 37-line shim | **1642-line pre-split monolith**, docblock still claims "CycleForge has no such file" about `pinned.json` |
| `tools/design-mcp/router.json` | present, `cf-router:v1`, 11 cohorts | **absent** |
| `design-mcp.profile.json` | present | present — **byte-identical** |
| `src/design-system/pinned.json` | present | present, 58 curated entries |

And `.cursor/mcp.json` aims the live server at
`/home/michaelgarisek/Projects/cycleforge-app/tools/design-mcp/server.mjs` — **not this worktree.**

**Consequence:** editing `prod/tools/design-mcp/server.mjs` changes nothing the agent actually calls,
and the file it would change is a monolith upstream already replaced.

**M0.1 does two things, in order:**
1. Replace prod's monolith `server.mjs` with the shim and add `router.json` (the profile already
   matches, so nothing else moves). prod's `ds.mjs`, `run-mcp.sh`, `smoke.mjs` keep working unchanged
   — that is what the shim is for.
2. **DECIDED (operator, 2026-09-14): the law lives in the checkout's own design system**, i.e.
   `<checkout>/src/design-system/pinned.json` + `<checkout>/tools/design-mcp/router.json` +
   `design-mcp.profile.json` — never in the Garisek-OS engine. Author it in **`cycleforge-app`**,
   the checkout the live MCP describes, and carry it into prod like any other law file. Do **not**
   repoint `DESIGN_MCP_REPO` at a lane worktree: the MCP would then describe a tree that vanishes on
   merge. The engine reads these by path and owns none of them, which is exactly what makes the
   per-checkout decision safe.

**Verify (operator, 30 seconds):**
```bash
cd /home/michaelgarisek/Projects/cycleforge-lanes/prod
wc -l tools/design-mcp/server.mjs        # expect 37, not 1642
ls tools/design-mcp/router.json          # expect present
node tools/design-mcp/ds.mjs contract "row of actions" | head -30
# PASS when a match carries `cohort` + `refuse` (proves the engine + router are live)
```

### 1b.2 M0.2 — register the mobile kit as a primitive home

**File:** `tools/design-mcp/design-mcp.profile.json` → `primitiveHomes` (+2 entries, in this order —
the engine matches top-down, so the specific shell home precedes the general kit):

```jsonc
{ "dir": "src/components/mobile/redesign", "label": "mobile shell (house)",
  "alias": "@/components/mobile/redesign", "match": "^(MobileShell|MobileTopBar|MobileSidebarDrawer|MobileAccountFooter|MobileDetailTopBar)\\.tsx$" },
{ "dir": "src/components/mobile", "label": "mobile kit (house)",
  "alias": "@/components/mobile", "match": "\\.tsx$" }
```

**Verify — this is the step that proves the whole phase:**
```bash
node tools/design-mcp/ds.mjs contract "phone shell for an /m page"
# BEFORE: ItemRecordMobileMeta, ItemRecordMobileStage, Button  (no shell)
# AFTER : MobileShell first, home "mobile shell (house)"  — catalog id is the FILENAME
node tools/design-mcp/ds.mjs contract "phone list row opens a detail"
# AFTER : BottomSheet
```

### 1b.3 M0.3 — the pattern map: small root, linked leaves

**Operator directive (2026-09-14):** *"It seems like it would be best to have a pattern mapping use
case for this so I would be able to have small root knowledge and then linkages to other child's
components within the design system."*

**That architecture already exists in the engine — it is the two-file split, and M0.3 uses it rather
than fattening `pinned.json`.** Six self-contained pins would restate the same four sentences six
times, which is exactly what `pinned.json`'s own `_README` forbids: *"Keep this small: a rule here is
a rule an agent will follow, and a stale one is worse than none."*

#### How the engine links a root to its children (read from `target-engine.mjs`, not assumed)

| Layer | File | Holds | Verified at |
|---|---|---|---|
| **ROOT** — one record per pattern | `tools/design-mcp/router.json` → `routes[]` | `cohort` (the pattern name) · `keywords` (intent map) · `refuse[{id,why,diffPattern}]` (the law) · `evalCommand` · `graphSymbols` · **`engineFiles` = the linkage list** | `annotateMatchFromRouter` — `target-engine.mjs:1498-1517` |
| **LEAF** — one per component | `src/design-system/pinned.json` | `useWhen` (retrieval terms) · `doNot` (**only what is unique to this component**) · `law` (citation → `lawRef`) | `score()` — `:1238-1251`; merge at `:208-222` |

**The linkage is automatic.** `annotateMatchFromRouter` walks `routes[]` and attaches the root's
`cohort`, `evalCommand` and `refuse[]` to **any catalogued component whose file appears in that
route's `engineFiles`**. So the shared law is written **once, in the root**, and every child inherits
it — add a file to `engineFiles` and that component starts answering with the mobile-first law, with
no new prose anywhere. That is the "small root knowledge + linkages" shape, and it is why M0.4 (the
root) carries the law and M0.3 (the leaves) stays thin.

```
ROOT  router.json › cohort "mobile-first"
      ├─ keywords[]    → how an intent reaches this pattern
      ├─ refuse[]      → the law, inherited by every leaf below
      └─ engineFiles[] → THE LINKAGE
            ├─ src/components/mobile/redesign/MobileShell.tsx      → leaf pin: MobileShell
            ├─ src/components/mobile/redesign/MobileAccountFooter.tsx → leaf pin (U1 geometry)
            ├─ src/components/mobile/redesign/mobile-scan-cta.tsx  → leaf pin: MobileScanCta
            ├─ src/components/mobile/ProgressDots.tsx              → leaf pin (B4 tokens)
            ├─ src/lib/mobile/nav-registry.ts                      → the routing SoT
            └─ src/lib/mobile/mobile-first-surface.ts              → the machine checklist
```

#### Three linkage rules — the matcher is looser than it looks

`annotateMatchFromRouter` counts a hit when the route's entry equals the file path, **or its
basename matches**, **or the path contains the component id**. Measured consequences:

1. **Always use full repo-relative paths, never a bare common basename.** The existing router already
   demonstrates the hazard: `session-memory` lists `route.ts`, and a bare `route.ts` basename matches
   **every API route in `src/app/api/**`**. Do not add to that class of entry.
2. **First matching route wins** — the function `return`s on first hit. `routes[]` is ordered
   alphabetically by cohort, so `mobile-first` sorts after `discover` and **before** `session-memory`,
   `shortcuts`, `slot-table` and every `station:*`. Any file it shares with those cohorts it will
   **capture**. That precedence is correct for mobile-owned files and wrong for anything else.
3. **Never list a shared primitive.** `Button.tsx` and `BottomSheet.tsx` are deliberately absent from
   every `engineFiles` list today — they reach a cohort through the `surfaces[]` topId path instead.
   Listing `BottomSheet.tsx` under `mobile-first` would annotate every desk dialog that uses it.
   **So `BottomSheet` gets a leaf pin with mobile `useWhen`, but is NOT linked into the root.**

#### The leaves (thin — shared law inherited, not repeated)

| Leaf pin | `useWhen` (retrieval terms) | `doNot` — component-unique only | Linked? | Cites |
|---|---|---|---|---|
| `MobileShell` (exports `RedesignedMobileShell`) | `/m` page frame, phone chrome, mobile shell, top bar + drawer | Do not hand-roll a phone frame. This is the `/m` frame; `DeskPageChrome` is the desk's. | ✅ root | `SURFACE_LAW` §4/§7 |
| `BottomSheet` | phone row detail, list row → detail, handheld detail | Lists on phone are cards + sheet — never a `DataTable` as the phone SoT. | ❌ shared primitive (rule 3) | `SURFACE_LAW` §5 |
| `MobileScanCta` | universal scanner door, scan seat on `/m` | Never a drawer row — Scan owns the permanent top-right seat; a row is a second door. | ✅ root | `nav-registry.ts:47-49` |
| `MobileAccountFooter` | drawer foot, staff identity on `/m` | No `border-t` — `elevationClass('raised','soft')`. `avatarPhotoId={null}`; never hash a name into a colour. Inset `px-3`, ghost row `px-0`, `min-h-11`. | ✅ root | increment **U1** |
| `ProgressDots` | phone step progress, dot rail | Done `bg-fill-success`, current `bg-fill-info`, pending `bg-surface-strong`. | ✅ root | increment **B4** |
| `MobilePhotoCountBadge` | photo count on a phone card | **x0 is never a door.** Clamp negatives; tabular figures; no in-flight state. | ✅ root | increment **B3** |

Note what is **absent** from every `doNot` above: "no hover-only", "no raw palette class", "no second
bottom nav". Those are pattern-wide, so they live in the root's `refuse[]` once (§1b.4) and arrive on
all five linked leaves automatically. Adding a seventh mobile component later costs **one
`engineFiles` line and one thin pin** — not a copy of the law.

**`useWhen` is the retrieval surface, so spend the words there.** `score()` gives a `useWhen` term
**+10** versus **+6** for an id substring — it outranks the component's own name. This is why rung 4
works: "phone shell for an /m page" has to hit `useWhen`, because nothing in the intent says
"Redesigned".

**Prerequisite:** M0.2. A pin whose file is not under a `primitiveHomes` dir *"merges onto nothing
and is law no agent can find"* (`target-engine.mjs:113`). Land the homes before the pins.

**Verify:**
```bash
node tools/design-mcp/ds.mjs contract "phone shell for an /m page" --full
# PASS: MobileShell, its own doNot, AND cohort "mobile-first" + inherited refuse[]
node tools/design-mcp/ds.mjs contract "phone step progress dots"
# PASS: ProgressDots carries cohort "mobile-first" — proof the ROOT law reached a LEAF
#       with no mobile prose written in that pin
node -e "const p=require('./src/design-system/pinned.json');
  console.log(Object.keys(p).filter(k=>/Mobile|BottomSheet|ProgressDots/.test(k)))"
# expect 8 (2 existing + 6 new)
node tools/design-mcp/ds.mjs contract "row of actions" | grep -c mobile-first
# PASS: 0 — the root did not capture a shared primitive (rules 2 and 3)
```

### 1b.4 M0.4 — the `mobile-first` cohort: refuse rules that the hook enforces

This is the step that makes mobile-first **binding rather than documented.** The profile's
`adjudicator.note` states the mechanism verbatim: *"Router refuse[] entries with a diffPattern become
project rules automatically."* So a `mobile-first` cohort in `router.json` is simultaneously a
`ds_contract` cohort, a `ds_adjudicate` rule set, and a PreToolUse denial.

**File:** `tools/design-mcp/router.json` → `routes[]` (+1 entry, same shape as the 11 existing):

```jsonc
{
  "cohort": "mobile-first",
  "keywords": ["mobile", "phone", "/m", "handheld", "touch", "thumb", "sheet", "drawer", "mobile-first"],
  "graphSymbols": ["MobileShell", "mobile-scan-cta", "MobileAccountFooter"],
  "engineFiles": [
    "src/components/mobile/redesign/MobileShell.tsx",
    "src/components/mobile/redesign/MobileAccountFooter.tsx",
    "src/components/mobile/redesign/mobile-scan-cta.tsx",
    "src/components/mobile/ProgressDots.tsx",
    "src/components/mobile/receiving/MobilePhotoCountBadge.tsx",
    "src/lib/mobile/nav-registry.ts",
    "src/lib/mobile/mobile-first-surface.ts"
  ],
  "refuse": [
    { "id": "mobile-first.desk-chrome-on-m",
      "why": "DeskPageChrome is the desk frame. /m mounts MobileShell / RedesignedMobileShell (SURFACE_LAW §4/§7).",
      "diffPattern": "DeskPageChrome" },
    { "id": "mobile-first.datatable-as-sot",
      "why": "Lists on phone are cards + BottomSheet. A DataTable as the phone SoT fails SURFACE_LAW §5.",
      "diffPattern": "<DataTable" },
    { "id": "mobile-first.hover-only",
      "why": "R5: no hover-only affordance on a touch surface. Give it a resting state.",
      "diffPattern": "hover:(?:opacity|flex|block|visible)" },
    { "id": "mobile-first.second-bottom-nav",
      "why": "The drawer replaced the bottom nav (MobileSidebarDrawer.tsx:39). Reviving one needs an operator ruling, not a component.",
      "diffPattern": "BottomNav" },
    { "id": "mobile-first.raw-palette",
      "why": "B4 token law: semantic fills only on /m. bg-emerald-500 / bg-blue-500 vanish at 8px.",
      "diffPattern": "bg-(?:emerald|blue|red|amber|slate)-[0-9]{3}" },
    { "id": "mobile-first.scan-drawer-row",
      "why": "Scan owns the permanent top-right seat; a drawer row is a second door (2026-08-21).",
      "diffPattern": "id: ?'scan'" }
  ]
}
```

**Two deliberate omissions from `engineFiles`, per §1b.3's linkage rules:**

- **`src/components/ui/BottomSheet.tsx`** — a shared primitive. Linking it would annotate every desk
  dialog that mounts a sheet, and because `mobile-first` sorts ahead of `slot-table` and `station:*`
  it would **capture** them (rule 2). `BottomSheet` keeps a leaf pin with mobile `useWhen` and no root
  link.
- **`docs/mobile-first/SURFACE_LAW.md`** — `engineFiles` is matched against the *component catalog*,
  so a doc can never be annotated. The law's address belongs in each leaf's `law` field, where it
  becomes `lawRef`.

All seven listed paths were checked to exist. `MobilePhotoCountBadge` lives under
`src/components/mobile/receiving/`, not `redesign/` — so M0.2's second home entry
(`src/components/mobile`, `match: "\\.tsx$"`) is what makes it catalogued at all.

**Scoping caution.** `diffPattern` rules are pattern-matched, so `desk-chrome-on-m` and
`datatable-as-sot` must only fire on `/m` and mobile-kit paths — every desk in this repo legitimately
mounts both. Confirm how the engine scopes a route to files (`engineFiles` vs path glob) **before**
adding these two, and if it cannot scope them, ship the four unambiguous rules
(`hover-only`, `second-bottom-nav`, `raw-palette`, `scan-drawer-row`) and leave the other two as
`pinned.json` `doNot` prose. **A false-positive refuse rule blocks every desk write in the repo** —
that failure is worse than the gap it closes.

**Verify:**
```bash
node tools/design-mcp/ds.mjs adjudicate --file src/components/mobile/redesign/MobileShell.tsx
# PASS: clean (the shell is the law, it cannot violate itself)
printf 'export const X = () => <div className="bg-emerald-500 hover:opacity-100" />\n' \
  > /tmp/m-probe.tsx
node tools/design-mcp/ds.mjs adjudicate --file /tmp/m-probe.tsx
# PASS: names mobile-first.raw-palette AND mobile-first.hover-only
node tools/design-mcp/ds.mjs adjudicate --file src/app/shipping/\(desk\)/orders/page.tsx
# PASS: NO mobile-first rule fires on a desk — this is the false-positive check
```

That last command is the acceptance test for the scoping caution. If a desk page trips a
`mobile-first` rule, **revert M0.4 and ship the four-rule version.**

### 1b.5 M0.5 — a `mobile-first` token axis

`ds_tokens` requires a named axis and refuses a dump. Current axes: `color`, `radius`, `spacing`,
`typography`, `z-index`, `elevation`, `border`, `focus`, `station-skin`, `station-depth`,
`item-record` — **nothing answers "what is the phone column width / touch floor / sticky dock
inset?"**, so an agent invents `max-w-[390px]`.

1. New token module `src/design-system/tokens/mobile-first.ts` — the values SURFACE_LAW §4/§6 already
   state, as exported constants: phone column cap (`max-w-sm`/`max-w-md`), `lg+` gutter, touch floor
   (`min-h-11`), sticky-CTA dock inset (compose the existing `dock-clearance.ts`, do not re-derive),
   phone band spacing. Colocated `mobile-first.test.ts` in the house pattern (`radius.test.ts`).
2. `design-mcp.profile.json` → `tokenSources` += `"mobileFirst": "src/design-system/tokens/mobile-first.ts"`.
3. `TOKEN_AXES` += `'mobile-first'` — **in the engine's axis list**, which is why M0.1 must land
   first: in prod's stale monolith that array is at `server.mjs:192`; after the shim it belongs to
   the engine + profile, and must be added the way the other axes are, not by editing a dead file.

**Verify:**
```bash
node tools/design-mcp/ds.mjs tokens mobile-first
# PASS: phone column, touch floor, gutter, dock inset — each with its source file
node --test --import tsx src/design-system/tokens/mobile-first.test.ts
```

### 1b.6 The operator verification ladder

Run top to bottom. **Every rung is independently revertible**, and no rung touches a `.tsx` render
path — so nothing in M0 can change a pixel.

| # | Command | PASS looks like |
|---|---|---|
| 1 | `wc -l tools/design-mcp/server.mjs` | `37` |
| 2 | `ls tools/design-mcp/router.json` | present |
| 3 | `ds.mjs contract "row of actions"` | a match carrying `cohort` + `refuse` |
| 4 | `ds.mjs contract "phone shell for an /m page"` | **`MobileShell` first** (needs M0.2 **and** M0.3) |
| 5 | `ds.mjs contract "phone shell for an /m page" --full` | the `doNot` prose from §1b.3 |
| 6 | `ds.mjs adjudicate --file /tmp/m-probe.tsx` | names 2 `mobile-first.*` rules |
| 7 | `ds.mjs adjudicate --file src/app/shipping/(desk)/orders/page.tsx` | **no** `mobile-first` rule fires |
| 8 | `ds.mjs tokens mobile-first` | phone column + touch floor, with sources |
| 9 | `node tools/design-mcp/smoke.mjs` | green (the server's own suite) |
| 10 | `pnpm verify:fast` | 3 gates green |

**Rung 4 is the one that matters.** Before M0 an agent asking design-mcp for a phone shell gets a
meta cluster and a Button; after M0 it gets the shell, its import path, and the rule that forbids
`DeskPageChrome` on `/m`. That is the difference between "mobile-first is written in a doc" and
"mobile-first is the answer the tooling gives."

**Then, and only then, proceed to N4** — and note R2 (`/m/reports`) becomes checkable work rather
than judgement: it must satisfy rungs 6–8 on its own files before it can be called done.

---

## 2. Track N — nav IA increments

### N4 — Lane registry: id-based composition, Outbound label, Sourcing → Inbound

**Files (3):** `src/lib/sidebar-navigation.ts` · `src/lib/sidebar-navigation.test.ts` ·
`src/lib/nav/command-bar-nav-groups.test.ts`

1. Replace positional `SPINE_SECTIONS` composition (D4) with an id lookup:
   ```ts
   const domainSection = (id: DomainGroupId) => {
     const found = DOMAIN_GROUPS.find((g) => g.id === id);
     if (!found) throw new Error(`unknown domain group: ${id}`);
     return found;
   };
   ```
   `SPINE_SECTIONS` becomes `[...STATION_GROUPS, domainSection('inbound'), domainSection('fulfillment'), …]`.
2. `DOMAIN_GROUPS`: `fulfillment` label `'Shipping'` → `'Outbound'`. Icon unchanged.
3. Drop `'sourcing'` from `DomainGroupId` and `DOMAIN_GROUPS`. Set `domainGroup: 'inbound'` on the
   `sourcing` row in **both** `APP_SIDEBAR_NAV` (`:454`) and `SIDEBAR_PAGE_NAV` (`:1393`) — the two
   arrays are coupled by existing tests.
4. Reorder the desk band of `SPINE_SECTIONS` to the §1.2 order: Inbound → Outbound → Inventory →
   Products → Sales → Support → Operations *(the `monitor` lane keeps its current `'Operations'`
   label here; R1 renames it to `'Monitor'` when Reports joins — see §1.2)*.

**Accept:** `node --test --import tsx src/lib/sidebar-navigation.test.ts` green with updated order
asserts · `command-bar-nav-groups.test.ts` subsequence assert still holds · typecheck green ·
`spineSectionIdForPage({kind:'domain',domainGroup:'sourcing'})` is a **type error**, not a runtime null.

**Blast radius (grep-verified, 9 files):** `SidebarNavList.tsx`, `command-bar-nav-groups.{ts,test.ts}`,
`nav-destinations.ts`, `spine-section-accent.ts`, `spine-slots.{ts,test.ts}`,
`sidebar-navigation.{ts,test.ts}`. `spineAccentFor` ignores its section id (returns one treatment),
so no accent entry is needed for a renamed or removed section.

---

### N5 — Workspaces above Scan Stations, including for existing staff

**Files (5):** `src/lib/nav/spine-slots.ts` · `src/lib/nav/spine-slots.test.ts` ·
`src/lib/schemas/staff-preferences.ts` · `src/lib/neon/staff-preferences-queries.ts` ·
`src/components/sidebar/master-nav/MasterNav.tsx`

**The trap:** flipping `defaultSpineOrder` alone ships to **new staff only**. `hydrateSpineSlots`
preserves any saved order for known ids, and `migrateSpineSlots` — the function written for exactly
this — **is dead code**: `MasterNav.tsx:63` calls `hydrateSpineSlots`, nothing calls
`migrateSpineSlots`, and `spineSlotsVersion` is persisted nowhere
(`StaffPreferencesPutBody` has `spineSlots` only, `staff-preferences.ts:344`).

1. `defaultSpineOrder`: push `SPINE_DESKS_SLOT_ID` **before** `SPINE_STATIONS_SLOT_ID`.
2. `SPINE_SLOTS_VERSION` 1 → **2**.
3. Add a v2 transform to `migrateSpineSlots`: when `savedVersion < 2`, move `desks` to the index
   immediately before `floor`, preserving every other id and its relative order. Pure function,
   unit-tested; a saved order that already has `desks` first is returned unchanged.
4. Persist the stamp: add `spineSlotsVersion?: number | null` to the `StaffPreferences` interface
   (`staff-preferences-queries.ts:205` neighbourhood) and to `StaffPreferencesPutBody`
   (`z.number().int().min(0).max(999).nullable().optional()`). **No SQL migration** — `prefs` is a
   JSONB bag merged with `||`.
5. `MasterNav`: call `migrateSpineSlots(prefs?.spineSlots, navItems, prefs?.spineSlotsVersion)`,
   render `slots`, and when `stamp !== null` fire `updatePrefs(stamp)` **once** in an effect keyed on
   the stamp identity.

**Accept:** new staff → Workspaces first · a staff row saved as `['floor','desks','studio','admin']`
renders `['desks','floor','studio','admin']` and writes the stamp exactly once (second mount writes
nothing) · a staff row that had dragged `admin` to the top keeps `admin` first · `spine-slots.test.ts`
covers all three.

---

### N6 — Lane sub-headers inside Workspaces

**Files (4):** `src/components/sidebar/master-nav/SidebarNavList.tsx` ·
`src/components/sidebar/master-nav/useSpineSectionCollapse.ts` ·
`src/components/sidebar/master-nav/spine-lane-groups.guard.test.ts` *(new)* ·
`src/lib/sidebar-navigation.ts` (export `deskSpineSections()`)

**design-mcp:** `ds_contract` before, `ds_critique` on `SidebarNavList.tsx` after. `ds_contract`
returns `@/components/ui/collapsible` and `@/components/ui/sidebar` — but this file already owns its
collapse (`useSpineSectionCollapse`) and its row face (`SPINE_ROW_*` from `sidebar-spine.ts`).
**Reuse those. Do not mount a second collapsible primitive inside the spine.**

1. Export from the nav SoT:
   ```ts
   export function deskSpineSections() {
     return SPINE_SECTIONS.filter((s) => isDeskSpineSection(s.id));
   }
   ```
   The render path must never filter `SPINE_SECTIONS` inline — that is how D3 happened.
2. In `SidebarNavList`, replace the flat `block.kind === 'desks'` body (`:435-451`) with a loop over
   `deskSpineSections()`, bucketing `deskPages` by `spineSectionIdForPage(page)`:
   - lane with **0** pages → render nothing (existing `rowCount === 0` return in `renderSection`);
   - lane with **1** page → `renderLeaf`-shaped row using the **lane** label and the page's
     `onNavigate(page.id)`;
   - lane with **≥2** pages → `renderSection(laneKey, …, lane.label, rows, …)`.
3. Collapse keys namespaced `desks/<laneId>`. `useSpineSectionCollapse` is **one flat string set**
   (device-local `localStorage`, key `sidebar-spine-sections-closed`) shared by station, desk and
   page-parent sections, so a bare lane id would collide with a page-parent section id. The store
   holds **only closed ids**, so every new lane arrives **open** with no change to
   `SPINE_SECTION_CLOSED_BY_DEFAULT` (which stays `{ admin: true }`).
4. `ownsCurrent` per lane = `lanePages.some(p => p.id === activePage.id)`.
5. The Workspaces group itself keeps its own collapse row and its `SPINE_DESKS_SLOT_ID` sortable id —
   lanes are **not** independently draggable (staff reorder stays at L0; `isSpineSlottable` unchanged).

**Guard test (new):** every `kind: 'domain'` row's `domainGroup` resolves to a `DOMAIN_GROUPS`
entry · every `deskSpineSections()` lane has ≥1 page under the full permission set · `SidebarNavList`
contains no hard-coded lane label string (no `"Inbound"` / `"Outbound"` literal) · single-page lanes
render the lane label.

**Accept:** spine reads Workspaces › Inbound{Purchasing, On the way} · Outbound · Inventory ·
Products · Sales · Support · Operations{Operations} (Unfound arrives in N8; Reports + the *Monitor*
rename in R1) · lane collapse survives reload **per device** (not a staff pref) · a
`shipping.view`-only role sees Outbound alone, no empty lane headers · `ds_critique` clean.

---

### N7 — Route-group lane parents *(deferred; execute only after N4–N6 land)*

Next.js route groups give a real parent component **without changing a single URL**:

```
src/app/(inbound)/
  layout.tsx           ← lane gate + prefetch only; renders {children}, NO DOM
  sourcing/            ← git mv src/app/sourcing            → /sourcing
  incoming/            ← git mv src/app/incoming            → /incoming
  receiving/           ← git mv src/app/receiving           → /receiving/*
src/app/(outbound)/
  layout.tsx
  shipping/            ← git mv src/app/shipping            → /shipping/*
```

**Hard constraint:** the lane layout renders `{children}` plus at most a context provider and
**emits no markup**. `/shipping/scan-out` is a `railless` Scan Station living inside the moved tree;
any chrome in a lane layout breaks station law and the railless predicate. `/shipping` would then
carry three nested layouts (`(outbound)` → `shipping` → `(desk)`) — acceptable, but it is the reason
this increment is last.

**Honest cost/benefit.** Benefit: the IA is legible in the file tree, and each lane gets one place
for its permission gate and prefetch instead of per-page `SurfaceGate` duplication. Cost: ~20
mechanical file moves, which **breaks the parent program's ≤6-file ceiling** and buys the operator
nothing they can see — they navigate by the spine, not by typing URLs. **Execute per lane, and
request an explicit R1 exemption for the `git mv` churn.** If the exemption is refused, N7 drops
with zero effect on N4–N6.

**Rejected: real URL nesting** (`/inbound/receiving`, `/outbound/shipping`). It breaks every
bookmark, every `SIDEBAR_PAGE_NAV` href literal, `ROUTE_PERMISSIONS` prefixes, middleware, and
`OUTBOUND_MODE_PATHS`, and it needs the `next.config` redirects the repo deliberately keeps empty
(§0.5). The benefit is cosmetic.

---

### N8 — Inbound › Unfound becomes a real page

**Prerequisite for X1.** Deleting the PO Mailbox admin door before this lands orphans the triage
queue.

**Files (4):** `src/app/receiving/unfound/page.tsx` ·
`src/app/receiving/unfound/[kind]/[id]/page.tsx` · `src/lib/sidebar-navigation.ts` ·
`src/lib/sidebar-navigation.test.ts`

1. Replace `redirect('/admin?section=po_mailbox')` in both pages with the real mount —
   `UnfoundQueueSidebarToolbar` + `UnfoundQueueTable` (the components Admin was hosting;
   `/api/receiving/unfound-queue` is unchanged).
2. Add the tab to the Inbound desk (`sidebar-navigation.ts:1345-1355`):
   ```ts
   { id: 'unfound', label: 'Unfound', icon: AlertTriangle,
     to: () => ({ pathname: '/receiving/unfound', params: {} }) },
   ```
   and a `resolveChild` clause returning `'unfound'` for that path prefix. Inbound's `deskChrome`
   tabs become **Inbound · History · Unfound**.
3. Add the `unfound` page to the `inbound` lane's L2 list only if the operator wants it as a spine
   row as well as a desk tab; default is **desk tab only** (a desk that tabs its own pages does not
   need the nav to tab them a second time — `SidebarPageNav.deskChrome` docblock).

**Accept:** `/receiving/unfound` renders the queue, no redirect · Inbound desk shows 3 tabs and each
deep-links · the `resolveChild(apply(to(child))) === child` round-trip invariant holds (enforced by
`sidebar-navigation.test.ts`).

---

### N9 — Mobile drawer lanes (mirrors §1.2)

**Files (4):** `src/lib/mobile/nav-registry.ts` · `src/lib/mobile/nav-registry.test.ts` ·
`src/components/mobile/redesign/MobileSidebarDrawer.tsx` (icon map only) ·
`src/lib/mobile/mobile-first-surface.ts`

`MobileNavGroup` already supports exactly one level of children — no new type.

```ts
export const MOBILE_NAV_DESTINATIONS = [
  { kind: 'group', id: 'inbound', label: 'Inbound',
    matchPrefixes: ['/m/receiving', '/m/receive', '/m/triage', '/m/unbox', '/m/r/'],
    children: [ Unbox, Photo feed, Walk-In, Consult, Repair ] },        // unchanged set
  { kind: 'group', id: 'outbound', label: 'Outbound',
    matchPrefixes: ['/m/work', '/m/pick', '/m/orders', '/m/print'],
    children: [
      { id: 'orders',     label: 'Orders',    href: '/m/work' },        // NEW — closes §0.3
      { id: 'picks',      label: 'Picks',     href: '/m/pick' },
      { id: 'orders-new', label: 'Add order', href: '/m/orders/new' },
      { id: 'print',      label: 'Print',     href: '/m/print' },
    ] },
  { kind: 'leaf', id: 'daily', label: 'Daily', href: '/m/home' },       // per H1 handoff
];
```

- **`/m/work` gets a drawer row.** It is the mobile landing default and today has none (§0.3).
- **Scan stays absent** — permanent top-right CTA (§0.5).
- **No bottom nav.** The drawer replaced it (§0.5). `MOBILE_NAV_TAB_DESTINATIONS` remains the
  dormant routing SoT; do not touch its ids (admin card + stored configs reference them).
- Drawer glyph law unchanged: **pages are text, modes own icons** — only group children carry
  glyphs, keyed by destination id in `NAV_ITEM_ICONS`.
- Coordinate with **H1** (`docs/handoff/daily-tasks-page-HANDOFF.md`), which renames
  `checklist` → `daily` and repoints it to `/m/home`. **Whichever lands second owns the merge.**

**Accept:** `nav-registry.test.ts` — exactly one active row per location (`isChildActive` query
awareness preserved), `/m/work` resolves to Outbound › Orders, `/m/receiving?mode=repair` lights only
Repair · drawer renders 2 groups + Daily · unbox 56/56.

**Mobile-first debt registered.** `/reports` desk families (Bin Utilization, Velocity, Dead stock)
have no `/m` SoT. Add three entries to `MOBILE_FIRST_VERB_GAPS` in this increment; the staff/daily
report itself is **not** a gap because R2 ships its `/m` SoT first.

---

## 3. Track R — Reports

### R1 — Front door + URL-addressable tabs for `/reports` ✅ **LANDED 2026-09-15**

Lane renamed `'Operations'` → **`'Monitor'`** (`MAIN_GROUPS`), Reports row added beside Operations
(`kind: 'main'`, `mainGroup: 'monitor'`), `LANE_MOBILE_FIRST.monitor` flipped `hidden → desk-only`
(`/m/reports` is the lane's phone face). Tabs and date are URL-addressable (`?tab=`, `?date=`,
`router.replace`) with **Staff day as the default tab**; sort/search stay local per the existing
docblock. `children` + `resolveChild` declared on the reports `SIDEBAR_PAGE_NAV` entry
(`deskChrome`) — ⌘K finds the four report tabs via child flattening, round-trip invariant green
(nav suites 83/83). **Permission deviation from step 3, recorded:** the gate is
`operations.view` on all three doors, and
`reports.view` was considered and REJECTED — it is granted broadly (manager tiers AND `viewer`,
`seed-roles.mjs:76`), which would hand a floor viewer every staffer's
day and contradict *"view only in a manager"*. Stale expectations updated in
`nav-mobile-first.test.ts` + `sidebar-navigation.test.ts` (they pinned the pre-flip hidden set).
`debt:surfaces` not re-run (sibling lanes hold the tree red-green; own suites green).

**Files (5):** `src/lib/sidebar-navigation.ts` · `src/lib/sidebar-navigation.test.ts` ·
`src/app/reports/page.tsx` · `src/lib/reports/report-tabs.ts` *(new, pure)* ·
`src/lib/nav/nav-destinations.test.ts`

1. Add the row to **both** nav arrays:
   ```ts
   { id: 'reports', label: 'Reports', href: '/reports', icon: BarChart3,
     kind: 'main', mainGroup: 'monitor', requires: 'operations.view' },
   ```
   `mainGroup: 'monitor'` puts it in the monitor lane beside Operations.
2. **Rename the lane:** `MAIN_GROUPS.monitor.label` `'Operations'` → `'Monitor'`
   (`sidebar-navigation.ts:152`). Deferred to here from N4 so the lane never renders as a
   single-page row reading *Monitor* (§1.2). This also removes the header-over-one-child stutter and
   retitles the ⌘K band; `spineAccentFor` is id-agnostic so no accent entry changes.
3. **Permission:** reuse `operations.view` for v1. Do not mint `reports.view` until someone needs to
   withhold reports from a staffer who can see Operations — an unused permission is a row that can
   403 (§0.5). Add the `/reports` → `operations.view` entry to `ROUTE_PERMISSIONS`.
4. Convert the page's local `Tab` state to the URL. Declare `children` + `resolveChild` on the
   `reports` `SIDEBAR_PAGE_NAV` entry with `deskChrome: true`, targets
   `{ pathname: '/reports', params: { tab: 'utilization' | 'velocity' | 'dead' } }` (default tab
   nulls the param). The page reads `?tab=`. Keep sort/search local — the page owns no other params,
   and the existing docblock says so.

**Accept:** spine Monitor lane shows Operations · Reports · ⌘K finds "Bin Utilization" via
`buildNavDestinations` child flattening · `/reports?tab=velocity` opens on Velocity · round-trip
invariant holds · `pnpm run debt:surfaces` no longer lists `/reports`.

---

### R0 — the staff-day read model ✅ **LANDED 2026-09-15** (ahead of R1/R2, deliberately)

**Files (2):** `src/lib/daily-checks/staff-day.ts` · `staff-day.test.ts` (10/10).

`buildStaffDay(report, staffId)` / `buildStaffDays(report)` — a PURE projection of the day report
into one staffer's task list: `{ itemId, title, kind, ticketId, assignedStaffName, checkedAt }`,
checked tasks in TICK order, everything still owed after them in authored order. It is the model
R2 (`/m/reports`) and R4 (desk Staff family) both consume, so the phone and the desk cannot
disagree about what a shift did.

Sequenced first because it is decision-free and DB-free: no new endpoint, no permission question,
no UI. `GET /api/daily-checks?date=` already returns everything it needs —
`DailyCheckStaffRow.markedAtByItemId` (DC4) is the per-task instant, and it had no consumer until
now. **R3 is therefore still gated on the R2 phase gate**, unchanged: this closes the *shape*
question, not the *source* question.

Load-bearing rules it encodes, so no surface re-derives them:
- a task the staffer was not on the hook for (a one-off owned by someone else) is **absent**, not
  an unchecked row — the report's own `countsFor` rule, so a miss is a real miss;
- an unchecked task **stays** with `checkedAt: null` — a day is read to find what was missed;
- the fraction is `DailyCheckStaffRow.doneCount / .total`, never re-counted;
- an unknown staffer returns `null`, never a fabricated empty day.

**Note vs §1.7 / R2's data list:** R2 pairs `/api/daily-checks` with `GET /api/staff-goals` for the
roster + production counts. R0 covers the CHECKLIST half only — title + time per staffer, which is
what the operator asked for by name. `staff-goals` stays R2's business for units produced; R0 does
not replace it and does not contradict the spec.

### R2 — `/m/reports` — the staff day, mobile SoT **first** (SURFACE_LAW §1)

This ships **before** the desk Staff family. That ordering is the law, not a preference.

**Files (5):** `src/app/m/(shell)/reports/page.tsx` *(new)* ·
`src/components/mobile/reports/MobileStaffDayList.tsx` *(new)* ·
`src/components/mobile/reports/MobileStaffDayList.test.tsx` *(new)* ·
`src/lib/mobile/mobile-first-surface.ts` · `src/lib/mobile/nav-registry.ts`

**Surface class B** (phone browse — a queue/roster is the product). Composition:

| Slot | Mount | Law |
|---|---|---|
| Day selector | `TabSwitch`-shaped day chip (`Yesterday · Today`) + date field | SURFACE_LAW §5 binary/small mode = `TabSwitch`; a full range picker is a desk control |
| Roster | banded card list, one card per staffer | §5 "lists on phone = cards + `BottomSheet`", never a `DataTable` |
| Card face | `StaffAvatar` colour mark + name + done/goal + last activity | `ds_contract` → `ItemRecordMobileStage` for the mark, `ItemRecordMobileMeta` for the fact cluster. **One meta cluster under the title** — do not split into independent chips |
| Detail | `BottomSheet` — that staffer's day: checks marked, units by station, first/last activity | §5 row → sheet |
| CTA | **none** — this surface is read-only | R2 "one primary CTA" applies to surfaces that commit; inventing one would be a fake job |

**Data — existing endpoints, no new API for v1:**
- `GET /api/staff-goals` → **all staff with live SAL-based counts** (`staff-goals/route.ts`, "All
  staff with live SAL-based counts" branch) — this is the roster + production number.
- `GET /api/daily-checks?date=YYYY-MM-DD` → the day's checklist + report,
  `loadDailyCheckReport`, gated `dashboard.view`, **live read, warehouse civil day**
  (`getCurrentPSTDateKey` — never the server's UTC date).

**Phase gate:** if those two cannot answer "what did staffer X do on day D", stop and do R3. Do not
widen a query inline.

**Mobile laws to satisfy (R1–R10):** one job per screen · no hover-only (the desk `HoverTooltip`
pattern is already flagged in `MINIATURE-CATALOG.md` — do not copy it) · `min-h-11` touch floors ·
`IconButton size="touch"` · semantic tokens only, no raw palette class (the B4 token-law contract) ·
fixed phone width on `lg+` per SURFACE_LAW §4.

**Tests:** `renderToStaticMarkup` + `node:test`, colocated (house pattern:
`src/components/ui/tracking-chip-last8.test.tsx`). Contracts: empty roster renders an honest empty
state and **never a fake 0** · a staffer with no goal row shows the derived default, not `null` ·
day key is the warehouse civil day, not `new Date()` · no raw palette class in the markup.

**Registry:** add `/m/reports` to `MOBILE_FIRST_ROUTE_PREFIXES` and a `{ kind: 'leaf', id: 'reports',
label: 'Reports', href: '/m/reports' }` row — **outside** both lanes, since reports are cross-lane.

---

### R3 — `/api/reports/staff-day` *(only if R2 proves the rollup is missing)*

**Files (3):** `src/app/api/reports/staff-day/route.ts` *(new)* ·
`src/lib/reports/staff-day-queries.ts` *(new)* · test.

Canonical handler skeleton: `withAuth` + route permission → Zod validate (`date` = `YYYY-MM-DD`,
optional `staffId`) → domain helper → 404/200 → `recordAudit`. Org-scoped via `tenantQuery`
(`organization_id` from `ctx`, **never** the body). Date is a warehouse civil day. Read-only.

Candidate sources already in the repo, to be confirmed by the R2 gate — do **not** wire all of them
speculatively: `staff_goals` + station activity (`VELOCITY_ACTIVITY_TYPES`), `daily_checks`,
`packerlogs`, `receiving_logs`, `tech_logs`, `shifts`.

---

### R4 — Desk Staff family on `/reports` ✅ **LANDED 2026-09-15**

`/reports?tab=staff&date=` — a FOURTH registered family on the one engine, not a fourth table:
`report-staff-day` (own tableId, `PRODUCT_TABLES` + `REGISTERED_BINDINGS` + `TABLE_ENTITY_FAMILIES`
 + `TableId`/`TABLE_COLUMNS` key + `SLOT_TABLE_ENGINE_LAYOUT_HOOKS` all appended). Rows are LONG
format — one row per (staffer × task), `staffDayRowsFromReport` flattening the SAME
`buildStaffDay` projection the phone reads (`src/lib/reports/staff-day-rows.ts`), so the two
surfaces cannot disagree about a shift. Chrome mapping: identity = Staff · title = Task · Dates
Hash = the tick's clock time · state pill = `Checked`/`Not checked` (`done`/neutral tone, sorted
CHRONOLOGICALLY via `slotDisplayType: 'date'`) · status tracks = cadence + ticket. Day stepper
(Earlier/Later, forward disabled on today) above the table; `recordPlane: 'none'` — the row is a
projection and the interactive view is `/m/reports`. Guard: `report-staff-day.test.ts` (14/14:
catalog parse, slot budget, skeleton order, headers, chronological state sort, resolver
blank-on-unchecked, adapter words/tones). **Narrowed from spec:** no `staff-goals` production
counts yet — the checklist half is what the operator asked for by name; units-produced is its own
follow-up riding the same mount.

**Files (5):** `src/components/reports/report-staff-grid/useReportStaffSpreadsheet.ts` *(new)* ·
`src/lib/reports/report-rows.ts` (add `parseStaffDayReportRows` + row type) ·
`src/app/reports/page.tsx` · `src/lib/reports/report-tabs.ts` · test.

- A **fourth registered family** with its own `tableId` — per the page's own law: a layout document
  binds catalog facts into slots, and a staff-day row shares no vocabulary with a bin's fill ratio.
  One shared `reports` table id would bind fields the other families cannot resolve, and would kill
  the per-tab Fields menu.
- Row type narrowed at the `fetch` boundary, like its three siblings. No `Record<string, unknown>`.
- Mount `DataTable` — it owns search and the filter icon beside it (`DataTableFilterMenu`).
  **Never** `FilterRefinementBar`, never a hunt-tile strip, never a second toolbar
  (`ds_contract` → `slot-table.filter-refinement-bar` refuse rule).
- Any date in a cell is `DateRangePickerField variant="compact"` — never `variant="range"`, never a
  native `type="date"`, never `InlineEditableValue` (`slot-table.native-date-input`,
  `slot-table.range-variant-in-cell`, `slot-table.inline-editable-date`).
- Any staff picker is `AssigneeCombobox` via `StageStaffAssignPopover` — never
  `SearchableSelectField`.
- **Eval:** `pnpm run eval:cohort slot-table` (SoT is the engine + every `PRODUCT_TABLES` peer, not
  this family alone). Then `pnpm run eval:discover` to confirm no hand `*_GRID_COLUMNS` leftover was
  introduced.

---

## 4. Track X — PO Mailbox deletion

The operator's call is right about the **door**. The section is `Admin › PO Mailbox`, group
"Operations", `requires: 'receiving.view'` — a daily inbound triage task parked in an admin console.
But it currently hosts **two payloads**, and one redirect target points at it:

| Payload | Where it must land | Increment |
|---|---|---|
| Unfound / unmatched triage queue (`UnfoundQueueSidebarToolbar` + `UnfoundQueueTable`) | **Inbound › Unfound** (`/receiving/unfound`) | **N8** |
| PO-Gmail connect/disconnect (`PoMailboxTab`) | **Settings › Integrations** provider | **X2** |
| `/receiving/unfound` + `/receiving/unfound/[kind]/[id]` redirect to `?section=po_mailbox` | rewritten to the real page | **N8** |
| `api/admin/po-gmail/oauth-callback` → `/admin?section=po_mailbox` (2 sites) | `/settings/integrations/po-gmail` | **X2** |

**Order is load-bearing: N8 → X2 → X1.** Deleting the door first leaves the queue reachable at no
URL and the Gmail OAuth callback redirecting to a dead section.

### X2 — PO-Gmail connection → Settings › Integrations
**Files (4):** `src/app/api/admin/po-gmail/oauth-callback/route.ts` (2 redirect strings) ·
`src/components/admin/PoMailboxTab.tsx` (2 `router.replace` calls) · the integrations provider
registry under `src/app/settings/integrations/` · test.
Connections belong where every other connection lives; `IntegrationCard` +
`IntegrationConnectSuccess` already handle the connected-flash pattern that `PoMailboxTab` hand-rolls.

### X1 — Delete the Admin section (door only)
**Files (4):** `src/app/admin/page.tsx` (drop the import + `case 'po_mailbox'`) ·
`src/lib/admin/admin-sections.ts` (drop the `'po_mailbox'` union member + registry row) ·
`src/components/admin/admin-sections.ts` (same — see X3) ·
**delete** `src/components/admin/PoMailboxAdminSection.tsx`.
Also delete its hand-rolled `SubTab` (`ds-raw-button`: a segmented toggle that forks `TabSwitch`) —
it dies with the file and must not be lifted anywhere.
**Accept:** `grep -rn "po_mailbox" src` returns only the two stale comments in
`receiving-sidebar-shared.ts` (update them) and `operations-catalog.ts:449` (a data `source:` string
naming a 2026-05-24 pile — **leave it**, it is a provenance label, not a route).

### X3 — *(not a deletion)* keep both `admin-sections.ts` copies in lockstep

`src/components/admin/admin-sections.ts` and `src/lib/admin/admin-sections.ts` are byte-identical
(§0.4) and they are **not unique**. Measured 2026-09-14, eight `src/lib/**` ↔ `src/components/**`
files are byte-identical twins:

```
admin/admin-sections.ts · forge/forge-view.ts · labels/labels-view.ts
photos/photo-library-types.ts · products/products-view.ts · receiving/zoho-po-types.ts
repair/repair-intake-logic.test.ts · sourcing/sourcing-shared.ts
```

plus near-twins that differ **only in import paths** (`receiving-sidebar-shared.ts`:
`@/lib/ui/horizontal-slider-item` vs `@/components/ui/HorizontalButtonSlider`). That is the
**strangler state of the parent plan's Track C8** ("move receiving vocab/types into
`src/lib/receiving/`"), and R2 there explicitly permits parallel *reads* during migration.

**So X3 deletes nothing.** Its only obligation is the one X1 depends on: the `'po_mailbox'` union
member and registry row must be dropped from **both** copies in the same commit, or the stale
registry keeps offering a section whose component is gone. Consolidating the twins is Track C8's
work, not this plan's — do not fold it in here.

### X4 — *(gated: operator decision + probe)* delete the feature entirely
If email-PO ingestion is dead — not just mis-homed — then `PoMailboxTab`,
`api/admin/po-gmail/*`, `components/receiving/unfound/*`, `api/receiving/unfound-queue/*`, and the
Inbound Unfound tab all go, and N8 reverts.

**Probe before deciding — do not guess:**
```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30d
  FROM email_missing_purchase_orders;
```
Zero in 30 days + operator confirmation → X4. Any live rows → the queue is real work and N8 is its
home. **This plan does not delete a queue with rows in it.**

---

## 4b. Track U — collapse mobile intake into ONE identification kernel

**Operator directive (2026-09-14, verbatim, binding):** *"Need to delete all the hard-coded mobile
routes in terms of triaging information like the triage arrival and unbox and it just needs to be
one under one identification scan kernel Overall and keeping the unbox photo feed for dog food."*

This **answers the GATED rows in §1.7** — `/m/triage`, `/m/receive` and `/m/unbox` are DELETE, not
pending. It is the U2 doctrine's next batch (U4–U6), so it obeys U2's rules: one batch at a time,
each green alone, and the unbox photo feed is inviolate.

### 4b.0 The collapse is already 80% done — measured, not assumed

| Route | Actual state today | Verdict |
|---|---|---|
| `/m/triage` | **already** `redirect('/m/scan')` | stub — delete |
| `/m/receive` | **already** `redirect('/m/scan')`, docblock "deprecated alias. Identification lives on /m/scan" | stub — delete |
| `/m/unbox` | **PAGE** — `<RedesignedMobileReceive surface="unbox" title="Unbox" />`, a **second scan door** | the real hard-coded route — delete |
| `/m/scan` | **PAGE** — docblock "identification kernel (packages + PO tracking)", server-seeded, and it **already mounts `MobileArrivalClassifyFlow`** (`MobileScanIdentify.tsx:298`) | **THE kernel — keep** |
| `/m/receiving` | **PAGE** — the live photo feed, `?mode=` branching | **the unbox photo feed — KEEP for dogfood** |

Two components are already dead or near-dead:

- **`MobileArrivalStation.tsx`** — docblock says it *is* `/m/triage`; **zero consumers** outside its
  own folder. The classify flow it was built around now lives in the kernel. Dead code.
- **`redesign/Receive.tsx`** — **sole consumer is `/m/unbox`**. It dies with that route. Its
  `back: '/m/triage'` hrefs (`:275`, `:304`) are already dangling.

### 4b.1 Two live bugs the sweep exposed (fix in U4, do not carry forward)

1. **`/m/receive/[recvId]` does not exist.** `MobileIdentify.tsx:243` does
   `window.location.href = \`/m/receive/${recvId}\`` — `src/app/m/(shell)/receive/` contains only
   `page.tsx`, so that navigation **404s today**. Repoint to the kernel (`/m/scan?rid=…`) or to the
   carton record (`/m/r/[id]`), whichever the Add-item flow actually needs.
2. **The arrival return loses its params.** `photo-scope.ts:259` returns to
   `/m/triage?rid=${receivingId}&step=platform`, but `/m/triage` is a bare `redirect('/m/scan')`,
   which **drops the query string**. The guided-photos → Platform → Type → Priority flow therefore
   cannot resume. `photo-scope.test.ts:232` pins the old href, so the test moves with the fix.

### 4b.2 U4 — delete the two stubs, repoint their dependents

**This is the U3 lesson increment: plain-string dependents that `tsc` cannot see.** Sweep result for
`/m/receive` and `/m/triage`, every live (non-docblock) reference:

| Dependent | Fix |
|---|---|
| `src/proxy.ts:178-179` — desktop `/triage` → `/m/triage` UA rewrite | → `/m/scan` (today it is a double hop through a stub) |
| `LandingPageCard.tsx:20` — `/m/receive` is a **selectable staff landing page**; stored role rows may already point there | Repoint the option to `/m/scan`; **migrate stored values** or sign-in breaks for those staff — the exact U3 failure |
| `nav-registry.ts:128` — `MOBILE_NAV_TAB_DESTINATIONS.receiving → /m/receive` | → `/m/scan`. Do **not** change the tab **id** (admin card + stored configs reference it) |
| `MobileIdentify.tsx:243` — `/m/receive/${recvId}` | 4b.1 bug 1 |
| `photo-scope.ts:259` + `photo-scope.test.ts:232` | 4b.1 bug 2 |
| `MobileReceivingList.tsx:165` — `surface === 'triage' ? '/m/triage' : '/m/receiving'` | → `'/m/scan'` |
| `mobile-context-navigation.ts:49,52` + its test | Drop the `/m/triage` and `/m/receive` title branches |
| `mobile-first-surface.ts:19,21` | Remove both prefixes |
| `nav-registry.ts:57` `matchPrefixes` + `nav-registry.test.ts:47,48,54` | Drop `/m/receive`, `/m/triage` from the Inbound group's prefixes |
| `mobile-feed-seed.server.ts:3` docblock | Update — `seedMobileReceivingFeed('triage')` is still the kernel's seed and **stays** |

**Then delete** `src/app/m/(shell)/receive/page.tsx` and `src/app/m/(shell)/triage/page.tsx`.

**Accept:** `grep -rn "/m/triage\|/m/receive\b" src apps` returns docblocks only · desktop `/triage`
on a phone lands on `/m/scan` in one hop · a staffer whose stored landing is `/m/receive` still signs
in · nav-registry tests green · unbox 56/56.

### 4b.3 U5 — delete `/m/unbox` and its component

Prerequisite: U4. **Files:** `src/app/m/(shell)/unbox/page.tsx` (delete) ·
`src/components/mobile/redesign/Receive.tsx` (delete — sole consumer) · `nav-registry.ts` ·
`nav-registry.test.ts` · `mobile-first-surface.ts` · `mobile-context-navigation.ts` (+ test).

**The drawer change is the point of the directive.** The Inbound group's `unboxing` leaf
(`{ id: 'unboxing', label: 'Unbox', href: '/m/unbox' }`) is removed; **`Photo feed` (`/m/receiving`)
becomes the group's first child** — the dogfood surface the operator is keeping. Scan is unaffected:
it is the permanent corner CTA, and it is now the *only* identification door.

`nav-registry.test.ts:72-75` pins `/m/unbox` child activation; that test deletes with the leaf. It
is the kind of test the parent plan's rules say goes with its subject, not re-pinned to new text.

**Accept:** drawer Inbound = Photo feed · Walk-In · Consult · Repair · no `/m/unbox` route ·
`getMobileAppTitle` has no Unbox branch · boundary baseline **shrinks** (Receive.tsx crossings go) ·
unbox photo feed 56/56 **green — the invariant this whole track is protecting**.

### 4b.4 U6 — delete the dead arrival station

**Files:** `src/components/mobile/receiving/MobileArrivalStation.tsx` (delete) · `useArrivalHistory.ts`
and `arrival-mobile-flow.ts` (audit: keep whatever `MobileArrivalClassifyFlow` still needs — the
kernel mounts it) · docblock updates.

**Do not delete `MobileArrivalClassifyFlow`** — `MobileScanIdentify.tsx:298` renders it. That is the
collapse working as intended: the *flow* survives inside the kernel, the *station* does not.

### 4b.5 What this track must NOT do

- **Never touch the unbox photo feed** (`/m/receiving`, `ReceivingLive.tsx`, and the 56-test suite).
  The directive keeps it explicitly, and U2 named it the first keep.
- Never delete `/m/scan` or shrink `MobileScanIdentify` — it absorbs the deleted doors.
- Never delete a `MobileNavTabId` **id** (stored configs), only its href.
- Never fold `/m/pick` into the kernel — picks are a separate keep.

---

## 5. What else belongs in this plan

Ordered by value per unit of risk. Each is its own increment; none is a prerequisite for another.

1. **Lane counts on lane headers.** Inbound = unfound + pipeline; Outbound = to-ship + exceptions
   (the Exceptions tab already carries a live count). Reuse the existing count endpoints; **omit the
   badge when the count is unknown — never print a fake 0** (`DeskPageTab.count` law).
2. **`pnpm run debt:surfaces` sweep.** `/reports` and `/receiving/unfound` were both found by hand.
   Run the dead-surface probe and triage the rest of the list; that is how many more orphan desks
   exist is answered with evidence instead of another audit doc.
3. **Header / breadcrumb reads the lane.** `masterNavLabelForPath` returns the L1 label today; with
   lanes there is a real `Inbound › On the way › History` path. Feed `HeaderPageSwitcher` from
   `spineSectionIdForPage` rather than adding a second derivation.
4. **Per-lane recents.** `useRecentPages` is flat; scoping MRU to the active lane makes the
   compact recents strip (SURFACE_LAW §4) useful instead of a global history.
5. **Saved views per report family.** `/api/saved-views` exists; each `tableId` can carry them, and
   the Staff family is the first report anyone will want to re-open with the same columns.
6. **`/m` gap closure for the three inventory reports** (registered in N9). One verb per increment,
   `/m` SoT first — the Track G rule in the parent plan.
7. **Lane law paragraph** in `docs/mobile-first/SURFACE_LAW.md` §8 route map: the lane table from
   §1.2, so the next agent extends the table instead of forking a taxonomy.

**Explicit non-goals.** Bottom-nav revival · a `/inbound` or `/outbound` landing page (a lane is a
grouping, not a place — a lane landing page mints a second front door onto its children) ·
independently draggable lanes · per-lane accent colours (`spineAccentFor` is monochrome by ruling) ·
moving Packing or Scan out off Scan Stations · a Marketing lane before a Marketing page.

---

## 6. Sequencing

```
M0.1 ── M0.2 ── M0.3 ── M0.4 ── M0.5        ← START HERE (§1b); pure data + config
  │
  ├── N4 ─┬─ N5 ──┬─ N6 ──┬─ (N7 optional, needs R1 exemption)
  │        │       │       └─ N8 ── X2 ── X1 (carries X3's both-copies rule) ── (X4 gated)
  │        └─ R1 ──┴─ R2 ── (R3 if gated) ── R4
  │
  └── U4 ── U5 ── N9 ── (U6 anytime after U5)
```

- **M0 first, and M0.1 before the rest of M0.** Every `.tsx` increment in this plan is blocked by the
  design-mcp session hook, and until M0.2 the catalog cannot name a phone shell. M0.1 is a hard
  prerequisite because the axis list and router the later steps edit do not exist in this worktree yet
  (§1b.1).
- **M0 touches no render path** — profile JSON, `pinned.json`, `router.json`, one new token module.
  It cannot change a pixel, which is why it is safe to put first and verify in isolation.
- **N4 first within the nav chain** — every other nav increment reads the lane registry.
- **N5 before N6** so the reorder and the grouping are separately revertible.
- **R1 before R2** only for the Monitor-lane stutter fix; R2 can start in parallel if N6 has landed.
- **N8 before X2 before X1** — non-negotiable (§4).
- **U4 → U5 → N9** — non-negotiable (§1.7/§4b): N9 must not row up `/m/unbox` on the way to deleting
  it, and U5 is the increment that promotes `Photo feed` into the leaf N9 needs. Whoever lands
  second between N9 and H1 owns the `MOBILE_NAV_DESTINATIONS` merge.
- **U6** any time after U5 — dead-code removal, no nav surface.

## 7. Close-out per increment

```bash
pnpm verify:fast                  # 3 gates incl. boundary --enforce
node --test --import tsx src/lib/sidebar-navigation.test.ts
node --test --import tsx src/lib/nav/spine-slots.test.ts
node --test --import tsx src/lib/nav/command-bar-nav-groups.test.ts
node --test --import tsx src/lib/mobile/nav-registry.test.ts
# unbox invariant, every increment:
node --test --import tsx src/**/arrival-station-tape* src/**/photo-upload-queue-* \
  src/**/complete-carton* src/**/scan-verdict*        # 56 tests
# R4 only:
pnpm run eval:cohort slot-table && pnpm run eval:discover
```

Plus: `ds_contract` before / `ds_critique` after any `src/**/*.{tsx,jsx,css}` write · no new boundary
crossing (`ds_boundary <file>` before a risky import) · append a status line to the ledger in
`docs/todo/mobile-first-foundation-PLAN.md` so that file stays the tracker.

**Manual proof, per increment that touches chrome:** open the spine at `:3050` — Workspaces above
Scan Stations, lanes grouped, a `shipping.view`-only role sees no empty lane headers; open
`/m/reports` at phone width and at `lg+` (fixed phone column, thick gutters, not a stretched desk).
