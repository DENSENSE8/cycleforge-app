# Research briefing — contextual sidebar IA for a multi-tenant reseller-ops SaaS

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-26
**Deliverable:** an information-architecture recommendation, benchmarked against named industry systems and reconciled against the constraints in §3–§6 below.

---

## 0. How to use this brief

You do **not** have the codebase. Everything you need is embedded here: measured layout facts, a per-page inventory of what the contextual sidebar currently holds, the design laws already ratified in-repo, and the specific decisions that are blocked.

Two things are being asked of you, and they are **different questions** — answer both separately:

1. **What is industry standard?** Survey how comparable products solve this, with named examples and cited sources. Do not generalize into "it depends" — give the actual dominant patterns and the conditions under which each wins.
2. **What is right for *this* codebase?** Take the industry answer and reconcile it against §3–§6. Where the industry standard conflicts with a constraint here, say so explicitly and pick a side with reasoning. We would rather have a defended deviation than an unusable generic answer.

Prefer concrete, implementable recommendations over frameworks-for-thinking. Assume the reader is the engineer who will implement it this week.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). It spans:

- **Back-of-house floor work** — receiving/unboxing inbound cartons, triage, testing, repair intake, packing, shipping scan-out. Barcode-scanner-driven, standing operators, hands busy.
- **Front-of-house / desk work** — order management, product catalog, inventory, media (photo evidence) library, support tickets, analytics, admin/settings.
- **Multi-tenant** — vendor integrations (Zoho, Zendesk, marketplaces) are tenant connectors behind capability facades, never the product itself.

The UI identity is called **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. The stated bias is **legible throughput over document calm** — closer to Linear/Carbon/Stripe Dashboard chrome discipline and POS/scan floors than to a document-whitespace product.

The app already classifies every UI region into one of four **region contracts** (this is enforced house law, not aspiration):

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

A page with N jobs is N regions; each region gets exactly one contract. **This vocabulary is load-bearing — please use it in your answer.**

---

## 2. The three competing surfaces (measured facts)

The desktop frame today has **three** places a piece of information can live. This is the crux of the problem.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GlobalHeader — 40px tall, full width right of the sidebar               │
├──────────────┬───────────────────────────────────────────────────────────┤
│              │                                                           │
│  LEFT        │   MAIN PANE                        ┌──────────────────┐  │
│  SIDEBAR     │   (rounded-tl-2xl content shell)   │  RIGHT DETAIL    │  │
│              │                                     │  STACK           │  │
│  360px fixed │   Workbench pages:                  │                  │  │
│  persistent  │   centered gutter column,           │  420px floating  │  │
│  non-modal   │   max-width 1440px,                 │  card, 12px      │  │
│  collapsible │   px-4 / sm:px-6 / lg:px-8          │  inset all sides │  │
│              │                                     │                  │  │
│  ┌────────┐  │   Station pages:                    │  MODAL-ISH:      │  │
│  │ master │  │   centered 720px column,            │  • viewport      │  │
│  │  nav   │  │   px-4 / sm:px-6                    │    backdrop dim  │  │
│  │ header │  │   (mobile-shaped by design)         │  • backdrop blur │  │
│  │ 40px   │  │                                     │  • body scroll   │  │
│  └────────┘  │                                     │    LOCK          │  │
│  ┌────────┐  │                                     │  • Esc to close  │  │
│  │context │  │                                     │  • single-occupant│ │
│  │ panel  │  │                                     │    stack         │  │
│  │ (route │  │                                     └──────────────────┘  │
│  │ keyed) │  │                                                           │
│  └────────┘  │                                                           │
└──────────────┴───────────────────────────────────────────────────────────┘
```

### 2a. Left sidebar — 360px, persistent, non-modal

One `<aside>`, fixed `360px`, always docked on desktop. It is **two stacked things**:

- A **master-nav header band** (~40px): the current page name, a click-dropdown of all pages, a second click-dropdown of the current page's L2 **modes**, and up to 3 "recent mode" jump chips. This is the *only* L2 mode switcher in the app.
- A **route-keyed context panel** below it, filling the remaining height. A single dispatcher maps `pathname → route key → one panel component` (code-split per route). ~25 route keys.

Desktop-collapsible via a header toggle; when collapsed, resting the pointer at the far-left edge for 2s re-opens it. On mobile it becomes a slide-out drawer (`max-w-xs`) over a scrim.

### 2b. Main pane

Two shell recipes, both ratified:

- **Workbench shell** (`DashboardScrollShell`): a *pinned* chrome slot outside the scroll port holding a rounded-card tab strip + filters + a table-toolbar portal, over one `overflow-y-auto` body in a centered `max-w-[1440px]` gutter column. Exactly one sticky layer inside the body (day-band headers at `top-0`), so no offset math.
- **Station workbench**: a centered **720px** column — deliberately phone-shaped — with a sticky entity-identity "bookmark" bar, a section-tab slider, a scrolling body, and a bottom terminal dock (composer + primary CTA).

### 2c. Right detail stack — 420px, floating, **modal-ish**

A single-owner host renders exactly one occupant at a time as an inset rounded card floating over the top-right of the viewport. Critically, it ships with:

- a **full-viewport backdrop** (`bg-scrim/55` + 2px blur; an "elevated" variant is `scrim/70` + `blur-md`),
- **body scroll lock**,
- Escape-to-close,
- a crossfade keyed on occupant id.

**This is the surface the product owner is objecting to.** Selecting an order row on `/dashboard` opens an order details/editor panel here — which dims and scroll-locks the very table you selected from. It behaves like a modal wearing a side-panel costume. There is no persistent inspector mode.

---

## 3. Per-page inventory: what the contextual sidebar actually holds today

This is the evidence that the pattern is applied inconsistently. Panel sizes are a rough proxy for how much real content exists.

| Route | Sidebar context panel | What's in it | Verdict |
|---|---|---|---|
| `/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair`, `/receiving/*` | Receiving panel (~374 lines) | Mode switcher, scan bar, recent-activity rail, triage lists (unfound/staging/done), carton search | **Load-bearing.** The rail *is* the operator's work queue. |
| `/products` | Products panel (~455 lines) | Searchable SKU picker + sub-tab rows + sort; classic master–detail navigator | **Load-bearing.** |
| `/warehouse` | Warehouse panel (~333 lines) | Bin/location picker + filters | **Load-bearing.** |
| `/settings` | Settings panel (~260 lines) | Section navigator | Load-bearing (nav tree). |
| `/support` | Support panel (~170 lines) | Ticket queue picker | Load-bearing. |
| `/pack`, `/test`, `/shipping` | Packer / Tech / Outbound panels (~76–123 lines) | Recent-activity rails, scan-out dock scan bar, thin mode context | **Thin but justified** — recents + scan input for a station. |
| `/inventory` | Inventory panel (~110 lines) | Section toggle + tabbed sidebars | Thin. |
| `/dashboard` (Shipping mode) | Order feed sidebar | Order list + search | Load-bearing. |
| `/dashboard` (Receiving mode) | **`null`** — explicitly returns nothing | — | **Empty 360px.** |
| `/dashboard` (management view) | Management panel (~74 lines) | An "import orders" card + a sync status banner | **Near-empty.** A card of admin actions parked in prime navigational real estate. |
| `/walk-in` (Sales), `/repair` | Walk-in panel (**17 lines**) | Passthrough wrapper | **Effectively empty.** |
| `/ops/photos` (**Media Library**) | **`null`** — dispatcher explicitly returns nothing | — | **Empty 360px** — the sidebar renders as a bare nav header over blank space, on every visit. |

**So: of ~25 route keys, roughly 5 have a genuinely load-bearing picker/rail, ~5 are thin-but-defensible station rails, and at least 3 render an empty or near-empty 360px column.** Meanwhile the pages with the *most* per-record detail to show (Dashboard orders, Media Library) are the ones pushing that detail into the scroll-locking right stack.

---

## 4. The laws already ratified in-repo (do not silently overturn these)

These were arrived at through prior course-corrections and are recorded in the repo's design-convergence log. Your recommendation must either compose with them or explicitly argue one should change.

1. **Content-chrome tabs = lifecycle *facets* of ONE workspace.** Dashboard (To Ship · Packed · Shipped), Shipping (Pending · FBA · History) — same records, same body shape, different stage filter. These belong in a top tab strip in the main pane's pinned chrome.
2. **Sidebar mode rail = distinct *surfaces*.** Outbound (Labels queue · Scan-out station · Ready table · FBA board) — different jobs, different region contracts, different body shapes. These switch from the sidebar/master-nav, **not** a top tab band. (An earlier attempt to move these to top tabs was explicitly reverted by the product owner.)
3. **"Padded + tabbed" ≠ "wrap the table in a card."** The good pages keep the table full-bleed inside the gutter column; the only cards are KPI tiles and the chrome strip. Wrapping a queue table in a panel reproduces banned card-soup.
4. **One sticky layer per scroll port.** Pinned chrome lives *outside* the `overflow-y-auto` body so in-body sticky headers dock at `top-0` with no offset math.
5. **Compose the shared primitive; grow it when it's wrong; never fork a page-local twin.** A genuinely different job earns a *new sibling that composes the same primitive* — not a copy.
6. **Crossfade exactly one focus surface per region contract** — Station: the active card. Workbench: the detail region. Monitor: the drill. Canvas: the inspector overlay. **Never crossfade the collection map, list, stream, or graph.** The navigator stays mounted and still.
7. **Selection durability matches the contract.** Station = ephemeral, never in URL. Workbench = durable, URL-addressable (`?skuId=`, `?id=`). Monitor = filters only. This is what makes views deep-linkable and reload-safe.
8. **Keep the navigator mounted.** The reference Workbench keeps its table mounted behind a `display:none` toggle rather than unmounting it, to preserve query cache, in-flight fetches, and scroll position.

---

## 5. The desktop/mobile split (facts, not preferences)

- Phones are hard-restricted to an **allowlist of routes**: `/m/*`, `/signin`, `/kiosk`, and the floor stations (`/receiving`, `/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair`, `/pack`, `/packer`, `/shipping`, `/outbound`, `/test`, `/tech`) plus GS1 barcode deep-links. **Any other path on a phone hard-redirects to `/m/home`.**
- So `/dashboard`, `/products`, `/inventory`, `/ops/photos`, `/settings`, `/admin` — the pages this brief is mostly about — **are desktop-only by policy.** There is no mobile version of them to keep in parity.
- `/m/*` has its own shell with a bottom nav; the desktop sidebar is never mounted there.
- Mobile detection is client-only (viewport < 768px **and** coarse pointer, plus device signals), which forces careful first-paint handling but is otherwise settled.
- **Stations are deliberately mobile-shaped on desktop too**: the 720px station column is the same shape a phone renders, so one operator UI serves both a bench monitor and a handheld. The product owner wants to *keep* this and considers it correct.

**Implication worth testing in your answer:** the "desktop vs mobile split" the owner worries about may be much smaller than it feels, because the sidebar-heavy pages are already desktop-only and the stations are already deliberately single-column everywhere. Please assess whether that reframing holds.

---

## 6. Constraints on any recommendation

- **No foreign design kit.** "Better" means stronger *within* Kinetic Ledger and its existing tokens (semantic color, density-aware spacing scale, named z-index bands, focus-ring SoT, elevation roles). Importing a different product's visual language is out of scope.
- **No second visual language beside the existing one** without merging or deleting the old one.
- **Anything durable must be URL-addressable** — a shared link must reproduce the exact view (this is already the rule for Workbench selection and is only partially honored for filters/sort/search today, which is a known gap).
- **Motion budget:** opacity + transform only, sub-300ms, ease-out for discrete swaps; never animate `width`/`height`/`padding`; `prefers-reduced-motion` must collapse transforms to a pure opacity fade.
- **Density is a first-class dimension** (`floor` / `ops` / `rollup` / `studio`), already wired to a CSS multiplier that tightens spacing and type together.
- **Multi-tenant:** any "context" surface must be org-scoped; a rollup or recents rail that leaks across tenants is a hard failure.

---

## 7. The questions

### Q1 — Is a persistent contextual sidebar the right primary IA for the non-station pages at all?

Today it is applied uniformly because the shell mandates it, and the result is that some pages get a genuine navigator and others get 360px of nothing. Options we can see:

- **(a) Keep it universal**, and find real content for every page (see Q2).
- **(b) Make it conditional** — pages declare whether they have a context panel; the shell collapses to a slim icon rail (or nothing) when they don't, letting content run wider.
- **(c) Invert it** — demote the sidebar to a slim nav rail everywhere, and move all per-page context into the main pane's chrome and a right inspector.
- **(d) Make it user-controlled** — persistent, remembered, per-page open/closed state, with a sensible default per route.

**Answer with a recommendation, not a menu.** Include: what do Linear, Notion, Figma, Height, Retool, Airtable, Salesforce Lightning, Shopify Admin, Stripe Dashboard, Jira, Monday, Zendesk Agent Workspace, ServiceNow Workspace, and Microsoft Dynamics actually do here — specifically which of them run a *conditional* or *variable-content* left panel vs. a fixed one, and what happened when they changed it. Cite sources.

### Q2 — If the sidebar stays on content-less pages, what legitimately belongs in it?

Be specific to the two named problem pages:

- **Media Library** (`/ops/photos`): a photo/document evidence library filtered by date tree, PO, ticket, receiving carton, and source scope; browsable as folders or a flat grid; supports multi-select and bulk actions (share links, share pages, ZIP download, attach to support ticket, label editing). Its current chrome puts breadcrumb + view/density controls + selection toolbar in the main pane. **What does the sidebar hold in the industry-standard version of this page?** (Google Photos, Apple Photos, Dropbox, Adobe Bridge/Lightroom, Cloudinary, Bynder, Frame.io, Contentful, Figma's file browser — how do DAMs specifically handle the left panel?)
- **Dashboard orders** (`/dashboard`): a dense order table with lifecycle facets in top chrome, multi-select bulk actions, and per-row detail.

Distinguish clearly between things that are **navigation** (belongs in a persistent left panel), things that are **filter state** (arguably belongs in chrome or a filter bar), and things that are **inspection of the current selection** (belongs on the right, or in the main pane). We suspect the app is currently mixing all three into whichever panel had space.

### Q3 — The core one: selection detail in the left sidebar vs. a right detail panel

The proposal on the table: **selecting a product/order row in the Dashboard table shows its detail in the left contextual sidebar, instead of opening the right slide-over that backdrops and scroll-locks the page.**

Evaluate this seriously. In particular:

- **Directionality.** Is there a real cost to putting *detail about the selected item* on the **left**, when the selection was made in a table to the **right** of it? Western reading order and the near-universal master→detail convention put the list left and detail right. Does the *inverse* (detail left, list right) exist in shipping products, and does it work? The repo's own Workbench rules already say "don't invert the sidebar to hold related items where the picker belongs" — is that rule right?
- **The real defect.** Is the actual problem the *side* the detail is on, or is it that the right panel is **modal** (backdrop + scroll lock) when it should be a **non-modal, resizable, persistent inspector** that lets the user keep arrowing down the table with the panel live? Distinguish these two diagnoses explicitly. If the second is the real defect, say so plainly — the owner's proposed fix may be solving the wrong variable.
- **Two-tier detail.** Is there a defensible pattern where a *lightweight* summary of the selection appears in the persistent left panel (identity, status, thumbnails, quick facts) while *heavy editing* still opens a dedicated surface? What do products that do this call it, and where does it break down (state desync, two places showing the same record, ambiguity about which one is authoritative)?
- **Progressive disclosure.** The repo already permits "similar/related items appear *below* the picker once a record is selected." Is expanding *that* the better move than replacing the picker with detail?

Give a ruling, with named precedents (Gmail's reading pane orientations, Outlook, Superhuman, Linear's issue peek vs. full page, Notion's peek/side-peek/full-page triad, Jira's detail view settings, Airtable's expanded record, Salesforce Lightning console tabs/subtabs, Figma's right properties panel, VS Code's explorer-left/editor-right split). Note especially any product that offers the **user** the orientation choice, and whether that's considered good practice or an admission of indecision.

### Q4 — Reconciling extra UI space with the desktop/mobile split

The owner's stated tension: the sidebar is "nice to have extra UI space and room to add more features to, but this introduces a split between desktop and mobile."

Given §5 (sidebar-heavy pages are already desktop-only by policy; stations are already deliberately single-column on both), assess:

- Is this actually a split worth designing around, or a non-issue that's being over-weighted?
- What's the industry-standard way to handle a component that exists only at desktop widths? (Responsive disclosure, list-**or**-detail on narrow, off-canvas, "no mobile version by design" for admin surfaces.)
- Is there a principled rule for *when* a feature is allowed to live only in the desktop sidebar? We'd like a one-line test an engineer can apply.

### Q5 — The unifying principle

Produce a **decision rule** — ideally a short table or a 3–4 question flowchart — that an engineer can run per page/region to answer: *does this region get a left context panel, and if so what goes in it; does selection open an inspector, and on which side, modal or not.*

It must slot into the existing four-contract vocabulary (Station / Workbench / Monitor / Canvas) rather than introducing a fifth taxonomy. Where a contract already implies the answer, say so.

---

## 8. Requested output format

1. **Executive answer** — 5–10 sentences. The recommendation, stated as a decision, up front.
2. **Industry survey** — the dominant patterns, organized by pattern (not by company), each with named shipping examples and citations. Flag where practice has *changed* recently and why.
3. **Per-question rulings** — Q1 through Q5, each with a clear verdict, the reasoning, and the strongest counter-argument you rejected.
4. **The decision rule** (Q5) as a compact table or flowchart.
5. **Reconciliation with this codebase** — an explicit list of which of the §4 ratified laws your recommendation composes with, and which (if any) it asks us to change, with the argument for each change.
6. **Phased implementation sketch** — what to do first (lowest risk, highest signal), what to defer, what needs a product decision rather than an engineering one. Order by blast radius.
7. **Open risks** — where you're least confident, and what evidence would resolve it.

Cite sources throughout — design-system documentation, published product decisions, HCI research on split-pane orientation and scanning direction, and accessibility guidance on modal vs. non-modal side panels are all in scope. Where evidence is thin and you're extrapolating from convention, say so explicitly rather than dressing it up.
