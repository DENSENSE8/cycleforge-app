# Research briefing — Unbox listing↔bench photo Compare: display modality + media pipeline

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** For a dense B2B **warehouse / fulfillment / recommerce ops SaaS**, what is the **2024–2026 industry-standard** way to present a **listing-vs-physical photo compare** job at a **scan / unbox bench** — and what media pipeline do mature systems use to get marketplace listing images onto that surface, capture bench evidence beside them, and surface **difference** (human glance and/or assisted)?
**Status:** ANSWERED 2026-08-09 — winner **D4 centre stage (1×2 hero) + M3 durable gallery / M2 Pull cold-start**; hard-ban D5/D6; no auto-open; dock-only capture. Execution plan: [`unbox-centre-stage-listing-compare-PLAN.md`](./unbox-centre-stage-listing-compare-PLAN.md).
**Primary surface (empirical, not law):** Receiving **Unbox** station — centre = PO lines + label; bottom dock = capture CTA; right = Displays push column. Photos → Compare currently mounts a thin leaf inside that column.

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** (named products, WMS/RF/returns practice, marketplace seller tools, visual-QA / DAM patterns, citable UX and logistics research). Close gaps against those standards. **Do not** invent, cite, defend, or reconcile against this product’s internal design constitution, region contracts, “source of truth” files, AGENTS rules, Kinetic Ledger slogans, or house naming systems. Treat §2 measured facts as **empirical current state an engineer verified in source on 2026-08-09** — not as rules to preserve. Your output will be used **to decide whether Compare stays a Displays drill, becomes a second push, a centre stage, a new route/tab, or something else** — and whether listing images must be **fetched/cached** before compare is honest.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** How do mature recommerce / ITAD / returns / marketplace-seller / pack-QA / visual-inspection products present **“listing (or reference) photo vs what’s in my hand”** during inbound unbox or grading? Name products. Cite primary sources. State the **dominant presentation pattern** and when minority patterns win.
2. **Display-modality scorecard for THIS job.** Score the candidates in §0.3 for a **wedge-scanner desk (~1080p, ~720px locked work middle, right tool column)** where capture lives in a bottom dock and the operator’s eyes must leave the item as little as possible.
3. **Media pipeline survey.** How do systems obtain marketplace/listing images for compare?
   - Hotlink vs download-and-cache vs operator-uploaded reference pack
   - Legal / ToS / hotlink breakage / CORS / EXIF stripping
   - When “temporarily download listing images” is required vs when a durable SKU gallery already exists
   - Retention: ephemeral session cache vs durable evidence asset
4. **Difference / contrast UX.** What do industry tools actually show for “listing vs bench”?
   - Side-by-side thumbs (human glance)
   - Sync-pan / wipe / onion-skin
   - Checklist of required angles (front / back / ports / serial plate)
   - Automated similarity / damage callouts (and when that is theatre)
   Pick a default for **small multi-tenant reseller SaaS**, not a dedicated machine-vision line.
5. **Decision pack (industry language only).** Exact recommendation:
   - **One winning display modality** (+ when to switch)
   - **One winning media pipeline** for listing images (+ when to download)
   - **One winning difference affordance** for v1 vs v2
   - Acceptance criteria an engineer can verify on an Unbox carton walk
   - Deletion-ordered backlog (what to kill if the current leaf is wrong)

### 0.2 What this brief is NOT

- Not a redesign of the whole Unbox station or Media library browse UX.
- Not whether Photos Actions should use armed rows vs tabs (settled adjacent).
- Not carrier-claim evidence policy in full (see related brief) — only what Compare needs to *support* glance + capture.
- Not RF gun hardware procurement.
- Not “AI will magically detect damage” without citing shipped products and failure modes.
- Not reconciliation against internal house law (that is the *consumer* of your answer).

### 0.3 Candidate display modalities (score all)

| ID | Candidate | One-line |
|---|---|---|
| **D1** | **Leaf inside existing right Displays push** | Compare is a drill under Photos (current shape): index → Photos → Compare |
| **D2** | **Sibling Displays leaf (top-level topic)** | Compare is its own Displays row (not nested under Photos Actions) |
| **D3** | **Second right-edge push / overlay beside Displays** | A temporary “compare pushover” that can sit with or displace Displays |
| **D4** | **Centre stage (replace or split the middle work plane)** | Listing \| bench takes the locked ~720 middle while dock keeps capture |
| **D5** | **Full-route / new browser tab / Media library deep link** | Navigate away to `/ops/photos` or a dedicated compare route |
| **D6** | **Floating lightbox / modal over the station** | Fullscreen or large modal; station chrome dimmed underneath |
| **D7** | **Dual-monitor / pop-out window** | Dedicated second window for listing reference (operator places on second screen) |

Score 1–5 on each axis; report a table. No eighth axis.

| Axis | Meaning |
|---|---|
| **Eyes-on-item** | Operator can shoot / grade without losing the physical unit’s orientation |
| **Reference glance speed** | Time from “I need listing” → useful pixels on screen |
| **Capture co-location** | Dock / wedge / phone-capture still works without dismissing Compare |
| **Cognitive mode clarity** | Clear that this is *reference*, not a second capture surface or a desk inspector |
| **Sellable density** | Survives ~1080p + 720 middle + Displays invader; not marketing whitespace |
| **Evolution cost** | Cost to evolve Photos verbs / Media library / Compare independently |

**ROI ≈ (Eyes-on-item × Glance speed × Capture co-location × Mode clarity × Sellable density) / (6 − Evolution cost).** Rank D1–D7 descending. State winner, runner-up win conditions, and **hard bans** (modalities that fail this job even if pretty).

### 0.4 Candidate media pipelines (score all)

| ID | Pipeline | One-line |
|---|---|---|
| **M1** | **Hotlink marketplace CDN URLs** | `<img src=ebay/amazon…>` at compare time |
| **M2** | **Session fetch → blob/object-URL cache** | Download on Compare open; discard when carton closes |
| **M3** | **Durable SKU / listing gallery ingest** | Background or on-link job copies listing images into tenant object storage; Compare reads gallery |
| **M4** | **Operator-curated reference pack** | Human picks/uploads “gold” listing shots once; Compare uses that pack only |
| **M5** | **Live scrape at Compare open** | Server fetches listing HTML/API on demand, extracts images, then M2 or M3 |
| **M6** | **No listing images — URL only** | Compare shows “Open listing” external link; bench grid only |

Score 1–5 on: **Dispute honesty** · **Operator seconds** · **ToS/legal risk** · **Breakage resilience** · **Storage/CU cost** · **Cold-start (no gallery yet)**. Rank M1–M6. Call out when M2 (“temporarily download”) is the *right* v1 vs when M3 is table-stakes.

### 0.5 Sources to cover (minimum)

| Class | Named examples (start here; expand with 2024–2026) | Use for |
|---|---|---|
| **Recommerce / ITAD inbound** | Decluttr / Gazelle-class intake UX writeups; Back Market seller tools; ITAD grade benches | Listing vs unit visual check |
| **Marketplace seller photo tools** | eBay seller hub photo requirements; Amazon seller listing images; Shopify product media | What “listing gallery” means operationally |
| **Returns / SNAD inspection** | Happy Returns / Narvar / Loop returns inspection; carrier claim photo guidance | What angles matter beside a reference |
| **Visual QA / machine vision** | Cognex / Keyence bench inspection UIs; modern “golden sample” compare in manufacturing MES | Side-by-side + difference patterns — and when overkill |
| **Photo / DAM compare UX** | Lightroom / Capture One reference view; Frame.io compare; Bynder / Cloudinary asset compare; Google Photos face-group (as anti-pattern for this job) | Pane layouts, wipe, sync zoom |
| **WMS / pack QA** | ShipStation / ShipHero / Extensiv pack verification; SAP EWM / Manhattan RF “picture of SKU” prompts where public | Reference image beside scan prompt |
| **Legal / CDN** | Marketplace image ToS, hotlink policies, DMCA / licensed asset norms for seller tools that cache listing images | Whether M1/M2/M5 are even allowed |
| **UX research** | Nielsen Norman (comparison tables, split views, progressive disclosure); WCAG for image comparison; mode-error literature | Principles |

Where industry splits, give **both** positions, conditions each wins under, then pick a default for **this** shape (§1).

### 0.6 Related briefs in this repo (cite, do not redo)

These exist in `docs/todo/`. Use them only to avoid re-answering settled *adjacent* questions. **Ignore any house-law sections inside them.**

| Brief | Already owns (industry angle) |
|---|---|
| `photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md` | Dispute evidence stages / what wins claims — you may **narrow** to Compare’s role, not restart claim law |
| `media-library-ux-GEMINI-RESEARCH-BRIEFING.md` | DAM browse / facet rail — not bench Compare |
| `mobile-unbox-photo-flow-GEMINI-RESEARCH-BRIEFING.md` | Phone capture handshake |
| `scan-vs-desk-right-rail-separation-GEMINI-RESEARCH-BRIEFING.md` | Scan tool column vs desk inspector hosts |
| `unbox-dock-listing-compare-LANE1-HANDOFF.md` | Empirical landing notes for current Compare leaf (facts only) |
| `unbox-photos-armed-rows-no-tabs-HANDOFF.md` | Photos Actions rows vs URL drills (IA of Photos leaf) |

Your unique job: **where Compare lives on the station + how listing pixels get there + what “difference” means for v1.**

---

## 1. Product context (facts only — not design law)

**Cycle Forge** is multi-tenant **reseller-operations SaaS** (used-goods / electronics refurb is the first dogfood tenant). Frame recommendations as **sellable B2B warehouse/fulfillment software**, not a five-person shop tool.

**Unbox job (one carton):**

1. Operator opens a carton at a desk with a **wedge scanner** and (often) a phone for capture.
2. Procedure beats include carton photos, contents check, **serial → condition → item photos**.
3. For matched PO lines, the line may already know a **listing URL** and/or a **SKU catalog id** with a curated **listing photo gallery** (tenant-owned ordered set).
4. During **item photos**, the operator needs to see **what the marketplace listing looks like** next to **what they just shot on the bench**, so they can decide: match / need another angle / flag condition / send to claim later.

Capture must stay fast. Eyes should not leave the unit longer than a glance. A second browser tab that steals focus from the wedge is a known failure mode in this class of product.

---

## 2. Empirical current state (verified in source 2026-08-09)

Treat as observation, not endorsement.

### 2.1 Navigation / shell

| Fact | Where |
|---|---|
| Photos Displays default = armed verb list (View · Phone · Upload · Download · Media · Move · Send · Compare · Details) | `PhotosActionsArmedList.tsx` |
| Compare is a URL drill `?photoAction=compare`, not a nested underline tab | `PhotosDisplayHost.tsx` · `unbox-side-tabs.ts` |
| Body = `ListingPhotoCompareHost` | same |
| On procedure step `item_photos`, station auto-opens Displays → Photos → Compare | `LineEditPanel.tsx` (`openDisplays('photos', { photoAction: 'compare' })`) |
| Auto-open yields Ticket and Move/Send drills | same |
| Capture stays in the bottom dock (`ItemPhotoDockControl`); Compare copy says so | `ListingPhotoCompareHost.tsx` |
| Back / Esc pops Compare → Photos Actions → Displays index | `PhotosDisplayHost` + `useDisplaysLeafChrome` |
| Media library verb now same-tab `router.push` to `/ops/photos?…` (not `_blank`) | `PhotosActionsArmedList.tsx` |

### 2.2 What Compare paints today

Two stacked sections in the right Displays leaf (~leftover width beside a locked ~720 middle):

1. **Listing** — thumbs from `useListingGallery({ kind: 'sku', id: sku_catalog_id })` via `/api/photos/listing-gallery`. If no SKU gallery: honest empty; optional **Open listing** (`window.open` listing URL).
2. **Bench evidence** — union of `unbox_item` (line) + `unbox_carton` (carton) receiving photos.

No wipe, no sync zoom, no angle checklist, no automated diff, no “download marketplace images now” path. Listing pixels only exist if the **tenant listing gallery** already has them (or the operator leaves to the external listing).

### 2.3 Media reality the team is worried about

Engineer’s hypothesis to validate or kill:

> “To do a real compare I must **temporarily download listing images from the marketplace listing**, show them beside an **immediate bench capture**, and somehow show **difference**.”

Today that hypothesis is **not implemented**. Compare reads an already-ingested SKU gallery. Cold start (listing URL present, gallery empty) degrades to external link.

### 2.4 Layout constraints observed

- Station middle locks ~720px; Displays is a flex invader filling leftover.
- A second full-width right column (AI + detail) is already treated as a product failure mode elsewhere in the app.
- Wedge focus must not be stolen when the rail opens/swaps.

---

## 3. Forced product questions (answer each with one pick + 2–4 sentence defense)

**Q1 — Display home.** For listing↔bench Compare during item photos, the default is:  
**(D1)** Photos drill · **(D2)** top-level Displays topic · **(D3)** second pushover · **(D4)** centre stage · **(D5)** full route/tab · **(D6)** modal · **(D7)** pop-out.  
Pick one. Name the one modality that is a hard ban for wedge desks.

**Q2 — When Compare auto-opens.** On entering the item-photos beat:  
**(A)** auto-open Compare (current) · **(B)** open Photos Actions only · **(C)** open nothing until operator asks · **(D)** open a thinner “listing strip” without full Compare.  
Pick one.

**Q3 — Listing image source for v1.**  
**(M1)** hotlink · **(M2)** session download cache · **(M3)** durable gallery ingest · **(M4)** operator-curated pack only · **(M5)** live scrape on open · **(M6)** URL-only.  
Pick one primary + one fallback when primary is empty.

**Q4 — Difference affordance for v1.**  
**(A)** two thumb grids (human glance only) · **(B)** fixed 1×2 hero (listing cover \| latest bench) · **(C)** sync-pan / wipe · **(D)** required-angle checklist with slots · **(E)** automated similarity score.  
Pick one for v1; optionally one for v2.

**Q5 — Capture relationship.** While Compare is visible:  
**(A)** dock-only capture (current) · **(B)** Compare hosts a “shoot next angle” CTA that still writes through dock/upload SoT · **(C)** phone-pair only · **(D)** Compare dismisses for each shot.  
Pick one.

**Q6 — Cold start (listing URL, no SKU gallery).**  
**(A)** block item-photos until gallery exists · **(B)** one-shot “Pull listing images” button (M2/M5) · **(C)** external Open listing only · **(D)** skip Compare entirely until gallery filled offline.  
Pick one.

**Q7 — Blast radius.** Does the winning pattern apply only to Unbox item-photos, or also to Testing / Returns / claim-file photo attach? Name the blast radius.

---

## 4. Decision criteria (use these; do not invent softer ones)

A recommendation fails if it:

1. Steals wedge focus or forces a new browser tab for the steady-state beat.
2. Makes the operator upload listing screenshots by hand as the *happy path*.
3. Treats hotlinked marketplace CDN URLs as durable dispute evidence without saying so.
4. Adds a second capture surface that races the dock.
5. Requires dual full-width right columns (Compare + unrelated detail) as the default.
6. Proposes automated damage AI as v1 without citing a shipped recommerce product and its false-positive cost.

A recommendation wins if it:

1. Keeps listing reference within one glance of the unit + dock.
2. Makes cold-start (no gallery) an explicit, timed action — not a silent empty grid.
3. Separates **reference pixels** (may be ephemeral) from **bench evidence** (durable, staged).
4. Names a deletion: what current UI goes away if D4/D2/etc. wins.

---

## 5. Paste-ready output shape (return exactly these sections)

```markdown
## A. Industry survey (listing↔bench compare)
(dominant pattern + named products + citations)

## B. Modality ranking (D1–D7)
(table + winner + runner-up win conditions + hard bans)

## C. Media pipeline ranking (M1–M6)
(table + winner + when temporary download is justified + legal notes)

## D. Difference UX (v1 / v2)
(what to show; what not to build yet)

## E. Answers to Q1–Q7
(one pick each + short defense)

## F. Acceptance criteria
(checklist for an Unbox carton walk on a 1080p desk)

## G. Deletion-ordered backlog
(what to remove or stop investing in if the winner is not D1)

## H. Open risks
(ToS, CDN breakage, PII in listing shots, CU/storage, phone-capture race)
```

---

## 6. Engineer’s gut (optional — argue for or against; do not treat as constraint)

1. **D1 (current leaf) feels underpowered** for true contrast — stacked thumb grids in a narrow invader may be glanceable but not “compare.”
2. **D5 (new tab / Media library)** is already disliked for Photos → Media; likely wrong for the steady beat.
3. **D4 (centre stage)** might be the honest home if Compare is the *job* of the item-photos beat — dock stays, middle becomes listing \| bench.
4. **M2 temporary download** matches the user’s instinct for cold start; **M3 durable gallery** matches dispute honesty if listing pixels must survive the carton.
5. Automated diff (E) is suspected theatre at this scale; human 1×2 hero (B) may beat two equal grids (A).

Challenge these explicitly.

---

## 7. Repo pointers (open if useful; do not trust names alone)

| Path | Why |
|---|---|
| `src/components/receiving/workspace/line-edit/ListingPhotoCompareHost.tsx` | Current Compare body |
| `src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx` | Photos leaf / drill shell |
| `src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx` | Compare armed verb |
| `src/components/receiving/workspace/LineEditPanel.tsx` | `item_photos` → auto-open Compare |
| `src/hooks/useListingGallery.ts` | SKU/unit listing gallery client |
| `src/lib/photos/listing-photos.ts` | Gallery invariants / DB |
| `src/components/photos/ListingPhotoGallery.tsx` | Desk gallery editor (not bench) |
| `docs/todo/unbox-dock-listing-compare-LANE1-HANDOFF.md` | Landing notes |
| `docs/todo/photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md` | Adjacent dispute evidence brief |

---

**End of briefing.** Prefer cited industry practice over inventing a third rail grammar. If the honest answer is “centre stage + durable gallery ingest, Displays Compare is a stub,” say that plainly and name what to delete.

---

## Appendix — Gemini answer (2026-08-09) summary

Locked into [`unbox-centre-stage-listing-compare-PLAN.md`](./unbox-centre-stage-listing-compare-PLAN.md):

- **D4** centre-stage 1×2 (listing cover \| latest bench); **D1** Displays leaf = failure mode for throughput.
- **M3** primary ingest; **M2** operator Pull for cold-start; **M1** hotlink banned.
- Auto-open **off**; dock-only capture; v1 = hero only; v2 = angle checklist (later).
- Delete `ListingPhotoCompareHost` / `photoAction=compare` after centre stage lands.
