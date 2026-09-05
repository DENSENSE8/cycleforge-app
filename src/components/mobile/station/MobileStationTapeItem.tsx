'use client';

/**
 * One thing on a mobile station's tape.
 *
 * ## A ledger, not a stack of cards
 *
 * Rows are flush and full-bleed, divided by a hairline. They used to be rounded
 * cards floating on the canvas with a gutter and a gap, which is the phone-app
 * default and the wrong one here: forty of them read as forty objects to
 * consider rather than as one running list to scan down, and the gutter threw
 * away horizontal room a long product title needs. The corners on this screen
 * belong to the capture window — the one surface the operator physically aims —
 * and spending them on every history row made none of them mean anything.
 *
 * ## Two lines, and the second one is not a sentence
 *
 * Line 1 is the product title, ALWAYS one line — the only field an operator
 * can match against the box in their hands, and a row whose height changes with
 * the length of a marketplace title makes the tape impossible to scan down. It
 * truncates; it never wraps, and it is never absent: a shipment that resolved
 * to no product still gets a line saying so, because a row that silently drops
 * its first line reads as a different KIND of row rather than as the same row
 * missing a fact. Line 2 is the record and the label, in the order the
 * rest of this codebase already uses them: `OrderIdChip` first, `TrackingChip`
 * to its right (`MobileToShipRow`, `PendingOrderRow`, `MobilePackingSheet`),
 * then the relative stamp hard right.
 *
 * The outcome verb used to live on line 2 ("SCANNED OUT", uppercase, tone ink).
 * It is gone (operator 2026-09-04). At a dock the verb was the same word on
 * every row, so a column of it carried no information while occupying the most
 * scannable position on the card; the identifier the operator actually reads
 * back was demoted to a chip beside it. The outcome still shows — as the tone
 * of the stamp, and as the server's own message on the rows that have one — but
 * it no longer costs a line to say "this went the way it always goes".
 *
 * ## One component, two emphases
 *
 * `focus` is the thing that just happened; `history` is everything behind it.
 * They were two components with a copy-pasted footer between them, which is four
 * stations x two copies of every future row change. The difference is scale and
 * a tone plate, not structure — so it is a prop.
 *
 * ## Reversal is two taps, on the row
 *
 * When a station offers an {@link StationItemAction}, the row opens to reveal it
 * rather than carrying a standing button. A dock station's actions are
 * irreversible in the other direction, and a row of always-visible Undo buttons
 * under a gloved thumb aiming at a camera is an accident waiting to be filed. So
 * the first tap opens, and the second commits — both large, both deliberate.
 *
 * ## Why the disclosure is a real button, and the Undo is its sibling
 *
 * The row used to be a `role="button"` div wrapping the whole card, with the
 * copy chip and the Undo nested inside it. That one choice produced three
 * defects at once (audit 2026-09-04):
 *
 *  - Enter/Space on the focused Undo bubbled to the row's `onKeyDown`, which
 *    called `preventDefault()` and collapsed the row — so the only way to
 *    reverse an irreversible ship-confirm was a pointer. Keyboard-dead.
 *  - The row's `aria-label` became the accessible name and flattened its
 *    descendants, hiding the identifier, the meta and the server's own refusal
 *    message from a screen reader — on exactly the rows carrying a refusal.
 *  - A button may not contain focusable descendants at all; AT behaviour was
 *    undefined.
 *
 * So the disclosure is a real `<button>` over the row's content, the Undo is its
 * SIBLING outside it, and the content names the control instead of an
 * `aria-label` suppressing it.
 */

import { memo, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import {
  OrderIdChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  STATION_TONE_EDGE,
  STATION_TONE_GROUND,
  STATION_TONE_INK,
  STATION_TONE_RING,
} from './station-chrome';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { StationItemAction, StationTapeEntry } from './station-tape';

function MobileStationTapeItemBase({
  entry,
  /** Injected clock so every stamp on screen measures from the same instant. */
  now,
  emphasis = 'history',
  /** Reversal for this entry, when the station offers one. */
  action,
  /**
   * What line 1 says when the record has no name.
   *
   * The station's word, not this component's — scan-out calls it an unfound
   * ORDER because that is what failed to resolve; a receiving station would say
   * something else about the same absence.
   */
  untitledLabel = 'Untitled',
}: {
  entry: StationTapeEntry;
  now: number;
  emphasis?: 'focus' | 'history';
  action?: StationItemAction | null;
  untitledLabel?: string;
}) {
  const focus = emphasis === 'focus';
  const ink = STATION_TONE_INK[entry.tone];
  const [open, setOpen] = useState(false);
  const actionable = action != null;

  const body = (
    <div className="flex items-start gap-2.5">
      {/* The tone plate is the focus item's outcome signal — it is why the card
          does not need the verb the row dropped. History rows carry the tone in
          the stamp instead: a column of plates would be stripes, not a signal. */}
      {/*
        The thumbnail slot, on EVERY row — reserved even when there is no photo.

        It used to appear on the focus row only, which pushed that row's text to
        a 74px rail while all 40 history rows sat at 16px. The one row that
        matters was the one row that broke the column, and the eye had to
        re-find the left edge on every scan. A constant slot is worth more than
        the width it costs.
      */}
      <span
        className={cn(
          'relative flex shrink-0 overflow-hidden bg-surface-sunken',
          focus ? 'h-11 w-11' : 'h-9 w-9',
          MOBILE_SCAN_ROW_CORNER,
          // Tone rings the picture rather than replacing it with a glyph.
          focus && cn('ring-2', STATION_TONE_RING[entry.tone]),
        )}
      >
        {entry.imageUrl && (
          <ItemRecordThumb imageUrl={entry.imageUrl} className="h-full w-full min-h-0 w-auto" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {/* Line 1 — the name. Omitted, not faked, when the record has none: the
            identifier on line 2 is then the whole of what is known, and a row
            that repeated it on both lines would say one fact twice. */}
        <p
          className={cn(
            // One line, both emphases. `truncate`, never `line-clamp-2`: a
            // two-line focus title changes the row's height and shoves the whole
            // tape, which is the one thing this layout exists to prevent.
            'truncate leading-snug',
            // ONE size for both emphases (MOBILE_MAX_TYPE_ROLES_PER_FILE = 2,
            // and `role-eyebrow` already spends the second on stamps). The focus
            // row reads louder through WEIGHT, its tone ground and its ring —
            // not through a third size. A 10-14px scale cannot build hierarchy
            // by size anyway; trying pushes the job onto colour, which then has
            // to carry meaning it cannot carry accessibly.
            'text-role-caption',
            focus ? 'font-bold' : 'font-semibold',
            entry.title ? 'text-text-default' : 'text-text-muted',
          )}
        >
          {entry.title ?? untitledLabel}
        </p>

        {/*
          Line 2 — record, then label, then when.

          Order first and tracking to its right is the pairing every other
          surface in this codebase already uses, so an operator reads the same
          two chips in the same two places here as on To-ship and Packing.

          Both are inert (`disableCopy`). A live copy button is ~16px tall inside
          the area a gloved thumb is aiming at, so a mis-hit either copies
          silently or opens the row — and a focusable descendant inside the
          disclosure button is invalid besides. The chips still carry their glyph,
          tint and last-eight; copying belongs on a record surface, not a running
          ledger.
        */}
        <div className="flex min-w-0 items-center gap-1.5">
          {/*
            Always rendered, even with nothing to show.
            `resolveChipDisplay` turns an empty value into the house em dash and
            forces the chip inert, so an order-less row reads as "# —" in the
            same slot rather than shifting the tracking chip left onto a
            different rail. Every other identity surface in this codebase holds
            the column the same way.
          */}
          <OrderIdChip
            value={entry.recordId ?? ''}
            display={entry.recordId ? getLast8(entry.recordId) : ''}
            displayWidth="last8"
            dense
            truncateDisplay={false}
            disableCopy
            disableTooltip
            outerPad="flush"
            nonInteractive
          />
          {entry.identifier ? (
            <TrackingChip
              value={entry.identifier}
              showIcon
              dense
              outerPad="flush"
              disableCopy
              disableTooltip
              nonInteractive
            />
          ) : null}
          {/*
            Whose work this was — only ever set on rows the operator did not
            scan here.

            The staff MARK, not the name: the same contract the slot table's
            stage cell uses (`CompoundCells`) — colour + initials,
            `avatarPhotoId={null}` because a photo collapses to a white speck at
            this size, and `colorRing` so the fill is the identity channel.

            It also removes a layout bug the name had. It was set `shrink-0
            truncate`, and `truncate` cannot fire on a non-shrinking flex child,
            so a long name grew and pushed the stamp out of the row. A
            fixed-size mark cannot.
          */}
          {(entry.actor || entry.actorId != null) && (
            <StaffAvatar
              staffId={entry.actorId}
              name={entry.actor}
              avatarPhotoId={null}
              size="sm"
              colorRing
              alt={entry.actor ?? undefined}
            />
          )}
          <time
            dateTime={entry.at}
            // One ink for every stamp. It used to borrow the tone's colour,
            // which put the outcome signal in a 10px glyph at 3.3:1 — the tone
            // is the row's GROUND now, and this can simply be legible.
            className="ml-auto shrink-0 text-role-eyebrow tabular-nums text-text-soft"
          >
            {formatRelativeTime(entry.at, now)}
          </time>
        </div>

        {/* No third line. The grade lived here and is gone (operator
            2026-09-05): a scan-out confirms that a package LEFT, and the
            condition of what is inside it changes nothing an operator can act on
            at the door. It made the focus row a different height from every
            other row for a fact nobody was reading. `conditionGrade` stays on
            the entry — a receiving station will want it. */}

        {/* The server's own words. Never suppressed on a history row: a refusal
            the operator scrolled past is the one thing they may need to go back
            to, and it is the only content that distinguishes a bad row now that
            the verb is gone. */}
        {entry.message && (
          // `role-caption` with a two-line clamp. At `role-micro` this was a
          // 78-character sentence at 10px wrapping to three lines, which changed
          // the row's height and shoved the tape — the exact failure the
          // truncate-never-wrap rule on line 1 exists to prevent.
          <p className={cn('line-clamp-2 text-role-caption font-medium', ink)}>{entry.message}</p>
        )}
      </div>

    </div>
  );

  return (
    <div
      className={cn(
        'flex flex-col px-4',
        STATION_TONE_GROUND[entry.tone],
        focus
          ? cn('border-t-2', STATION_TONE_EDGE[entry.tone])
          // `border-subtle`, not `border-hairline`: the hairline token is
          // #f1f5f9 on #ffffff — 1.13:1, which the theme file itself calls
          // "near-invisible". Forty rows of two-line content with no readable
          // rule between them is one grey block, not a ledger.
          : 'border-b border-border-subtle',
        // ONE vertical padding for the list. The focus row was `py-2.5` against
        // history's `py-2` — an 8/10 split inside a list whose whole premise is
        // a scannable rhythm.
        'py-2.5',
      )}
    >
      {actionable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          // `min-h-11` floors the target at 44px explicitly rather than trusting
          // the runtime UI-mode inference: a title-less row is only ~36px of
          // content and is still tappable.
          className={cn(
            'ds-raw-button flex min-h-11 w-full flex-col justify-center text-left',
            focusRing('cell', 'accent'),
          )}
        >
          {body}
        </button>
      ) : (
        body
      )}

      <AnimatePresence initial={false}>
        {actionable && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <Button
              // `danger` because this DELETES a committed record, and the house
              // has one destructive face. It is loud, and that is affordable
              // here only because it is never standing: it exists solely inside
              // a row the operator deliberately opened.
              variant="danger"
              // `row` rung of MOBILE_CONTROL_LADDER — 36px painted, 44px hit via
              // the padding below. It was size="lg" (56px), a screen-CTA
              // footprint for an action that lives inside one row of forty.
              size="sm"
              className="mt-2 h-9 min-h-11 w-full justify-center"
              disabled={action.pending}
              onClick={action.run}
            >
              {action.pending ? action.pendingLabel : action.label}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Memoized: the shell re-renders every 30s to age the relative stamps, and that
 * would otherwise re-render every visible row for a string that changed on one
 * of them. Depends on the station handing a STABLE `action` per entry — see
 * `MobileStationShell`'s `itemAction` contract.
 */
export const MobileStationTapeItem = memo(MobileStationTapeItemBase);
