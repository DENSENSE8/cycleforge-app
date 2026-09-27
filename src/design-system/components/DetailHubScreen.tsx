'use client';

import type { ReactNode } from 'react';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailNav } from '@/components/mobile/detail/DetailParts';
import { Button } from '@/design-system/primitives';
import type { DetailDoor } from '@/lib/mobile/detail-door';

type PerRecord<T> = ReactNode | ((record: T) => ReactNode);

function resolve<T>(slot: PerRecord<T> | undefined, record: T | null): ReactNode {
  if (typeof slot === 'function') return record == null ? null : slot(record);
  return slot ?? null;
}

/** The mobile detail bar's slots. `meta` / `right` may read the live record. */
interface DetailRecordBar<T> {
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
interface DetailRecordState {
  loading: boolean;
  /** A failed read — rose face, with Retry when `onRetry` is given. */
  error?: string | null;
  onRetry?: () => void;
  /** A neutral face instead of the record (e.g. "already paired to …"). */
  notice?: ReactNode;
  /** Text when the read succeeded and there is no such record. */
  missing?: string;
}

/** The frame of ONE entity's phone screens — hub, `/info`, and each job screen: */
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
    <div className="flex min-h-screen flex-col bg-mode-panel">
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
        // Flat like the record it stands in for: full-width bands, no box.
        <div className="flex-1">
          {state.loading ? (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
          ) : state.notice ? (
            <div className="border-b border-mode-rule bg-mode-panel px-mode-page py-3 text-mode-body text-mode-ink">
              {state.notice}
            </div>
          ) : (
            <div className="space-y-2 border-b border-rose-200 bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">
              <p>{state.error || state.missing || 'Not found.'}</p>
              {state.error && state.onRetry ? (
                <Button variant="secondary" size="lg" radius="flush" onClick={state.onRetry}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * **The mobile entity hub** — the exoskeleton every scanned thing wears
 * (operator 2026-09-24; reference: the repair hub `/m/rs/[id]`):
 * Edge to edge (operator 2026-09-25): no page padding and no gaps. Card, ack,
 */
export function DetailHubScreen<T>({
  record,
  state,
  bar,
  card,
  ack,
  onAckDismiss,
  content,
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
  /** The record's live working set, between the card and the doors. */
  content?: (record: T) => ReactNode;
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
          <div className="flex-1 divide-y divide-mode-rule">
            {card(live)}
            {ack && onAckDismiss ? <DetailAck onDismiss={onAckDismiss}>{ack}</DetailAck> : null}
            {content ? content(live) : null}
            <DetailNav label={rowsLabel} rows={rows(live)} />
          </div>
          {dock(live)}
          {children ? children(live) : null}
        </>
      )}
    </DetailRecordFrame>
  );
}
