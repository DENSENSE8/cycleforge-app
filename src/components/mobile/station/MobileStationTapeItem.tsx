'use client';

/**
 * One thing on a mobile station's tape — ONE simple row (owner 2026-09-26):
 * `focus` is the thing that just happened (2px ink outline, BRIEF §4/§5);
 */

import { memo, useState } from 'react';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { INTAKE, type IntakeClass } from '@/design-system/tokens/intake';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { RECORD_LABEL_CLASS, RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { STATION_TONE_INK } from './station-chrome';
import { MobileStationEntrySheet } from './MobileStationEntrySheet';
import type { StationItemAction, StationTapeEntry, StationTone } from './station-tape';

/** A station outcome as the functional state colour it borrows. */
const TONE_STATE: Record<StationTone, StateName> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
};

/** What the thing IS, as its 3-letter mono code; the full word is spoken (BRIEF §8). */
function IntakeCode({ intake }: { intake: IntakeClass }) {
  const spec = INTAKE[intake];
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>
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
  /** The verbs this entry offers, shown in the entry sheet. */
  actions,
  /** Opens the entry's own record (its hub route), from the entry sheet. */
  onOpen,
  /** What the row says when the record has no name — the station's word. */
  untitledLabel = 'Untitled',
}: {
  entry: StationTapeEntry;
  now: number;
  emphasis?: 'focus' | 'history';
  actions?: readonly StationItemAction[] | null;
  onOpen?: (() => void) | null;
  untitledLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const focus = emphasis === 'focus';

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          'ds-raw-button flex min-h-mode-hit w-full items-stretch border-b border-mode-ink bg-mode-panel text-left',
          focus && 'outline outline-2 -outline-offset-2 outline-mode-ink',
          focusRing('cell', 'accent'),
        )}
      >
        <span aria-hidden className={cn('w-[5px] shrink-0', STATE_TONE_CLASSES[TONE_STATE[entry.tone]].dot)} />
        <span className="relative w-12 shrink-0 overflow-hidden border-r border-mode-rule bg-mode-well">
          {entry.imageUrl && <ItemRecordThumb imageUrl={entry.imageUrl} className="h-full w-full min-h-0" />}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 px-2">
          {entry.intake && <IntakeCode intake={entry.intake} />}
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1', entry.title ? 'text-mode-ink' : 'text-mode-muted')}>
            {entry.title ?? untitledLabel}
          </span>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', STATION_TONE_INK[entry.tone])}>{entry.verb}</span>
        </span>
      </button>
      {open ? (
        <MobileStationEntrySheet
          entry={entry}
          now={now}
          untitledLabel={untitledLabel}
          actions={actions ?? []}
          onOpen={onOpen ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Memoized: the shell re-renders every 30s to age the relative stamps, and that
 * would otherwise re-render every visible row. Depends on the station handing a
 * STABLE `action` per entry — see `MobileStationShell`'s `itemAction` contract.
 */
export const MobileStationTapeItem = memo(MobileStationTapeItemBase);
