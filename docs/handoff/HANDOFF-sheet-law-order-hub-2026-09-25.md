# HANDOFF — Sheet law, full-screen order record, then the rest of Plan B (2026-09-25)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`.

**Read first, in this order:**
1. `AGENTS.md`
2. `docs/design-system/BRIEF.md` (the design law)
3. `docs/handoff/mobile-ds-law-exoskeleton-HANDOFF.md` and `mobile-entity-exoskeleton-HANDOFF.md` (the phone record grammar)
4. `docs/handoff/HANDOFF-cross-client-outbound-foundation.md` (the "Page protocol" and the "Page queue")
5. `docs/handoff/SPEC-v1-desktop-outbound-adapter.md`

## Working rules
- **Dev origin:** `http://localhost:3050` only. Never start `next dev` and never bind a port. Check the lane with `systemctl --user status cycleforge-lane@prod`.
- **Commits: the owner has said "commit all of it" for this track.** Commit each finished step as its own commit, with only that step's files or hunks (`git add -p`).
  - Many other agents edit this tree at the same time. Some examples: directed pick (`src/components/mobile/picker/directed/`, `/m/pick/go`), carton hub, ShipStation, tasks, `PickQueue.tsx`, `pinned.json`, `DetailHubScreen.tsx`.
  - Never revert, reformat or commit their hunks.
  - Push only when the owner asks. The pre-push hook runs `verify`.
- **Tokens:** no literal hex, px or tone maps. Values come from tokens (`node tools/design-mcp/ds.mjs tokens <axis>`), and states come from `LIFECYCLE` / `INTAKE`.
- **Fix at the lowest layer that owns the bug:** the server owns facts, the token package owns meaning, and the page owns layout.
- **Known reds (report them, don't fix):**
  - Typecheck: `src/lib/picking/sessions.ts` cannot find `@/lib/picking/tote-scan`. This may already be fixed by the directed-pick agent; check.
  - Ground gate: 45 vs a baseline of 43, from another agent's `rs/[id]/record` and `rs/[id]/work` pages.
  - `color-neutrals` `bg-white` at `KioskHistoryDetail.tsx:145`.
  - 2 tests in `compound-title-strike`.
- **QA-org session for probes:**
  - Pinless sign-in: `POST /api/auth/signin` with header `x-tenant-slug: cycleforge-qa` and body `{staffId:67, deviceKind:'personal'}`. Write the cookies to `/tmp`, never into `tests/.auth`.
  - Playwright: `NODE_PATH=$PWD/node_modules node <script>` at 390×844, `isMobile`, and `waitUntil:'load'` plus a ~2.5 s wait. `networkidle` never settles on `/m/*`.
- **QA fixtures:** `QA_TRIAGE_FIXTURES` in `src/lib/tenancy/qa-org.ts`. Re-seed with `pnpm provision:qa-org -- --triage-only`. Seeded ids on this branch:

| Fixture | Id |
|---|---|
| Return carton | 53283 |
| Repair carton | 53284 (repair service 4865) |
| Ticket carton | 53285 (ticket 514) |
| Unpaired order | 14262 (`QA-TRIAGE-UNPAIRED`) |
| Label-less order | 14263 (`QA-TRIAGE-NO-LABEL`) |
| Placeholder SKU | `TMP-QAHOLDTRIAGE1` |

## Already committed (earlier this track)
| Commit | What |
|---|---|
| `13eb97e37` | Plan A, Foundation 0: QA capabilities, acknowledge, `/api/v1/outbound/work`, the V1 OpenAPI gate, fixtures, adapter spec |
| `d5607943f` | Checkpoint of the whole tree at that time |
| `2ab16cfe1` | `/m/scan`: the `INTAKE` registry (`NEW`/`RTN`/`REP`/`TKT`), ink selection outline, row verbs, Button `ink` variant + `radius="mode"`, `useModeFeedbackSeconds` |

Other agents have committed on top since then (`6b56aa26b` and earlier).

## Owner decisions this session (binding)
1. **Bottom-sheet rule.** A `BottomSheet` on a phone is allowed only for:
   - an edit opened from the `/info` pencil
   - a dock verb's form
   - a confirmation
   - a picker
   - a quick look at a **linked** item from inside another record (for example, an item linked to a ticket)

   The **primary record of the job being worked** is never a sheet. That covers an order while picking or packing, a carton, a unit, a bin, a SKU and a ticket. It opens as a full, scrollable screen with an **X** back to the job.
2. **Option A for the order screen.** `/m/orders/[orderId]` is a real route built on the exoskeleton (`DetailHubScreen`). When it is opened from a job, its bar shows an X that returns to the job.
3. **Order of work:**
   1. sheet law + gate
   2. order record, used from picking and exceptions
   3. `/m/scan` rows open the carton hub
   4. the remaining Plan B lists: `/m/exceptions`, `/m/on-hold`, `/m/inbox`

## Done in this session, UNCOMMITTED (these are my hunks; commit them with the step they belong to)
| File | Change |
|---|---|
| `src/design-system/pinned.json` | **Only the `"BottomSheet"` entry** was rewritten to the sheet rule (useWhen/doNot/law). The `SearchableSelectField` and `EvidenceDisclosure` hunks belong to another agent. The new law text names `src/lib/mobile/mobile-sheet-roles.ts`, **which does not exist yet — step 1b creates it.** |
| `docs/mobile-first/SURFACE_LAW.md` | §7 rewritten: the Record (exoskeleton) kit, the List/job kit, and a "Sheet vs screen" paragraph. The unbuilt `MobileRecentStrip`, `MobileStepShell` and `MobileQueueShell` were removed. |
| `src/components/mobile/redesign/MobileDetailTopBar.tsx` | New `close?: boolean` prop: shows X with `aria-label="Close"` instead of the back chevron; navigation is unchanged. |
| `src/design-system/components/DetailHubScreen.tsx` | `DetailRecordBar.close?: boolean`, passed through to the bar. Check the diff: another agent may also have edited this file. |
| `src/lib/mobile/nav-trail.ts` (+ `.test.ts`, passing) | `mobileJobReturn(raw)` accepts only a `/m/...` path (rejects `//`, backslash, off-site) and returns null otherwise. `withJobReturn(href, from)` appends `?back=`, following the existing `back` param convention. |
| `src/lib/outbound/work-contract.ts` | `outboundWorkQuerySchema.id` (optional positive int), plus an OpenAPI `id` param. |
| `src/lib/outbound/work-projection.ts` | `AND ($9::int IS NULL OR o.id = $9)`; `listOutboundWork` passes `parsed.id ?? null` as `$9`. |
| `docs/openapi/cycleforge-v1.json` | Regenerated; `verify-v1-openapi` passes. Projection and fixture tests pass (14/14). |

Unfinished item from the last step: add an assertion to `src/lib/outbound/work-projection.test.ts` (the test at about line 106, "saved view is a bound parameter") that `{ id: 7 }` binds `values[8] === 7` and the SQL contains `o.id = $9`, and that `{}` binds `null`.

## Next steps

### Step 1b — gate the sheet rule
- Create `src/lib/mobile/mobile-sheet-roles.ts`. It exports `MOBILE_SHEET_ROLES: Record<file, 'edit'|'dock-verb'|'confirm'|'picker'|'linked-peek'|'record'>` for **every** file under `src/components/mobile` and `src/app/m` that mounts `<BottomSheet` (about 32 files; find them with grep). It also exports `MOBILE_RECORD_SHEET_BASELINE`, which is the count of `'record'` entries and may only shrink.
- Classify each file by reading it. Likely record sheets, judged by name only (verify each): `MobileToShipSheet`, `MobilePackingSheet`, `MobileCartonSheet` (the carton hub `/m/r/[id]` exists), `MobileOrderEvidenceSheet`, `PrepackedProductSheet`, `PairDetailSheet`, `MobilePackerItemsSheet`, `UnitLineSheets`/`UnitSheetParts`.
- Extend `scripts/detail-hub-guard.ts`, which is already the `Detail hub` gate in `verify:fast`:
  - A new phone `BottomSheet` file that is missing from the map fails with "classify it".
  - More `'record'` entries than the baseline fails.
  - Fewer entries than the baseline asks you to lower the baseline in the same commit (the same wording the guard already uses for unported hubs).
- Add the new rule id to `DetailHubRule` / `DETAIL_HUB_REFUSAL` in `src/lib/mobile/detail-hub-law.ts`, so the design-mcp `ds_detail_hub` face serves it.
- Prove it: add an unclassified sheet file and the gate exits 1; revert and it exits 0.
- Commit this together with the pin and §7 hunks.

### Step 2 — the full-screen order record
- Rebuild `src/app/m/(shell)/orders/[orderId]/page.tsx`. Today it renders `src/components/mobile/redesign/OrderDetail.tsx`, an old bento layout with its own X and a sticky Done button. The new version sits on `DetailHubScreen`; copy the reference carton hub `src/app/m/(shell)/r/[id]/{page,info/page,layout}.tsx` + `useCartonHub` + `CartonInfoCard`.
  - **The route param is the public `order_id` string, with the `orders.id` pk as a fallback.** Callers: `PickQueue.tsx:284`, `MobileToShipQueue.tsx:273`, `MobileShippedHistory.tsx:93`, `deadline-bands.ts:135`, `shipped-as-work-row.ts:32`, `/api/scan/resolve`.
  - **Data**, through React Query under a new `qk.orders.hub(key, facet)` in `src/queries/keys.ts`:
    1. `GET /api/orders/lookup/<param>` (`src/app/api/orders/lookup/[orderId]/route.ts`). It returns the order, customer, ship-to, tracking, serials and activity, and resolves `order_id` or tracking. Add a pk path, `?by=id`, that uses the file's existing `loadOrderDetailById`. **The cache key must include `by`.** Fall back to it when the string lookup returns 404 and the param is numeric.
    2. `GET /api/v1/outbound/work?id=<pk>`: the server-owned `OutboundWorkItem` (Zoho-governed title, `warehouseStage`, label/`shippingLabel.live`, acknowledgment, stock, priority).
  - **State chip:** add `workStageLifecycleState(stage, {urgent})` in `src/lib/order-lifecycle.ts`, next to `orderLifecycleState`, as the one mapping. Rules, in order:
    1. `SCANNED_OUT` → `shipped`
    2. `OUT_OF_STOCK` → `outOfStock`
    3. urgent → `urgent`
    4. `PACKED`/`LABELED` → `packed`
    5. anything else → `ready`

    Unit-test it. Render the chip with `LifecycleCode` (`src/design-system/components/record-ledger/LifecycleCode.tsx`) or with `DetailSummaryCard`'s chip classes taken from `LIFECYCLE_CLASSES`.
  - **Card:** `OrderInfoCard` built on `DetailSummaryCard`. Title = the item's product title; lines = tracking · carrier (or "No shipping label yet") and qty · condition · channel; foot = the `order_id` in mono; the whole card links to `/m/orders/[orderId]/info`.
  - **Doors** (`detailDoor`): Units (serials) → `/units`, Activity → `/activity`. Each door screen and `/info` sits on `DetailRecordFrame`. `/info` holds every fact (customer, ship-to, ship-by, tracking, label state, acknowledgment, stock, notes count) and has no write controls.
  - **Dock:** `DetailDock`, at most 3 verbs with exactly 1 primary. Suggested: Documents (primary; opens the existing `MobileOrderDocumentsSheet` as the dock verb's sheet) · Copy order # · Scan again. Ask the owner if Pick/Pack verbs should replace any of them.
  - **Bar:** `close: mobileJobReturn(searchParams.get('back')) != null` and `backHref = that path`, or no `backHref` when it is absent.
  - Move the peer `/m/orders/[orderId]` in `src/lib/mobile/detail-hub-cohort.ts` to `status: 'ported'` with `info` set. Lower `DETAIL_HUB_UNPORTED_BASELINE` in the same commit; the guard asks for it.
  - Delete `OrderDetail.tsx` once nothing imports it. Check with lsp references.
- **Open the record from the jobs with `withJobReturn(href, currentPath)`:**
  - `PickQueue.tsx:284`; coordinate with the directed-pick agent's in-flight edits there.
  - `/m/exceptions/[orderId]` (`MobileOrderExceptionTask`): decide whether it redirects to the order hub or keeps its task screen with a door to the hub. Recommended: keep the task screen, which is a job, and add an "Order" door or link to the hub.
  - `MobileToShipQueue` (the sheet row → hub), if it is classified as a `record` sheet in step 1b.
- **Prove it live** at 390×844 on orders 14262 and 14263: take screenshots, measure the X closing back to the pick queue at the same scroll position, the chip code, 48 px targets and `data-mode="triage"`. Then run `detail-hub-guard` and `pnpm verify:fast`.

### Step 3 — `/m/scan` rows open the carton hub
- `src/components/mobile/scan/MobileScanIdentify.tsx` currently opens row verbs: Photos & classify (ink) · Return · Repair, all deep links into the classify flow (`?type=` hint).
- Change it so tapping a row opens `withJobReturn('/m/r/<id>', '/m/scan')`. Move the triage decisions into the carton hub.
- The carton hub's dock already has 3 verbs (Take photo · Unbox · Scan again), so Classify has to be a **door** on `/m/r/[id]` that leads to the classify flow. Ask the owner if "Classify" should replace "Scan again" in the dock.
- Keep `MobileStationTapeItem`'s verb-list support; scan-out and other stations use the shell.

### Step 4 — the remaining Plan B lists (triage mode)
Apply BRIEF §4 triage to each list; records stay on the exoskeleton:
- rows lead with a state code, from `LIFECYCLE` or `INTAKE`
- the selected row gets the 2 px ink outline
- radius `rounded-mode`, `min-h-mode-hit`, `text-mode-body`
- the primary decision is an ink `Button variant="ink" radius="mode"`
- opacity-only motion via `useModeFeedbackSeconds`

| Page | Known gaps |
|---|---|
| `/m/exceptions` | Industrial rows, a pink spine with no code, "NO SLA ASSIGNED" truncated. |
| `/m/on-hold` list | Pill-shaped raw-blue Merge buttons; an ON HOLD chip — `LIFECYCLE` now has `onHold` (`HLD`), use it. The `[sku]` page is already a ported hub; don't restyle it. |
| `/m/inbox` | The raw "support_ticket #450" text (use `payload.ticketNumber` and the words for the kind); every row reads "Handed to you" with no state code or decision. |

For each page: take BEFORE and AFTER screenshots, write a behaviour checklist, get `verify:fast` green except the known reds, commit, and update the page-queue row in `HANDOFF-cross-client-outbound-foundation.md`.

## Open decisions still with the owner (from earlier reports)
- **Ticket verb.** `/m/t/[id]` takes the provider ticket number, but the tape's ticket label mixes local ids and Zendesk numbers.
- **`CopyChip` renders a `<button>` inside a row's `<button>`.** This is a pre-existing hydration warning on `/m/scan`. Proposed fix: render the chip inert as a `span` when copying is disabled.
- **`BottomSheet` portals out of the page's `ModeRegion`**, so sheets have to re-declare `ModeRegion` (the existing pattern).
- **The Plan A list:** Zod on `orders/add`; publishing acknowledge in OpenAPI; audit on refusals; the return fixture's position in the tape; bin rows for the placeholder SKU.
- **INTAKE in the BRIEF.** Add a line for `INTAKE` to the BRIEF's resolved list if the owner approves.
