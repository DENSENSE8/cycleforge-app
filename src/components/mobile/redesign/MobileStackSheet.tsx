'use client';

/**
 * The Stack — the shift as four bands, behind the top-left menu.
 *
 * The phone's answer to "where do I go": you do not GO anywhere, you RESUME.
 * The drawer's page tree is gone (operator pivot 2026-09-06); what is behind
 * the menu is the timeline of the day — Now, Earlier today, Queues, Find —
 * folded by the SAME pure model the desk's rail bands were built on
 * (`stackModel`, `@/lib/nav/stack-model`). No mobile twin of the fold: one
 * model, two renders.
 *
 * ## Resume is navigation, deliberately
 *
 * Tapping an earlier block routes to that block's station; the station's own
 * mount-time sync (`POST /api/sessions/sync`) parks the current block and arms
 * the resumed one. This sheet performs no session write of its own — the write
 * lives where the desk already put it, transactionally, and a sheet that could
 * write sessions would be a second clock.
 *
 * ## Elapsed is the fold's, not ours
 *
 * `stackModel` sums intervals (open ones run to the ticked `now`). The 30s
 * clock below exists only to feed it; a running block's readout therefore
 * matches the desk's within the same tick.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  armedBlock,
  stackModel,
  type StackBlockInput,
  type StackModel,
} from '@/lib/nav/stack-model';
import { searchNav } from '@/lib/nav/nav-search';
import { TextField } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { WorkSession } from '@/lib/sessions/types';

/** How often a running block's elapsed re-renders. Same grain as the station
 *  shell's clock — beside a camera decode loop, faster buys nothing. */
const CLOCK_TICK_MS = 30_000;

const QUEUES = [
  { id: 'tasks', label: 'Tasks', href: '/m/work' },
  { id: 'orders', label: 'Work orders', href: '/m/orders' },
  { id: 'pick', label: 'Pick queue', href: '/m/pick' },
  { id: 'testing', label: 'Testing', href: '/m/testing' },
  { id: 'prepacked', label: 'Prepacked', href: '/m/prepacked' },
  { id: 'scan-out', label: 'Scan out', href: '/m/scan-out' },
] as const;
/** Where a block's station lives on the phone. Resume = go here; the surface's
 *  mount sync does the arming. Keys are `work_sessions.scan_type`. */
const SURFACE_ROUTE: Record<string, string> = {
  unbox: '/m/unbox',
  triage: '/m/triage',
  pickup: '/m/receiving?mode=local-pickup',
  pack: '/m/pack',
  test: '/m/testing',
  outbound: '/m/scan-out',
};

/** Everything Find can reach: the destinations the drawer's tree used to
 *  list, flattened. Scanning remains the other way in. */
export interface StackFindDestination {
  label: string;
  href: string;
}

function bandLabel(kind: StackModel['bands'][number]['kind']): string {
  switch (kind) {
    case 'now':
      return 'Now';
    case 'earlier':
      return 'Earlier today';
    case 'queues':
      return 'Queues';
    case 'find':
      return 'Find';
  }
}

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Sessions → model inputs. A block's title is what the operator called it;
 *  a session nobody titled falls back to its surface, then to "Block". */
function toBlockInputs(sessions: readonly WorkSession[]): {
  armed: StackBlockInput | null;
  earlier: StackBlockInput[];
} {
  const blocks = sessions.map((s) => ({
    id: String(s.id),
    title: s.title ?? s.surfaceKey ?? 'Block',
    state: s.armed ? 'running' : (s.endedAt != null ? 'done' : s.status),
    intervals: s.intervals ?? [{ startedAt: s.startedAt, endedAt: s.endedAt }],
  }));
  const armed = blocks.find((b) => b.state === 'running') ?? null;
  // The shift, not the week: the band is "Earlier today".
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earlier = blocks.filter(
    (b) => b !== armed && b.intervals.some((i) => Date.parse(i.startedAt) >= today.getTime()),
  );
  return { armed, earlier };
}

export function MobileStackSheet({
  onNavigate,
  findDestinations,
}: {
  onNavigate: (href: string) => void;
  findDestinations: readonly StackFindDestination[];
}) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), CLOCK_TICK_MS);
    return () => clearInterval(t);
  }, []);

  const [find, setFind] = useState('');

  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'recent', 'mobile-stack'],
    queryFn: async (): Promise<WorkSession[]> => {
      const res = await fetch('/api/sessions/recent?limit=12', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { sessions?: WorkSession[] };
      return json.sessions ?? [];
    },
    staleTime: 15_000,
    retry: 1,
  });

  const model = useMemo(() => {
    const { armed, earlier } = sessionsQuery.data
      ? toBlockInputs(sessionsQuery.data)
      : { armed: null, earlier: [] };
    return stackModel({
      armed,
      earlier,
      queues: QUEUES.map((q) => ({ id: q.id, label: q.label, tableId: q.href })),
      now,
    });
  }, [sessionsQuery.data, now]);

  const findResults = useMemo(() => {
    const q = find.trim();
    if (!q) return [];
    return searchNav(findDestinations, q).slice(0, 8).map((r) => r.item);
  }, [find, findDestinations]);

  const nowBlock = armedBlock(model);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-2 py-2">
      {/* Band header: one face for all four — uppercase caption on ground.
          Two type roles in this file: caption (structure) and data (content). */}
      {model.bands.map((band) => (
        <section key={band.kind} className="mb-3 flex flex-col gap-1" data-band={band.kind}>
          <p className="px-1 text-role-caption font-semibold uppercase text-text-soft">
            {bandLabel(band.kind)}
          </p>

          {band.kind === 'now' &&
            (nowBlock ? (
              <div className="flex items-baseline justify-between gap-2 px-1 py-1.5">
                <p className="min-w-0 flex-1 truncate text-role-data font-semibold text-text-default">
                  {nowBlock.title}
                </p>
                <p className="shrink-0 text-role-caption text-text-muted">
                  {formatElapsed(nowBlock.elapsedMs)}
                </p>
              </div>
            ) : (
              <p className="px-1 py-1.5 text-role-data text-text-soft">
                Nothing armed — scan to start a block.
              </p>
            ))}

          {band.kind === 'earlier' &&
            (band.blocks.length ? (
              band.blocks.map((b) => {
                const route = sessionsQuery.data?.find((s) => String(s.id) === b.id);
                const href =
                  route?.scanType != null ? SURFACE_ROUTE[route.scanType] ?? null : null;
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!href}
                    onClick={() => href && onNavigate(href)}
                    className={cn(
                      'flex items-baseline justify-between gap-2 px-1 py-1.5 text-left',
                      href ? 'text-text-default active:bg-surface-hover' : 'text-text-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-role-data">{b.title}</span>
                    <span className="shrink-0 text-role-caption text-text-muted">
                      {formatElapsed(b.elapsedMs)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-1 py-1.5 text-role-data text-text-soft">
                {sessionsQuery.isLoading ? 'Loading the day…' : 'No earlier blocks today.'}
              </p>
            ))}

          {band.kind === 'queues' &&
            QUEUES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onNavigate(q.href)}
                className="flex items-baseline gap-2 px-1 py-1.5 text-left text-text-default active:bg-surface-hover"
              >
                <span className="min-w-0 flex-1 truncate text-role-data">{q.label}</span>
              </button>
            ))}

          {band.kind === 'find' && (
            <div className="flex flex-col gap-1 px-1 pt-1">
              <TextField
                label="Find a destination"
                value={find}
                onChange={setFind}
                inputMode="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              {findResults.map((d) => (
                <button
                  key={d.href + d.label}
                  type="button"
                  onClick={() => {
                    setFind('');
                    onNavigate(d.href);
                  }}
                  className="py-1.5 text-left text-role-data text-text-default active:bg-surface-hover"
                >
                  <span className="truncate">{d.label}</span>
                </button>
              ))}
              {find.trim() && findResults.length === 0 && (
                <p className="py-1.5 text-role-caption text-text-muted">
                  Nothing matches — scan it instead.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
