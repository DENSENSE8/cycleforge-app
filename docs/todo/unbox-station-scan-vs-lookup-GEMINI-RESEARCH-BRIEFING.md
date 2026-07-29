# Research briefing — the Unbox station: scan-as-verb vs scan-as-lookup, and what the top bar is for

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Subject surface:** `/unbox` — the receiving "Unbox" mode. Internally regarded as the strongest page in the product; this brief exists to decide what to *keep* and what to *change*, not to rescue it.

**Deliverable:** (a) a benchmark of this surface's interaction model against named 2026-era industry systems and standards; (b) a defended verdict on **seven specific decisions** (§10), each of which has a stated current behavior and a stated proposed change; (c) an answer to the open questions in §11 that is implementable, not a framework.

---

## 0. How to use this brief

You do **not** have the codebase. Every behavior described below was read out of the source today. Where something is inferred rather than directly asserted by the code, it is labeled **(inferred — verify)**.

Three separate deliverables, kept separate:

1. **What is industry standard (2026)?** For scanner-driven warehouse/receiving stations and for the "find a past record" path that sits beside them. Name real systems and standards (WMS/WES vendors, GS1, HIG/design-system guidance, published operator-UX research). State the conditions under which each pattern wins. Do not retreat into "it depends."
2. **Take a side on each of the seven decisions in §10.** A defended "no, keep it as is, here's why the proposed change is worse" is more valuable to us than a hedge. Each decision already names our current position and the strongest counter-argument we can construct against ourselves — attack both.
3. **Answer §11's open questions** with sources.

The reader is the engineer who will implement the answer. Prefer a concrete migration order and named trade-offs over a decision framework.

---

## 1. Product and the house region vocabulary

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers. Electronics refurb/resale is the dogfood tenant. One warehouse, a small crew, mixed roles — the same person may unbox inbound cartons in the morning and pack outbound orders in the afternoon. Vendor systems (an inventory ERP, a helpdesk) are tenant connectors behind capability facades, never the product itself.

Every UI **region** (not page) is classified into exactly one of four contracts. This is house law enforced in code (`pickArchetype()`), not aspiration:

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | barcode scanner / keyboard wedge | act-and-clear | **ephemeral**, never in the URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | **durable, URL-addressable** | `ops` |
| **Monitor** | filters over a stream | observe only, zero edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a *definition* (draft→publish) | durable focus in URL | `studio` |

The house rule that matters most here: **"a page may host several contracts, but each region obeys exactly one; never blend two in one region."** The stated anti-pattern is *"don't put a browsable list in a Station"* and, conversely, *"don't bolt edit affordances onto a pure Monitor."*

**The whole point of this brief is that `/unbox` currently blends Station and Workbench in a way we are no longer sure is a violation or a virtue.** It has a scanner-driven act-and-clear left rail *and* a durable, URL-addressable, three-tab browse workbench in the right pane, and a single scan can drive both.

---

## 2. The Unbox surface — measured anatomy

`/unbox` is a first-class route (`src/app/unbox/page.tsx`). Legacy `/receiving` and `/receiving?mode=receive` alias to it. The whole receiving family (`src/components/receiving` + `src/components/sidebar/receiving` + `src/lib/receiving`) is **~75,200 LOC**; the Unbox-specific shell is ~2,400 LOC across seven files, on top of shared station/workbench primitives.

Desktop layout is a two-column `RouteShell`:

```
┌─ SIDEBAR (Station region) ────────┬─ RIGHT PANE (Workbench region) ─────────────────┐
│ [scan bar — autofocus, hotkey]    │  ┌ browse workbench (always mounted) ─────────┐ │
│   armed-mode rail: Ticket|Trk|PO  │  │ tabs: Queue · Viewed · History              │ │
│                                   │  │ [ToolbarSearchToggle] [staff] [filter ⚙]   │ │
│ [returns banner]                  │  │ KPI strip (3 tiles, attention-sorted)      │ │
│ [multi-match picker, conditional] │  │ ReceivingLinesTable (LedgerGrid, day bands) │ │
│                                   │  └────────────────────────────────────────────┘ │
│ ── "Unboxed · N" rail ──          │  ┌ focused carton overlay (crossfades OVER) ──┐ │
│  ● carton row  (hover popover)    │  │ StationContextBar (identity bookmark)      │ │
│  ● carton row                     │  │ SectionTabsSlider: Unbox·Listings·Ticket·  │ │
│  ● …up to 50, first-open order    │  │   Units·(…): Checklist·Support·Tracking·   │ │
│                                   │  │   Timeline·Classify·PO-note                │ │
│ [pencil → bulk dismiss bar]       │  │ [scroll body per tab]                      │ │
│                                   │  │ [dock: notes composer + Print/Receive CTA] │ │
└───────────────────────────────────┴──┴────────────────────────────────────────────┴─┘
```

**The sidebar is the Station region.** Scan bar auto-focuses, registers itself as the global focus-hotkey target, and clears+refocuses after each submit. The rail below it is `view=unbox_opened` — every carton this org has opened on the Unbox surface, newest-first-open first, server-ordered (the client is forbidden from re-sorting it), capped at 50.

**The right pane is the Workbench region**, and it is *browse-first*: landing on `/unbox` with no selection shows the table, not an auto-opened carton. Selection is durable and URL-addressable via `?openReceivingId=<cartonId>&lineId=<lineId>`.

**The focused carton overlay crossfades over the browse table**, which stays mounted (`visibility: hidden`, `inert`) so its react-query cache and scroll survive.

The carton editor (`LineEditPanel`, 616 LOC of pure composition over a controller hook) composes the house **Station Workbench** SoT: `StationContextBar` identity bookmark → `SectionTabsSlider` → per-tab scroll body → terminal dock. On the Unbox overview tab, the dock is a single elevated shell: a chat-style notes composer with the split **Print / Receive** CTA riding in its footer — deliberately *one* shell, never composer + a second CTA row.

Tab inventory (visibility-gated; `priority: 'primary'` shows on the strip, `'overflow'` hides under ⋯):

| id | label | gate | priority |
|---|---|---|---|
| `overview` | Unbox | always | primary |
| `classify` | Classify | always | **primary iff carton is unfound**, else overflow |
| `listings` | Listings | matched cartons only | primary |
| `ticket` | Ticket | always | primary |
| `units` | Units | ≥1 serial on the line | primary |
| `po-note` | *(inventory-system note)* | matched + has carton | primary |
| `checklist` | Checklist | always | overflow |
| `support` | Support | always | overflow |
| `tracking` | Tracking | not a local-pickup fulfillment | overflow |
| `timeline` | Timeline | has tracking OR units OR carton | overflow |

Each tab id maps to a **terminal action** through a registry (`resolveUnboxTerminal(tabId)`) so the primary CTA in the dock is tab-aware: on `overview` it is Print/Receive; on `checklist` it is Check-all/Uncheck-all; on `units` it is Add serial; on `ticket` it is Reply; and so on. There is exactly one primary action visible at a time.

---

## 3. The scan pipeline, in full

This is the heart of the brief. One function (`submitTrackingScan`) is the single entry point for every scanned value on this surface. It is invoked by the desktop scan bar, by a paired phone over a realtime channel, and by the mode-armed variants.

### 3a. Intent classification before resolution

The scan bar has three **armable modes** — `Ticket #`, `Tracking #`, `PO #` — shown as an icon rail inside the input. Arming is sticky-per-scan-only-by-intent: clicking a mode forces the next scan to that route; clicking again returns to auto.

When **un-armed** (the default), the submitted mode is `'auto'`, and the server deep-scans the value as ticket# → PO# → tracking# before creating anything. The leading icon still changes as you type (`classifyUnboxScan`: looks-like-a-ticket → ticket; contains a dash → PO; else tracking) but that is explicitly **display-only** and does not decide resolution. A code comment records why: the dash heuristic used to *route* the scan, and it misrouted real PO numbers into the "Unfound" flow, creating phantom cartons.

### 3b. The six resolution rungs

Each rung short-circuits on a hit; otherwise the value falls through:

| # | Rung | Network | What it resolves |
|---|---|---|---|
| 1 | **Internal code resolve** | 1 call | `R-`/`RCV-`/`H-`/`L-`/`U-`/`REP-` handles, printed unit ids, serial numbers → jump straight to the owning PO line. **Skipped** for a plain Unbox tracking scan (no dash, not a ticket shape) so rung 4 starts immediately. |
| 2 | **Phase-0 cache select** | **zero** | Flattens every cached `['receiving-lines-table']` feed (rail, queue, viewed, history) into one deduped row list; if the scanned value is an already-*materialized* carton sitting in any of them, open it straight from cache exactly as a rail-row click would. Expected-but-never-arrived rows are deliberately skipped so they still take the adopt path. |
| 3 | **Local-first tracking short-circuit** | 1 call | Resolves the tracking number against local lines without waiting on the full lookup. Can also *retarget* — rewrite the value/mode for rung 4. |
| 4 | **`POST /api/receiving/lookup-po`** | 1 call | 1,615-LOC handler. Local-DB only — **never a live vendor lookup on the scan path** (explicit speed-first decision). Resolves ticket links, the PO mirror, and shipment/tracking records. Returns `matched` \| `not_found` \| `integration-error` \| unmatched. |
| 5 | **Apply-matched** | 1 background call | Sets PO context, seeds the sibling-lines cache so the accordion paints on the first frame, then hydrates `include=serials` in the background on the *same* query key the accordion uses so the two dedupe into one round trip. |
| 6 | **Apply-unmatched** | 0–1 | Creates/opens an "unfound" carton and drops the operator straight into its workspace so they can add items immediately. Explicitly does **not** fire a live vendor search — that is operator-initiated later. |

### 3c. Optimistic paint at t=0

Before any of the above resolves, an Unbox scan already:

1. **paints a pending rail stub** keyed `scan:<tracking>` at the top of the Unboxed rail, showing the raw tracking number, and
2. **replaces the right pane** with an optimistic *unmatched, empty PO-items* workspace.

The stated design intent: the empty pane **is** the loading state. There is no skeleton and no spinner on the Unbox scan path — a comment records that a prior "importing" stub caused a visible `tracking# → Unfound PO` flicker, and a separate skeleton was removed for the same reason. (Triage, the sibling mode, *does* still use a surface-tagged skeleton — the two modes never share a loading display.)

A 300 ms grace timer gates the skeleton takeover elsewhere; a scan that resolves from cache under that threshold never flashes a loader at all.

### 3d. Feedback, focus, idempotency

- **Audio/haptic** fires exactly once per scan on every terminal path: a clean PO match plays *success*; unmatched, not-found, integration-error, and network error all play *reject*. Silent by default — gated on an org master switch plus a per-staff toggle.
- **Refocus** after resolve is preference-gated: Unbox arms the *serial* field (60 ms defer); Triage returns focus to the *tracking* bar.
- **The paired phone's camera** is nudged open for the carton (preference-gated), including on the unmatched path — an unfound carton still needs unboxing photos.
- **A scan-generation counter** guards against cross-mode leaks: every scan captures a generation at submit; any `receiving-clear-line` (mode switch, view switch, workspace close) bumps it. A scan that resolves *after* the operator has moved on still refreshes every feed — so the carton lands in the Queue — but is forbidden from seizing the now-current view.

### 3e. The single client chokepoint

Every Unbox open path funnels through one function, `applyUnboxCartonOpened`, specifically so the side effects cannot drift per rung. It does four things:

1. drop the pre-resolve `scan:<tracking>` pending stub;
2. upsert the carton onto the Unboxed rail under its durable `carton:<id>` key;
3. **purge the triage rails** so the arrival dock never keeps phantom inventory;
4. optionally fire `POST /api/receiving/touch-scan` (client short-circuit rungs only; the lookup path already stamped server-side and must not double-post).

---

## 4. What a scan **mutates** — the crux of this brief

This is the fact the rest of the brief turns on. **On this surface, a scan is a write.** Scanning a tracking number — including one that was received and unboxed weeks ago — currently performs, in order:

| Effect | Durable? | Idempotent? |
|---|---|---|
| Appends a row to the receiving-scans log, attributed to the signed-in operator | **yes, append-only** | **no** — each scan is a new row |
| Stamps `receiving_unbox.opened_at` / `opened_by` | yes | **yes** — `COALESCE`-once, a re-scan never moves it |
| Derives `intake_path = 'unbox_only'` when there was no prior door scan | yes | yes |
| Emits an `UNBOX_SCAN_OPENED` ops-spine event | yes, append-only | no |
| Upserts the carton onto **this operator's Unboxed rail** (top-of-list) | client cache + snapshot | order is preserved by first-open, so it does not reshuffle |
| **Purges the carton from every triage/arrival rail, org-wide** | client cache | yes |
| On first open only, publishes a realtime `receiving-log-changed` so *other terminals* refetch | — | first-open only, deliberately |
| Opens the carton's editor and takes over the right pane | ephemeral | — |
| Nudges the paired phone's camera open for that carton | ephemeral | — |
| Marks the line into the operator's server-backed "Viewed" recents | yes | yes (upsert bumps `viewed_at`) |

So: **an operator who scans a box to "see what happened to it" attributes a scan to themselves, fires an ops event, re-ranks their own work rail, and opens a camera on their phone.** No single one of these is destructive. Cumulatively they mean the scan log — which is also the actor-attribution and throughput spine — cannot distinguish "I did this work" from "I looked this up."

**This is the operator's complaint, and it is factually grounded.**

---

## 5. State model

### 5a. URL is the SoT for the Workbench half

| Param | Owner | Notes |
|---|---|---|
| `?unboxview=queue\|viewed` | workbench tabs | absent = `History` (the default tab; the `recent` id is kept for URL stability) |
| `?openReceivingId=` + `?lineId=` | focused carton | Unbox-surface only; a stale value that rides a mode switch is explicitly refused |
| `?rh_q=`, `?rh_field=`, `?rh_scope=` | History tab search | debounced 250 ms into the URL |
| `?sort=` | History day-band axis | `unboxed_newest` (default) \| `scanned_newest` |
| `?staff=` | staff filter | canonical; `?staffId=` survives as read-only legacy |
| `?search=` | Queue/Viewed filter | separate param from History's `rh_q` |

Selection is **not** ephemeral here, which is the Workbench contract, not the Station contract. A cold reload re-fetches the carton and reopens the overlay, holding a workspace skeleton so the browse feed never flashes first.

Nineteen mode-scoped params are stripped on every mode switch so a selection from mode A can never bleed into mode B.

### 5b. A 29-name `window` CustomEvent bus

The sidebar and right pane are separate React trees under `RouteShell` and communicate entirely through `window` events. Measured names in the receiving family:

```
receiving-active            receiving-arm-line          receiving-clear-line
receiving-disarm-line       receiving-entry-added       receiving-entry-deleted
receiving-focus-scan        receiving-highlight-line    receiving-label-printed
receiving-line-deleted      receiving-line-updated      receiving-navigate-table
receiving-open-details-overlay  receiving-open-pairing-add
receiving-package-updated   receiving-scan-in-flight    receiving-scan-resolved
receiving-select-line       receiving-serial-scanned    receiving-triage-refresh
receiving-workspace-close   receiving-workspace-nav-state
receiving-workspace-open    receiving-workspace-refresh-line
receiving-unbox-refresh     app-refresh-data            open-zoho-pane …
```

This is load-bearing, not incidental: the deep-link restore explicitly bypasses the bus for the *open* half because routing through `receiving-select-line` alone is a mount-order race — the sidebar listener lives in a Suspense-mounted sibling that can commit *after* the restore fetch resolves, silently dropping the one-shot event.

### 5c. Four cache layers on the read path

1. **Upstash rail snapshot** — org+viewer scoped, TTL 60 s, seeds the rail's *first paint* on a cold reload so the sidebar is never empty. Only the unfiltered view seeds/persists.
2. **React-query feed caches** under `['receiving-lines-table', …]`, one entry per feed/scope/staff/query.
3. **Spine-first two-phase table fetch** — a cheap `?phase=spine` query paints first (serial chips come from a `serial_projection` read-model that rides along in the list SELECT), then the authoritative `include=serials` fetch fires *after* the spine settles, never in parallel, on the *unchanged* query key so every existing invalidation keeps working.
4. **A per-staff dismissal set** applied as a *display* filter, deliberately **not** baked into the query key — baking it in meant the rail blanked to a skeleton and refetched whenever the async exclusion fetch resolved.

---

## 6. Motion — exact current behavior

House motion law: opacity + transform only, never layout; `mode="wait"`; `initial={false}`; stable keys (entity id, never array index); sub-300 ms ease-out for discrete swaps; everything routed through hooks so `prefers-reduced-motion` collapses to a pure opacity fade.

**The Unbox carton overlay uses a deliberately heavier preset than the house default:**

| | House workbench pane | **Unbox carton pane** |
|---|---|---|
| preset | `workbenchPane` (opacity + y:6/−6) | **`workbenchPaneSettle` (opacity ONLY)** |
| duration | 0.18 s | **0.30 s** |
| mode | `wait` | `wait` |

`mode="wait"` means exit completes *before* enter starts. So a carton→carton swap is **~0.6 s** with a visually empty canvas in between (the browse table underneath is `visibility: hidden`, so the operator sees the app background, not the list).

**The presence key is not the carton id.** It is:

```
scanDriven ? `scan-${client_event_id ?? tracking_number ?? id}`
           : `row-${receiving_id ?? id}`
```

Two consequences fall out of this, both read directly from the source:

- **A) The same carton crossfades when the entry route changes.** Scanning carton #482 gives key `scan-…`; then clicking that same carton's rail row gives key `row-482`. Same entity, full exit-then-enter.
- **B) There appears to be a mid-resolution remount on every scan.** The optimistic pane stub carries `client_event_id = "scan:<tracking>"` → key `scan-scan:<TRK>`. When the match applies, the matched stub row carries **no** `client_event_id` → key `scan-<TRK>`. The key changes, so the "empty pane upgrades in place to PO chrome" that the code comments describe as the intent would in fact be a full 0.6 s exit-then-enter. **(inferred from key derivation — needs in-browser verification before acting on it.)**

By contrast, **line→line within one carton is deliberately *not* animated**: `ReceivingLineWorkspace` carries no per-line key, with a comment recording that adding one re-mounted the whole workspace on every line click ("the re-rendering the whole page jank").

**There is already a ratified house exception for exactly this class of problem.** For a queue-processing inspector — one where the operator walks records with `j`/`k` — the rule says to register a *stable* occupant id and swap content in place with **no exit animation at all**, because a blank gap per step is the wrong cost for the core loop. The preconditions are stated: the panel must fully re-seed on record change, any dirty draft must be flushed for the outgoing record first, and navigating without editing must write nothing. **Whether Unbox carton→carton qualifies for that exception is decision D5 below.**

---

## 7. The browse half (the "did I already do this?" path today)

Three tabs, one mounted `LedgerGrid` table, one KPI strip:

| Tab | Data view | KPI tiles | Search |
|---|---|---|---|
| **Queue** | `view=scanned, sort=priority` — door-scanned cartons awaiting unbox. Badge = live server count. | total · priority count · oldest age (h) | `?search=` free-text filter |
| **Viewed** | `view=viewed` — this operator's own recently-opened lines, server-backed | total · viewed today · unfinished | `?search=` free-text filter |
| **History** *(default)* | `view=activity` — day-banded by `unboxed_at` or `scanned_at` | total · opened today · awaiting test · stuck | **`?rh_q=` + field selector + sort** |

The History search is the only *fielded* search on the surface. Fields: **All · PO # · Tracking # · SKU · Product · Serial #**. It is a filter over the fetched table view, expressed in the URL, debounced, with a hot-state filter popover carrying sort + field + "Clear filters".

The chrome control is a `ToolbarSearchToggle` — collapsed to a search glyph at rest, expanding on hover/focus/click. House law forbids an always-open search field in a workbench header search slot.

**Note the copy asymmetry**: on the History tab the placeholder is rewritten from "Search…" to "**Filter**…". The surface already tells the operator this is a filter over what is loaded, not a search over everything.

---

## 8. The lookup path that already exists (and is under-used)

There are two lookup surfaces above the station, and neither is where operators go:

### 8a. Global header search (⌘K)

Default-ON since 2026-07-06. Icon-rail at rest; expands to a combobox with `aria-activedescendant`, arrow-key traversal over flattened preview groups, recents dropdown, clipboard paste as a commit. A pasted identifier resolves and navigates with no preview flash.

### 8b. The hybrid retrieval engine underneath it

One cross-entity engine over an `entity_search_docs` table, kept fresh by DB triggers → an outbox → a cron worker. Arms, in order: **exact-identifier bypass → keyword (trigram GIN) → pgvector cosine → reciprocal-rank fusion.** Result shape is a typed `SearchHit` with per-entity deep links.

Crucially, **the plumbing to make a search result open exactly what a scan opens already exists**:

```
RECEIVING → /unbox?openReceivingId=<id>
```

A `RECEIVING` search hit lands on the *same* Unbox surface, opening the *same* carton overlay, via the *same* deep-link restore path a refresh uses. There is also a secondary "Journey Trace" handoff for a receiving hit, keyed on its tracking number.

There is even a **page-context boost**: the surface you searched *from* boosts (never hard-filters) the entity types you're likely targeting — `/unbox` and `/receiving` boost `RECEIVING`. So a search issued from the Unbox station already leans toward cartons.

**So the lookup path is built, wired, deep-linked, context-boosted — and operators still scan the box instead.** Explaining *why*, and what would change it, is a core ask of this brief (§11 Q3).

---

## 9. The operator's thesis (verbatim intent)

Paraphrased faithfully from the person who runs this warehouse and uses this page daily:

> The Unbox mode page is the best page in the product. Keep it. But keep this station page in mode **primarily and only for doing the task** — for completing the unboxing. The top bar should be for the **history display, just as a filter to see if the task was done**. And the **search bar should be empowered to be the display of all details**.
>
> The problem right now: when staff are looking something up, they **scan the tracking number** to look at the information. But scanning should only be for **doing the order itself** — not for looking up the history of a box that was already received and unboxed.

Decomposed into claims we want tested:

- **C1** — A station's scan input should be a *verb* (do the work on this item), never a *noun* (tell me about this item).
- **C2** — Verification ("was this done?") is a distinct job from lookup ("tell me everything") and from work ("do it"), and deserves its own affordance — the top-bar filter over the current view.
- **C3** — Full-detail lookup belongs to the search bar, at a scope above any one station.
- **C4** — Operators default to the scanner for lookup **because it is physically fastest**, not because they are confused — and any fix that ignores that ergonomic reality will fail.

C4 is our own addition and may be the most important thing to pressure-test.

---

## 10. The seven decisions — take a side on each

For each: **current behavior** (measured) → **proposed change** → **strongest case against the change** → **what we need from you**.

---

### D1 — Should a scan on the Unbox station ever perform a lookup?

**Current:** Yes, implicitly. A tracking scan of an already-unboxed carton resolves through rung 2 or 3, opens the carton editor, appends a scan-log row, fires an ops event, upserts the operator's rail, purges triage rails, and nudges a phone camera. There is no way to say "just show me."

**Proposed:** The scan input becomes strictly a work verb. Scanning a carton that is already past the unbox milestone does *not* re-open the work editor and does *not* append an attributed scan; it produces a read-only receipt ("Carton #482 · unboxed 12 days ago by Marcus · 4 units · 6 photos") with an explicit affordance to open the record if the operator really wants to.

**Case against:** This adds a decision the operator did not ask for, mid-flow, hands full. It also breaks the legitimate case where a carton *was* unboxed but has genuine remaining work (a missed serial, a late photo, a re-print). A hard read-only gate would make the fast path slower for a real work case in order to protect a log.

**We need:** Is "scan = mutation only" an actual standard in scanner-driven systems, or a design preference? What do real WMS/WES receiving stations do when a completed item is re-scanned? Is there an established third state between "do the work" and "refuse"?

---

### D2 — What should a re-scan of an already-completed carton actually do?

**Current:** Idempotent at the milestone level (`opened_at` is COALESCE-once and never moves; the rail does not reshuffle) but **not** idempotent at the log level (a new attributed scan row + a new ops event, every time).

**Candidate answers to rank:**
1. **Silent idempotent re-open** (today's behavior, minus the extra log row).
2. **"Already done" receipt** — a big card state, not a toast, with the completion facts and an explicit "Open anyway".
3. **Distinct log classification** — still log it, but as `LOOKUP_SCAN`, never as work, so attribution and throughput metrics stay clean.
4. **Refuse + redirect** — surface a message pointing at search.

**Case against #4, and partly #2:** the house Station rules say pass/fail must be *a big card state, not a corner toast*, and that a station must "degrade, not block". A refusal is a block.

**We need:** Ranked recommendation with sources. Specifically: is there prior art for **classifying scan intent in the log** rather than gating it in the UI? That option preserves the fast physical path *and* cleans the data, which is why we suspect it may be the right answer — attack that suspicion.

---

### D3 — Should the workbench top bar be repositioned as a *verification filter* rather than a browse surface?

**Current:** Three tabs (Queue · Viewed · History). History is the **default** tab. It has a fielded search (6 fields), a sort axis, day banding, and a KPI strip. It is a full browse workbench with its own filter popover — considerably more than "check whether the task was done."

**Proposed:** Demote History from default. Make the default tab **Queue** (the actual worklist). Reframe the top-bar search as a verification filter over the *current* view only, and push open-ended "find any carton ever" to the global search bar (D4).

**Case against:** The default tab was presumably chosen because operators land here between scans and want recent context; History is also the surface where day-banding and the "opened today / awaiting test / stuck" KPIs live, which *is* verification at a shift level. Demoting it may just relocate the same confusion. Also: the History placeholder already says "Filter", and operators still scan — so copy is evidently not the lever.

**We need:** For a scanner-driven station with an attached browse pane, what is the correct **default view** in 2026 practice — the worklist, or the recent-activity log? Cite real systems. Second: is a *fielded* search (PO/tracking/SKU/product/serial) the right shape for a verification filter, or does verification want a fundamentally different control (a status facet, a date window, a "my work today" toggle)?

---

### D4 — Should the global search bar become "the display of all details"?

**Current:** ⌘K global search exists, is default-on, has a hybrid retrieval engine (exact → trigram → vector → RRF), is page-context boosted toward `RECEIVING` when invoked from `/unbox`, and deep-links a receiving hit to `/unbox?openReceivingId=` — *the same overlay a scan opens*.

**Proposed:** Make the search result itself the detail display: a receiving hit expands to a rich, **read-only** carton record — timeline, units, photos, scans with actors, tracking events, linked ticket, PO lines — without ever mounting the work editor.

**The tension we cannot resolve internally:** if search opens the *same* editor a scan opens, we have solved nothing — we have just moved the identical mutation-shaped surface behind a different input. But if search opens a *different*, read-only detail view, we now maintain **two renderings of a carton**, which directly violates our own "never fork a page-local twin of the same job" law. The escape hatch our rules allow is that "a genuinely different job earns a new sibling that composes the shared primitive."

**We need:** Is "read view and work view are different surfaces over the same record" a recognized, defensible pattern (CQRS-shaped UI, read-model separation, inspector-vs-editor), or is it a known maintenance trap? Name systems that do it well and systems where it decayed. If it is defensible, what is the correct factoring so the two do not drift?

---

### D5 — The carton crossfade: keep the 0.3 s settle, or swap in place?

**Current:** `mode="wait"`, opacity-only, 0.30 s each way = **~0.6 s with an empty canvas between cartons**. Chosen deliberately over the 0.18 s house default as a "Receiving convention" for carton→carton swaps. Line→line inside a carton is already un-animated by design.

**Precedent already in-house:** a ratified exception for queue-processing inspectors — stable occupant id, swap in place, **no exit animation** — on the reasoning that arrowing through a queue is the core loop and a blank gap per step is the wrong cost. Its preconditions: full re-seed on record change, dirty-draft flush for the outgoing record *before* the swap, and no writes on navigate-without-edit.

**Proposed:** Adopt that exception for Unbox carton→carton. Additionally, key the presence on `receiving_id` alone so the *entry route* (scan vs rail-click) stops causing a spurious full crossfade of the same carton (§6 consequence A), and give the optimistic and matched stubs a shared identity so the mid-resolution remount disappears (§6 consequence B).

**Case against:** at scan cadence, an operator scans a *new physical box* every time — the entities are genuinely, physically different, and the crossfade is arguably doing exactly the job motion is for: signaling "this is now a different box, do not act on stale context." Removing it risks the worst error class in receiving — acting on the previous carton. The 0.3 s settle may be *intentional friction*, and the queue-inspector analogy may be false because that inspector walks a homogeneous list while this station swaps physical objects.

**We need:** A verdict, and the reasoning. Does the "different physical object" argument survive? Is there published evidence on transition duration vs. mis-attribution error rate in operator UIs? Note separately whether consequences A and B should be fixed regardless of the main verdict — we believe they are unambiguous bugs even if the 0.3 s settle stays.

---

### D6 — Armed scan modes (Ticket / Tracking / PO) vs pure auto

**Current:** Auto by default, with server-side deep-scan across all three namespaces before anything is created. Three armable modes force a namespace. The leading icon shows a live *display-only* guess as you type. A code comment records that when the guess actually *routed* the scan, it misrouted PO numbers into the unfound flow and created phantom cartons.

**Proposed (one of):** (a) keep as is; (b) drop arming entirely — auto has been reliable enough that the modes are vestigial; (c) keep arming but hide it behind a setting.

**Case against dropping:** arming is the operator's manual override when auto is wrong, and removing an escape hatch that costs one click is a poor trade.
**Case against keeping:** three modes is three states to teach, and the display-only icon that *looks* like it is deciding but isn't is a plausible source of the exact confusion in §9.

**We need:** Is explicit namespace arming standard in 2026 scanning UIs, or has the field converged on pure auto-discrimination? Consider GS1 Application Identifiers and the extent to which symbology/AI metadata makes arming unnecessary for standards-compliant barcodes — and how much of that survives when the codes in play are carrier tracking numbers, vendor PO numbers, helpdesk ticket ids, and internal handles that share no namespace authority.

---

### D7 — Is `/unbox` blending two region contracts, and is that a bug?

**Current:** One page, two regions. A Station sidebar (scanner, ephemeral, act-and-clear) and a Workbench right pane (pointer, durable URL selection, CRUD, three browse tabs). Our own law says a page may host both, one contract per region — so this is *legal*. But a single scan currently drives **both** regions: it mutates the station rail *and* seizes the workbench selection *and* writes the workbench's URL param.

**That coupling is the mechanism by which "scan to look something up" became possible in the first place.**

**Proposed:** Sever it. A scan owns the Station region only. Opening a durable, URL-addressable Workbench selection becomes a Workbench-initiated action (rail click, table row click, search hit) — never a side effect of a scan.

**Case against:** This would be a genuinely large change to the surface everyone agrees is the best page in the product, and the "scan the box, its editor opens, start working" flow *is* the value proposition. Severing it to satisfy an architectural boundary would be exactly the kind of purity-over-throughput move the house rules elsewhere warn against.

**We need:** Is the coupling the disease or the cure? If the coupling should stay, what is the minimal discrimination that lets a *work* scan seize the workbench while a *lookup* scan does not — and can that discrimination be made without asking the operator to declare intent in advance?

---

## 11. Open research questions

**Q1 — Scan-as-verb.** In 2026 warehouse/receiving systems, is the scanner input treated as a command channel (verb), a query channel (noun), or a mode-dependent hybrid? Name real WMS/WES/3PL systems and cite their documented behavior. Where a system supports both, how is intent disambiguated — by mode, by prefix, by context, by the code's own namespace, by dwell/double-scan?

**Q2 — Idempotency and completed-work re-scan.** What is the established handling for re-scanning an item whose station step is already complete? Is there a standard "already done" receipt pattern? How do systems keep an attributed scan log clean when the same physical action serves both work and inspection? Is intent classification *in the log* (rather than gating in the UI) a real pattern anywhere?

**Q3 — Why operators reach for the scanner over search (the behavioral question).** This is the crux and the least code-answerable. A scanner is ~0.5 s, eyes-down, hands-full, zero typing. A search bar is ⌘K + type + read + click, eyes-up, one hand off the box. Our thesis (C4) is that operators will **always** pick the scanner for lookup unless the lookup path is comparably fast. Is there published research or documented industry practice on this specific substitution? What have real systems done — a dedicated "info" hardware button, a double-scan gesture, a scan-into-search field, a physically separate lookup terminal, voice? Which of those hold up in practice?

**Q4 — Verification vs. browse vs. lookup as three distinct jobs.** Is this trichotomy recognized in operations-UX literature/practice, or are we inventing a distinction? If recognized, what affordance does each conventionally get? Specifically: is "filter the current view to confirm my own recent work" a named pattern with a canonical control shape?

**Q5 — Read view vs. work view over one record.** (Feeds D4.) Named systems that maintain a distinct read-only record view alongside an editor over the same entity — what keeps them from drifting? Where has this decayed into two half-maintained surfaces? Is there a factoring (shared read-model, shared presentation layer, editor-as-a-mode-of-the-viewer) that is the current best practice?

**Q6 — Motion at scan cadence.** (Feeds D5.) Evidence on transition duration and style for high-frequency operator swaps between *physically distinct* items. Does a discrete crossfade reduce mis-attribution errors (acting on the previous item), or is it pure latency? Is there a documented threshold where transition time starts costing throughput? How does this interact with WCAG 2.3.3 and reduced-motion, where our current fallback is a pure opacity fade with duration ~0?

**Q7 — Command palettes as the operational lookup waist.** Our ⌘K search has exact-identifier bypass, trigram, vector, and RRF fusion, plus page-context boosting — technically strong, behaviorally ignored. What separates a command palette operators *actually* use from one they don't, in an operational (not knowledge-work) context? Is there evidence that palettes fail specifically in hands-busy environments, and what replaces them there?

**Q8 — What to instrument before deciding.** If we wanted to settle §9's claims empirically instead of by argument, what is the minimal instrumentation? Candidates we can already reach: scan→outcome distribution (matched / unmatched / already-complete), time-from-scan-to-first-mutation (a lookup scan produces *no* mutation — is that the discriminator?), rate of scans on cartons already past the unbox milestone, search-bar usage per operator per shift. What else, and what would each measurement license us to conclude?

---

## 12. Constraints — treat these as fixed

1. **Do not propose a second design language.** House identity is data-first, dense, state-colored ops UI. "Better" means stronger within that family.
2. **Do not propose a second search engine.** One hybrid retrieval waist; new consumers call it.
3. **Do not propose removing the append-only scan log or the ops-event spine.** They are the actor-attribution and throughput source of truth. Reclassifying entries is on the table; dropping them is not.
4. **Never block the bench on infrastructure.** A down printer/scale/network must degrade, never gate a scan.
5. **The station must stay usable eyes-down, hands-full, at cadence.** Any proposal that adds a decision the operator must read and answer mid-scan carries the burden of proof.
6. **Reduced motion is not optional.** Any motion recommendation must state its reduced-motion form.
7. **Multi-tenant.** Nothing may leak across orgs; every rail, feed, and search is org-scoped.

---

## 13. What a good answer looks like

- A **verdict per decision D1–D7**, each one sentence, up front, before the reasoning.
- For each verdict: the strongest named precedent, the strongest counter-precedent, and why one wins *here* given §12.
- A **migration order** — which change lands first, which are independent, which are one-way doors.
- An explicit list of anything you think is **already correct and should not be touched.** We are more likely to break this page by over-correcting it than by leaving it alone, and a defended "leave it" is a real answer.
- Sources. Named systems, cited standards, dated research. Where you are reasoning from first principles rather than evidence, say so.

---

# ADDENDUM — response received, and the execution sequencing

**Added:** 2026-07-28, after Gemini Pro returned verdicts on D1–D7 and Q1–Q8.
**Audience:** whoever picks this up **and** the lane doing the modes→routes refactor. §16 is addressed to that lane specifically and should be read before that work starts.

## 14. Status

Gemini's verdicts, compressed: **D1** scan is a verb, never a lookup · **D2** classify the scan in the log (`LOOKUP_SCAN`) *and* show an "already done" receipt with an explicit override · **D3** demote History, default to Queue, top-bar search becomes a view filter · **D4** yes to a read-only `CartonInspector`, defensible as CQRS-shaped UI **provided both shells compose the same dumb primitives** · **D5** swap in place, and the two key bugs are objective defects to fix regardless · **D6** default to pure auto, keep arming behind a preference · **D7** the Station↔Workbench coupling is the disease, but **defer** — Phases 2 and 4 solve the operator complaint without it.

**Already landed (2026-07-28):** the two presence-key defects called out in §6 (consequences A and B). Carton overlay identity now resolves through `src/components/receiving/workspace-pane-key.ts` (`resolveWorkspacePaneSlot`) — one key per physical carton, stable across the scan-resolution upgrade and across the entry route, while a scan landing on a *different* carton still remounts. 18 assertions in `workspace-pane-key.test.ts`; the guard in `ReceivingRightPane.pending.guard.test.ts` was **retargeted, not deleted** — its intent (never reuse the prior carton's shell) is preserved at the corrected granularity.

**Still open from Phase 1:** D5's actual question — whether the `workbenchPaneSettle` 0.3 s duration itself should drop to an in-place swap. Fixing the keys removed the *spurious* crossfades; it did not change the duration of the legitimate carton→carton one.

## 15. Sequencing against the modes→routes refactor

**Do not gate the whole plan on that refactor.** Two phases are coupled to routing; the two that solve the operator complaint are not.

Sizing note the plan depends on: **the mode→route migration is already substantially landed for the receiving family.** `/unbox`, `/triage`, `/incoming`, `/pickup`, `/repair`, `/receiving/history` are already first-class routes — `isGraduatedMode()` returns true for all six and `useReceivingMode` derives the mode from `pathname`, not `?mode=`. What remains is deleting the *vocabulary* (the `ReceivingMode` union, `?mode=` back-compat parsing, `ReceivingModeSwitcher`, the mode branches in `ReceivingSidebarPanel` / `ReceivingRightPane`) plus the sidebar/dashboard display. The collision surface is narrower than "routing is being rewritten" implies.

| Phase | Primary files | Collision with the refactor | Verdict |
|---|---|---|---|
| **1** — drop the crossfade duration (D5) | `UnboxLineWorkspace` motion presets (leaf) | **none** | **now** |
| **2** — `LOOKUP_SCAN` + receipt (D2) | `record-scan.ts`, `unbox-scan-opened.ts`, `touch-scan/route.ts`, `lookup-po/route.ts`, `useTrackingScan` | **near none** — the scan log and ops spine do not know what a URL is | **now** |
| **3** — Queue default, History→filter (D3) | `src/utils/unbox-workspace-state.ts` (`?unboxview=`), `resolveUnboxReceivingTableMode` in **`src/lib/receiving/receiving-modes.ts`**, `useUnboxWorkspaceTab`, `UnboxWorkspaceHeader` | **high** — that file *is* the mode registry, and `?unboxview=` is exactly the param a layout-URL refactor turns into `/unbox/queue` | **after** |
| **4** — `CartonInspector` + search deep-links (D4) | `searchHitHref` (`RECEIVING` → `/unbox?openReceivingId=`), `unbox-selection-url.ts`, `useReceivingWorkspacePane` restore | **high** — building the Inspector against today's routing means re-homing it | **after** |

### Why Phase 2 should not wait

**The scan log is append-only.** Every lookup-scan recorded between now and the refactor landing is permanently indistinguishable from real work in actor-attribution and throughput. A backfill can only *infer* (a scan followed by zero mutations was probably a lookup — Q8's heuristic), never recover the truth. Deferring Phases 3–4 costs ergonomics, which is recoverable; deferring Phase 2 costs data, which is not.

### Do this first, independent of everything

Land Q8's instrumentation before either lane moves: **time-from-scan-to-first-mutation**, and **the rate of scans landing on cartons with `opened_at != null`**. Both are cheap and refactor-proof. Right now "staff scan to look things up" is well-reasoned but unquantified, and D3 (demoting the default tab) is painful to reverse if the premise is smaller than assumed. Landing these now means D3 and D7 get decided by measurement instead of argument.

### D7

**Re-open after the refactor, do not plan it now.** If layouts get their own URLs, the Station↔Workbench coupling is re-expressed by that work anyway; the decision may become trivial or moot.

## 16. ⚠ Warning for the modes→routes lane: `intakeSurface` is NOT mode vocabulary

The intake-surface discriminator reads like a leftover of the mode vocabulary. **It is not. It is persisted, and it drives SQL.** A vocabulary sweep that collapses it will break the Unbox surface silently — the failure is a rail that quietly stops being a distinct feed, not a crash.

**It exists under two names, one per side of the wire — a partial sweep will find one and miss the other:**

| Type | Home | Side |
|---|---|---|
| `ScanIntakeSurface` | `src/lib/receiving/scan/types.ts:125` | client (scan pipeline, apply layer) |
| `ReceivingIntakeSurface` | `src/lib/receiving/record-scan.ts:15` | server (persistence) |

**The default is the trap.** `recordReceivingScan` does `options.intakeSurface ?? 'triage'` (`record-scan.ts:78`). A caller that loses the field mid-refactor does **not** error — it silently records every Unbox scan as a triage scan, and the Unboxed rail's membership quietly stops being written. There is no loud failure anywhere on this path.

Where it is load-bearing:

- **Set from the mode, but semantic, not navigational.** `useTrackingScan` does `intakeSurfaceRef.current = receivingMode === 'receive' ? 'unbox' : 'triage'`. The *input* is mode vocabulary; the *meaning* — "which station's rules applied to this scan" — must outlive it.
- **Crosses the wire.** Sent in the `lookup-po` request body and read by `touch-scan` (`body.intakeSurface`).
- **Persisted.** `recordReceivingScan(..., { intakeSurface })`; `recordUnboxScanOpened(...)` stamps `receiving_unbox.opened_at` / `opened_by` and derives `receiving_unbox.intake_path = 'unbox_only'`.
- **Read back as a SQL predicate.** `UNBOX_ONLY_INTAKE_PREDICATE_SQL` and `unboxOpenedPredicateSql()` / `UNBOX_OPENED_PREDICATE_COLUMN_ONLY_SQL` are what make `view=unbox_opened` — the Unboxed rail's entire feed — a distinct set.
- **Gates the client chokepoint.** `applyUnboxCartonOpened` runs only on the unbox branch: pending-stub drop, Unboxed rail upsert, `purgeTriageRailsAfterUnboxOpen`, and the first-open realtime publish that makes *other* terminals drop the carton from their Arrival dock.

**If it is collapsed:** the Unboxed rail loses its membership predicate, Arrival rails keep phantom dock inventory across terminals, and first-open attribution stops being recorded. None of that throws — it just goes quiet.

**Guidance:** when `ReceivingMode` is deleted, `intakeSurface` should be **re-derived from the new route** (e.g. `pathname.startsWith('/unbox') ? 'unbox' : 'triage'`) and kept as its own named type. Do not fold it into whatever replaces the mode union, and do not let it become a boolean on a layout descriptor — Triage and Unbox stamp genuinely different things.

Related: this is the same distinction §10/D7 is arguing about. `intakeSurface` is the *semantic* half of the Station↔Workbench coupling (which station's rules ran) and is worth keeping; `?openReceivingId=` is the *navigational* half (which record the Workbench selected) and is the part D7 proposes severing.
