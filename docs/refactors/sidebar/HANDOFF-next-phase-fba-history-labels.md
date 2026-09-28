# HANDOFF — Next phase of the contextual sidebar: FBA, Inbound History, Labels

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27 at the end of the
session that ported Inbound (both lanes) and moved every To ship / Inbound header control into the
sidebar. Plan approved by the owner ("This looks good"). Phase order: **1 FBA → 2 Inbound History →
3 Labels.**

**Status (2026-09-28):**
- Phase 1 FBA — **done.** Views Ready · Plan · Combine · Shipped · Catalog (owner: Combine
  stays, it is the bare default), `NAV_VIEW_ICONS['fba.*']`, tab row + Ready's mode filter
  deleted, `NAV_CONTEXT_ROLLOUT.fba = 'contextual'`. Open: no contextual painter for
  `scanInput`, so the FNSKU field is still absent on `/shipping/fba`.
- Phase 2 — step 2 (door memory) **done**; step 3 **done for Inbound only** (owner: Shipping
  Find stays desk-local per the `outbound-routes.ts` ruling): `?find=`. Exact hit opens was
  already live on the card faces (`receiptExactFind` / `cartonExactFind`, opens as soon as
  Find names one card — no Enter); serial is not one of their keys.
  Step 1 **landed by the concurrent Unboxed session** (attention pills `?dflag=` + Kind
  `?dkind=`; no sidebar state row). Step 4 (counts) **skipped** by the owner.
- Phase 3 Labels — sidebar half **landed by the concurrent Labels session** (views To print ·
  Printed, `label-intake` contextual).
- **Parent tier on every mode (operator 2026-09-28):** every page of a door lane shows
  `‹ <Lane>` + the lane's mode card with itself current (Labels & docs, FBA, Sourcing — no
  `‹ <Page>` row). Resolver-derived (`build.ts` `modeLaneOf`), pinned by `resolve.test`, law in
  `pinned.json` (ContextualSidebar).
- **Sourcing — done** (next page in the port queue): contextual, see the check matrix row.

---

You are continuing the contextual-left-sidebar port. Three pages, in order. Each phase ends
with a browser proof on `:3050` before the next starts.

## 0. Read first (in this order)

1. `AGENTS.md` — probe only `http://localhost:3050`; lane unit `cycleforge-lane@prod`.
2. `docs/refactors/sidebar/HANDOFF-contextual-page-port.md` — the per-page port loop (steps 1–7,
   traps, proof list). Follow it for FBA and Labels.
3. `docs/design-system/HANDOFF-triage-family-contract.md` — especially **"The sidebar half of the
   contract"**: status chips in the middle; every sort / filter / date / Find in the left sidebar;
   URL is the only state; one param, one control; server-safe `pages.ts` imports.
4. `docs/refactors/sidebar/HANDOFF-outbound-sidebar-verify.md` — the check matrix. Add rows for
   every page you touch; don't fork it.
5. `docs/design-system/HANDOFF-inbound-history-cards.md` — its last section lists History's sidebar
   state and backlog.

Shared tree rules: `git status --short` before you start. Other sessions are live (orders cards,
label-intake rebuild, auth). Re-read a file right before each edit, never revert what you did not
write, never commit without asking, report red in other people's files instead of fixing it. If a
file you are editing changes under you, stop and re-read.

Probe hygiene: use the saved session `tests/.auth/admin.json` (`storageState`) — do NOT mint a
sign-in per probe run; `/api/auth/signin` rate-limits at 10 per 10 min and a retry loop keeps it
locked. Leave ≥200 ms after `Escape` before `G` (scanner-burst guard). Wait for
`[data-nav-switcher="view"]`, not `networkidle`. Delete probe scripts from `/tmp` when done.

## What landed already (don't redo)

- **Controls contract:** `NavControls` has `sort` (with optional `dirParam`), `staff`,
  `dateRanges`, and `choices` (single-choice, no counts, `clearParams`) — `schema.ts`, painted by
  `NavFilters.tsx` (`SortRow`, `StaffRow`, `DateRow`, `ChoiceRow`).
- **Inbound:** `NAV_CONTEXT_ROLLOUT.incoming = 'contextual'`, `viewKeys: true` (`1` On the way,
  `2` History). On the way: Save view · Sort · Source. History: Save view · Sort · Handled by ·
  Activity date · Activity (`?sort=` unboxed/scanned axis) · State (`?dstate=`).
- **To ship:** the header ⇅ menu and the per-section sorts are gone; the sidebar Sort carries every
  order the old menu had.
- **Go keys:** `G` + letter is **per lane** (`NAV_GO_KEYS` in `src/lib/nav/go-keys.ts`): Shipping
  lane `S/F/L`, Inbound lane `D/S`. The header strip shows the lane's modes top-middle, icons in their
  mode tones, no `[G] then` lead, and nothing shades the list.
- **Nav:** Automations is a top row under Chat; the empty Automations lane was removed.
- **Server-safety:** `STAFF_FILTER_PARAM` / `parseStaffParam` live in
  `src/lib/station/table-url-params.ts` (not the `'use client'` hook).

## Phase 1 — FBA onto the contextual sidebar

Facts (verified 2026-09-27):
- `/shipping/fba` shows **no sidebar column** — `NAV_CONTEXT_ROLLOUT.fba = 'legacy'`.
  `parityGaps('fba')` → `[]`. `NAV_PAGE_DECLS.fba` already declares `viewKeys: true` and the FNSKU
  `scanInput`.
- Mount: `src/app/shipping/(desk)/fba/page.tsx`; legacy panel `FbaSidebarPanel`
  (`SidebarContextPanel.tsx:59`).
- **View mismatch:** `SIDEBAR_PAGE_NAV.fba.children` = Plan · Combine · Shipped, but the page's own
  tab row paints Ready · Plan · Shipped · Catalog, and `FbaMode` (`src/lib/fba/fba-modes.ts`) =
  `ready | plan | combine | shipped | catalog`.

Do:
1. Make the view children the page's real modes, each round-tripping on `?fbaMode=` (Catalog may be
   `?details=catalog` — read `fba-workspace-hooks.ts`). **Ask the owner whether Combine stays** (no tab
   paints it today) before deleting or keeping it.
2. `NAV_VIEW_ICONS['fba.<view>']` for each view (FBA's purple family).
3. Delete FBA's own tab row in the same change (`DeskPageLayout bare`, as the Shipping desk layout
   does). Clean cutover — no second path.
4. Canary with the per-staff override `nav.contextual.fba = contextual`, run the proof, then set
   `NAV_CONTEXT_ROLLOUT.fba = 'contextual'`.
5. Proof (port handoff §4): views + digits land on the right URL, reload and back/forward change
   nothing, `G F` / `G S` / `G L` from FBA, no `Hydration failed`, `resolve.test.ts` green,
   `node scripts/probe-sidebar-contract.mjs` (note: that script still predates `controls`,
   `viewKeys`, `locate` — report its schema drift, don't let it block).

## Phase 2 — Inbound History display

History now renders on the triage **card** face (another session's port: `receipt-card-model.ts`,
status chips Scanned · Unboxed · On hold · Exception · Received). Do:
1. **One param, one control:** the chips and the sidebar State row now cut the same thing. Make the
   chips write `?dstate=` (multi-value if the chips are multi) and remove the sidebar State `choice`
   from `DOCKED_CONTROLS` in the same change; keep `dstate` in the saved-view keys. Coordinate with
   whoever owns `receipt-card-model.ts` / the chips — ask before editing their files.
2. **Door memory:** add `incoming` to `LANE_DOOR_FIRST_VIEW` in `useLaneDoorHref.ts` so `G D` and the
   map's Inbound row reopen the last Inbound view (On the way or History). Probe `G D` from a Shipping
   page and from Sourcing.
3. **Find in the URL + exact hit opens** (`NavFind`, every `desk-store` page — Shipping and Inbound
   together): a saved view / shared link carries the search; an exact carton / PO / tracking / serial
   (orders: order number) opens the record.
4. **Counts (optional, ask first):** a facet context `incoming.docked` / `incoming.pipeline` in
   `src/lib/nav/facets/` (pickup's pattern) gives view counts in the switcher, option counts, and an
   exception alert beacon. History's read is up to 3000 rows — prefer a count-only SQL.

## Phase 3 — Labels (`/shipping/label-intake`, "Labels & docs")

**Owner ruling 2026-09-27: Labels displays ONLY with the triage design system** — the page-agnostic
triage face (`TriageCardList` / `RecordCard` / `TriageSelectBar` / `TriageListBody` /
`DeskRecordPlane`) per `HANDOFF-triage-family-contract.md`: a Labels **data host** + a pure **family
adapter** (`labelCardModel`), no bespoke list, no DataTable face. Ask the owner before keeping any
other face (e.g. a Floor ledger).

**Gate:** another session is rebuilding this page right now (`page.tsx` modified,
`LabelIntakeLedger.tsx` deleted, untracked `LabelPrintDesk.tsx`, `LabelDocumentPane.tsx`,
`src/lib/label-prints/`). Their mid-edit states broke the dev server twice on 2026-09-27. **Do not
start Phase 3 until that work has landed** — check `git status` and ask the owner.

Facts:
- `NAV_CONTEXT_ROLLOUT['label-intake'] = 'legacy'`; `parityGaps('label-intake')` → `[]` but its
  parity list is empty — it declares nothing yet, so fill the rows as you inventory.
- The route is **outside** `src/app/shipping/(desk)/`, so it gets no header key strip (port handoff
  §3 trap). Move it into the desk group or accept the fallback explicitly (ask).
- `SIDEBAR_PAGE_NAV['label-intake']` has no children, so the sidebar can only paint the page map.
- Today the page paints its own left list (Find · All / No order / Paired) and tabs (Pending · Record
  · Desk · Floor) plus header verbs (Upload label PDFs · Print all labels).

Do (after the gate clears and the pattern card is signed off):
1. **Pattern card** in `RECORD-CARD-MIGRATION.md`: grain (one card = one label / one print job?),
   identity (order # / tracking + carrier), top-right status (printed / pending / quarantined),
   facts, next step ("→ Print", "→ Pair"), status-chip keys (candidates: Pending · Printed · No
   order · Paired), verbs with scopes (print, reprint, pair, upload packing slip, delete), noun,
   test-id prefix `label-card`, record URL param, storage keys `cf:label-cards:*`. Owner signs off
   before code.
2. **Sidebar half:** views = the page's tabs that are really views (Pending · Record) as
   `SIDEBAR_PAGE_NAV['label-intake'].children` with round-tripping hrefs; Find → sidebar `NavFind`;
   All / No order / Paired → the status chips if they are statuses, else a sidebar `choices` row (one
   param, one control); Upload label PDFs · Print all → `NAV_PAGE_DECLS['label-intake'].actions`;
   `NAV_VIEW_ICONS` (teal family — Label intake's mode tone is `text-teal-600`); `viewKeys` only after
   proving no other bare digit is bound there.
3. Delete the page's own left list and tab row in the same change; flip the rollout after the
   canary + proof.

## Done means (every phase)

- `node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/nav/context/resolve.test.ts src/lib/sidebar-navigation.test.ts src/lib/nav/*.test.ts` green;
  `parityGaps(<page>)` → `[]`.
- A browser probe on `:3050` with the evidence named above; screenshots of the sidebar and header.
- `pnpm verify:fast` — report foreign failures separately with `git status --short <file>` proof
  (known foreign red on 2026-09-27: `src/lib/auth/pin.ts` typecheck).
- Check-matrix rows added; the triage-family handoff's "Live references" updated.
