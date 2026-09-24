# HANDOFF — Industrial record: buyer-note interlock + open threads (2026-09-24)

Paste this whole file as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`). Read first, in order:
[`HANDOFF-industrial-record-ledger.md`](./HANDOFF-industrial-record-ledger.md) (the record law —
its anatomy section is current as of this handoff), then `AGENTS.md`. Dev origin
`http://localhost:3050` only. Do not commit; the owner commits. The tree carries many
uncommitted changes from other lanes — touch only what your task needs.

## 1. The task: buyer notes are an active fulfillment exception, not metadata

Owner ruling (2026-09-24), verbatim intent: a buyer note ("ship white instead of black") is an
active exception. Today the note is a tiny document icon floating on band 3 between PACK and
LISTING (`LedgerNote` in `src/components/outbound/orders/outbound-orders-ledger-editors.tsx`,
mounted in `LedgerRecord` band 3 of `OutboundOrdersLedger.tsx`). By the time the eye reaches it the
item is already off the shelf. Replace it with four layers:

1. **Left-side priority anchor.** Group a note indicator with the state code on band 1 (after
   `☐ · CODE`). An order WITH a buyer note renders a fixed-width, high-contrast **amber `NOTE`
   badge**; an order without one keeps an empty rigid slot of the same width, so platform /
   order # never shift. Amber ink must pass 4.5:1 — use the mode's warn ink (`text-mode-warn`,
   the same reason `URG` uses it; see `recordStateCodeClass` in
   `src/design-system/tokens/industrial-record.ts`). Add the badge class to that token file so
   the phone record uses the same face.
2. **Amber left accent, zero width change.** A noted record gets an amber indicator on the left
   edge — the width-preserving signal, like the OOS hatched spine. Do NOT add a second spine
   (the owner just removed double vertical lines on seed children). Recommended: a 2px amber
   inset on the existing 5px spine (e.g. `shadow-[inset_-2px_0_0_var(--mode-warn-text)]` or a
   token), so a noted OOS row still reads OOS first. Decide and state it.
3. **Text lives in the evidence column, never inline.** The row shows only the badge. Opening
   the record loads the full note at the TOP of `OutboundOrderEvidence.tsx` (a warn-ink block
   under the state strip, above the photo). The current Note fact (latest + add) stays below
   for adding notes. Phone: same block at the top of
   `src/components/mobile/orders/MobileOrderEvidenceSheet.tsx`. Remove `LedgerNote` from band 3
   (the note editor lives in the evidence column only) and give its width back to the BIN lane.
4. **Packing interlock (soft hold).** When a noted order is packed — the ledger's `→ Pack`, the
   phone sheet's **Pack** verb (`/m/pack/start/[id]`), and the pack station's verify scan — show an
   acknowledgement modal with the full note that the operator must confirm before the label
   generates / packing proceeds. Record the ack (who, when) through the existing order
   events/notes path; do not invent a table without reading `skill://db-migration-author`.
   Find where the label is generated in the pack flow (`/m/pack/start/[orderId]/page.tsx` →
   `POST /api/packing-logs/draft` → `/m/p/[id]/photos`; desk pack station `src/components/packer/**`)
   and gate there, server-side too (a client-only modal is not an interlock).

**Open question to resolve by reading code, not guessing:** what counts as a *buyer* note.
`orders.notes` today is the append-only operator trail (`POST /api/orders/[id]/notes`, see
`handleCommitSubtitleField` in `src/components/dashboard/orders-queue/useOrdersQueueFeed.ts`).
Check whether marketplace buyer messages / gift notes are ingested anywhere (order ingest,
`src/lib/orders/ingest-canonical-orders.ts`, connectors). If buyer notes and operator notes
share `orders.notes`, list it as a numbered decision with a recommended default (e.g. a
`buyer_note` fact from ingest + an operator "treat as instruction" flag) before building.

Acceptance: desk 1440×900 M zoom and phone 390×844 `/m/orders?display=ledger` screenshots
with a noted and an un-noted row side by side (no column shift); interlock blocks pack until
acknowledged (show the server rejecting an un-acked pack); `pnpm verify:fast` green except the
pre-existing `src/lib/picking/sessions.ts` → `@/lib/picking/tote-scan` error (another lane's).

## 2. State of the work this session left (all uncommitted)

**Desk To-ship ledger** (`src/components/outbound/orders/`):
- Industrial bar: page actions (Past imports · Labels · Sync) are flush bar segments like the
  modes — `DeskHeaderFaceProvider` / `DESK_BAR_SEGMENT_CLASS` in
  `src/design-system/components/DeskActionSlot.tsx`, `DeskHeaderSplitAction.tsx`, and
  `SlicedActionDock` `embeddedChrome="segment"`.
- Record in the F-pattern (band 1 `☐ · CODE · platform · order # │ date`; band 2 `title │ QTY
  badge`; band 3 `condition · BIN · SKU · pick · pack · note · LISTING ↗ │ → next`). Price only
  in the evidence column (green). One right column (date · QTY · next) — verified same pixel.
  Seed children wear one spine. Seed parent: location, pick/pack for all lines, next step.
- Faces promoted to `src/design-system/tokens/industrial-record.ts` (RECORD_* + QTY badge +
  `recordStateCodeClass`); ship-by face `src/lib/orders/ship-by-face.ts`; photo fetcher
  `src/lib/photos/line-photos.ts` (desk uses Unbox's `PhotoViewerPortal`).
- Square staff marks: `StaffAvatar` / `IdentityMark` `shape="square"`.

**Phone** (`/m/orders?display=ledger`, Ledger toggle; cards stay default):
`src/components/mobile/orders/MobileOrderRecord.tsx` (F-pattern, 32px micro-thumbnail, no
price) + `MobileOrderEvidenceSheet.tsx` (hero image → All photos, Pick/Pack, Pass pick, urgent,
Exceptions: out of stock · damaged · discrepancy, listing, labels · slip, details, facts incl.
price) + `MobileLinePhotoViewer.tsx`; pure facts `src/lib/work-orders/mobile-record-facts.ts`.
Industrial `ModeRegion` now lives on `AssignedOrders.tsx` (covers `/m/orders` and `/m/work`).
Open: the outbound-workflow cohort (`src/lib/shipping/outbound-workflow-cohort.ts`) still
governs the CARD row ("no Pick/Pack execution on Orders"); re-ratify before the ledger replaces
the cards.

**Auto-assign rules — item # + SKU pair:** code done (matcher precedence: exact pair beats the
item-#-only rule; card saves pairs). Migration
`src/lib/migrations/2026-09-24_automation_rules_item_sku_pair_key.sql` is **NOT applied** —
until it is, saving a pair for a listing that already has an item-#-only rule hits the old
unique index (409). Apply: `npm run db:migrate:dry` → `npm run db:migrate` → `npm run
tenancy:coverage`, only with the owner's go-ahead.

**Platform short labels ("Edit platforms", e.g. Amazon Renewed → `AMZRN` for the 2×1 label):**
a sub-agent (`PlatformShortLabels`) was mid-flight at handoff. Its brief: add `short_label` to
`platforms` (and `platform_accounts` if connection-grain), shortLabel through the
`src/hooks/useCatalog.ts` resolver, a short-label field in Unbox's `CatalogManagerList` /
`CatalogManagerPopover` with `PlatformAccountsManager` embedded for connection names, an
"Edit platforms" control in the desk ledger toolbar opening the same popover, and short labels
read by `src/lib/print/printReceivingLabel.ts`, the desk record/parent band, and the phone
record. **First step next session:** `git status` + read its files; verify typecheck,
`pnpm exec tsx scripts/boundary-guard.ts --enforce`, and that any new migration is unapplied.
If it did not finish, finish that brief before the note work (both touch band 1 of the record).
