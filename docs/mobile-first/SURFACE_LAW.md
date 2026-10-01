# Mobile-first surface law (repo-wide)

<!--
  Callers: AGENTS.md, CLAUDE.md, .cursor/rules/mobile-first-surface.mdc,
  src/lib/mobile/mobile-first-surface.ts, all agents building UI.
  No data schemas / API.
  User: "contract into laws plus components must … span repo-wide. You must
  be able to do everything on the mobile app first."
-->

**Status:** binding · **Scope:** entire CycleForge app (Inventory, Shipping,
Receiving, Support, Admin, Studio, Search, …) — not Warehouse OS alone.  
**Operator:** 2026-09-10 — “contract into laws plus components must … span
repo-wide. You must be able to do everything on the mobile app first.”

This is the product SoT for **how we design and ship UI**. Desktop desks,
scan stations, and kiosk faces remain real surfaces; they **consume** the
mobile-first job tree — they do not invent a second IA that phones cannot run.

---

## 1. Non-negotiable product rule

**Every operator verb that exists in the product must be completable on the
mobile web app (`/m/*`) first.**

- If a verb has no `/m` path, the feature is **incomplete**, not “desktop-only.”
- Desktop may add density (tables, multi-pane, wedge scan, hotkeys) **after**
  the mobile happy path exists and is triageable.
- “Desktop-first, then squeeze” is **refused** for new work and for ports.

Exception (narrow): **public GS1 resolvers** and pure print-only hardware
bridges that have no operator session. Everything else is in scope.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Job** | One verb the operator came to do (pick confirm, print labels, scan arrival, …). |
| **Surface** | Shell that owns chrome: `/m/*` phone, desk (`DeskPageChrome`), scan station, kiosk. |
| **Mobile SoT** | The phone layout + step machine under `/m/…` for that job. |
| **Desktop frame** | Same SoT tree shown in a fixed phone-width column with thick side gutters; optional compact recents top-left — **not** a second desktop IA. |
| **Token family** | One control grammar per job class (see §5). |
| **Triageable** | Cold open → done in a short thumb path; primary CTA sticky; no hover-only. |

---

## 3. Surface classes (every feature is classified)

| Class | Shell | When |
|---|---|---|
| **A — Floor / single-task** | `/m/(shell)/…` or `/m/(immersive)/…` | Scan, pick, print, photo, put-away, triage one carton |
| **B — Phone browse** | `/m` + sheets/lists | Queues, history, search results on phone |
| **C — Dense desk** | Desk chrome + tables | Multi-column ops after A exists |
| **D — Station / kiosk** | Station overlay / kiosk face | Wedge + large flush targets; still must not be the *only* way to do the job |

**Port rule:** design **A** (or B) first; C/D arrange the same jobs wider or denser.

---

## 4. Desktop display of mobile-first (frame law)

When showing mobile SoT on a large viewport:

1. **Center column** = phone width (`max-w-sm` / `max-w-md` — use DS radius/spacing tokens, not invented px sprawl).
2. **Left / right** = thick empty gutters **or** compact **recents** (top-left, small rows) — never a full desk rail that the phone lacks.
3. **No dual interactive trees** (`lg:hidden` full flow + `hidden lg:block` full flow both live). One step machine; optional layout variants only.
4. Desk URLs may **embed** the `/m` frame; they must not fork a separate click path.

---

## 5. Token families (use case → mount)

| Job class | Mount | Do not |
|---|---|---|
| Desk / page facet tabs | `TableTabs` (underline) | Pill path chips |
| Binary / small mode (e.g. Single \| Bulk) | `TabSwitch` segmented | Path chips; desk underline tabs |
| Ordered path (Zone → …) | Path chips (`LABEL_BUILDER_STEP` or successor) | `TabSwitch` faces |
| Primary commit | Sticky `Button` / sticky bar | Buried under long lists |
| Secondary / wipe (Reset, Change) | Outlined `Button secondary` (or danger) | Ghost next to mode switch |
| Recents | Compact recent rows / strip | Full context rail on phone SoT |
| Lists on phone | Flat hairline work rows + task-local detail | Rounded/elevated islands; full `DataTable` as SoT |

Call `ds_contract` / `ds_tokens` / `ds_critique` before UI writes. Prefer existing
`/m` redesign primitives (`MobileShell`, item-record mobile, `BottomSheet`,
`IconButton size="touch"`).

---

## 6. Hard rules (R1–R10)

1. **One job per screen** (first viewport).
2. **One primary CTA**, sticky, thumb zone (≥44px hit via DS).
3. **Token family = use case** (§5).
4. **Progressive disclosure** — current step body; path chips are status/jump-back.
5. **No hover-only**; no dual active trees.
6. **Touch ladder** via `UIModeProvider` / `IconButton size="touch"` — not random taller classes.
7. **Search only when the list is the product** (long queues), not ~10-item pickers.
8. **Secondary actions collapse** (⋯ / sheet); toolbar ≤2 trailing icons on phone.
9. **Disabled CTAs name what’s missing**.
10. **Device intent before layout** — floor verbs are class A under `/m`.

Pass/fail: fail any of R1–R4 on the mobile SoT → not done.

---

## 7. Component kit (build toward; share repo-wide)

**Record (the exoskeleton — one scanned thing, a full scrollable screen):**

| Component | Responsibility |
|---|---|
| `DetailHubScreen` | The entity hub `/m/<entity>/[id]`: bar, summary card, doors, dock, loading/error |
| `DetailRecordFrame` | The frame of `/info` and each job screen under a hub |
| `DetailSummaryCard` | The read-only card on top of a hub; the whole card opens `/info` |
| `DetailNav` + `detailDoor` | One door per job screen (photos, lines, activity …) |
| `DetailFacts` + `DetailFact` · `DetailAck` | Facts as full-bleed rows — mono caps label left, value right, one mode rule between rows; a `DetailSectionHeading` band opens each further group; `copy` on identifiers = tap-to-copy. The acknowledgement line |
| `DetailSectionHeading` | Section band between two blocks of one screen (well-grey strip, mono caption) — never on a hub |
| `DetailDock` | The ONE bottom execution bar: ≤3 verbs, one primary; 72px flush cells, instant ink press, 500ms leading-edge lock (the selection ✕ fires past it and re-arms it), press buzz only with the staff `scan.haptics` toggle (`usePressHaptic`). One verb = a job screen's full-width bar; `selection` = ✕ N SEL + ≤2 verbs |
| `DetailDock placement="inline"` | The same band in-flow under a record (board row, order card): full width, `border-t` rule, not sticky, no safe-area pad; ≤4 verbs (four = flush 2×2); 48px cells, labels wrap, never truncate. Replaces any padded `grid-cols-2 gap-2` of bordered Buttons |
| `DetailDock center` | A scanning job screen's collapsed Scan bar as the dock's middle cell (success fill), between two verbs — via `MobileCaptureWindow collapsedFrame`. The bar's label is the step's next action (`Scan tote`, `Scan item · 3 left`, `Saving…`); no instruction sentence above it. Lens up → the dock renders alone under the panel |
| `DetailDock placement="float"` | A LIST screen's job CTA (owner 2026-09-28, `/m/pick` Start picking): no bar — NO hairline, NO ground strip behind or below; ≤2 `xl` pill buttons at one fixed, centred width (`FLOATING_CTA_WIDTH`, the same on every phone, never edge to edge), a spacing step + the safe-area inset off the bottom. The last child of the scrolling list: the list scrolls under it and its flow height is the list's bottom clearance, so the last card is never hidden |
| `RecordCardMobile` | The phone face of the desk triage card (`RecordCard`). Owner 2026-09-29: bin, platform and order number above the image — top row = bin (`LocationBadge`) · channel dot + name · order ref …… SLA pill; body row = square image (no corner, `object-cover`) far left, exactly as tall as its two rows: title (one line) over subtitle `×qty · condition · price`. State rail kept; no check, peek, chips or verbs. `/m/pick`'s card; its `RecordSquarePhoto` is also the order screen's large product tile |

**Flat (operator 2026-09-25).** Every record screen's column is `divide-y divide-mode-rule`
with no page padding, gaps, or boxed panels: blocks run the full width, square, one 1px
rule between them, and only text keeps the page inset. Rows and cards invert to ink on
press, with no transition.

**List / job screens (stay):** `MobileShell`, `MobileActionSlot`, `ItemCardRow`,
`MobileTriagePage`, `BottomSheet`.

**Sheet vs screen (operator 2026-09-24).** The primary record of the job being
worked — an order while picking or packing, a carton, a unit, a bin, a SKU, a
ticket — is never a sheet. It opens as its hub route: a full scrollable screen
with an **X** back to the job. `BottomSheet` is for an edit from the `/info`
pencil, a dock verb's form, a confirmation, a picker, and a quick look at a
**linked** item from inside another record (an item linked to a ticket). Every
phone sheet declares its role in `src/lib/mobile/mobile-sheet-roles.ts`; the
`Detail hub` gate fails an unclassified sheet, and record sheets are a
shrink-only baseline.

New jobs **compose** these; they do not invent a parallel mobile design system.

**The phone top bar reads title-left / action-right** (`MobileTopBar`): menu ·
page title … page action · **SCAN**. Scan owns the corner permanently (ruling
2026-08-21) and the page action sits immediately to its LEFT, registered from
the page body through `MobileActionSlotRegistrar` — never passed as a prop,
because the host mounts the bar and the page is `children`.

Unlike the desk's three-role slot, the phone slot holds **exactly one** action:
390px has no room for a cluster, and R1/R2 already say one job, one CTA. A
page with a second verb puts it in a `BottomSheet`, not a second corner.

---

## 8. Route map (extend as verbs land)

Canonical phone entrypoints (non-exhaustive; grow this table, don’t fork):

| Verb area | Mobile SoT |
|---|---|
| Pick (a pick list only: progress bar, my list — mine, then unowned — and a floating Start picking; no status chips or filters) | `/m/pick` · progress "N of M picked" (picked today by me ÷ + walk left) on the list and the walk; Start picking / a tapped card walks the list's To-pick orders on the scan card, `?order=<id>` (every line's product photo, large): the desk's own flow (`src/lib/picking/desk-scan-client.ts`), the first serial / SKU scan anchored on the ORDER (`scanDeskOrder`), Undo last step, Pair bin / Update location (the SKU's bin, set-bin sheet), Skip; advances when the order is in hand. No Unpick on the phone |
| Pick one named order | `/m/pick/[orderId]` · claim `/m/id/pick/[orderId]` |
| Orders / to-ship | `/m/orders` (canonical) · `/m/work` (compatibility alias; never a second nav door) |
| Exceptions (every kind — Fulfillment: FBM · Labels & docs · Paperwork; Inventory: Missing pairs · Bin errors · Tracking; Receiving: Claim · Short · Unfound) | `/m/exceptions` hub (drawer L0 row; kind segments with the list's own counts, `?domain=` / `?kind=`; rows = tag · entity · resolve verb) · `/m/exceptions/[key]` record (`key` = `kind:sourceId`), one phone resolver per kind that completes the exception in place (`src/components/mobile/exceptions/**`). Old `/m/exceptions/<orderId>` links land on that order's FBM, else Missing pairs, exception. `/m/orders` › Exceptions is the same list locked to Fulfillment. Desk twin `/exceptions`. |
| Unbox photo feed | `/m/receiving` (drawer: Receiving lane → Photo feed) · `View all` → `/m/receiving/history` (search · status facets) |
| Receive / location scan | `/m/scan` |
| Identification kernel (QC-done, claim, scan-out) | `/m/id/*` — `/m/id/methods`, `/m/id/[job]/[entityId]`, `/m/id/scan-out/[orderId]` |
| Packing | **`/m/p/[id]/photos`** — the photo feed reached from the desk `scan_ready` bridge. There is **no `/m/pack` queue**: deleted 2026-09-14 by operator ruling. Do not recreate it. |
| Claim | `/m/claim` |
| SKU exceptions (on-hold `TMP-…` placeholders) | `/m/on-hold` queue · `/m/on-hold/[sku]` hub (summary card → `/info` details + pencil edit; doors Photos · Locations · Pair; dock Share · Take photo · Pair) · `/photos` · `/locations` (count via `/m/pair/[code]/[sku]?from=on-hold`, returns here) · `/pair` pair to Zoho SKU. Desk twin `/inventory/sku-exceptions`; `?sku=` share links land on the phone hub. |
| Warehouse stock record (a location · SKU pair: title + description, count per location, Add location, home tote, Pair to Zoho SKU, photos, Send to staff; an empty location creates a TMP SKU) | `/m/stock` list · `/m/stock/detail?open=<location:sku:source>` record = the desk record's own body (`src/features/stock-record/StockRecordView.tsx`, ARCHITECTURE.md rule 6) in `DetailRecordFrame`, bottom walk Previous · Add photo (`/m/stock/[stockId]/photos`) · Next. Desk twin `/inventory/stock?open=`. |
| Locations / labels (port target) | `/m/…` TBD — must exist before desk Labels is “done” |

**Outbound / inbound verb order** (operator, 2026-09-14) is the ledger in
`src/lib/mobile/mobile-first-surface.ts` → `MOBILE_FIRST_VERB_GAPS`:
import → pick list auto-created → pick by location → label → box → stage
(location scan) → carrier scan-out; inbound delivery → unbox + photos → QC
inspect → QC test → ID kernel marks QC done → place at location → **pre-box**
(labelled, graded, location-paired, ready to pick). Pre-box is the hinge that
makes outbound a lookup instead of a computation.

Machine checklist: `src/lib/mobile/mobile-first-surface.ts`.

### Outbound projection rule

`OUTBOUND_WORKFLOW_SURFACES` and `OUTBOUND_WORKFLOW_STAGES` in the machine
checklist are the root contract for Shipping / Outbound. Mobile owns the job
sequence and completion paths. Desktop consumes the same workflow facts.
Industrial desk pages render the industrial record ledger
([BRIEF.md](../design-system/BRIEF.md) §4 industrial). `DataTable` remains for
triage and admin tables. Adoption is page by page. Stations
consume the same stage/action contract through their station host. A legacy
route may mount the canonical mobile component, but may not gain a second nav
door or a second status/filter implementation.

Entering a task may navigate from its queue to the task route. Once the active
task starts, exception correction, quantity changes, barcode input, and retry
stay in that task surface (inline or in a task-local sheet); they must not send
the operator through a second page tree.

---

## 9. Agent / eval obligations

- Cursor rule: `.cursor/rules/mobile-first-surface.mdc` (`alwaysApply`).
- `AGENTS.md` / `CLAUDE.md` point here.
- Before claiming a **new** product verb done: `/m` path exists and passes §6.
- Design-mcp before UI. Graph impact before shared `/m` shell edits.
- Future: `eval:cohort mobile-first` when peer routes are listed in the cohort file.

---

## 10. Refusals

- “Desktop-only for now; mobile later.”
- Shrinking a desk page and calling it mobile-first.
- A second control grammar that phones don’t share.
- Recents as a full left warehouse rail on the phone SoT.
- Marketing/landing taste skills as law for ops surfaces (out of scope for those skills).
