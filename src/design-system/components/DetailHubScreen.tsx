'use client';

import type { ReactNode } from 'react';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailNav } from '@/components/mobile/detail/DetailParts';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import type { DetailDoor } from '@/lib/mobile/detail-door';

type PerRecord<T> = ReactNode | ((record: T) => ReactNode);

function resolve<T>(slot: PerRecord<T> | undefined, record: T | null): ReactNode {
  if (typeof slot === 'function') return record == null ? null : slot(record);
  return slot ?? null;
}

/** The mobile detail bar's slots. `meta` / `right` may read the live record. */
export interface DetailRecordBar<T> {
  title: string;
  mono?: boolean;
  subtitle?: ReactNode;
  meta?: PerRecord<T>;
  right?: PerRecord<T>;
  /** Where Back lands (nav-trail). Never `router.push` a parent. */
  backHref?: string;
  /** An X instead of a chevron — the record was opened from a job (see `mobileJobReturn`). */
  close?: boolean;
}

/** The three honest non-record states every entity screen shares. */
export interface DetailRecordState {
  loading: boolean;
  /** A failed read — rose face, with Retry when `onRetry` is given. */
  error?: string | null;
  onRetry?: () => void;
  /** A neutral face instead of the record (e.g. "already paired to …"). */
  notice?: ReactNode;
  /** Text when the read succeeded and there is no such record. */
  missing?: string;
}

/**
 * The frame of ONE entity's phone screens — hub, `/info`, and each job screen:
 * a triage-mode panel ground, the mobile detail bar with the identifier as the
 * title, and loading / error / notice / missing faces. `children` renders only
 * with a live record, so a screen never guards for it.
 */
export function DetailRecordFrame<T>({
  record,
  state,
  bar,
  children,
}: {
  record: T | null | undefined;
  state: DetailRecordState;
  bar: DetailRecordBar<T>;
  children: (record: T) => ReactNode;
}) {
  const live = record ?? null;
  return (
    // Deciding what a scanned thing is — and recording it — is a triage job.
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        title={bar.title}
        mono={bar.mono}
        subtitle={bar.subtitle}
        backHref={bar.backHref}
        close={bar.close}
        meta={resolve(bar.meta, live) || undefined}
        right={resolve(bar.right, live) || undefined}
      />
      {live != null ? (
        children(live)
      ) : (
        <div className="flex-1 space-y-4 px-mode-page py-mode-page">
          {state.loading ? (
            <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
          ) : state.notice ? (
            <div className="rounded-mode border border-mode-edge bg-mode-panel p-mode-page text-mode-body text-mode-ink">
              {state.notice}
            </div>
          ) : (
            <div className="space-y-2 rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
              <p>{state.error || state.missing || 'Not found.'}</p>
              {state.error && state.onRetry ? (
                <Button variant="secondary" size="lg" className="rounded-mode" onClick={state.onRetry}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </ModeRegion>
  );
}

/**
 * **The mobile entity hub** — the exoskeleton every scanned thing wears
 * (operator 2026-09-24; reference: the repair hub `/m/rs/[id]`):
 *
 * ```
 * MobileDetailTopBar  ‹ Back · IDENT (mono) · meta ··········· Scan
 * card                read-only DetailSummaryCard; whole card → /info
 * ack                 server-stamped, dismissable
 * rows                DetailNav doors, one per exact job (detailDoor)
 * dock                DetailDock — ≤3 verbs, one primary
 * ```
 *
 * The slots are the law, so a hub cannot put a heading above the card, an Edit
 * button on it, or a second dock under it. `/info` owns every fact and the only
 * edit; each door opens one job screen. `children` is for the dock's sheets.
 * Gate: `scripts/detail-hub-guard.ts` (`src/lib/mobile/detail-hub-law.ts`).
 */
export function DetailHubScreen<T>({
  record,
  state,
  bar,
  card,
  ack,
  onAckDismiss,
  rowsLabel,
  rows,
  dock,
  children,
}: {
  record: T | null | undefined;
  state: DetailRecordState;
  bar: Omit<DetailRecordBar<T>, 'right'>;
  /** A mapper over `DetailSummaryCard` (e.g. `RepairInfoCard`). */
  card: (record: T) => ReactNode;
  ack?: ReactNode;
  onAckDismiss?: () => void;
  /** Accessible name of the door list (`Repair screens`). */
  rowsLabel: string;
  rows: (record: T) => readonly DetailDoor[];
  /** `DetailDock`, or a thin mapper over it. */
  dock: (record: T) => ReactNode;
  children?: (record: T) => ReactNode;
}) {
  return (
    <DetailRecordFrame record={record} state={state} bar={bar}>
      {(live) => (
        <>
          <div className="flex-1 space-y-5 px-mode-page py-mode-page">
            {card(live)}
            {ack && onAckDismiss ? <DetailAck onDismiss={onAckDismiss}>{ack}</DetailAck> : null}
            <DetailNav label={rowsLabel} rows={rows(live)} />
          </div>
          {dock(live)}
          {children ? children(live) : null}
        </>
      )}
    </DetailRecordFrame>
  );
}
