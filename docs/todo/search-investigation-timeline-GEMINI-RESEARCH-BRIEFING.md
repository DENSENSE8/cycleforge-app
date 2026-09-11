# Research briefing — FIND confirmation as a detective timeline (ops SaaS, not a WMS station)

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-09-11
**Status:** RESEARCH CLOSED 2026-09-11 — conclusion locked. Implementation checklist: [search-investigation-timeline-PLAN.md](search-investigation-timeline-PLAN.md).
**Primary surface:** `/search?sel=` (FIND confirmation / dossier). Also: `/search?q=` browse, ⌘K / header find, future `/m/search`, scan-gun **preview** of the same column.
**Companion briefs (do not re-litigate):** [search-results-grid-GEMINI-RESEARCH-BRIEFING.md](search-results-grid-GEMINI-RESEARCH-BRIEFING.md) (hit **list** shape); [detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md](detail-surface-IA-GEMINI-RESEARCH-BRIEFING.md) (where detail lives); this brief is **what the open-record FIND column is for** once a hit is confirmed.

**Hard framing rule:** Cycle Forge is **not** “a WMS with a search bar.” It is a **2026 multi-tenant operational SaaS** (fulfillment + receiving + serialized inventory + support/repair + channel ops + kiosk + studio). Warehouse is **one domain among many**. Recommendations that assume ShipHero/ShipBob **order-detail tabs** (Items / History / Warehouse) as the default will be **wrong** for this job. Compare to **investigation / case-file / object-explorer** products as the primary class; use WMS consoles only as a contrast class.

**Hard framing rule for citations:** Name products and citable UX research (2024–2026). Treat the measured anatomy in §3 as **empirical current state**, not as a constitution you must preserve.

---

## 0. Method — read before answering

### 0.1 Your job (four deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature **ops / admin / investigation** products show “I looked something up; tell me what it is **now**, then what **happened**, then let me jump to the tool that writes”? Named products. Citations. Dominant pattern vs minority patterns and when each wins.
2. **Display-method catalog keyed by time, not by workplace.** Propose the **smallest** set of row faces that appear **only when that event kind exists** on a chronology. Faces must not fork on “this is an Unbox carton vs a Pack order vs a Support ticket.” Station names may appear as **captions on a hop**, never as a layout switch.
3. **One-column SoT (phone first).** Specify the exact stack for a **single column** that is (a) `/m/search`, (b) desktop `/search` framed as that column, (c) scan-station **preview** embed. Desktop may add density **after** that column exists — not a second IA.
4. **Left outline vs recents vs Displays index.** Given §3, rule on: investigation outline (Overview + kind counts), “recent finds” rail, and station Displays leaves (Photos / Status info / Timeline / Units / Ticket / Support / Warranty). Which jobs belong on FIND; which are workplace and must stay off this route.

### 0.2 What this brief is NOT

- Not “port Unbox / Pack / EntityStationPane onto `/search`.”
- Not “add a page per entity type.”
- Not “restore Recently searched as the left rail because ⌘K already has Recents.”
- Not “fold Unbox Queue / Viewed / History into the table filter funnel” (different surface; out of scope).
- Not a visual skin / marketing landing-page taste pass.
- Not a retrieval / ranking brief (hybrid search already exists).

### 0.3 Scoring axes (mandatory — score 1–5, no sixth axis)

| Axis | Meaning |
|---|---|
| **Job purity** | FIND confirms and hands off; it does not become a second Unbox / To-ship / Support |
| **Identification agnosticism** | Order vs serial vs tracking vs carton vs SKU vs repair vs FBA change **which events exist**, not which chrome tree mounts |
| **Timeline as shaper** | Display methods appear iff the stream has that kind; empty kinds are omitted |
| **Mobile SoT** | Cold open on a phone: status pin → outline/facts → chronology → one sticky handoff; no hover-only; no dual `lg:` trees |
| **Upkeep** | No new routes per entity; adapters at the **data** layer only |

**ROI ≈ (Job purity × Identification agnosticism × Timeline as shaper × Mobile SoT) / (6 − Upkeep).** Rank candidate IAs descending.

### 0.4 Sources to cover (minimum)

| Class | Named examples (start here; expand) | Use for |
|---|---|---|
| **Commerce record + chronology** | Shopify Admin order timeline; Stripe Dashboard payment/customer activity; Amazon Seller Central order detail | Status pin + event-kind rows (not warehouse tabs) |
| **Investigation / case** | Palantir Foundry object view; ServiceNow incident; Relativity/case-file chronology; Splunk/Chronicle event lists | Object-agnostic dossier + evidence stream |
| **Observability incident** | Sentry issue; Datadog incident; PagerDuty | Sticky state, timeline as the document, facets as filters on the stream |
| **Helpdesk** | Zendesk Agent Workspace; Gorgias; Linear issue | Context vs work; when left rail is outline vs view list |
| **Parcel tracking** | AfterShip, 17TRACK, USPS Informed Delivery, carrier native apps | Status hero + dated hops; same chrome for every carrier |
| **WMS / 3PL (contrast only)** | ShipHero, ShipBob, Extensiv, ShipStation | Show why **order tabs by workplace** fail identification-agnostic FIND |
| **Mobile admin** | Shopify mobile, Stripe mobile, Linear mobile | One column + sheet for event enlarge |
| **Research** | Nielsen Norman Group (progressive disclosure, IA); WCAG 2.2 touch/focus; Apple HIG / Material 3 for admin density | Principles |

Where industry splits, give **both** positions, then pick a default for **this** job: serialized reseller ops, many entity types, one FIND route, work owned elsewhere.

---

## 1. Product identity (the main briefing identification)

**Cycle Forge** is a **sellable, multi-tenant B2B operations platform**. First dogfood tenant is org **#1** (`00000000-0000-0000-0000-000000000001`) — a used-goods / electronics refurb shop. **Do not** frame UX as “a five-person warehouse tool.” Frame it as software a second 3PL / reseller org could buy.

Domains that already share one product (incomplete list): Inventory, Shipping / To-ship, Receiving / Unbox / Arrival, Support, Repair, FBA, Kiosk / walk-in, Studio, Admin, **Search**. Mobile-first law is **repo-wide**: every operator verb must be completable on `/m/*` first; desks and scan stations **consume** that job tree.

Serialized inventory is common (serials, grades, photos, claims) **and** the same FIND must also confirm: marketplace orders, cartons, SKUs, repair claims, FBA shipments, tracking numbers. **The identifier the operator typed is not the layout.**

**Who the operator is (FIND specifically).** Mid-task. Holding a label, a serial, a ticket number, a customer quote, or a tracking paste. They need: *what is this, is it blocked, what happened, where do I go to fix it.* They are **not** scanning a carton through Unbox and they are **not** packing a bench.

**Region for `/search`:** FIND / confirmation workbench. Query is the object. Hit is confirmation. **Work happens on the handoff** (To-ship, exceptions, Unbox, inventory units, repair desk). Implementers already forbid station workbench chrome on FIND files; you should still argue from industry, then say whether that forbid is aligned.

---

## 2. The problem, in one paragraph

Operators cannot carry a new page per identifier type, and they cannot carry station chrome on lookup. Today `/search?sel=` correctly **named** a search-only dossier (status pinned on top, details below, findings, handoff) but **filled** it with ports: station identity, shipped/receiving pipelines, Unbox photo peek, unit scan milestones. The left column is **rail-less** (recents were deleted because ⌘K already has Recents). There is **no `/m/search`**. Station Displays indexes still exist on disk (Photos / Status info / Timeline / Units / Ticket / Support / Warranty) — workplace leaves. The desired product is: **one investigation column**, **timeline-only display methods**, **search-owned outline** for quantities and specifics, **station-agnostic**, portable to phone and scan preview.

---

## 3. Measured current anatomy (verified from source 2026-09-11)

You may not have the repo. Treat this as ground truth. Do not invent extra chrome.

### 3.1 Route machine

| URL | Body |
|---|---|
| `/search?q=…` and no `?sel=` | Browse — relevance list. Find field is **only** header / ⌘K. |
| `/search?sel=type:id` | Dossier frame via per-type adapters. |
| Refine on browse | `?etype=` `?hstat=` `?colsort=` — not a left rail. |

Entity types on `?sel=`: `order` · `receiving` · `unit` · `sku` · `repair` · `fba`.

### 3.2 Dossier frame (overview display that already exists)

`SearchDossierFrame` (`data-testid="search-dossier"`):

1. Optional **banner** (today: station identity / carton context ports).
2. **Toolbar:** title + handoff buttons (`search-dossier-handoff`).
3. **Status pin** (`search-dossier-status-row`): either a **pipeline** slot or status badge + fact chips.
4. Optional identity header if no banner.
5. **Findings** band if dirty — search paints; it does not clear.
6. Scroll **contents** list — lines of title + meta.

**Keep this vertical contract** unless industry gives a strictly better one-column status-then-body pattern (say so explicitly).

### 3.3 Ports currently filling the frame (the upkeep)

Order confirmation mounts station identity, a shipped pipeline strip, and Unbox photo peek. Unit confirmation mounts unit station identity and scan milestones. Carton confirmation mounts receiving identity + carton pipeline (+ order pipeline if linked). SKU / repair / FBA are thinner stack loaders.

Station panes (`EntityStationPane` / `SearchOrderStationPane`) are **forbidden** on FIND files and must not return. Displays index leaves (Photos, Status info, Timeline, Units, Ticket, Support, Warranty) are Unbox/Pack-shaped **workplace KNOW**.

### 3.4 Left rail

`/search` has **no** context panel. Recents duplicated ⌘K. **Warehouse recents are not the missing rail.** The missing rail (if any) is an **investigation outline** derived from the open record’s stream — and on phone it **is** the column, not a second tree.

### 3.5 Mobile

Registered `/m` prefixes include Pick, Work, Pack, Unbox, Receive, … **No `/m/search`.** Phone FIND is incomplete.

---

## 4. Constraints the recommendation must satisfy

1. **No new entity pages.** One frame; entity adapters map APIs → **events**, not → chrome forks.
2. **Timeline is the only shaper of display methods.** Identification (serial vs order vs tracking) is content. Station name is a hop caption.
3. **Quantities** are a display method when qty events exist (have / should), not a receiving-typed qty rail.
4. **One column is SoT.** Desktop: phone-width column + gutters (or compact recents). Scan preview **embeds this column**.
5. **Handoff owns writes.** FIND may copy and deep-link; it does not assign staff, unbox, or pack.
6. **Do not restore recents as the search left rail.**
7. **Do not** recommend hunt-tile filter strips (table funnel is a different surface).

---

## 5. Candidate display methods (hypotheses — confirm or replace with industry names)

| Kind (time) | Operator question | Must not be |
|---|---|---|
| **Now / status pin** | Where is this right now? | A station stepper stolen from Pack |
| **Qty ledger** | Counts: ordered / received / packed / shipped as last-written | Unbox qty rail |
| **Hop** | Who, where, when | A different layout per station |
| **Evidence** | Photos at T | Unbox photo peek as page chrome |
| **Exception** | What’s blocking? | A writable exceptions desk |
| **Bind** | SKU / serial / tracking attached at T | Identity chrome fork |
| **Carrier hop** | Tracking movement | A second pipeline widget |
| **Note** | What did staff say? | A composer that writes from FIND |

**Overview** = status pin + identity line + now-qty + outline of kinds that have counts. Default “left” selection on a large screen and the top of the phone stack.

Ask: is this catalog **too large** or **missing a kind** that 2026 investigation UIs always have?

---

## 6. Dogfood — organization #1 (check live)

**Org UUID:** `00000000-0000-0000-0000-000000000001` (dogfood / org 1). Sign in as that tenant. Local: attach the running app (typically `:3050`).

**How:** paste the **left** token into ⌘K (or header find), **or** open the URL. Sole identifier hits should set `?sel=` in-page.

Queried live **2026-09-11** against org 1. Prefer **fresh** rows; **legacy** still resolves (regression vs 2026-08-30 SoT notes).

### 6.1 Fresh

**Orders**

| Paste | Opens |
|---|---|
| `5034` | `/search?sel=order:13928` |
| `15-15130-87157` | `/search?sel=order:13927` |
| `09-15129-79463` | `/search?sel=order:13926` |
| `113-1397006-0292212` | `/search?sel=order:13924` |
| `111-5953611-3366663` | `/search?sel=order:13923` |

**Tracking** (must resolve to an order confirmation, not a new entity type)

| Paste |
|---|
| `9405508106244533289572` |
| `9434608106244532552423` |
| `9434608106245555565636` |

**Serial units**

| Paste | Opens |
|---|---|
| `078338982650888AE` | `/search?sel=unit:2562` |
| `037755982600190AC` | `/search?sel=unit:2561` |
| `033975C52715021AC` | `/search?sel=unit:2560` |
| `070213972550843AE` | `/search?sel=unit:2559` |

**SKU** (skip `CF-PACK-PRINT-E2E` — harness)

| Paste | Opens |
|---|---|
| `01091-BK` | `/search?sel=sku:2486` |
| `00279-CW` | `/search?sel=sku:2467` |
| `00006-P-1` | `/search?sel=sku:2446` |

**Carton / repair / FBA**

| Paste | Opens |
|---|---|
| `R-52695` | `/search?sel=receiving:52695` |
| `R-52694` | `/search?sel=receiving:52694` |
| `REP-4780` | `/search?sel=repair:4780` |
| | `/search?sel=fba:75` |

### 6.2 Legacy (still in org 1)

| Paste | Opens |
|---|---|
| `112-4984499-1990656` | `/search?sel=order:12941` |
| `111-2562571-1045803` | `/search?sel=order:12940` |
| `5008` | `/search?sel=order:12937` |
| `024644912010195BC` | `/search?sel=unit:2451` |
| `024644923230171BC` | `/search?sel=unit:2449` |
| `070213922071007AE` | `/search?sel=unit:2447` |

### 6.3 Live walk — score these, do not invent a page

On **one** Amazon order (`113-1397006-0292212`), **one** serial (`078338982650888AE`), **one** carton (`R-52695`), **one** SKU (`01091-BK`):

1. Is **status** the first pinned band?
2. Does chrome **change shape** in a way a phone cannot share?
3. Can you triage **qty / serial / location** without opening Unbox or To-ship?
4. Is the handoff the **only** write path?
5. Would this stack embed in a scan preview **without** a Displays index?

If (3) is no, that is the outline + qty/hop/evidence gap — not a reason to port a station.

---

## 7. Acceptance checklist (for the research conclusion)

Each principle: name · one-sentence rule · who ships it in industry · how Cycle Forge FIND fails or partially meets it · **verify on the org-1 URLs in §6**.

Must include a ruling on:

- Whether desktop “left rail” **is** the phone column (recommended hypothesis) or a true second pane.
- Whether Overview is a **filter on the stream** or a separate page (it must not be a separate page).
- Whether Shopify-style event faces are enough, or investigation products require a **kind outline** with counts.
- Explicit **refuse** list: station Displays leaves, recents rail, EntityStationPane preview, per-entity layout forks.

---

## 8. Out of scope

Slot-table engine, DataTableFilterMenu, overlay z-index, Operator verdict ledgers, Lighthouse floors. FIND must not pick up their chrome to look complete.
