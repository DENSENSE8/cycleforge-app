# Research briefing — Electron vendor webviews in Unbox Displays: what to delete vs keep

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-10
**Subject surface:** Unbox station **Displays** leaves that today hand-roll “look at the marketplace listing” and “look at the inventory PO” — specifically `listings` and `inventory` — versus an **Electron (or Tauri) shell** that mounts a signed-in vendor web page (`BrowserView` / `<webview>`) in that same right-edge column.
**Status:** **Zoho / Unbox Inventory slice ANSWERED 2026-08-10** → [`unbox-inventory-zoho-deep-link-port-PLAN.md`](./unbox-inventory-zoho-deep-link-port-PLAN.md) (**HARD BAN on Zoho embed unchanged**). **2026-08-10 evening — Zendesk Agent escape hatch REOPENED** as Electron **N5 VendorView** (partitioned `WebContentsView` + REST for CF-owned mutations); SoT: [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Station desktop VendorView. Listings embed still deferred. Commercialization stays browser-first ([`saas-commercialization-plan.md`](./saas-commercialization-plan.md) §0).
**Deliverable:** (a) industry patterns for “ops app + embedded vendor console” in 2024–2026 WMS/3PL/recommerce; (b) a **file-level delete / keep / thin** matrix validated against the inventory in §3; (c) defended positions on the decisions in §7; (d) answers to §8 with sources.

**Related briefs (do not redo; cite or diverge):**
- [`unbox-listing-photo-compare-display-GEMINI-RESEARCH-BRIEFING.md`](./unbox-listing-photo-compare-display-GEMINI-RESEARCH-BRIEFING.md) — listing **photo** Compare modality (answered). This brief is about **live listing HTML pages** and **inventory ERP pages**, not photo compare.
- [`docs/integrations/capability-relabel-program.md`](../integrations/capability-relabel-program.md) — Zoho-as-the-app dies; Zoho-as-inventory-connector stays.
- Prior chat framing: owner wants to delete **small** Displays chrome (listing-link cards, inventory dossier sub-leaves) and show the real eBay / Zoho page instead — **not** gut the whole product into an Electron wrapper of vendors.

---

## 0. How to use this brief

You do **not** need to invent the codebase. §3 is a **literal measured inventory** from the running repository on 2026-08-10 (line counts via `wc -l`). Where something is inferred it is labeled **(inferred — verify)**. Prefer opening the named paths if you have repo access; otherwise treat §3 + Appendix A as ground truth.

Three deliverables, kept separate:

1. **Industry standard (2024–2026)** for embedding a vendor’s own web UI inside an operational warehouse app (Electron/`BrowserView`, iframe, deep-link-only, vendor App SDK). Name real systems. State when each pattern wins, especially when vendors set `X-Frame-Options` / CSP `frame-ancestors`.
2. **Take a side on each decision in §7.** Each states current shape, strongest case against it, and our starting admission.
3. **Answer §8** with sources — and return a **delete / keep / thin** table keyed to the file paths in §3 (not vague “simplify the UI”).

The reader is the engineer who will cut or keep these leaves. Prefer a concrete target architecture and named trade-offs over a decision framework.

---

## 1. Product and vocabulary, briefly

**Cycle Forge** is multi-tenant reseller-operations SaaS. USAV is the dogfood tenant only. Vendor systems (Zoho Inventory, Zendesk, eBay, Ecwid, ShipStation, …) are **tenant connectors behind capability facades** — never the product spine (`AGENTS.md`, `.claude/rules/source-of-truth.md` → Integrations).

**Unbox** is the golden scan station: centre = PO lines + label preview + placement; bottom = flush procedure dock; right = **Displays** push column (`StationDisplaysPushStack`). Displays leaves include (among others):

| Leaf id | Operator label | Group | What it is today |
|---|---|---|---|
| `listings` | Listings | verification | Resolved listing URLs + open/copy/manual override (`ListingLinksTab`) |
| `inventory` | Inventory | assets | PO dossier: Information · Lines · PO notes · Activity (`InventoryDisplayHost`) |
| `units` | Units | assets | Carton serial explosion + Prebox (`UnitsDisplayHost`) — **Cycle Forge unit ledger, not Zoho** |
| `photos` | Photos | assets | Photos actions; nested Compare = listing gallery vs bench evidence |
| `ticket` | Ticket | context | Claim / link ticket tools |
| … | classify, linkage, tracking, timeline, support, checklist | … | Other ops tools |

**Integrations hub** (`/settings/integrations`) is the **only** connect/disconnect surface for API credentials. Connecting Zoho/eBay there stores vaulted API tokens for **server-side** sync — it does **not** create a browser cookie session on `inventory.zoho.com` or `ebay.com`.

**Already-known embed failure (browser):**
- `ListingResizePanel` — marketplace pages **block iframe embedding**; UI is “open externally” only (`canEmbed` deprecated/ignored).
- `ZohoSplitPane` — provider apps **block iframe embedding**; pane only surfaces an external link to the Zoho PO URL.

**Electron distinction (the hypothesis under test):** a top-level `BrowserView` / `<webview>` is **not** an iframe. Pages that refuse `frame-ancestors` often still load as a first-party navigation. The owner hypothesis is: station PCs run an Electron shell; operators stay signed into eBay / Zoho in partitioned sessions; Displays → Listings / Inventory show those live pages instead of hand-rolled React.

---

## 2. The job, restated as a research question

Strip away product names:

> At a barcode-scan inbound bench, the operator needs (A) to **visually verify** the marketplace listing that matches the carton in hand, and (B) to **consult / occasionally edit** the upstream purchase-order record in the inventory ERP, without leaving the station layout. Today the SaaS re-implements thin “link list” and “PO dossier” UIs over mirrored API data, plus deep links out. Would a **signed-in vendor webview** in the right column be the industry-standard simplification — and if so, which pieces of the hand-rolled UI become pure delete candidates versus which must remain because they mutate the SaaS’s own operational ledger?

This is the shape of:
- WMS/3PL “open ERP / marketplace in a side browser” station tooling.
- Seller tools that embed or deep-link Seller Hub / Amazon Seller Central / Shopify admin.
- Desktop wrappers (Electron/CEF) used in warehouse apps specifically to defeat iframe bans.
- Explicit **non-pattern**: replacing the whole ops SaaS with a multi-tab vendor browser.

**Named research target:** for recommerce / ITAD / 3PL inbound stations in 2024–2026, what is the dominant pattern for “see the listing” and “see the PO” — embedded webview, deep link only, API-mirrored dossier, or vendor App SDK — and what do mature systems **refuse** to delete when they add a webview?

---

## 3. What shipped — measured anatomy (2026-08-10)

### 3.1 Unbox Displays leaf catalog (wiring)

| Concern | Path | Lines |
|---|---|---|
| Leaf id vocabulary + URL drills | `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts` | 308 |
| Root Index row builders | `src/components/receiving/workspace/line-edit/unbox-display-index.ts` | 202 |
| Leaf body mount table | `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` | 554 |
| Carton Macro floor (incl. Zoho Refresh icon) | `src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx` | 281 |
| **Subtotal (shell wiring)** | | **~1345** |

`listings` mounts `ListingLinksTab` from `unbox-tabs.tsx` (~id `'listings'`). `inventory` mounts `InventoryDisplayHost`. `units` mounts `UnitsDisplayHost`.

### 3.2 Listings cluster — candidate for webview preview

```
src/components/receiving/workspace/line-edit/ListingLinksTab.tsx           245  — URL cards, Open/Copy, manual override field, source tabs
src/components/receiving/workspace/line-edit/OpenListingLinksPanel.tsx      82  — open-all when 2+ hrefs
src/components/receiving/workspace/line-edit/ListingPhotoCompareHost.tsx   180  — Photos→Compare (listing gallery vs bench) — DIFFERENT JOB
src/components/listing/ListingResizePanel.tsx                             231  — legacy “listing preview” panel; iframe abandoned
src/lib/receiving/listing-links.ts                                       209  — collectCartonListingLinks (manual/sync_notes/catalog/derived)
src/lib/receiving/listing-links.test.ts                                  274
src/hooks/useListingGallery.ts                                           111  — gallery fetch for Compare
────────────────────────────────────────────────────────────────────────
Listings “link chrome” (excl. Compare + gallery):                        ~767 lines / 4 files (+ tests)
Listings + Compare + gallery + tests:                                   ~1332 lines
```

**What `ListingLinksTab` actually does (not a marketplace UI):**
1. Shows every resolved `CartonListingLink` (sources: `manual` | `sync_notes` | `catalog` | `derived`).
2. Open in new tab / Copy URL.
3. Manual override URL field → persists onto carton `receiving.listing_url` via line-edit package sync hooks.
4. Optional “Edit Zoho notes” jump when source is `sync_notes`.
5. Multi-link open-all.

**What it does *not* do:** render the live eBay/Amazon/Ecwid HTML page (already abandoned in `ListingResizePanel`).

**Persistence spine (keep even if preview dies):**
- `collectCartonListingLinks` in `listing-links.ts`
- `useReceivingPackageSync` / `useReceivingLineCore` listing_url debounce persist
- `receiving.listing_url` column + details overlay fields

### 3.3 Inventory cluster — candidate for Zoho webview *escape hatch*, not full replace (hypothesis)

```
src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx     544  — armed verbs → info/lines/notes/activity
src/components/receiving/inventory/InventoryPoHeader.tsx                  197  — PO telemetry
src/components/receiving/inventory/InventoryPoLineList.tsx                448  — qty · rate · line notes
src/components/receiving/inventory/InventoryActivityPanel.tsx              87  — receive/unreceive trail
src/components/receiving/inventory/useInventoryPoDossier.ts               112  — dossier data hook
src/components/receiving/inventory/inventory-activity-panel.test.ts        66
src/components/receiving/workspace/ZohoSplitPane.tsx                       97  — right-rail “open Zoho PO” link-only pane
src/components/receiving/ZohoInboundStatusBanner.tsx                     158  — inbound sync status banner
src/components/receiving/workspace/line-edit/hooks/useZohoSync.ts         358  — refresh / sync orchestration
src/components/receiving/workspace/line-edit/hooks/useZohoLinePrefill.ts   84  — prefill from mirror
src/components/admin/connections/ZohoManagementPage.tsx                    42  — admin sync tools shell
src/components/admin/connections/ZohoSyncCard.tsx                        154  — refresh token / sync POs
────────────────────────────────────────────────────────────────────────
Inventory Displays dossier (+ escape hatch + banners/sync hooks):       ~2307 lines (UI+hooks above)
src/lib/zoho/** (API connector — NOT a UI surface)                      ~3758 lines
```

**What `InventoryDisplayHost` actually does:**
- Root armed list: Information · Lines · PO notes · Activity (Displays Root-to-Leaf grammar).
- Saves PO notes / line notes **in Cycle Forge** (and syncs toward inventory provider via APIs).
- Activity = **receive / unreceive** trail for this org’s carton — not Zoho’s audit log UI.
- “Change PO” routes to Pairing/Linkage; Zoho Refresh lives on Macro floor (`UnboxDisplaysActionFloor`), not in the breadcrumb.
- Receive / Unreceive stay on the **Unbox dock**, not inside this leaf.

**Deep link already exists:**
- `ZohoSplitPane.buildProviderPoUrl` → `https://inventory.zoho.com/app#/purchaseorders/{id}`
- Duplicate URL builder in `useReceivingLineCore.ts` (~611–612)

### 3.4 Units cluster — **not** a vendor mirror (control group)

```
src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx         241
src/components/receiving/workspace/UnitsExplosionDisplay.tsx              349
src/components/receiving/PreboxWizard.tsx                                 306
────────────────────────────────────────────────────────────────────────
Units:                                                                   ~896 lines
```

Units = serials · grade · photos · Prebox on **this carton**. Zoho Inventory has no equivalent station surface. **Starting position: KEEP entirely** — any research answer that deletes Units for a Zoho webview is wrong for this codebase unless it invents a replacement for the unit ledger.

### 3.5 Adjacent surfaces often confused with this proposal

| Surface | Path | Lines (approx) | Role vs this brief |
|---|---|---|---|
| Support ticket console | `src/components/support/**` | **~11941** | Ops helpdesk workspace; deep link via `zendeskTicketUrl` — **out of scope** unless §7 expands |
| Integrations hub | `src/app/settings/integrations/**` | **~2561** | Connect/config only — **KEEP**; not a vendor dashboard |
| Ticket Displays host | `.../TicketDisplayHost.tsx` | 91 | Station claim/link tools |
| Linkage Displays host | `.../LinkageDisplayHost.tsx` | 158 | Pair PO / catalog |
| Photos Displays host | `.../PhotosDisplayHost.tsx` | 130 | Photo actions; hosts Compare |
| Zendesk URL helper | `src/lib/zendesk-ticket-url.ts` | 28 | Deep link builder |

### 3.6 Electron / desktop shell state in this repo

- Historical Electron wrapper referenced in `docs/skills/Feature_Interaction_Map.md` (printer IPC + sidecar `:3001`).
- `electron/` tree **not present** in the current checkout (measured 2026-08-10) — treat as **retired / not in-tree**.
- `docs/todo/saas-commercialization-plan.md` §0: ship **browser-first**; only future-native exception = thin Tauri for hardware the browser can’t reach — **not** vendor UI hosting.
- This brief must reconcile: **station webview shell** vs **settled “no desktop app” commercialization**.

---

## 4. The owner’s proposed cut (starting hypothesis — challenge it)

### 4.1 Listings leaf
**Delete / replace preview chrome** (`ListingLinksTab` URL cards, possibly `ListingResizePanel`) with an Electron pane that navigates to the primary `listing_url` / selected `CartonListingLink.href`. Operator is signed into eBay (etc.) in that webview session, so seller-only pages work.

**Keep:** URL resolution (`listing-links.ts`), carton `listing_url` persistence, multi-link picker if >1 URL, Photos→Compare.

### 4.2 Inventory leaf
**Delete / replace** hand-rolled dossier sub-leaves (Information / Lines / PO notes / Activity components) with Zoho Inventory’s PO page in the same Displays column (or right rail).

**Keep (owner less clear):** receive dock, Macro refresh that hits **our** sync APIs, Linkage for change-PO. Research must say whether notes/activity can move entirely into Zoho’s UI.

### 4.3 Explicit non-goals (owner clarified in chat)
- Not deleting the whole Unbox station.
- Not replacing Cycle Forge with “Electron tabs of every vendor.”
- Not claiming Integrations OAuth automatically authenticates vendor websites (research must address session partitioning).

---

## 5. Self-indictment / tensions

1. **We already tried embedding and documented defeat** (`ListingResizePanel`, `ZohoSplitPane`). The only new variable is Electron top-level browse context — research must say whether that is enough in practice for Zoho Inventory SPA + eBay seller pages (login walls, MFA, bot detection, session isolation).
2. **Integrations connect ≠ webview login.** Vaulted API tokens do not inject cookies into `BrowserView`. Multi-account / multi-tenant station PCs need **partitioned sessions** (`session.fromPartition`) or operators re-login — a product cost.
3. **Inventory dossier mutates Cycle Forge state** (notes, line notes, activity tied to receive). Zoho’s UI mutates Zoho. Deleting the dossier without a sync story creates two sources of truth or loses floor-speed edits.
4. **Units ≠ Inventory.** Collapsing “right rail hand-rolls” into “just show Zoho” wrongly deletes the unit ledger if Units is swept in.
5. **Commercialization says no desktop app.** A webview-dependent Displays leaf makes the **browser app a degraded fallback** (deep link only) — research must price that fork.
6. **Capability-facade law.** Product copy must stay capability-noun (“Open in inventory provider”); embedding Zoho chrome re-introduces vendor UI as the face of a Displays leaf — may be acceptable as an explicit “provider pane” escape hatch, but research should name the IA cost.

---

## 6. Shapes not taken (candidates for research to score)

| Shape | Argument for | Argument against |
|---|---|---|
| **A. Deep link only (status quo+)** — thin Open button; delete fat URL cards; no Electron | Zero shell cost; works in browser; matches iframe reality | Context switch; no signed-in seller page in-column |
| **B. Electron BrowserView for Listings only** — keep Inventory dossier | Highest-value visual verify job; smallest auth surface (marketplace) | Desktop fork; session management; Listings leaf still needs URL picker chrome |
| **C. Electron BrowserView for Inventory PO page; delete dossier** | Deletes ~1.2k lines of dossier UI | Loses in-app notes/activity/receive-adjacent facts; Zoho SPA navigation is slow for wedge operators; sync lag |
| **D. Hybrid Inventory** — keep dossier as default; armed verb “Open provider” mounts BrowserView | Escape hatch without gutting receive workflow | Two UIs for one leaf; complexity |
| **E. Vendor App SDK / Zoho embedded app** (if exists) | Official embed path | May not exist for Inventory PO; couples to one vendor; violates capability-swappable goal |
| **F. Second OS window** managed by shell (not in-column) | Simpler than in-column BrowserView layout | Breaks Displays column grammar / keyboard nav |
| **G. Delete Listings leaf entirely** — only centre/dock “open listing” chip | Fewer Displays leaves | Loses multi-link + manual override home; photo steps still rail to `listings` (`steps/rail/index.ts`) |

---

## 7. Decisions — take a side on each

### D1 — Should Listings preview become an Electron webview?
**Current:** `ListingLinksTab` = URL meta UI; live page only via `window.open`.
**Proposed:** BrowserView navigates to selected href inside Displays.
**Counter:** browser tenants get a permanent degraded path; Electron becomes mandatory for the “good” Unbox verify loop.

### D2 — What Listings files are pure delete vs must stay?
**Starting cut (challenge with evidence):**

| Path | Start | Why |
|---|---|---|
| `ListingLinksTab.tsx` | **THIN or DELETE** body → replace with webview host + tiny picker | Preview chrome |
| `OpenListingLinksPanel.tsx` | **KEEP or THIN** | Multi-open still useful even with webview |
| `ListingResizePanel.tsx` | **DELETE** if unused after webview, or leave as external-open stub | Already non-embed |
| `listing-links.ts` + tests | **KEEP** | URL resolution SoT |
| `ListingPhotoCompareHost.tsx` + `useListingGallery.ts` | **KEEP** | Different job (answered in sibling brief) |
| Package-sync listing_url hooks | **KEEP** | Persistence |

### D3 — Should Inventory dossier be deleted in favor of Zoho’s PO page?
**Current:** `InventoryDisplayHost` + PoHeader/LineList/Activity + notes save.
**Proposed (owner):** show Zoho webview instead.
**Counter:** notes/activity/receive metrics are Cycle Forge ops; Macro refresh syncs **mirror**, not “whatever tab you’re staring at.”

### D4 — Inventory file-level cut
**Starting cut (challenge):**

| Path | Start | Why |
|---|---|---|
| `InventoryDisplayHost.tsx` | **KEEP shell / THIN** — add “Open provider” verb; do not delete leaf | Leaf is in Displays index grammar |
| `InventoryPoHeader.tsx` | **KEEP** unless webview proves redundant for telemetry operators need at a glance | Fast facts without Zoho SPA |
| `InventoryPoLineList.tsx` | **KEEP** (line notes tied to receive) | Mutates CF |
| `InventoryActivityPanel.tsx` | **KEEP** | Receive trail is CF |
| `useInventoryPoDossier.ts` | **KEEP** | Data waist |
| `ZohoSplitPane.tsx` | **DELETE or MERGE** into Inventory “Open provider” | Duplicate escape hatch |
| `ZohoInboundStatusBanner.tsx` | **KEEP** (sync health ≠ PO UI) | Ops signal |
| `useZohoSync.ts` / prefill / admin sync cards | **KEEP** | API connector UX |
| `src/lib/zoho/**` | **KEEP** | Connector — deleting UI ≠ deleting sync |

### D5 — Units
**Starting cut: KEEP all Units files.** Confirm or refute with industry examples of ERP webviews replacing serial/unit capture at inbound benches.

### D6 — Auth model for vendor webviews
**Current:** Integrations vault = API; vendor sites = separate cookies.
**Proposed (owner intuition):** “signed in from the integration.”
**Research must pick:** (a) manual login per partition, (b) cookie injection from OAuth (ToS/security), (c) deep link only, (d) vendor device-code / SSO. Name risks for multi-tenant station PCs.

### D7 — Distribution: browser-first vs Electron-required Displays
**Current commercialization:** no desktop app as primary product.
**Proposed:** Electron shell for station PCs to unlock webviews.
**Research must say:** is this a dogfood-only station accessory (Tauri/Electron helper), or does it fork the product into “real Unbox” vs “browser Unbox”?

### D8 — Scope creep: Support / Ticket console
**Owner originally mentioned ticket chatbot; later narrowed to Listings + Inventory.**
**Starting cut: OUT OF SCOPE / KEEP support console** (`~12k` lines) + keep `zendeskTicketUrl` deep link.
**Only reopen if industry overwhelmingly replaces in-app ticket threads with Zendesk Agent webviews at scan benches — and even then, Ticket Displays claim/link tools may still stay.**

---

## 8. Open research questions

1. **Embed reality 2026.** For Zoho Inventory PO pages and eBay listing / seller pages, what happens in Electron `BrowserView` vs Chromium iframe vs plain `window.open`? Cite CSP/`X-Frame-Options`, bot/MFA friction, and any official embed/SDK alternatives.
2. **Industry inbound-bench pattern.** Named WMS/3PL/recommerce/ITAD products: how do they show “the listing” and “the PO” next to scan UI? Dominant pattern + conditions for webview.
3. **What never gets deleted.** When systems add a vendor webview, which mirrored dossier fields do they still keep locally (qty expected/received, serials, photos, notes, claims)?
4. **Session partitioning.** Standard patterns for multi-account Electron sessions on shared warehouse PCs (partition per org, per staff, per capability). Failure modes (cross-tenant cookie bleed).
5. **API connect vs web login.** Do any mature products pretend OAuth-to-API equals website SSO into the vendor console? If yes, how? If no, how do they explain it to operators?
6. **Keyboard / wedge safety.** Unbox has wedge-safe nav keys and dock focus laws. What breaks when a webview steals key focus? Industry mitigations (webview focus trap, explicit “return to scan” chord).
7. **Delete-line budget.** Given §3 counts, what is a realistic lines-deleted estimate for shapes B vs C vs D without regressing receive?
8. **Browser fallback.** If Electron webview is the premium path, what is the **minimum** Listings/Inventory UI the pure web app must keep so Unbox remains usable?

---

## 9. Constraints — treat as fixed

- **Capability facades stay.** Inventory writes/sync go through `src/lib/integrations/inventory` / Zoho connector packages — a webview is not a second write path for receive qty.
- **Unboxed ≠ Received** meters stay on Cycle Forge math (`inventoryReceivedDisplayQty`) — never painted from “whatever Zoho’s page shows.”
- **Units leaf is Cycle Forge unit ledger** — not replaceable by Zoho UI without a new unit SoT (forbid silent delete).
- **Photos→Compare is a separate answered decision** — do not collapse it into “show listing URL.”
- **Integrations hub remains the only API connect/disconnect surface.**
- **Multi-tenant:** no shared vendor cookie jar across orgs on one station PC without explicit partition design.
- **`npm run verify` / DS ratchets** still apply to whatever thin chrome remains; do not raise baselines to delete files.
- **Do not assume `electron/` exists in-tree** — any shell is greenfield or restored from history.
- **Scan-station centre stays ops-flow** — vendor webviews belong in Displays / auxiliary panes, not centre banners.

---

## 10. What a good answer looks like

1. **One recommended shape** from §6 (or a named hybrid), with conditions under which you’d pick the runner-up.
2. **A delete / keep / thin table** whose rows are **exact paths from §3**, each with a one-line reason. No “clean up Zoho stuff” vagueness.
3. **Auth/session design** for station PCs (partition key, login UX, logout, MFA).
4. **Browser fallback** spec (what web Unbox shows when BrowserView is unavailable).
5. **Migration order** that keeps Unbox live: e.g. “thin ListingLinksTab → add BrowserView behind Electron detect → merge ZohoSplitPane into Inventory Open provider → only then consider dossier sub-leaf deletion with sync proof.”
6. **Explicit non-deletes:** Units, listing-links SoT, receive dock, Integrations hub, `src/lib/zoho/**`, Photos Compare (unless arguing against the sibling brief with new evidence).
7. **Line-count delta estimate** (deleted / kept / new shell module).

An answer that concludes “keep deep links; do not build Electron webviews” is acceptable **if** it explains why the owner’s Listings preview pain is better solved by thinning `ListingLinksTab` alone — and still returns the file-level table.

---

## Appendix A — file map (primary)

| Concern | Path |
|---|---|
| Listings leaf body | `src/components/receiving/workspace/line-edit/ListingLinksTab.tsx` |
| Open-all listings | `src/components/receiving/workspace/line-edit/OpenListingLinksPanel.tsx` |
| Listing URL resolution SoT | `src/lib/receiving/listing-links.ts` |
| Abandoned iframe preview | `src/components/listing/ListingResizePanel.tsx` |
| Photos → Compare | `src/components/receiving/workspace/line-edit/ListingPhotoCompareHost.tsx` |
| Inventory leaf host | `src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx` |
| PO dossier pieces | `src/components/receiving/inventory/InventoryPo{Header,LineList}.tsx`, `InventoryActivityPanel.tsx`, `useInventoryPoDossier.ts` |
| Zoho link-only rail pane | `src/components/receiving/workspace/ZohoSplitPane.tsx` |
| Units leaf | `src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx`, `../UnitsExplosionDisplay.tsx`, `PreboxWizard.tsx` |
| Displays mount table | `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` |
| Leaf ids / gates | `unbox-side-tabs.ts`, `unbox-display-index.ts` |
| Macro floor Zoho refresh | `UnboxDisplaysActionFloor.tsx` |
| Sync hooks | `hooks/useZohoSync.ts`, `hooks/useZohoLinePrefill.ts` |
| Integrations hub | `src/app/settings/integrations/**` |
| Inventory capability facade | `src/lib/integrations/inventory/**` |
| Zoho connector (API) | `src/lib/zoho/**` |
| Product law | `AGENTS.md`, `.claude/rules/source-of-truth.md` → Integrations · Unbox centre · Displays |
| Capability relabel program | `docs/integrations/capability-relabel-program.md` |
| Commercialization (no desktop app) | `docs/todo/saas-commercialization-plan.md` §0 |

## Appendix B — starting delete/keep scorecard (engineer hypothesis — research must rewrite)

| ID | Path | Hypothesis |
|---|---|---|
| L1 | `ListingLinksTab.tsx` | THIN → webview host + link picker |
| L2 | `OpenListingLinksPanel.tsx` | KEEP |
| L3 | `ListingResizePanel.tsx` | DELETE if call sites allow |
| L4 | `listing-links.ts` (+ tests) | KEEP |
| L5 | `ListingPhotoCompareHost.tsx` | KEEP |
| L6 | `useListingGallery.ts` | KEEP |
| I1 | `InventoryDisplayHost.tsx` | KEEP shell; add Open provider |
| I2 | `InventoryPoHeader.tsx` | KEEP (unless proven redundant) |
| I3 | `InventoryPoLineList.tsx` | KEEP |
| I4 | `InventoryActivityPanel.tsx` | KEEP |
| I5 | `useInventoryPoDossier.ts` | KEEP |
| I6 | `ZohoSplitPane.tsx` | DELETE/MERGE into I1 |
| I7 | `ZohoInboundStatusBanner.tsx` | KEEP |
| I8 | `useZohoSync.ts` / prefill / admin Zoho* | KEEP |
| I9 | `src/lib/zoho/**` | KEEP |
| U1–U3 | Units cluster | KEEP |
| S1 | `src/components/support/**` | KEEP (out of scope) |
| H1 | Integrations hub | KEEP |
| E1 | New Electron BrowserView module | ADD only if D1/D7 win |

## Appendix C — raw inventory totals (measured 2026-08-10)

```
Listings link chrome (Tab+OpenAll+ResizePanel+listing-links.ts):     ~767 lines
Listings + Compare + gallery + listing-links tests:                ~1332 lines
Inventory dossier UI + ZohoSplitPane + banner + sync hooks + admin: ~2307 lines
Units cluster:                                                       ~896 lines
Displays shell wiring (tabs/index/floor/side-tabs):                 ~1345 lines
Support components tree:                                           ~11941 lines
Integrations settings tree:                                         ~2561 lines
src/lib/zoho connector:                                             ~3758 lines
electron/ in-tree:                                                       0 files
```

## Appendix D — prompt block (paste to Gemini)

> You are researching whether a warehouse ops SaaS should replace hand-rolled “listing links” and “inventory PO dossier” Displays panels with Electron `BrowserView` panes showing the live marketplace / Zoho Inventory pages. Use the measured file inventory and decisions D1–D8 in `docs/todo/electron-vendor-webview-displays-delete-keep-GEMINI-RESEARCH-BRIEFING.md`. Return: (1) industry pattern winner, (2) rewritten delete/keep/thin table with exact paths, (3) auth/session design, (4) browser fallback, (5) migration order, (6) line-count delta. Do not recommend deleting Units or `src/lib/zoho` API connectors unless you provide a replacement SoT. Challenge the owner hypothesis that Integrations OAuth equals vendor website login.
