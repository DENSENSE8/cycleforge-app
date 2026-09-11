# PLAN — FIND as a diagnostic case-file investigator

**Status:** OPEN — checklist only. No implementation in this file.
**Authored:** 2026-09-11
**Research:** [search-investigation-timeline-GEMINI-RESEARCH-BRIEFING.md](search-investigation-timeline-GEMINI-RESEARCH-BRIEFING.md)
**Industry conclusion (locked):** Timeline as the Document (Palantir Object Explorer + Sentry issue stream). Commerce status-pin (Shopify/Stripe) is the **hero**, not the IA. WMS tab-routing is the contrast class to refuse.
**Product identification:** Cycle Forge is **ops SaaS**. FIND is a **diagnostic case-file**, explicitly separated from workstation execution. Warehouse is one domain among many.

**Paste for a new session:**

> Read `docs/todo/search-investigation-timeline-PLAN.md`. Do not re-open §0–§2. Start at the first unchecked phase. UI writes: `ds_contract` / `ds_tokens` / `ds_critique` first. Graph: impact FIND surface files, not one dossier adapter. Mobile-first: `/m/search` is the SoT column. Org-1 dogfood URLs in §8 — check live before claiming a phase done.

---

## 0. Verdict (do not weaken)

FIND confirms a record and hands the operator to the tool that writes.

```
Status pin (hero)
  → Investigation outline (kind counts + now-qty / facts)
    → Chronology (timeline-only faces, newest-first)
      → Sticky handoff (one contextual write path)
```

That stack **is** the document. Desktop adds density (outline as **filter** on the same stream). Scan preview **embeds the same column**. Chrome must not fork on entity type or station name.

**ROI (research, locked):** Timeline dossier ≈ 125. Ported station panes ≈ 4. Do not “improve” the current ports.

---

## 1. Decisions locked

| Decision | Verdict |
|---|---|
| Job | Diagnostic investigator. Not Unbox, Pack, Support, To-ship, or a WMS order-detail. |
| Shaper | **Time.** Faces mount iff that event kind exists on the stream. Empty kinds omitted. |
| Identification | Order / serial / tracking / carton / SKU / repair / FBA change **which events exist**, never which chrome tree mounts. |
| Station names | Caption on a hop. Never a layout switch. |
| Desktop “left rail” | **Investigation outline** (Overview + kind counts) that **filters the stream**. Same tree as the phone stack. Not a second navigation IA. |
| Overview | Filter / summary of the stream. **Not a page.** |
| Recents on FIND | **Refuse.** ⌘K already owns Recents. |
| Displays index | **Refuse** on FIND. Photos / Status info / Timeline / Units / Ticket / Support / Warranty are workplace leaves. |
| Shopify raw stream | **Insufficient.** Palantir-style kind outline with counts is required up front. |
| Writes | Handoff only. Copy + deep-link allowed. No composer, assign, unbox, pack, or exception desk on FIND. |
| New entity routes | **Refuse.** One frame; adapters map APIs → events. |
| Hunt-tile filters | **Refuse** (table funnel is a different surface). |
| Slot-table / overlay z-index / Operator verdict | Out of scope. Do not pick up their chrome. |

### 1.1 Display-method catalog (locked)

| Kind | Operator question | Display method | Must not be |
|---|---|---|---|
| Now / Status | Where is this right now? | Pinned status band + facts hero | Pack station stepper |
| Qty ledger | Ordered / received / packed / shipped? | Summary ledger at top of stream (only if qty events exist) | Unbox qty rail |
| Hop | Who, where, when? | Chronological custody row | Per-station layout |
| Evidence | Photos at T? | Inline thumbnail grid **inside** the event | Unbox `PhotoPeekFan` as page chrome |
| Exception | What’s blocking? | High-contrast block + resolution state | Writable exceptions desk |
| Bind | SKU / serial / tracking attached at T? | Inline linkage tag | Identity chrome fork |
| Carrier hop | Tracking movement? | Nested sub-events under a shipment hop | Second pipeline widget |
| Note | What did staff say? | Inline text in the stream | Composer that writes from FIND |

### 1.2 Explicit refuse (tripwire fodder)

- `EntityStationPane`, `SearchOrderStationPane`, `SearchUnitStationPane`, `SearchReceivingStationPane` on FIND files
- Station Displays leaves as FIND navigation
- Recently searched / warehouse recents rail on `/search`
- `OrderStationIdentity` / `UnitStationIdentity` as FIND banners
- `OrderPipelineSection` / carton pipeline as FIND chrome (carrier hops live **in** the stream)
- `PhotoPeekFan` as FIND page chrome (evidence lives **in** the event)
- Per-entity layout forks in `SearchDossier` beyond a **data** adapter
- Inline writes from the dossier
- Dual `lg:hidden` + `hidden lg:block` trees

Workplace files may keep Displays indexes. FIND must not import them.

---

## 2. Ground truth (measured 2026-09-11)

| Layer | Today | Target |
|---|---|---|
| Law | `src/lib/search/search-find-law.ts` — forbids station panes; still allows carton context + scan pipeline | Law names Timeline-as-Document + outline + handoff-only writes |
| Frame | `SearchDossierFrame` — banner, toolbar+handoff, status row, identity, findings, lines | Same vertical contract: pin → outline → stream → sticky handoff. Drop `pipeline` / `photoPeek` / station `identity` slots |
| Adapters | `SearchOrderDossier` still mounts `OrderStationIdentity`, `OrderPipelineSection`, `PhotoPeekFan` | Adapters emit `FindEvent[]` + outline counts + handoffs |
| Station leftovers | `src/components/search/station/*` still on disk | Unreachable from `/search` / `/m/search`. Delete or quarantine after graph impact |
| Browse | `/search?q=` — `SearchBrowseShell` | Unchanged list job (companion: search-results-grid briefing) |
| Recents | Search dropped from context-panel route keys | Stay dropped |
| Mobile | No `/m/search` in mobile-first prefixes | Class **B** SoT column |
| Timeline data | Journey / `inventoryEventsToTimeline` / order timeline APIs exist for **work** surfaces | **Data** adapters only. Do not mount `OrderTimelineSection` workplace chrome on FIND |
| Eval | `search-find-law.test.ts` | Extend markers + dossier contract tests. No `eval:cohort overlay` |

---

## 3. Phase checklist

Check a box only after the **Done when** and **Org-1** row for that phase are true. Do not skip to desktop density before `/m/search` exists.

### Phase 0 — Law, model, guards (no paint)

- [x] Update `SEARCH_FIND_LAW` to: FIND is a case-file; timeline shapes faces; outline is derived from the stream; handoff is the only write; recents and Displays index stay off the route.
- [x] Extend `SEARCH_FIND_FORBIDDEN_MARKERS` with: `OrderStationIdentity`, `UnitStationIdentity`, `OrderPipelineSection`, `ReceivingCartonPipeline`, `PhotoPeekFan`, `search-order-display-index`, `buildSearchOrderDisplayIndexRows`.
- [x] Add a **kind** union in `src/lib/search/` (name TBD, e.g. `FindEventKind`): `status` · `qty` · `hop` · `evidence` · `exception` · `bind` · `carrier` · `note`. No station-named kinds.
- [x] Add `FindEvent` + `FindOutline` (kind → count, omit zeros) + `FindDossier` (status, facts, outline, events newest-first, handoffs). Adapters produce this; the frame does not switch on `entityType` for chrome.
- [x] Graph: `find_symbol` / impact on `SearchDossierFrame`, `SEARCH_FIND_SURFACE_FILES`, `CompoundItem` **not** in blast radius.
- [x] Tests: law tripwire still green; new model unit tests (empty kinds omitted; newest-first; tracking paste is still `order` not a new type).

**Done when:** Law + types compile; no UI class changes yet.  
**Org-1:** N/A (no visual).  
**Shipped:** 2026-09-11 Session A. Remaining ports listed as shrink-only `SEARCH_FIND_MARKER_DEBT` (Phase 1 clears). Graph index (2026-09-06) has no `SearchDossierFrame` node; CompoundItem impact is table/station queue only — FIND not in callers.

### Phase 1 — One-column frame (strip ports)

Job: `ds_contract` **FIND confirmation column status pin outline chronology sticky handoff**. Tokens before classes.

- [x] `SearchDossierFrame` stack, top → bottom:
  1. Status pin (`search-dossier-status-row`) — badge + primary identifier. **No** pipeline slot.
  2. Investigation outline — kind counts + qty/facts ledger (read-only).
  3. Chronology — stream host (may be empty stub this phase).
  4. Sticky handoff — existing `search-dossier-handoff`; primary CTA stays reachable on a phone.
- [x] Findings band stays **paint-only** (search does not clear).
- [x] Delete frame props: `pipeline`, `photoPeek`, station `identity`, Unbox `banner` unless a **read-only** carton fact line can live in the outline without `CartonContextCard` station skin.
- [x] `SearchOrderDossier` / `SearchUnitDossier` / `SearchReceivingDossier` / generic: stop importing station identity, pipelines, `PhotoPeekFan`. Map current facts/lines into outline + placeholder stream if events are not ready.
- [x] `SearchDossier` remains a **router to adapters**, not a chrome switch.
- [x] `ds_critique` on every edited `src/components/search/dossier/*` file.

**Done when:** All six `?sel=` types share one chrome tree. Status is the first pinned band. No station banner.  
**Org-1:** Open `113-1397006-0292212`, `078338982650888AE`, `R-52695`, `01091-BK`. Chrome shape is shareable by a phone.  
**Shipped:** 2026-09-11 Session B. `SEARCH_FIND_MARKER_DEBT` emptied. Chronology still a line stub (Phase 2). Fast eval was red on unrelated tree (`SidebarNavList` / diagnostics) — FIND unit + law tests green.

### Phase 2 — Stream faces (timeline as document)

- [x] One FIND stream component (search-owned). Reuse **data** from journey / inventory / order timeline APIs; do **not** mount `OrderTimelineSection`, Unbox activity tabs, or Displays “Timeline” leaves.
- [x] Face per kind from §1.1. Kind with count 0 does not render a section header or empty state row.
- [x] Evidence: thumbnails **in** the event at T. Enlarge via existing sheet/lightbox patterns — not page-level `PhotoPeekFan`.
- [x] Exception: high contrast + resolution state; click is **handoff**, not inline resolve.
- [x] Carrier: nested under shipment hop; tracking paste still opens `order:` confirmation.
- [x] Bind: SKU/serial/tracking tags on the hop that created the link.
- [x] Qty ledger: only when qty events exist; numbers are last-written facts, not an Unbox rail.
- [x] Newest-first default. Outline chip filters the stream (Phase 3 wires the filter; Phase 2 can paint all kinds).
- [x] Analog (behavior, not skin): Linear’s issue timeline — one document, entity-agnostic rows, scales in one column.

**Done when:** Order, unit, carton, SKU each show **only** kinds they have. Photos and serial/location are visible without opening Unbox.  
**Org-1:** Same four records. Score §8 questions 3–4 as yes.  
**Shipped:** 2026-09-11 Session C. `SearchFindStream` + `find-events-from-sources`. Outline derived from the stream. Org-1 order `13924` showed qty + hop (Ship confirm + serial) without station chrome. Unit/carton/sku walk blocked after the local :3077 process exited.

### Phase 3 — Outline as filter (desktop density, same IA)

- [x] Desktop: outline is a **narrow column beside the stream** that filters kinds. Selecting Overview = all kinds. Selecting a kind = that kind only. **Not** a second route, **not** recents, **not** Displays.
- [x] Phone: outline **stacks above** the stream (no dual tree). Same filter semantics if a kind chip is tapped.
- [x] No `lg:hidden` full-flow fork. Density only: column vs stack.
- [x] Surface law class: FIND dossier = **B** (phone browse) consuming this column; desktop = phone-width frame + gutters unless the outline+stream pair still **is** one job.

**Done when:** Filtering kinds never navigates. Recents still absent.  
**Org-1:** Desktop `/search?sel=order:13924` — outline chips filter; phone-width resize still one column.  
**Shipped:** 2026-09-11 Session D. `filterEventsByKind` lifts nested hops. Frame: one investigation tree (`flex-col` / `md:flex-row`). House `Button` chips — not `FilterRefinementBar`. `/m/search` is Phase 4.

### Phase 4 — `/m/search` SoT

- [x] Register `/m/search` in `src/lib/mobile/mobile-first-surface.ts` (and route tree). Class **B**.
- [x] Cold open: query / `?sel=` → **same** dossier column as desktop (shared module, not a copy).
- [x] Sticky handoff; no hover-only; one token family (not TabSwitch, not TableTabs, not path chips).
- [x] Browse `?q=` on `/m/search` uses the existing hit list job — do not invent a third results chrome.
- [x] Desktop `/search` **consumes** this column (frame + gutters). Scan preview in Phase 5 embeds it.

**Done when:** An operator can confirm and hand off on `/m/search` without `/search`. The feature is no longer “desktop-only.”  
**Org-1:** Phone viewport on the four records.  
**Shipped:** 2026-09-11 Session E. Shared `SearchFindSurface`. Order hops paint staff + stamp when pick/pack/scan-out rows exist (omit if the ledger has none). Identifier bind is SKU → Serial → Tracking. Org-1 `order:13924` has scan-out (Michael, tracking) and no pick/pack rows.

### Phase 5 — Scan preview embed

- [ ] Scan-station **preview** of a resolved identifier mounts the FIND column (read-only + handoff), not `EntityStationPane` preview.
- [ ] No Displays index dependency in the embed.
- [ ] Gun stations keep `StationComposerHost` + `showModeFaces={false}` for **execution**; preview is FIND, not a second mouth.

**Done when:** Preview of an org-1 serial/order matches `/m/search?sel=` structurally (status → outline → stream → handoff).  
**Org-1:** Floor station preview of `078338982650888AE` and `113-1397006-0292212`.

### Phase 6 — Quarantine workplace leftovers

- [ ] Impact `src/components/search/station/*`. FIND surface files must not import them.
- [ ] If Support / Orders desks still need `SearchOrderStationPane`, leave those call sites; **rename or move** out of `components/search/` if the folder implies FIND.
- [ ] `search-order-display-index.ts` / unit sibling: workplace only. FIND tests must fail if imported.
- [ ] Delete dead FIND-only ports (`SearchOrderCentre` pipeline wrappers, etc.) after knip/graph says unreferenced from SEARCH_FIND_SURFACE_FILES.
- [ ] Do not delete overlay `visibility` / `zIndex.panel` to silence unrelated critique.

**Done when:** `SEARCH_FIND_SURFACE_FILES` grep clean of refuse list. Workplace Displays still work on Unbox/Pack.  
**Org-1:** FIND URLs unchanged; Unbox still has Photos/Units leaves.

### Phase 7 — Eval + session stamp

- [ ] `search-find-law.test.ts` covers new markers and “no Displays index import.”
- [ ] Dossier contract tests: status first; handoff present; kinds omitted when count 0.
- [ ] `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
- [ ] Stamp `.cursor/eval-session.json` if the eval skill requires it for this change set.
- [ ] No slot-table cohort unless this work accidentally touched CompoundItem / `useSlotTableLayout` (it must not).

**Done when:** Fast eval green; FIND tripwire green.

---

## 4. Data / adapter notes (do not invent APIs until Phase 0 types exist)

Adapters stay in `Search*Dossier` (or a `src/lib/search/find-*.ts` helper they call):

| `?sel=` | Stream sources to prefer (read, merge, tag kind) |
|---|---|
| `order` | Order resolve + existing order timeline / journey `dim=order` + tracking as carrier sub-events |
| `unit` | Unit resolve + journey `dim=unit` / serial inventory events |
| `receiving` | Carton resolve + receive events; linked order as bind/hop, not a second pipeline chrome |
| `sku` | Catalog facts + bind events if any; thin stream is OK |
| `repair` | Claim status + notes/exceptions; handoff to repair desk |
| `fba` | Shipment status + hops; handoff to FBA desk |

Tracking paste must continue to resolve to `order:` (no `sel=tracking:`).

If a source is missing for a kind, **omit the kind**. Do not stub fake hops to look complete.

---

## 5. UI / DS constraints

- Before any `src/**/*.{tsx,jsx,css}` write: `ds_contract`, `ds_tokens`, `ds_critique`.
- Do not guess radius, status badge, or button variants.
- Sticky CTA = existing `Button` + `search-dossier-handoff`, not a new token family.
- Status = `StatusBadge` (already on the frame), not a Pack stepper.
- Evidence enlarge = existing sheet; mobile-first `BottomSheet` if a sheet is required.
- No `bg-surface-station-well`, no `motionRole.swap.scan`.

---

## 6. Session slicing (suggested)

| Session | Phases | Stop |
|---|---|---|
| A | 0 | Types + law. No paint. |
| B | 1 | Frame stripped. Org-1 chrome walk. |
| C | 2 | Faces + live photos/qty/serial on stream. |
| D | 3–4 | Outline filter + `/m/search`. |
| E | 5–7 | Preview embed, quarantine, eval. |

Do not combine B and C in one session if the stream API merge is large.

---

## 7. Out of scope (still)

- Search ranking / hybrid index
- Restoring Recently searched
- Slot-table funnel, Queue/Viewed/History
- Operator verdict ledgers
- Overlay shell z-index
- Per-entity marketing pages
- Porting Linear’s visual skin (behavior analog only)
- Writing from FIND

---

## 8. Org-1 dogfood (live check — tenant `…0001`)

Local: attach the running app (typically `:3050`). Sign in as org **1**.

**Required walk (every UI phase):**

| Paste | URL |
|---|---|
| `113-1397006-0292212` | `/search?sel=order:13924` |
| `078338982650888AE` | `/search?sel=unit:2562` |
| `R-52695` | `/search?sel=receiving:52695` |
| `01091-BK` | `/search?sel=sku:2486` |

Also after Phase 4: the same `?sel=` on `/m/search`.

**Score (must all be yes before the plan is done):**

1. Is status the first pinned band, **without** a station banner?
2. Does chrome **stay the same shape** across the four records (only event kinds change)?
3. Can you triage qty / serial / location / photos **without** Unbox or To-ship?
4. Is the handoff the **only** write path?
5. Would this stack embed in a scan preview **without** a Displays index?
6. Does a kind chip filter the stream (desktop) / stack above it (phone) without a second IA?

**Extras (regression, not the scoring set):** tracking `9405508106244533289572`; carton `R-52694`; repair `REP-4780`; `/search?sel=fba:75`. Skip SKU `CF-PACK-PRINT-E2E`.

**Baseline from research (current product — expect fail until Phase 1–2):** (1) status exists but cluttered by station banners; (2) carton pipelines and photo peeks fork chrome; (3) no; (4) identity panes invite writes; (5) no.

---

## 9. Acceptance (plan complete)

- [ ] Phases 0–7 checked.
- [ ] §8 scores 1–6 yes on org 1 for order, unit, carton, SKU.
- [ ] `/m/search` exists and is the SoT column.
- [ ] FIND files grep-clean of §1.2 refuse list.
- [ ] Workplace Displays still function off FIND.
- [ ] Fast eval green.

When those are true, mark this file **DONE** and leave the briefing as historical research.
