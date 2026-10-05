'use client';

/** Carrier pickup cutoffs (`carrier_pickup_cutoffs`) — per carrier, the time its truck leaves on each weekday. */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { TimeField } from '@/components/sidebar/contextual/NavFilters';
import { Button } from '@/design-system/primitives/Button';
import {
  PICKUP_CUTOFF_TIME_RE,
  PICKUP_WEEKDAYS,
  PICKUP_WORKWEEK,
  type PickupCutoffRow,
  type PickupWeekday,
} from '@/lib/live-feed/pickup-cutoffs-shared';
import { toast } from '@/lib/toast';

const PICKUP_CUTOFFS_URL = '/api/live-feed/pickup-cutoffs';
const PICKUP_CUTOFFS_KEY = ['live-feed', 'pickup-cutoffs'] as const;

interface PickupCutoffsPayload {
  cutoffs: PickupCutoffRow[];
  /** Carriers on recent shipments plus any already configured. */
  carriers: string[];
}

/** carrier → weekday → `HH:MM`; an absent weekday has no pickup. */
type Draft = Record<string, Partial<Record<PickupWeekday, string>>>;

async function fetchPickupCutoffs(): Promise<PickupCutoffsPayload> {
  const res = await fetch(PICKUP_CUTOFFS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load pickup times (${res.status})`);
  return res.json();
}

function toDraft(rows: ReadonlyArray<PickupCutoffRow>): Draft {
  const draft: Draft = {};
  for (const row of rows) (draft[row.carrier] ??= {})[row.weekday] = row.cutoffLocal;
  return draft;
}

function toRows(draft: Draft): PickupCutoffRow[] {
  const rows: PickupCutoffRow[] = [];
  for (const [carrier, days] of Object.entries(draft)) {
    for (const { weekday } of PICKUP_WEEKDAYS) {
      const time = days[weekday];
      if (time && PICKUP_CUTOFF_TIME_RE.test(time)) rows.push({ carrier, weekday, cutoffLocal: time });
    }
  }
  return rows;
}

function rowsSignature(rows: ReadonlyArray<PickupCutoffRow>): string {
  return rows
    .map((r) => `${r.carrier}:${r.weekday}=${r.cutoffLocal}`)
    .sort()
    .join('|');
}

export function PickupCutoffsEditor() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: PICKUP_CUTOFFS_KEY, queryFn: fetchPickupCutoffs });
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data.cutoffs));
  }, [query.data]);

  const carriers = useMemo(
    () => [...new Set([...(query.data?.carriers ?? []), ...Object.keys(draft)])].sort(),
    [query.data?.carriers, draft],
  );
  const nextRows = useMemo(() => toRows(draft), [draft]);
  const dirty = query.data ? rowsSignature(nextRows) !== rowsSignature(query.data.cutoffs) : false;

  const setTime = (carrier: string, weekday: PickupWeekday, time: string) =>
    setDraft((prev) => {
      const days = { ...prev[carrier] };
      if (time) days[weekday] = time;
      else delete days[weekday];
      return { ...prev, [carrier]: days };
    });

  /** "Same time Mon–Fri": the first weekday time set Mon→Fri, copied across Mon–Fri. */
  const workweekSource = (carrier: string) => PICKUP_WORKWEEK.map((w) => draft[carrier]?.[w]).find(Boolean) ?? null;
  const fillWorkweek = (carrier: string) => {
    const time = workweekSource(carrier);
    if (!time) return;
    setDraft((prev) => {
      const days = { ...prev[carrier] };
      for (const w of PICKUP_WORKWEEK) days[w] = time;
      return { ...prev, [carrier]: days };
    });
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(PICKUP_CUTOFFS_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoffs: nextRows }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.issues?.[0]?.message || data?.error || `Save failed (${res.status})`);
        return;
      }
      queryClient.setQueryData<PickupCutoffsPayload>(PICKUP_CUTOFFS_KEY, (prev) =>
        prev ? { ...prev, cutoffs: data.cutoffs } : prev,
      );
      toast.success('Pickup times saved');
    } finally {
      setSaving(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-role-caption text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading pickup times…
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-role-caption text-red-700">Could not load pickup times.</p>;
  }

  return (
    <div className="space-y-3" data-testid="pickup-cutoffs-editor">
      <p className="text-role-caption text-text-muted">
        The time each carrier&apos;s truck leaves, in warehouse time. The Live feed counts down to it. Leave a day
        blank when that carrier does not pick up.
      </p>
      {carriers.length === 0 ? (
        <p className="text-role-caption text-text-faint">No carriers on recent shipments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            role="table"
            aria-label="Carrier pickup times"
            className="grid min-w-[44rem] grid-cols-[minmax(5rem,1fr)_repeat(7,minmax(4.75rem,1fr))_auto] items-center gap-x-1.5 gap-y-1.5"
          >
            <div role="row" className="contents">
              <span role="columnheader" className="text-role-eyebrow text-text-faint">
                Carrier
              </span>
              {PICKUP_WEEKDAYS.map(({ weekday, short }) => (
                <span key={weekday} role="columnheader" className="text-role-eyebrow text-text-faint">
                  {short}
                </span>
              ))}
              <span role="columnheader">
                <span className="sr-only">Fill</span>
              </span>
            </div>
            {carriers.map((carrier) => (
              <div key={carrier} role="row" className="contents" data-carrier={carrier}>
                <span role="rowheader" className="truncate text-role-caption font-semibold text-text-default">
                  {carrier}
                </span>
                {PICKUP_WEEKDAYS.map(({ weekday, short }) => (
                  <span key={weekday} role="cell" className="flex">
                    <TimeField
                      label={`${carrier} pickup ${short}`}
                      value={draft[carrier]?.[weekday] ?? ''}
                      onCommit={(time) => setTime(carrier, weekday, time)}
                    />
                  </span>
                ))}
                <span role="cell" className="whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!workweekSource(carrier)}
                    onClick={() => fillWorkweek(carrier)}
                    ariaLabel={`Same ${carrier} pickup time Mon–Fri`}
                  >
                    Same Mon–Fri
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => setDraft(toDraft(query.data.cutoffs))}
        >
          Reset
        </Button>
        <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Save pickup times
        </Button>
      </div>
    </div>
  );
}
