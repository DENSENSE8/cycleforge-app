'use client';

/** `IndustrialRecord` — one record of a {@link RecordLedger}: */

import type { ReactNode } from 'react';
import Image from 'next/image';
import { STATE_TONE_CLASSES } from '../../tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_QTY_BADGE_CLASS,
  RECORD_TITLE_CLASS,
  recordStateCodeClass,
  type RecordStateFace,
} from '../../tokens/industrial-record';
import { focusRing } from '../../tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RECORD_BAND_CLASS,
  RECORD_PHOTO_CLASS,
  RECORD_RIGHT_LANE_CLASS,
  RECORD_ROW_CLASS,
  RECORD_SPINE_CLASS,
  RECORD_SPINE_HATCH_CLASS,
} from './record-ledger-geometry';

/** One band: its facts, and what it shows in the shared right lane. */
interface RecordBandSlots {
  main: ReactNode;
  right?: ReactNode;
}

interface IndustrialRecordProps {
  state: RecordStateFace;
  open: boolean;
  /** Accessible name of the open target — the record read as one sentence. */
  openLabel: string;
  onOpen: () => void;
  /** Photo lane content — {@link RecordPhoto}. */
  photo: ReactNode;
  /** Context · identity · execution. */
  bands: readonly [RecordBandSlots, RecordBandSlots, RecordBandSlots];
  /** Stable key, stamped as `data-record-key` (tests, scroll-into-view). */
  recordKey: string;
}

/** The three bands, in the order the operator's eye travels (F-pattern). */
const BAND_NAMES = ['context', 'identity', 'execution'] as const;

export function IndustrialRecord({ state, open, openLabel, onOpen, photo, bands, recordKey }: IndustrialRecordProps) {
  return (
    <div
      data-record-key={recordKey}
      data-state={state.id}
      className={cn(
        'group/record relative flex border-b border-mode-ink bg-mode-panel hover:bg-mode-hover',
        RECORD_ROW_CLASS,
        open && 'outline outline-2 -outline-offset-2 outline-mode-ink',
      )}
    >
      <button
        type="button"
        data-record-open=""
        aria-label={openLabel}
        aria-current={open || undefined}
        onClick={onOpen}
        className={cn('absolute inset-0 z-0 cursor-pointer', focusRing('cell'))}
      />
      <span
        aria-hidden
        className={cn(
          RECORD_SPINE_CLASS,
          'pointer-events-none relative z-10',
          STATE_TONE_CLASSES[state.tone].dot,
          state.hatched && RECORD_SPINE_HATCH_CLASS,
        )}
      />
      <span
        className={cn(
          'pointer-events-none relative z-10 shrink-0 overflow-hidden border-r border-mode-rule bg-mode-well',
          RECORD_PHOTO_CLASS,
        )}
      >
        {photo}
      </span>
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        {bands.map((band, index) => (
          <div
            key={BAND_NAMES[index]}
            data-band={BAND_NAMES[index]}
            className={cn(
              'flex min-w-0 items-center',
              RECORD_BAND_CLASS,
              index < 2 && 'border-b border-mode-rule',
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden pl-2 pr-2">{band.main}</div>
            <span className={RECORD_RIGHT_LANE_CLASS}>{band.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The state code on band 1: `HLD`, read aloud as the full word. */
export function RecordStateCode({ state }: { state: RecordStateFace }) {
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'w-9 shrink-0', recordStateCodeClass(state))} title={state.label}>
      <span aria-hidden>{state.code}</span>
      <span className="sr-only">{state.label}</span>
    </span>
  );
}

/**
 * WHERE the thing is — every location `|`-joined, `BIN UNASSIGNED` in the warn
 * ink when there is none (location is the first fact a floor hand needs).
 */
export function RecordBin({ faces, className }: { faces: readonly string[]; className?: string }) {
  const path = faces.length > 0 ? faces.join(' | ') : null;
  return (
    <span
      className={cn(RECORD_LABEL_CLASS, 'truncate', path ? 'text-mode-ink' : 'text-mode-warn', className)}
      title={path ?? 'No location'}
    >
      <span className="text-mode-muted">BIN </span>
      {path ?? 'UNASSIGNED'}
    </span>
  );
}

/** A mono label with its ID-face value (`SKU TMP-…`). */
export function RecordIdFact({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted', className)}>
      {label}{' '}
      <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{value || '—'}</span>
    </span>
  );
}

/** Band 2: the title, one line, ellipsis. */
export function RecordTitle({ children }: { children: string }) {
  return (
    <span className={cn(RECORD_TITLE_CLASS, 'flex-1')} title={children}>
      {children || '—'}
    </span>
  );
}

/** Band 2's right lane: the quantity, the row's visual stop. */
export function RecordQty({ value }: { value: number }) {
  return (
    <>
      <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>QTY</span>
      <span className={RECORD_QTY_BADGE_CLASS}>{value}</span>
    </>
  );
}

/** Band 3's right lane: where the record goes next (`→ Photo`). */
export function RecordNext({ label, warn = false }: { label: string | null; warn?: boolean }) {
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'w-full truncate text-left', warn ? 'text-mode-warn' : 'text-mode-ink')}>
      {label ? `→ ${label}` : ''}
    </span>
  );
}

/** Band 1's right lane: a date / time face. */
export function RecordStamp({ children, title }: { children: string | null; title?: string }) {
  return (
    <span className={cn(RECORD_LABEL_CLASS, 'w-full truncate text-left text-mode-ink')} title={title}>
      {children ?? '—'}
    </span>
  );
}

/**
 * The photo lane's face: the image full-bleed, or the title's initials on the
 * well when nothing is known.
 */
export function RecordPhoto({ src, fallback }: { src: string | null; fallback: string }) {
  if (src) {
    return <Image src={src} alt="" fill unoptimized sizes="96px" className="object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex h-full w-full items-center justify-center font-mono text-role-body font-black text-mode-muted"
    >
      {recordInitials(fallback)}
    </span>
  );
}

/** Two-letter mark for a record with no photo. */
export function recordInitials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join('') || '—').toUpperCase();
}
