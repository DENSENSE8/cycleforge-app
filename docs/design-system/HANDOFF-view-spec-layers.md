# HANDOFF — view specs and the layer order: split every screen by its job, not by its look (written 2026-09-27)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the verified
ground truth that prompt relies on (code read 2026-09-27 on the working tree; other sessions are
editing concurrently — re-read before every edit).

**This handoff is not a design-system doc.** Do NOT write `FOUNDATIONS.md` or any other parallel law
file. The model below lands as CODE (types, one registry, lint gates, one pilot) and every rule
points at the artifact that already owns it (`pinned.json`, `DESIGN_SYSTEM.md`, the field catalog,
`LIFECYCLE`, `CARD_DISCLOSE`, `mode-registry.ts`). The only prose change is a short section in
`MODE-SPLIT-INVENTORY.md` (owner decisions + census results).

Read first: `AGENTS.md` (dev origin `http://localhost:3050` only), `docs/design-system/MODE-SPLIT-INVENTORY.md`,
`docs/design-system/HANDOFF-mode-split-next.md`, `docs/design-system/HANDOFF-triage-family-contract.md`.

## 1. The problem in one line

The system is split by LOOK (triage ⇄ industrial) and LAYOUT (in place / split / floor), but the
axis that actually differs between screens is the JOB. With no place to declare a job, jobs leak
into components and paint, so pages look like two systems fighting (inbound history, the labels
queue, Exceptions vs To ship).

## 2. The layer order (the thing to integrate)

Every element on screen answers six questions; each has exactly ONE owning layer, and a layer
reads only the layers below it.

| # | Question | Layer | Owning artifact (already exists — reference, do not restate) |
|---|---|---|---|
| 1 | What thing is this? | Entity | data model + identity laws (`sku_catalog.id`, `resolveSkuIdentityTitle`, `inbound_order` writer — AGENTS.md §4) |
| 2 | What true fact is shown? | Fact | field catalog `src/lib/tables/field-catalog/*` (one reader per fact, `resolveOrdersSlotValue`) |
| 3 | What state, what can be done? | State + Verb | `LIFECYCLE` (`src/design-system/tokens/lifecycle.ts`), verb builders (`to-ship/MorphingRowActionMenu.tsx`), `permission-registry.ts` |
| 4 | Why is this person looking? | **View spec** (page × saved view) | **MISSING — build it** (§4) |
| 5 | How much, and where? | Presentation | layout `DeskStageView` (`DeskStageContext.tsx`), density (`LEDGER_ROW_ZOOMS`, `--cf-density`, `DESK_SPACING`/`TRIAGE_SPACING` in `modes.ts`), disclosure (`CARD_DISCLOSE` `desk-stage.ts:103`) |
| 6 | How is it painted? | Paint | tokens only (`packages/design-tokens/src`, `src/design-system/tokens/*`, the `industrial:` variant in `globals.css`) |

Cross-cutting cap: **Surface** (phone / desk / kiosk / station) limits which presentation choices a
surface offers (`resolve-region-mode.ts` phone collapse). It never decides facts or jobs.

### Laws (enforced as gates in §5, not as a doc)

1. Read downward only — paint knows no jobs; a view spec knows no tokens; facts know no pages.
2. One owner per decision — one line of code answering two of the six questions is a violation.
3. Shared parts never branch on the page — no `usePathname` / desk-id / `mode ===` content switches inside a shared component; the spec tells it what to show.
4. Jobs hide things through disclosure, not paint — no `industrial:hidden` on CONTENT (restyling is fine).
5. One reader per fact — no ad-hoc formatting of catalog facts in components.
6. **PROPOSED, pending owner sign-off — do not enforce:** the look follows density × surface, never route or layout. This reverses the standing governance (`mode-registry.ts` `runtime` for `/shipping`, `RouteModeRegion.tsx:41`, `src/app/shipping/layout.tsx:38`). Record it in `MODE-SPLIT-INVENTORY.md` → "Owner decisions needed" and leave the registry untouched.

### The six-question test (the acknowledgement method)

For any element, write its six answers. Example — the ship-by chip on a To-ship row:

```
entity  → order line
fact    → orders.ship_by via the field catalog
state   → LIFECYCLE tone (late / today / soon)
job     → VIEW_SPECS['shipping.to-ship'].lead = 'orders.ship_by'
present → tier "rest", every density
paint   → STATE_TONE_CLASSES + mode tokens
```

Any answer that reads "this component decides", or two answers from one line, is a mix.

## 3. Verified ground truth (exact)

| Claim | Verdict | Evidence |
|---|---|---|
| A per-view declaration exists for record SECTIONS only | TRUE | `ORDER_RECORD_SECTIONS` (`src/lib/selection-context/order-inspector-context.ts:215`), typed by `OrderRecordMode` with forbidden sections per mode (`:206-212`); read ONLY by `OrderRecordView.tsx:189` |
| To ship and Exceptions render the SAME list component | TRUE | `OrderExceptionsWorkbench.tsx:11,149` mounts `OutboundOrdersLedger mode="exceptions"`; To ship's Floor renders the same `OutboundOrdersLedger` (`UnshippedTable.tsx:819-835`); only the record sections differ |
| The view mode is threaded as a bare prop, not a spec | TRUE | `OrderRecordMode` prop through `OutboundOrdersLedger.tsx:144`, `OrderCardList.tsx:84`, `MorphingRowActionMenu.tsx:231,1012,1070,1117,1240`, `SearchOrderRecord.tsx:128`, `shipped-order-line.tsx:40` |
| Saved views / search / controls per page are declared | TRUE | `NAV_PAGE_DECLS` (`src/lib/nav/context/pages.ts:270`), e.g. inbound History `/incoming?lane=docked` (`:99-112, :310-314`) |
| Disclosure tiers are global, not per view | TRUE | `CARD_DISCLOSE` (`desk-stage.ts:103`) — one set of container tiers for every card family |
| Floor couples layout + look + component | TRUE | layout `DeskStageView='floor'`; look `RouteModeRegion.tsx:41` (`runtime` → industrial when floor); component swap `UnshippedTable.tsx:819` (`floor ? OutboundOrdersLedger : OrderCardList`) |
| Job decisions expressed as paint | TRUE (3 sites in `.tsx`) | `industrial:hidden` count = 3, incl. the Payment group and line price in `OrderRecordView.tsx` ("price is noise on the floor", owner 2026-09-24) |
| Shared parts read the route | TRUE (to audit) | `usePathname` in `MorphingRowActionMenu.tsx`, `LabelIntakeDesk.tsx`, `triage-card-list/triage-list-state.ts` — classify each (routing verb vs content switch) |
| State logic lives in a presenter file | TRUE | `recordState` / `worstState` in `src/components/outbound/orders/outbound-orders-ledger-state.ts`, imported by the record, the Paperwork rail and the ledger |
| Leaks fixed this session (do not redo) | TRUE | labels queue rail + label intake rail → `DESK_TRIAGE_RAIL_CLASS` (`desk-stage.ts`); `LEDGER_EVIDENCE_CLASS` deleted; one view switch `DeskRecordViewSwitch` (In place · Split · Floor), `DataTableFullscreenToggle` deleted; order-record QoL (see `MODE-SPLIT-INVENTORY.md` → Order record groups) |
| Inbound history "looks like two systems" | UNVERIFIED | not yet censused — §5 step 1 produces the evidence |

## 4. The view spec (layer 4) — what to build

One typed registry, `src/lib/views/view-specs.ts` (new folder), keyed `'<page>.<saved-view>'`:

```ts
export interface ViewSpec<FactId extends string, SectionId extends string, VerbId extends string> {
  /** The one question this view answers — also the empty / all-clear copy source. */
  job: string;
  /** The fact that orders the list and colours the row (field-catalog id). */
  lead: FactId;
  /** Row facts in priority order, each with the disclosure tier it first paints at. */
  rowFacts: readonly { fact: FactId; tier: 'rest' | 'label' | 'detail' | 'open' }[];
  /** Default + allowed densities for this view (user picks within the range). */
  density: { default: Density; allowed: readonly Density[] };
  /** Record sections, in paint order (moves the view's ORDER_RECORD_SECTIONS entry here). */
  record: readonly SectionId[];
  /** ONE primary verb, then secondary verbs; hotkeys come from the verb registry. */
  verbs: { primary: VerbId; secondary: readonly VerbId[]; bulk: readonly VerbId[] };
  /** All-clear state for this job. */
  empty: { title: string; detail: string };
}
```

Rules: fact ids come from the field catalog (type-checked union), section ids from
`OrderRecordSectionId`, verb ids from the verb registry — the spec only CHOOSES and ORDERS, it never
defines a fact, a style or a component. `ORDER_RECORD_SECTIONS` is MOVED into the specs (clean
cutover, no second copy); `OrderRecordMode` becomes the spec key.

Pilot pair — the two opposite jobs on one entity:

| | `shipping.to-ship` | `shipping.exceptions` |
|---|---|---|
| job | What do I pick / pack next, and by when? | Why is this order held, and what releases it? |
| lead | ship-by / late | hold reason |
| rowFacts (rest) | order # · buyer · title · qty · condition · bin · next step | hold reason · the missing piece · hold age · order # |
| sort | ship-by soonest | hold age, then orders one fix would release |
| primary verb | the next step (pick / pack / label) | resolve (pair SKU, release hold, fix address) — inline |
| record | today's `ORDER_RECORD_SECTIONS['to-ship']` | `resolve` first; payment / fulfilment folded |
| bulk | assign, print, urgent | apply this fix to every order with the same cause |
| empty | "Nothing left to ship today" | "No held orders" |

Verify each pilot value against the live code before encoding it (hold reason source:
`exceptionRowToQueueRow` in `src/lib/queries/caged-orders-queries`, `ExceptionResolveSection`).

## 5. Integration steps (in order; each step ships green)

1. **Census (read-only).** Run the five detectors below over `src/components/outbound`,
   `src/components/receiving`, `src/features`, `src/design-system/components` and write the
   file-by-file result into `MODE-SPLIT-INVENTORY.md` (new section "Layer census"), including
   inbound history (`/incoming?lane=docked`: find its list component from `pages.ts:99-112` and the
   incoming page). Detectors:
   - paint in components: `font-mono|uppercase|rounded-none|border-mode-ink|text-\[\d+px\]|#[0-9a-fA-F]{3,6}` outside `src/design-system/tokens` and not behind `industrial:`;
   - job-as-paint: `industrial:hidden` (and `industrial:` + `hidden|invisible`) on content;
   - page branching in shared parts: `usePathname|useActiveSidebarChild|mode ===|mode !==` inside `src/design-system/components` and shared record parts;
   - second fact readers: date / money / tracking formatting of order fields outside the field catalog and `src/utils`/`src/lib/*-format` helpers;
   - layout choosing components: `floor \?|view === 'floor'` selecting between list components.
   Confirm each hit by reading the line — the detectors over-match; record only confirmed ones.
2. **Spec registry + pilot types.** Create `src/lib/views/view-specs.ts` with the interface,
   `Density` type, and the two pilot specs. Move `ORDER_RECORD_SECTIONS` + its forbidden-section
   typing into it; `OrderRecordView` reads `VIEW_SPECS[key].record`. Delete the old export (clean
   cutover; update every importer found in §3 row 3). Unit test (`*.test.ts`, node:test, add a
   `test:view-specs` script): every spec's facts / sections / verbs resolve in their registries;
   forbidden sections stay forbidden.
3. **Exceptions row from its spec.** Make the Exceptions list paint `rowFacts` / `lead` / primary
   verb from `VIEW_SPECS['shipping.exceptions']` instead of the To-ship ledger anatomy. Prefer a
   spec-driven row inside the SAME shared row part (`RecordCard` family slots or the ledger row) —
   do not fork a second list component. Probe `/shipping/exceptions` and `/shipping/orders` on
   :3050, screenshot both, confirm they now differ by job while sharing parts and tokens.
4. **Gates.** Add ESLint rules (or `scripts/*` source-law gates run by `pnpm verify:fast`, matching
   the existing gate style) for Laws 3, 4 and 5, with an allowlist seeded from the census —
   burn-down, not big-bang. Law 6 stays proposed.
5. **Density per view.** Add the density control bounded by `spec.density.allowed` (persist next to
   `desk.<id>.view` in `src/lib/settings/registry.ts`). Do not change the mode registry.
6. **Record the owner decisions** (Law 6; whether "price is noise on the floor" becomes a Dense-tier
   disclosure rule) in `MODE-SPLIT-INVENTORY.md` → Owner decisions needed.

## 6. Guardrails

- Other sessions own large parts of this tree (`git status` shows 200+ modified files). Re-read
  every file right before editing; change only your lines; never revert or reformat others' work.
- `OrderRecordView.tsx`, `OutboundOrdersLedger.tsx`, `OrderCardList.tsx`, `DeskRecordPlane.tsx`,
  `TriageSelectBar.tsx` are hot — keep edits surgical and single-threaded (one owner).
- No new design-system law file; no restating of `pinned.json` / `DESIGN_SYSTEM.md` rules.
- Verification: `pnpm verify:fast` (report every red gate with per-file attribution), the new unit
  tests, `pnpm test:e2e:order-record-qol` (must stay 13/13), and :3050 screenshots of every changed
  surface. Tests follow repo convention: node:test `*.test.ts` + `test:*` scripts; e2e = scripts on
  :3050 reusing `tests/.auth/admin.json` (never start a server or another port).

## Prompt

```
You are continuing the CycleForge design-system split in /home/michaelgarisek/Projects/cycleforge-lanes/prod.
Read docs/design-system/HANDOFF-view-spec-layers.md fully first — it is the verified ground truth and the plan.

Goal: integrate the six-layer order (Entity → Fact → State/Verb → View spec → Presentation → Paint,
Surface as a cap) into the CODE so no screen mixes layers, starting with the To ship vs Exceptions
pilot. Do NOT write a foundations/law document; every rule references the artifact that already owns it.

Do, in order, shipping each step green:
1. Census (read-only): run the five detectors in §5.1, confirm each hit by reading it, and write the
   confirmed file-by-file list into MODE-SPLIT-INVENTORY.md → "Layer census" (include inbound history).
2. Create src/lib/views/view-specs.ts (ViewSpec, Density, pilot specs 'shipping.to-ship' and
   'shipping.exceptions'); MOVE ORDER_RECORD_SECTIONS into it (clean cutover, update every importer);
   add node:test coverage + a test:view-specs script.
3. Drive the Exceptions list row (lead fact, row facts, primary verb, sort, empty state) from its spec
   through the shared row part — no forked list component. Screenshot /shipping/exceptions and
   /shipping/orders on :3050 and confirm they differ by job while sharing parts and tokens.
4. Add source-law gates for Laws 3, 4, 5 (allowlist seeded from the census) to pnpm verify:fast.
5. Add the per-view density control bounded by spec.density.allowed, persisted beside desk.<id>.view.
6. Record Law 6 and the "price on the floor" question under Owner decisions needed. Do not touch
   mode-registry.ts / RouteModeRegion.

Rules: :3050 only (AGENTS.md §1); other sessions edit concurrently — re-read before each edit, touch
only your lines; verify with pnpm verify:fast (attribute every red gate per file), the new unit tests,
pnpm test:e2e:order-record-qol (stays 13/13), and screenshots. Report per step: files changed,
evidence, what is left.
```
