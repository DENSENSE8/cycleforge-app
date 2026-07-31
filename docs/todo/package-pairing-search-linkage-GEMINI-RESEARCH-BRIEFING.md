# Research briefing — Package Pairing search, filter chrome, and multi-source carton linkage vs 2026 ops UX

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-30
**Subject surface:** Unbox / Arrival **Items** card composition — `POUnboxingSection` hosting (1) PO-line accordion + serial work, (2) **Auto-match** strip for unfound cartons, (3) **Package Pairing** hub (`LineMatchingSection` / `TriageLineMatchingSection`) with multi-source link tabs (Inventory Item · PO · Store · Tickets), plus the just-shipped move of Store **order-scope** from segmented tabs into an in-field `WorkbenchFilterPopover` (`density="field"`).
**Status:** research complete → PLAN approved & implemented (2026-07-30). See [package-pairing-search-linkage-PLAN.md](./package-pairing-search-linkage-PLAN.md).
**Deliverable:** (a) a benchmark of 2026 WMS / 3PL / RMA / marketplace-ops / B2B search+filter+entity-link patterns against what we shipped; (b) a defended verdict on each decision in §6; (c) answers to §7 with sources; (d) a concrete “upgrade backlog” an engineer can turn into a PLAN.md without rediscovering industry norms.

---

## 0. How to use this brief

You do **not** have the codebase. Every inventory fact below was measured from source on 2026-07-30. Where something is inferred, it is labeled **(inferred — verify)**.

Three deliverables, kept separate:

1. **What is industry standard (2026)** for:
   - Progressive disclosure of **search refinements** (scope / facet / mode) inside or beside a search field on dense ops screens
   - **Multi-source entity linking** on a single operational record (link a carton to a PO *and/or* a store order *and/or* a helpdesk ticket without forcing a single “parent”)
   - Unifying **search chrome** across tabs that hit different backends but share the same operator job (“find and attach”)
   - Station / floor density (barcode-wedge environments) vs desk / pointer density for the same linkage job
   Name real products and published patterns (Shopify Polaris / Salesforce / SAP / Manhattan / Blue Yonder / Loop / Narvar / AfterShip Returns / Zendesk / NetSuite / Zoho Inventory / Linear-style filter menus). State when each pattern wins — do not retreat into “it depends.”
2. **Take a side on each decision in §6.** Each states our current (post-session) shape, the strongest case against it, and where we already admit uncertainty.
3. **Answer §7** with sources. Prefer a migration order and named target architecture an engineer can paste into a plan — not a framework-for-thinking.

**Do not re-litigate** these older briefs (different questions):

| Prior brief | Question already scoped |
|---|---|
| `receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md` | File/link a Zendesk claim from carton context |
| `chrome-sot-compound-GEMINI-RESEARCH-BRIEFING.md` | House-wide chrome SoT governance method |
| `unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md` | Scan bar vs lookup on the Unbox station |
| `dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md` | Arrival vs Unbox region split |

This brief is only: **given Package Pairing + Auto-match already exist as the carton linkage hub, how should search, filter, and multi-source link UX/data evolve to 2026 ops standards?**

---

## 1. Product vocabulary (use these words in the answer)

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Operators stand at scan benches (**Station** region) or work pointer-dense queues (**Workbench**).

**Kinetic Ledger** — product UI identity: dense, state-colored, scan-aware; legible throughput over document calm. Quiet chrome. No decorative card soup.

**Region contracts** (house law):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode / wedge | act-and-clear | ephemeral | `floor` |
| **Workbench** | pointer | pick → edit → persist | URL-durable | `ops` |
| **Monitor** | filters | observe only | none | `rollup` |
| **Canvas** | pan/zoom | reshape a definition | URL focus | `studio` |

**Carton** — physical inbound package (`receiving` row). **Line** — SKU/qty row on that carton (`receiving_line`).

**Package Pairing** — in-card hub that attaches external identities to the carton (PO, storefront order line, helpdesk ticket) without leaving Unbox/Arrival.

**Auto-match** — unfound-only operator-initiated strip (Return # / Zoho refetch / Amazon return / Find ticket). Nothing auto-runs on scan.

**Capability facades** — vendor integrations (Zoho, Ecwid/storefront, Zendesk, Amazon SP-API) sit behind capability nouns; UI must not hardcode vendor product sentences except Integrations hub.

**Canonical unit lifecycle** (domain spine):

```
EXPECTED → ARRIVED → MATCHED → UNBOXED → AWAITING_TEST → IN_TEST
  → PASSED → (list / pack / ship) → DONE
  → FAILED → RTV | SCRAP | rework
```

Linkage can happen at ARRIVED / MATCHED / UNBOXED depending on path (unfound carton vs Zoho PO carton).

---

## 2. The job, restated as a research question

Strip house names and the task is a recognizable 2026 ops pattern:

> On a dense **station workbench**, given one physical inbound package, let an operator **search and attach** one or more external system identities (purchase order, marketplace/store order, support ticket) using a **shared search chrome**, with **refinements** that do not steal a full row of segmented controls, while keeping **linkage semantics** auditable (who linked what, merge vs replace, reversible unlink) and **facts authoritative** (no fabricated match scores).

Named industry analogues:

- WMS / 3PL “associate ASN / PO / BOL / tracking to a receipt”
- Returns platforms “match RMA / order / ticket to inbound package”
- ERP receiving “match goods receipt to purchase order + supplier claim”
- Helpdesk apps “link ticket to order from an embedded ops screen”

**Research target:** What is the 2026 standard composition for (a) in-field filter vs facet chips vs segmented scope tabs, (b) multi-link vs single-parent identity models, (c) progressive disclosure of secondary link sources, and (d) how “hot” filters communicate active scope without a permanent tab rail?

---

## 3. Grounded current-state facts (measured 2026-07-30)

### 3.1 Composition shell (Items tab body)

```
POUnboxingSection.tsx                 170 lines
  WorkspaceCard glass + bodyClassName px-3 pt-3 pb-2
  ├── LinePoItemsSection → PoLinesAccordion → PoLineRow (+ ActiveLineConditionSerial / SerialCard)
  ├── UnfoundMatchStrip                 (only if carton isUnfound)
  └── LineMatchingSection               (Package Pairing; collapsible)
```

Spacing discipline (just tightened):

- Explicit `mt-3` between sections; **no** `space-y-*` against a height:0 collapsed pairing sibling (that ghost gap was a real bug).
- PO accordion expanded body keeps `pb-1` (flush `pb-0` was rejected visually).
- Auto-match top rule `pt-2`; section title via `WorkspaceSectionTitle` (same eyebrow class as Auto-match).

### 3.2 Package Pairing tabs (post Email-PO removal)

**Unbox** (`LineMatchingSection`, 576 lines) — `MatchTab`:

| Tab id | Label | Body | Link semantics |
|---|---|---|---|
| `zoho_item` | Inventory Item | `EcwidProductSearchInline` `popoverMode=search` `chrome=bare` | Add SKU line (no PO required); default for unfound |
| `zoho_po` | PO | `PoLinkTab` | Relink carton↔PO via `/api/receiving/relink`, or inbound merge via `/api/receiving/inbound/link` |
| `ecwid` | Store | `EcwidProductSearchInline` `popoverMode=repair_service` `chrome=bare` | Add line from recent store order; default for matched |
| `zendesk` | Tickets | `ZendeskMatchTab` | Link helpdesk ticket via triage panel |

**Arrival** (`TriageLineMatchingSection`, 386 lines) — no Inventory Item tab; never autofocuses search (station scan bar stays hot).

**Removed this session:** Email PO tab + `EmailPoLinkTab.tsx` (Gmail PO-worklist linker). Incoming sidebar “Email Triage” remains a different surface.

When an order/PO is linked, picker collapses to **Change / add pairing · Unlink**. Ticket identity lives on `ReceivingTicketChip`, not a second strip in Package Pairing.

### 3.3 Search chrome SoT (partially unified)

| Surface | Search control | Notes |
|---|---|---|
| Inventory Item / Store | `SearchBar` → `SearchField` | Shared SoT; `trailingPrefix` for catalog CTA or scope filter |
| PO tab | `SearchBar` | Migrated off hand-rolled `<input>` + Search icon |
| Tickets tab | `SearchBar` | Same |
| Auto-match Return # | Custom row (back + input + search IconButton) | Different job (order compare), not yet SearchBar |

House wrappers:

- `SearchField` (DS primitive, 363 lines) — draft/debounce, paste-as-commit, `trailingPrefix` / `trailingSuffix`
- `SearchBar` (122 lines) — mobile keyboard centering + tone map over SearchField
- `WorkbenchFilterPopover` (180 lines) — toolbar filter menu; **new** `density="field"` for in-SearchField triggers

`WorkbenchFilterPopover` consumers (grep): **11** TSX files (Outbound, Incoming, History, Unbox header, Photo library, Products catalog, Store scope, …).

### 3.4 Store order-scope filter (just changed)

**Before:** `EcwidOrderScopeFilters` rendered a `HorizontalButtonSlider` under the search field (`All orders` | `Repair`) — a full second chrome row.

**After:** same component exports a `WorkbenchFilterPopover density="field"` as SearchBar `trailingPrefix` (left of paste). Hot dot when scope ≠ `all`. Options still `all` | `repair_rs`; fetch still toggles `include_normal=1` on the store-orders API.

**Not done:** persist preferred scope per org/user; show active scope as a chip outside the field; unify Inventory Item catalog field override into the same filter menu.

### 3.5 Auto-match strip (parallel linkage UX)

`UnfoundMatchStrip.tsx` — **1119 lines**. Operator-only actions:

| Action | Behavior |
|---|---|
| Return # | Local shipped-order search / serial compare / import-sales-order |
| Zoho | POST unfound-queue retry-pair |
| Amazon return | SP-API reverse-tracking lookup |
| Find ticket | TicketLinkPopover seeded with tracking |

This is a **second** linkage UI beside Package Pairing tabs — overlapping “find ticket” and “find order” jobs with different chrome.

### 3.6 Data-linkage APIs in play (non-exhaustive)

| Link kind | Write path | Client refresh |
|---|---|---|
| PO relink | `POST /api/receiving/relink` | `dispatchLineUpdated` + invalidate feeds |
| Inbound merge (eBay spine + Zoho PO) | `POST /api/receiving/inbound/link` | same |
| PO search | `GET /api/receiving/po-search` | React Query |
| Store / catalog add | unmatched-items `handleAddLine` | line bus |
| Ticket link | support tickets link waist / triage panel | invalidate support + line patch |
| Sales-order import (Auto-match) | `POST /api/receiving/import-sales-order` | rail events + refresh domains |
| Unlink carton | `useReceivingCartonUnlink` | line bus → unfound |

**House rule already stated in UI:** pairing uses **real signals only** (no fabricated match scores). Auto-suggest banner (`PoSuggestBanner`) is separate and opt-in to operator confirmation **(inferred — verify score presentation)**.

### 3.7 Twin surfaces / forks still live

| Twin | Risk |
|---|---|
| `LineMatchingSection` vs `TriageLineMatchingSection` | Tab set + autofocus differ; bodies largely shared — good. Title chrome in triage still uses heavier `text-role-caption` eyebrow in one path **(verify teaching/header)**. |
| Auto-match “Find ticket” vs Pairing “Tickets” | Two ticket-link UIs |
| Auto-match “Return #” vs Store / PO search | Three order-find UIs |
| `PairingCandidateRow` vs Ecwid `ResultRow` | Different interaction models (Link button vs whole-row select) — intentionally different jobs |
| `chrome="bare"` vs `chrome="card"` on Ecwid inline | Pairing uses bare; other hosts may still nest a card |

---

## 4. What we believe we just aligned with industry (hypotheses — pressure-test these)

H1. **Segmented scope tabs under a search field are outdated for secondary refinements** when the default covers ≥80% of volume; 2026 ops UIs push secondary scope into an icon menu or chip, preserving vertical space for results (Linear / Polaris filter patterns; WMS receipt screens with “More filters”).

H2. **One search field primitive across “find and attach” tabs** is table stakes; hand-rolled inputs per backend are considered debt, not domain necessity.

H3. **Multi-link (PO + ticket independently)** is correct for reseller returns ops; forcing a single parent document ID is an ERP goods-receipt pattern that breaks marketplace + helpdesk reality.

H4. **Collapsing pairing to Change/Unlink after success** matches “done state → chrome shrinks” progressive disclosure (good). Hiding *how* it was linked (source chip) may be under-communicating for auditability (risk).

H5. **Station density** correctly forbids autofocus on Arrival search; Unbox may autofocus — industry often uses “focus owned by scan bar unless operator explicitly opens search” on floor apps.

---

## 5. Suspected gaps vs 2026 standards (hypotheses — confirm or kill)

G1. **No unified “linkage graph” presentation** — operator cannot see at a glance: PO identity · store order · ticket · inbound source · confidence/source of each link. Identity is scattered (header chips, collapsed pairing, ticket chip, Auto-match notices).

G2. **Overlapping find-paths** (Auto-match vs Package Pairing) increase training cost; industry returns desks usually have one “Match” panel with sources as facets, not two sibling strips.

G3. **Filter hot-state only as a 1.5px dot** may fail WCAG / glanceability on floor monitors; many 2026 systems use a persistent compact chip (“Repair”) or filled trigger label when non-default.

G4. **No keyboard contract** published for in-field filter (Esc closes menu without blurring scan focus; Arrow nav in menu) — critical for Station.

G5. **Merge vs Relink** is explained only in an inbound-merge callout; industry often uses an explicit verb picker or confirmation modal when identity model changes (replace vs augment).

G6. **Search result rows** still fork visual languages (PairingCandidateRow vs Ecwid ResultRow vs MatchCard) without a shared “linkable candidate” skeleton beyond the Link button SoT.

G7. **No org-level default for Store scope**; every session starts at `initialOrderScope` prop — 2026 ops products usually remember last filter per user or workspace.

G8. **Capability-safe copy** is uneven — tabs say “Store” / “PO” / “Tickets” (good) but some tooltips/docs still say Ecwid/Zoho/Zendesk **(verify remaining vendor strings in pairing chrome)**.

---

## 6. Decisions to take a side on

For each: (i) our current position, (ii) strongest counter-argument, (iii) your verdict — keep / change / defer — with one industry exemplar.

### D1. In-field filter icon (`density="field"`) vs facet chips under the field vs segmented tabs

**Current:** Filter funnel left of paste; tabs removed.  
**Counter:** Chips are more glanceable for binary scope; tabs teach available modes better for new hires.  
**Ask:** For a binary (or ≤4) scope on a station search, what is the 2026 default?

### D2. Grow `WorkbenchFilterPopover` for field density vs a dedicated `SearchFieldFilter` primitive

**Current:** One component, `density` prop.  
**Counter:** Toolbar h-8 semantics and field h-4 semantics will drift; consumers will overload content.  
**Ask:** Do mature design systems keep one FilterMenu with density, or split trigger shells?

### D3. Keep Auto-match strip separate from Package Pairing vs merge into one Match hub

**Current:** Separate strips; Auto-match only on unfound.  
**Counter:** Duplicate ticket/order find paths.  
**Ask:** Do RMA/WMS products keep “system refetch” actions visually separate from “manual link” search?

### D4. Multi-link model (order/PO + ticket independent) vs single primary document

**Current:** Multi-link; ticket on chip; PO collapses picker.  
**Counter:** Operators may think ticket link “completed pairing.”  
**Ask:** What identity UI pattern communicates “N links of different kinds” without a graph viz?

### D5. `chrome="bare"` Ecwid search inside glass card vs nested results panel

**Current:** Bare in Pairing (no nested card).  
**Counter:** Scroll containment / max-height listbox often wants a bordered panel.  
**Ask:** Standard for embedding a typeahead listbox inside an already-elevated card?

### D6. Default tabs: unfound → Inventory Item; matched → Store

**Current:** As coded.  
**Counter:** Unfound operators often need PO or ticket first; Inventory Item may be premature.  
**Ask:** How do industry receiving desks choose the default match mode by carton state?

### D7. Remove Email PO from pairing (done) vs keep as advanced source

**Current:** Removed from pairing tabs; Email Triage sidebar remains.  
**Counter:** Some teams live in Gmail-PO limbo and need one-click link from carton.  
**Ask:** Is “email as PO source” a pairing-tab job or a triage-queue job in 2026 returns ops?

### D8. Persist Store scope preference

**Current:** Not persisted.  
**Ask:** User / org / device — which persistence scope is standard for station filter prefs?

### D9. Unify result-row SoT for all linkable candidates

**Current:** `PairingCandidateRow` + Ecwid `ResultRow` + `MatchCard`.  
**Ask:** One skeleton with slots (leading media · title · meta · trailing action) vs allow job-specific rows?

### D10. Show active filter as chip outside SearchField when hot

**Current:** Dot on icon only.  
**Ask:** Required for floor glanceability, or noise on already-dense Unbox?

---

## 7. Open questions (answer with sources)

1. **Benchmark matrix:** For Shopify Admin, Salesforce Service Console, Loop Returns, Narvar, Manhattan Active WM, NetSuite Receiving, and Zoho Inventory (or closest public docs), how is “search + secondary scope + attach to record” composed in 2025–2026 screenshots/docs? One row per product: control anatomy, max vertical chrome above results, multi-link support Y/N.
2. **Filter-in-field accessibility:** WCAG 2.2 / APG patterns for combobox + adjacent menu button — recommended DOM order, focus restore after select, and whether hot-state must be textually exposed (not color/dot alone).
3. **Linkage audit UX:** What is the lightest UI that shows “linked via X at time T by user U” without opening a history tab? Industry examples.
4. **Merge vs replace:** Confirmation patterns when attaching a second accounting identity to a marketplace-originated receipt.
5. **Station vs desk:** Should Arrival and Unbox continue to fork autofocus + tab set, or should one Match hub adapt via density prop only?
6. **AI-assisted match:** Where (if anywhere) do 2026 systems show ranked suggestions *inside* the same search dropdown vs a separate banner (`PoSuggestBanner`)? When is a score allowed vs banned?
7. **What would change in our code next:** Propose a phased upgrade backlog (P0/P1/P2) of ≤8 items spanning UX chrome, SoT growth, and data-linkage presentation — each item one sentence + primary file/SoT to grow.

---

## 8. Constraints the answer must respect (house hard laws)

- Compose → grow SoT → compound; **no page-local twin** of `SearchBar` / `WorkbenchFilterPopover` / `WorkspaceSectionTitle`.
- Capability nouns in operator copy (Store / Tickets / PO), not vendor product sentences.
- Real signals only for pairing — no fake match percentages unless product explicitly introduces calibrated confidence.
- Station: do not steal scan-bar focus on Arrival.
- Status changes via `transition()` only; `orgId` from ctx; tenant writes via `withTenantTransaction`.
- Color/spacing/type/z-index from tokens; LedgerGrid justification rules if any grid lands in results.
- Prefer growing `WorkbenchFilterPopover` / `SearchField` / `PairingCandidateRow` over inventing `PackagePairingFilterMenu`.

---

## 9. Suggested reading pack for the researcher (public)

- WAI-ARIA APG: Combobox, Menu Button, Disclosure
- Shopify Polaris: Filters, Index filtering, Resource list
- Carbon Design System: Filtering, Data table toolbar
- Linear / Height-style “filter menu from icon” patterns (secondary sources OK if dated 2024–2026)
- Returns platforms: Loop / Narvar / AfterShip Returns help centers — “match return” / “link order”
- WMS receiving: public Manhattan / Blue Yonder / SAP EWM receiving UX papers or partner blogs — ASN/PO association
- Zendesk App Framework / Sunshine — linking tickets from third-party ops tools

---

## 10. One-paragraph brief for the model’s system prompt

You are reviewing Cycle Forge’s Package Pairing + Auto-match carton linkage hub after a 2026-07-30 SoT pass that unified search fields, removed Email PO from pairing tabs, and moved Store All/Repair scope into an in-field WorkbenchFilterPopover. Compare this against 2026 WMS/RMA/B2B ops standards for search refinements, multi-source entity linking, and dense station UX. Return: industry benchmark matrix, verdicts on D1–D10, answers to §7, and a concrete P0–P2 upgrade backlog that grows existing SoTs rather than forking new ones.
