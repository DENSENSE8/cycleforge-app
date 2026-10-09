# PROMPT — Order record: one calm, scannable detail view (2026-10-08)

Paste this whole file as the first message of a fresh implementation session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod` (lane `lane-prod`, branch
`prod/worktree-2026-09-11`). Read `AGENTS.md` first: one dev origin `:3050`,
lane lifecycle is operator-only, the tree is shared with another session — commit
only your own paths (`git add <path>`, never `-A`, never stash/restore).

## Goal

The order details view (the record that opens from Allocate, To ship, Pending,
Search and Unbox) shows everything the operator needs, but it reads as a stack of
equal-weight cards with empty facts, repeated facts and a long verb list. Make it
a calm, scannable record: identity and status at the top, the one next step
obvious, every fact painted once, nothing empty shouting for attention — on a
13" laptop and on a phone.

This is a DISPLAY pass. No new data, no new writes, no new routes.

## Where things stand (uncommitted work from today, same tree)

- Header (`DeskStageRecordHeader`, `src/design-system/components/DeskStageOverlay.tsx`):
  title = `OrderRecordTitle` (`src/components/outbound/orders/OrderRecordView.tsx`)
  — order id (click copies; the other order-number actions open flush on its right
  edge via `OrderAdminLinkAction copyOnClick`, `order-link-editors.tsx`) · platform
  · ordered-at. Right side, left of In place | Split: `OrderRecordStatusTags` — every
  current status as an orange pill (Buyer cancel / Picked / On the way… plus
  Urgent with its word), from `orderStatusTags` (`src/lib/orders/order-fulfillment-summary.ts`,
  unit-tested). Mounted by `OrderRecordHeaderActions`
  (`record-keys/OrderRecordHeaderActions.tsx`) and `SearchOrderRecord`.
- Body: `OrderRecordView` composes `RecordGroup`s per view. Which sections a view
  paints is `VIEW_SPECS[viewKey].record` (`src/lib/views/view-specs.ts`); section
  ids and what each holds: `OrderRecordSectionId`
  (`src/lib/selection-context/order-inspector-context.ts`). Allocate-style views
  (`recordPresentation: 'allocate'`: to-ship, pending, search.orders,
  unbox.fulfilled-order) render the fulfillment-first layout; `shipping.shipped`
  renders `standard`.
- Groups today (allocate face, main column): Fulfillment (stage nodes QC · Picked ·
  Pack · Scan out + Imported / Ship by) → Customer note → Items (+ price footer) →
  Serial numbers · N (`RecordSerials`) → Staff notes. Aside: photos door ("No photos
  yet") → Customer → Shipping (Tracking) → Actions (`RecordActionStrip face="panel"`)
  → Danger zone.
- Verbs: `useOrderActionVerbs` in `to-ship/MorphingRowActionMenu.tsx`. Toggles are
  live-derived and reversible: Mark / Clear urgent; Buyer cancelled / Undo buyer
  cancel (any time, `DELETE /api/orders/list-removal`).
- Phone: `/m/orders/[orderId]` (`src/app/m/(shell)/orders/[orderId]/` — `info`,
  `units`, `activity`). Law: `docs/mobile-first/SURFACE_LAW.md`.

## What the operator sees (CF-TEST-PH-000001, 1440×900, Allocate)

Observations from today's screenshots, not yet measured on other orders — confirm
each on 3–4 real orders (single line, multi-line, shipped, buyer-cancelled)
before changing it.

1. **Serial shown twice.** Items row paints `Serial 123456`, and a separate
   `Serial numbers · 1` card paints it again. Pinned law (`design-system/pinned.json`,
   RecordFlowFacts): serials are item identity — inline with the item through the
   house `SerialChip`, never repeated.
2. **Empty facts take full rows.** Items shows `Item #` with only a link icon,
   `Cond` with nothing, `Ref` as a bare link; Shipping shows `Tracking Not added`
   in a warning tone on an order that is not packed yet.
3. **Totals repeat on one-line orders.** `Items $5.00` and `Total $5.00` stacked.
4. **Status reads in three places.** Header pills (new), Fulfillment's stage
   nodes, and the lifecycle code on non-allocate views (`OrderRecordStatus`).
   Decide one owner per fact: header = where the order is; Fulfillment = who did
   each step and when.
5. **Stage order reads oddly.** QC "Awaiting assignment" sits left of Picked. Check
   `RecordFulfillmentSources` / `OrderLineFulfilment` ordering against the real
   flow before touching it — it may be deliberate (QC-gated SKUs).
6. **The Actions panel is a long equal-weight list** (Buy label, Mark urgent, Pair
   SKU to location, Create customer ticket, Assign task, Return label, Download
   photos, Buyer cancelled, Documents, Scan out, then Danger zone) and pushes below
   the fold at 900px. Three solid colour blocks (blue / yellow / orange) compete.
7. **Staff notes** is a large empty textarea at the bottom of the main column.
8. **"No photos yet"** is a full-width bar above Customer.

## Change

Work view by view in this order: `shipping.to-ship` (Allocate) → `search.orders`
→ `shipping.shipped` → `unbox.fulfilled-order` → phone. Each is one commit.

- **One owner per fact.** Write a short table first (fact → the one place it
  paints → views) and put it in this file under "Fact owners" before coding.
  Serial → Items row only (delete the duplicate `RecordSerials` card from the
  order record, or fold its Copy all into the item row — operator call, ask).
- **Empty facts collapse.** A fact with no value either disappears or becomes one
  quiet "Add …" affordance at the end of its group — never a label with a blank.
  Use the existing editors (`ListingLinkEditor`, `OrderAdminLinkAction`); no new
  ones. Warning tone only for a fact that is late, not merely absent.
- **Price footer** shows Total alone on a one-line order; the breakdown only when
  it differs (multiple lines, shipping, tax, discount).
- **Actions:** keep `RecordActionStrip face="panel"`; show the lead verb plus the
  view's `verbs.secondary` that apply now, then a "More actions" disclosure for the
  rest. Keys stay disclosed on hover (owner 2026-10-03, lint `cf-keys/hotkey-on-hover`)
  except where an exception is already listed in `eslint.config.mjs`. At most one
  solid-colour CTA.
- **Notes** collapse to a one-line "Add a note" until focused or until a note exists.
- **Photos door** becomes a compact control in the aside header, not a bar.
- **Phone:** each `/m/orders/[orderId]` tab mirrors the same fact owners; the
  primary verb is the bottom button (`DetailDock`).

### Rules that bind this work

- `ds_contract` before any new component; `ds_display_method` if a group changes
  method; `ds_disclosure` for the screen budget; `ds_critique` on every touched UI
  file. Read `docs/design-system/CONSOLIDATION_LEDGER.md` before adding a control.
- Filters / sort / views stay in the left sidebar (`rule://sidebar-controls-contract`);
  this pass touches the record only.
- Identifiers paint through the house chips (`rule://identifier-last8-contract`).
- No raw `<button>` / `<input>` outside primitive homes; tokens from `ds_tokens`,
  never literal colours or `text-[Npx]`.
- Keep every `data-testid` tests read (`order-record-*`, `fulfillment-*`,
  `send-replacement-*`, `order-record-status-tag`); grep `tests/` and `src/**/*.test.*`
  before renaming.

## Acceptance

- Each fact in the "Fact owners" table paints exactly once per view (spot-check
  serial, status, tracking, ship-by, total).
- No label with an empty value anywhere in the record on the four sample orders.
- Allocate record at 1440×900: header, Fulfillment, Items and the lead verb are
  all visible without scrolling; Actions shows ≤ 6 verbs before "More actions".
- Header status pills unchanged in behaviour: Urgent + Buyer cancel show together
  and both undo (re-run the flow below).
- Phone (390px): each tab fits, no horizontal scroll, the bottom button is the
  view's primary verb.
- `pnpm verify:fast` green; `ds_critique` clean on touched files (the existing
  size / raw-button findings in `OrderRecordView.tsx` predate this work — don't
  grow them; splitting the file is welcome).

## Test (only when `:3050` answers as `lane-prod`)

Read `~/.config/cycleforge/switch-pin`, check the Next process on `:3050` runs from
this worktree, then use the saved session (`tests/.auth/admin.json`, see
`tests/shot.mjs`). Today the dev overlay is up from another session's compile
errors (`MobilePackerCamera.tsx`, `usePickOrder.ts`) — hide `nextjs-portal` in
throwaway probes, never fix their files.

1. Desktop Allocate: `/shipping/orders?openOrderId=19955` (CF-TEST-PH-000001, a
   safe test order). Screenshot before and after each change.
2. Status flow on the test order: Mark urgent → Buyer cancelled → reopen → Undo
   buyer cancel → Clear urgent; the header pills follow each step. Leave the order
   as you found it (`In progress` only).
3. Search record: `/search?sel=order:<id>` for a shipped order and a
   buyer-cancelled one.
4. Phone: 390×844 on `/m/orders/19955` and each tab.

Report: before/after screenshots per view, the Fact owners table, verify output.

## Deploy (when asked)

Same as `HANDOFF-label-buy-stepper-2026-10-08.md` § Deploy: commit only your
paths, push `prod/worktree-2026-09-11` (pre-push runs `verify:dogfood`; if the
other session's uncommitted work fails it, push from a clean
`git worktree add --detach /tmp/cf-ship <sha>`), then `vercel deploy --prod --yes`
from that clean worktree and confirm with `vercel inspect <url>`.
