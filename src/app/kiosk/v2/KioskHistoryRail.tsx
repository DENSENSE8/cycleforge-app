'use client';

/**
 * History MASTER rail — the stack of past records, and nothing else.
 * gives Repair and Sales (operator 2026-09-22: *"delete the old search
 */

import { Loader2 } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import {
  KIOSK_POS_CATEGORY,
  KIOSK_POS_CATEGORY_ACTIVE,
  KIOSK_POS_CATEGORY_IDLE,
  KIOSK_POS_CATEGORY_STACK,
  KIOSK_POS_HISTORY_RAIL,
} from '@/app/kiosk/kiosk-pos-surface';
import type { KioskVisitRow } from '@/lib/kiosk/history/kiosk-history-client';
import { kioskHistoryStamp, kioskHistoryTime } from './kiosk-history-stamp';
import { kioskHistoryDayBands } from './kiosk-history-day';
import { kioskHistoryStatusTone } from './kiosk-history-status';
import { repairDeviceName } from '@/lib/repair/repair-device-name';
import { cn } from '@/utils/_cn';

/**
 * Money, or an em dash. Null is "not quoted" — a column of `$0.00` down forty
 * un-quoted inbound shipments reads as forty free repairs.
 */
function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** The loud identity of a row: the ticket the customer quotes, else the name. */
function rowTitle(row: KioskVisitRow): string {
  const ticket = row.ticketNumber?.trim();
  if (ticket) return ticket;
  const name = row.customerName?.trim();
  if (name) return name;
  return row.source === 'repair' ? `RS-${row.id}` : `Visit #${row.id}`;
}

/**
 * What came in — the DEVICE, with the listing's `REPAIR SERVICE for`
 * boilerplate cut out (`repairDeviceName`), or the first retail line.
 */
function rowDevice(row: KioskVisitRow): string {
  return repairDeviceName(row.subtitle);
}

/** The device's IDs — serial, then a second-device count. */
function rowDeviceIds(row: KioskVisitRow): string {
  const parts: string[] = [];
  if (row.serialNumber?.trim()) parts.push(`SN ${row.serialNumber.trim()}`);
  if (row.deviceCount > 1) parts.push(`${row.deviceCount} devices`);
  return parts.join(' · ');
}

/** The status WORD, on its own — the repair book's first. */
function rowStatus(row: KioskVisitRow): string | null {
  const status = row.repairStatus?.trim() || row.status?.trim();
  if (!status) return null;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** WHAT KIND of capture the row is, when the status chip does not already say. */
function rowKindLabel(row: KioskVisitRow): string | null {
  if (row.kind === 'retail') return 'Sale';
  if (row.kind === 'mixed') return 'Repair + sale';
  return null;
}

/**
 * WHO — the quiet third line, beside the status chip.
 * (operator 2026-09-23: *"the main ID top left and the date and time top right
 */
function rowTrail(row: KioskVisitRow): string {
  const name = row.customerName?.trim();
  // Already the title when the row has no ticket — never print it twice.
  return name && row.ticketNumber?.trim() ? name : '';
}

export function KioskHistoryRail({
  rows,
  loading,
  loadingMore,
  hasMore,
  error,
  search,
  relaxed,
  relaxedTerm,
  onLoadMore,
  selectedKey,
  onSelect,
}: {
  rows: KioskVisitRow[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Read-only: what the trail's find-bar holds, for the empty-state copy. */
  search: string;
  /** The strict search found nothing; these rows are NEAR-name matches. */
  relaxed: boolean;
  /** The term that was relaxed, as typed. Null unless `relaxed`. */
  relaxedTerm: string | null;
  onLoadMore: () => void;
  /** `visit:19` / `repair:4799` — the union's two id spaces collide. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const term = search.trim();
  /** The count says WHICH count it is. */
  const shown = `${rows.length}${hasMore ? '+' : ''}`;
  const singular = rows.length === 1 && !hasMore;
  const countLabel = term
    ? `${shown} ${singular ? 'result' : 'results'} for \u201C${term}\u201D`
    : `${shown} ${singular ? 'record' : 'records'}`;

  return (
    <div className={KIOSK_POS_HISTORY_RAIL} data-testid="kiosk-history-rail">
      {/* Broadened-result notice, in the palette's grammar (`CommandBar`): */}
      {relaxed && !loading ? (
        <p
          className="shrink-0 border-b border-border-hairline px-4 py-2 text-role-caption text-text-muted"
          data-testid="kiosk-history-relaxed"
        >
          No exact match for{' '}
          <span className="text-text-default">&ldquo;{relaxedTerm ?? term}&rdquo;</span> — showing
          close name matches.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="flex items-center gap-2 px-4 py-6 text-role-body text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading history…
          </p>
        ) : error ? (
          <p className="px-4 py-6 text-role-body font-semibold text-text-danger">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-role-body text-text-soft" data-testid="kiosk-history-empty">
            {term ? 'Nothing matches that search.' : 'No visits or repairs yet.'}
          </p>
        ) : (
          <ul className={KIOSK_POS_CATEGORY_STACK}>
            {kioskHistoryDayBands(rows, (row) => row.createdAt).map((band) => (
              <li key={band.dayKey || `undated-${band.rows[0]?.key}`}>
                {/* THE DAY BAND, pinned to the top of the scroll box (Polaris index table / Square's iPad transaction list). */}
                <p
                  className={cn(
                    KIOSK_SECTION_LABEL_ROW,
                    'sticky top-0 z-10 flex items-baseline justify-between gap-3 bg-surface-card border-t border-border-hairline first:border-t-0',
                  )}
                  data-testid="kiosk-history-day"
                  data-day-key={band.dayKey}
                >
                  <span className="min-w-0 truncate">{band.label}</span>
                  {/* HOW LONG, beside WHEN: `Pending Repair` under a band
                      reading `2 months ago` is a stuck unit found without
                      calendar arithmetic (`kioskHistoryDayAge`). */}
                  {band.age ? (
                    <span className="shrink-0 tabular-nums" data-testid="kiosk-history-day-age">
                      {band.age}
                    </span>
                  ) : null}
                </p>
                <ul className={KIOSK_POS_CATEGORY_STACK}>
                  {band.rows.map((row) => {
                    const selected = row.key === selectedKey;
                    const device = rowDevice(row);
                    const deviceIds = rowDeviceIds(row);
                    const status = rowStatus(row);
                    const kindLabel = rowKindLabel(row);
                    const trail = rowTrail(row);
                    return (
                      <li key={row.key}>
                        {/* ds-raw-button (carried by KIOSK_POS_CATEGORY): a
                            full-width rail nav row, not a Button shape — the
                            same call ProductSelector's category rows make. */}
                        <button
                          type="button"
                          className={cn(
                            KIOSK_POS_CATEGORY,
                            selected ? KIOSK_POS_CATEGORY_ACTIVE : KIOSK_POS_CATEGORY_IDLE,
                            'flex-col items-stretch gap-1 py-3',
                          )}
                          aria-current={selected ? 'true' : undefined}
                          onClick={() => onSelect(row.key)}
                          data-testid="kiosk-history-row"
                          data-history-key={row.key}
                        >
                          {/*
 * TOP LINE: the ID left, WHEN right.
 * the eye already tracks (operator 2026-09-23).
 */}
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-role-title text-text-default tabular-nums">
                              {rowTitle(row)}
                            </span>
                            <span className="shrink-0 text-role-caption tabular-nums text-text-soft">
                              {kioskHistoryTime(row.createdAt) || kioskHistoryStamp(row.createdAt)}
                            </span>
                          </span>
                          {device || deviceIds ? (
                            <span className="flex items-baseline gap-2 overflow-hidden">
                              <span className="min-w-0 flex-1 truncate text-role-body text-text-default">
                                {device}
                              </span>
                              {deviceIds ? (
                                <span className="shrink-0 text-role-caption tabular-nums text-text-soft">
                                  {deviceIds}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {/* Status is a CHIP, not the head of a `·` sentence:
                              it is the one mark on the row findable without
                              reading, which is how a POS list is scanned. */}
                          <span className="flex items-center gap-2 overflow-hidden">
                            {kindLabel ? (
                              <KioskChip tone="accent" testId="kiosk-history-kind">
                                {kindLabel}
                              </KioskChip>
                            ) : null}
                            {status ? (
                              <KioskChip tone={kioskHistoryStatusTone(status)}>{status}</KioskChip>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate text-role-caption text-text-soft">
                              {trail}
                            </span>
                            {/* Green is the MONEY token — an em dash is the absence of money and must not wear it, or "not quoted" reads as a figure from across the… */}
                            <span
                              className={cn(
                                'shrink-0 text-role-caption font-semibold tabular-nums',
                                row.totalCents == null ? 'text-text-soft' : 'text-text-success',
                              )}
                            >
                              {formatCents(row.totalCents)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {hasMore && !loading ? (
          // ds-raw-button via KIOSK_POS_CATEGORY: the tail of the same rail
          // stack, so it is a row, not a key floating under one.
          <button
            type="button"
            className={cn(KIOSK_POS_CATEGORY, KIOSK_POS_CATEGORY_IDLE, 'justify-center')}
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="kiosk-history-load-more"
          >
            <span className="text-role-body text-text-soft">
              {loadingMore ? 'Loading…' : 'Load older records'}
            </span>
          </button>
        ) : null}
      </div>

      <p className={cn(KIOSK_SECTION_LABEL_ROW, 'shrink-0 truncate border-b-0 border-t')}>
        {countLabel}
      </p>
    </div>
  );
}
