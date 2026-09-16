'use client';

/**
 * @domain-job Arrival Displays → Locations — place the CARTON on a door shelf
 *   **or** place any PRODUCT on the carton in its putaway bin, without leaving
 *   the door pass.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse StationLocationsDisplay directly here — a port is
 *   built from hooks, `buildTriageDisplays` assembles elements outside any
 *   component, and Arrival is the one station with TWO placement grains to
 *   choose between. This file is that choice and nothing else.
 *
 * ## Two grains, one leaf, never one column
 *
 * Receiving carries two independent location facts and they are not a
 * hierarchy — neither falls back to the other:
 *
 * | Subject | Table | Means |
 * |---|---|---|
 * | Carton  | `receiving_triage.staging_location_id` (+ `priority_lane`) | the unopened box is on this shelf |
 * | Product | `receiving_line_putaway.staged_location_id` | this item goes to this bin |
 *
 * So the subject is a SELECT above the shared leaf and each subject brings its
 * own port. Widening the carton column to also mean "and its products" would
 * make every metric that reads it silently answer a different question, and
 * writing a product's bin into it would corrupt the shelf + lane pair that
 * `completeTriage` gates Save-for-unbox on.
 *
 * The carton subject keeps `useTriageLocationPort`, so `selectShelf`'s lane
 * auto-route and its manual-wins rule are inherited untouched — the gate is not
 * relaxed and its one satisfying control has not moved.
 *
 * The product subject mounts {@link useReceivingLineLocationPort}, the SAME
 * port Unbox uses, so there is one line-putaway writer on the floor rather than
 * an Arrival twin of it. It also carries the directed target ("put this product
 * here"), which the carton subject deliberately does not: a door shelf is
 * chosen by what is free right now, not by where this SKU historically went.
 *
 * Products appear only when the carton HAS lines — an unfound / unmatched
 * carton has no product to place, and offering the subject anyway would be a
 * verb that cannot commit.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StationLocationsDisplay } from '@/components/station/location';
import { SearchableSelectField } from '@/design-system/components';
import { useReceivingLineLocationPort } from '@/components/receiving/line-location-port';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { useTriageLocationPort } from './triage-location-port';
import type { TriageStagingController } from './useTriageStaging';

/** `carton`, or `line:<receiving_line.id>`. */
type SubjectId = string;

const CARTON_SUBJECT: SubjectId = 'carton';

function lineSubjectId(lineId: number): SubjectId {
  return `line:${lineId}`;
}

/** `line:42` → 42; anything else (including `carton`) → null. */
export function parseLineSubject(subject: SubjectId): number | null {
  if (!subject.startsWith('line:')) return null;
  const id = Number(subject.slice('line:'.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function ArrivalLocationsLeaf({
  staging,
  row,
  active = true,
  onPlaced,
}: {
  staging: TriageStagingController;
  /** The open carton — supplies `receiving_id` for the sibling product read. */
  row: ReceivingLineRow;
  /** Is this leaf the showing one? The reads are station-wide; keep them off otherwise. */
  active?: boolean;
  onPlaced?: () => void;
}) {
  const receivingId = row.receiving_id ?? null;
  const [subject, setSubject] = useState<SubjectId>(CARTON_SUBJECT);

  // The carton's product lines. Its own key, NOT the accordion's
  // `receiving-siblings` one: two observers on one key with different queryFns
  // let the later mount's fetcher win, and the accordion's carries the
  // serial/unit carry-forward that keeps a metadata refetch from blanking them.
  const linesQuery = useQuery<ReceivingLineRow[]>({
    queryKey: ['arrival-location-subjects', receivingId] as const,
    enabled: active && receivingId != null && receivingId > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
      return data.receiving_lines ?? [];
    },
  });

  const lines = useMemo(
    () => (linesQuery.data ?? []).filter((l) => l.id > 0),
    [linesQuery.data],
  );

  // A line that disappears under the operator (return re-import, split) must
  // not leave the leaf writing to an id that is gone.
  useEffect(() => {
    const lineId = parseLineSubject(subject);
    if (lineId == null) return;
    if (lines.length > 0 && !lines.some((l) => l.id === lineId)) {
      setSubject(CARTON_SUBJECT);
    }
  }, [lines, subject]);

  const selectedLineId = parseLineSubject(subject);
  const selectedLine = useMemo(
    () => lines.find((l) => l.id === selectedLineId) ?? null,
    [lines, selectedLineId],
  );

  const cartonPort = useTriageLocationPort(staging);
  const linePort = useReceivingLineLocationPort({
    lineId: selectedLineId,
    stagedLocationId: selectedLine?.staged_location_id ?? null,
    enabled: active && selectedLineId != null,
    entityNoun: 'item',
  });

  const subjectOptions = useMemo(
    () => [
      { value: CARTON_SUBJECT, label: 'Carton — door shelf' },
      ...lines.map((l) => ({
        value: lineSubjectId(l.id),
        label: receivingWorkspaceLineTitle(l),
      })),
    ],
    [lines],
  );

  const port = selectedLineId != null ? linePort : cartonPort;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Row 1 — WHAT is being placed. Only when there is a second answer:
          a carton with no lines has exactly one placeable thing, and a select
          with one option is chrome pretending to be a decision. Same face as
          the leaf's own mode control one row down, so the two read as one
          stacked child-mode grammar rather than two kits. */}
      {lines.length > 0 ? (
        <div className="shrink-0" data-testid="arrival-locations-subject-select">
          <SearchableSelectField
            appearance="flush"
            value={subject}
            onChange={(id) => {
              if (id == null) return;
              setSubject(id as SubjectId);
            }}
            options={subjectOptions}
            placeholder="Carton or a product…"
            searchPlaceholder="Type to filter…"
            emptyMessage="Nothing on this carton to place"
            ariaLabel="What is being placed"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <StationLocationsDisplay
          // Remount per subject so the leaf's own mode / filter / busy state
          // never carries a carton's answer onto a product's.
          key={subject}
          port={port}
          onPlaced={selectedLineId != null ? undefined : onPlaced}
        />
      </div>
    </div>
  );
}
