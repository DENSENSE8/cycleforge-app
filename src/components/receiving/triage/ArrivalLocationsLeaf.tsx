'use client';

/** @domain-job Arrival Displays → Locations — place the CARTON on a door shelf **or** place any PRODUCT on the carton in its putaway bin,… */

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
function parseLineSubject(subject: SubjectId): number | null {
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

  // The carton's product lines.
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
      {/* Row 1 — WHAT is being placed. */}
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
