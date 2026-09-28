'use client';

/**
 * Parts both import lists (Runs · Orders) and their records share: the URL
 * writer, the Review gate, the order / review doors, the filled-field chips,
 * the check-set and the PT-day sections.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { EvidenceFact, EvidenceFacts, EvidenceSection } from '@/design-system/components/record-ledger/RecordEvidence';
import type { TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import type { TriageSectionTone } from '@/design-system/components/triage-card-list/TriageListBody';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import type { RowGroup } from '@/lib/group-rows';
import type { ImportRunRowItem } from '@/lib/imports/types';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { IMPORTS_PATH, filledFieldLabel, importOrderHref, importReviewHref } from '@/lib/imports/record-faces';
import { addDaysToDateKey, formatDateKeyMedium, getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

/** Review · Missing item number is gated by this; without it a parked row says so instead of linking. */
export const REVIEW_PERMISSION = 'packing.review';

/** Within-route param writes: shallow, so the list stays mounted under the record (disclosure ladder: stable frame). */
export function useImportParamWriter() {
  const pathname = usePathname() || IMPORTS_PATH;
  const searchParams = useSearchParams();
  return useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );
}

/** A door inside a card: its own press, never the card's open. */
const DOOR_CLASS = cn('hover:underline', focusRing('cell'));

/** The order number: a door into the order when the row landed on one, plain text when it was refused. */
export function ImportOrderNumber({ row, className }: { row: Pick<ImportRunRowItem, 'orderRowId' | 'externalOrderId'>; className?: string }) {
  const href = importOrderHref(row.orderRowId);
  const face = cn(RECORD_ID_CLASS, 'shrink-0 truncate text-mode-ink', className);
  if (!href) return <span className={face}>{row.externalOrderId}</span>;
  return (
    <Link
      href={href}
      className={cn(face, DOOR_CLASS)}
      onClick={(event) => event.stopPropagation()}
      aria-label={`Open order ${row.externalOrderId}`}
    >
      {row.externalOrderId}
    </Link>
  );
}

/** Review · Missing item number, when the row was parked there; null otherwise. */
export function ImportReviewDoor({ importExceptionId, canReview }: { importExceptionId: number | null; canReview: boolean }) {
  if (importExceptionId == null) return null;
  if (!canReview) return <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-warn')}>In review</span>;
  return (
    <Link
      href={importReviewHref(importExceptionId)}
      className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-warn', DOOR_CLASS)}
      onClick={(event) => event.stopPropagation()}
    >
      → Review
    </Link>
  );
}

/** The `orders` columns the import filled, as compact chips. */
export function ImportFilledFields({ fields }: { fields: readonly string[] }) {
  if (fields.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" aria-label={`Filled ${fields.map(filledFieldLabel).join(', ')}`}>
      {fields.map((field) => (
        <Badge key={field} variant="secondary">
          {filledFieldLabel(field)}
        </Badge>
      ))}
    </span>
  );
}

/**
 * The list's check-set, kept by the host (Law 5: the face paints, the host
 * keeps). "All" means the cards on screen; a new scope (filters, Find) starts
 * empty so a verb never acts on a card the list no longer shows.
 */
export function useImportSelection<Row extends { id: number }>(rows: readonly Row[], scopeKey: string) {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const visibleRef = useRef<readonly number[]>([]);
  useEffect(() => setIds(new Set()), [scopeKey]);
  const port = useMemo<TriageSelectionPort<Row>>(
    () => ({
      ids,
      toggle: (row) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (!next.delete(row.id)) next.add(row.id);
          return next;
        }),
      toggleGroup: (groupIds, on) =>
        setIds((prev) => {
          const next = new Set(prev);
          for (const id of groupIds) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      setAll: (on) => setIds(on ? new Set(visibleRef.current) : new Set()),
      publishVisible: (visible) => {
        visibleRef.current = visible;
      },
    }),
    [ids],
  );
  const selected = useMemo(() => rows.filter((row) => ids.has(row.id)), [rows, ids]);
  return { port, selected };
}

/** The one band an unsectioned list (a non-default sort) paints. */
const ALL_BAND = 'all';

/**
 * One card per record, banded by PT day (the server's order kept) under the
 * default newest-first sort; one unlabeled band under any other sort.
 */
export function importDayBands<Row extends { id: number }>(
  rows: readonly Row[],
  stampOf: (row: Row) => string,
  sectioned: boolean,
): [string, RowGroup<Row>[]][] {
  const bands = new Map<string, RowGroup<Row>[]>();
  for (const row of rows) {
    const band = sectioned ? toPSTDateKey(stampOf(row)) || ALL_BAND : ALL_BAND;
    const groups = bands.get(band) ?? [];
    groups.push({ key: String(row.id), rows: [row] });
    bands.set(band, groups);
  }
  return [...bands.entries()];
}

/** A PT-day band's header: Today · Yesterday · `Mon, Sep 22`. */
export function importDaySection(band: string): { label: string; tone: TriageSectionTone } {
  const today = getCurrentPSTDateKey();
  if (band === today) return { label: 'Today', tone: 'muted' };
  if (band === addDaysToDateKey(today, -1)) return { label: 'Yesterday', tone: 'muted' };
  return { label: formatDateKeyMedium(band), tone: 'muted' };
}

/** Split view with nothing open: the loaded list read as a whole. */
export function ImportListSummary({ label, facts, note }: { label: string; facts: readonly (readonly [string, number])[]; note: string }) {
  return (
    <div className="flex flex-col" data-testid="imports-list-summary">
      <EvidenceSection label={label}>
        <EvidenceFacts>
          {facts.map(([factLabel, value]) => (
            <EvidenceFact key={factLabel} label={factLabel}>
              {value.toLocaleString()}
            </EvidenceFact>
          ))}
        </EvidenceFacts>
      </EvidenceSection>
      <p className="px-4 py-3 text-role-data text-mode-muted">{note}</p>
    </div>
  );
}
