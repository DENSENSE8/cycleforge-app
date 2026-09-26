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
 * back was demoted to a chip beside it. The outcome still shows — as the colour
 * of the focus row's code, and as the server's own message on the rows that
 * have one — but it no longer costs a line to say "this went the way it always
 * goes".
 *
 * ## One component, two emphases
 *
 * `focus` is the thing that just happened; `history` is everything behind it.
 * They were two components with a copy-pasted footer between them, which is four
 * stations x two copies of every future row change. The difference is scale, the
 * ink selection outline and a coloured code, not structure — so it is a prop.
 *
 * ## Verbs are two taps, on the row
 *
 * When a station offers {@link StationItemAction}s, the row opens to reveal
 * them rather than carrying standing buttons. A row of always-visible verbs
 * under a gloved thumb aiming at a camera is an accident waiting to be filed.
 * So the first tap opens, and the second commits — both large, both deliberate.
 * The expected decision is the ink fill; the rest are neutral.
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
import { INTAKE, type IntakeClass } from '@/design-system/tokens/intake';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { useModeFeedbackSeconds } from '@/design-system/providers/useModeFeedback';
import { cn } from '@/utils/_cn';
import { STATION_TONE_INK } from './station-chrome';
import { RECORD_LABEL_CLASS, RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { StationItemAction, StationTapeEntry, StationTone } from './station-tape';

/** A station outcome as the functional state colour it borrows. */
const TONE_STATE: Record<StationTone, StateName> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
};

/** One touch band (36px) — three per record (BRIEF §4 industrial touch). */
const BAND = 'flex h-9 min-w-0 items-center gap-2 pl-2';
/** The right lane: one column down all three bands, rule on the same pixel. */
const LANE = 'flex h-full w-24 shrink-0 items-center border-l border-mode-edge px-2';

/**
 * The row's code — what the thing IS, as a 3-letter mono code (BRIEF §4 triage:
 * "what it is + state code" leads the evidence stack).
 *
 * The class carries no colour of its own. The FOCUS row borrows its scan
 * outcome's colour here (owner 2026-09-24: the outcome moves out of the outline
 * and into the code); history rows stay neutral ink, because a ledger in which
 * every row is coloured has no signal. The full word is spoken, not the code
 * (BRIEF §8: state codes read as full words).
 */
function IntakeCode({ intake, tone }: { intake: IntakeClass; tone: StationTone | null }) {
  const spec = INTAKE[intake];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-mode border px-1 font-mono text-role-eyebrow font-bold uppercase',
        tone
          ? cn(STATE_TONE_CLASSES[TONE_STATE[tone]].pill, STATE_TONE_CLASSES[TONE_STATE[tone]].border)
          : 'border-border-subtle text-text-default',
      )}
    >
      <span aria-hidden>{spec.code}</span>
      <span className="sr-only">{spec.label}</span>
    </span>
  );
}

function MobileStationTapeItemBase({
  entry,
  /** Injected clock so every stamp on screen measures from the same instant. */
  now,
  emphasis = 'history',
  /** The verbs this entry offers, when the station offers any. */
  actions,
  /**
   * Opens the entry's own record on tap (the carton hub from arrival triage).
   * Used only when there are no `actions`: a row either discloses verbs in
   * place or navigates, never both.
   */
  onOpen,
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
  actions?: readonly StationItemAction[] | null;
  onOpen?: (() => void) | null;
  untitledLabel?: string;
}) {
  const focus = emphasis === 'focus';
  const ink = STATION_TONE_INK[entry.tone];
  const [open, setOpen] = useState(false);
  const verbs = actions ?? [];
  const actionable = verbs.length > 0;
  const feedback = useModeFeedbackSeconds();

  /*
    The industrial phone record (BRIEF §4 industrial touch, owner 2026-09-26 for
    /m/scan): 5px outcome spine · 108px full-bleed photo · three 36px bands, one
    right lane down all three (when · who · outcome), 1px rules, no inset.

      spine │ photo │ CODE · # order ··········│ 3w
            │       │ title ···················│ (mark)
            │       │ tracking | refusal ······│ VERB

    Chips are inert (`disableCopy`): a copy target inside a gloved thumb's aim
    either copies silently or opens the row. The staff MARK, never the name,
    and only on rows the operator did not scan here.
  */
  const body = (
    <div className="flex flex-1 items-stretch">
      <span aria-hidden className={cn('w-[5px] shrink-0 self-stretch', STATE_TONE_CLASSES[TONE_STATE[entry.tone]].dot)} />
      <span className="relative flex w-27 shrink-0 self-stretch overflow-hidden border-r border-mode-rule bg-mode-well">
        {entry.imageUrl && <ItemRecordThumb imageUrl={entry.imageUrl} className="h-full w-full min-h-0" />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Band 1 — context: what it is · which record ··· when */}
        <div className={cn(BAND, 'border-b border-mode-rule')}>
          {entry.intake && <IntakeCode intake={entry.intake} tone={focus ? entry.tone : null} />}
          <span className="min-w-0 flex-1">
            <OrderIdChip
              value={entry.recordId ?? ''}
              display={entry.recordId ? getLast8(entry.recordId) : ''}
              displayWidth="last8"
              dense
              truncateDisplay={false}
            />
          </span>
          <time dateTime={entry.at} className={cn(LANE, RECORD_LABEL_CLASS, 'tabular-nums text-mode-muted')}>
            {formatRelativeTime(entry.at, now)}
          </time>
        </div>
        {/* Band 2 — identity: the name (one line; a wrap would shove the tape) ··· who */}
        <div className={cn(BAND, 'border-b border-mode-rule')}>
          <p className={cn(RECORD_TITLE_CLASS, 'flex-1', entry.title ? 'text-mode-ink' : 'text-mode-muted')}>
            {entry.title ?? untitledLabel}
          </p>
          <span className={LANE}>
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
          </span>
        </div>
        {/* Band 3 — execution: what was scanned, or the server's own refusal
            (never suppressed on a history row) ··· the outcome */}
        <div className={BAND}>
          {entry.message ? (
            <p className={cn('min-w-0 flex-1 truncate text-role-data font-medium', ink)} title={entry.message}>
              {entry.message}
            </p>
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {entry.identifier ? (
                <TrackingChip value={entry.identifier} showIcon dense outerPad="flush" disableCopy disableTooltip />
              ) : null}
            </span>
          )}
          <span className={cn(LANE, RECORD_LABEL_CLASS, ink)}>
            <span className="truncate">{entry.verb}</span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        // Industrial record (owner 2026-09-26): edge to edge, no inset — the
        // photo lane and the ink rule reach the screen's edges.
        'flex flex-col bg-mode-panel',
        // No row wash for any outcome (BRIEF §4 industrial): the spine and the
        // lane's verb carry it.
        'border-b border-mode-ink',
        // Selection is a 2px INK outline, never a coloured one (BRIEF §4/§5 —
        // an invariant). Inset so it cannot be clipped by the scroller.
        focus && 'outline outline-2 -outline-offset-2 outline-text-default',
      )}
    >
      {actionable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          // The region's hit floor (triage touch: 48px), explicitly: a
          // title-less row is only ~36px of content and is still tappable.
          className={cn(
            'ds-raw-button flex min-h-mode-hit w-full flex-col justify-stretch text-left',
            focusRing('cell', 'accent'),
          )}
        >
          {body}
        </button>
      ) : onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'ds-raw-button flex min-h-mode-hit w-full flex-col justify-stretch text-left',
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
            // Opacity only, at the region's feedback duration (triage ≤120ms;
            // 0 under reduced motion). The verbs appear in place — no height
            // tween sliding the tape under a thumb.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: feedback }}
            className={cn('grid gap-px border-t border-mode-rule bg-mode-rule', verbs.length > 2 ? 'grid-cols-2' : 'grid-cols-1')}
          >
            {verbs.map((action) => (
              <Button
                key={action.label}
                // The expected decision is the ink fill; the rest are neutral
                // (BRIEF §4 triage: "neutral decisions, primary = ink fill").
                variant={action.primary ? 'ink' : 'secondary'}
                size="lg"
                radius="mode"
                // An odd count in the two-column grid: the primary takes the
                // full width, so no neutral verb is left alone on its own row.
                className={cn(
                  'min-h-mode-hit w-full justify-center',
                  action.primary && verbs.length > 2 && verbs.length % 2 === 1 && 'col-span-2',
                )}
                disabled={action.pending}
                onClick={action.run}
              >
                {action.pending ? action.pendingLabel : action.label}
              </Button>
            ))}
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
