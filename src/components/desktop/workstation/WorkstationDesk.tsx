'use client';

/**
 * The desk's window onto the workstation — mobile-first, not mobile-only.
 *
 * Left: the REAL phone app in a 390×844 frame (same-origin iframe, camera
 * allowed). The workstation is not re-rendered for the desk — the desk gets
 * the actual surface the operator carries, so the two can never drift. Taps in
 * the bands DRIVE the frame: the desk triages, the phone executes.
 *
 * Right: the day's timeline, readable at desk distance — the same four bands,
 * folded by the same `stackModel`, painted by `RailStackBands` (the rail
 * component that has lived unmounted in the tree since it came off the spine;
 * this is the consumer it was kept for). The spine guard test still holds:
 * nothing here touches `SidebarNavColumn`.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RailStackBands } from '@/components/sidebar/RailStackBands';
import { stackModel, type StackBlockInput } from '@/lib/nav/stack-model';
import type { WorkSession } from '@/lib/sessions/types';

/** What the frame can be pointed at. The workstation is home; the queues and
 *  resumed blocks are the frame's own mobile routes. */
const FRAME_HOME = '/m/triage';

const QUEUE_HREF: Record<string, string> = {
  tasks: '/m/work',
  orders: '/m/orders',
  pick: '/m/pick',
  testing: '/m/testing',
  prepacked: '/m/prepacked',
  'scan-out': '/m/scan-out',
};

/** Where a resumed block's station lives in the frame. Mirrors the mobile
 *  Stack's map — when they diverge, the desk is lying about where resume goes. */
const SURFACE_HREF: Record<string, string> = {
  unbox: '/m/unbox',
  triage: '/m/triage',
  pickup: '/m/receiving?mode=local-pickup',
  pack: '/m/pack',
  test: '/m/testing',
  outbound: '/m/scan-out',
};

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earlier = blocks.filter(
    (b) => b !== armed && b.intervals.some((i) => Date.parse(i.startedAt) >= today.getTime()),
  );
  return { armed, earlier };
}

export function WorkstationDesk() {
  const [frameSrc, setFrameSrc] = useState(FRAME_HOME);
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);

  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'recent', 'workstation-desk'],
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
      queues: Object.entries(QUEUE_HREF).map(([id, href]) => ({
        id,
        label: id === 'scan-out' ? 'Scan out' : id.charAt(0).toUpperCase() + id.slice(1),
        tableId: href,
      })),
      now,
    });
  }, [sessionsQuery.data, now]);

  const sessionById = useMemo(() => {
    const map = new Map<string, WorkSession>();
    for (const s of sessionsQuery.data ?? []) map.set(String(s.id), s);
    return map;
  }, [sessionsQuery.data]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 lg:flex-row">
      {/* The phone, actual size. The frame IS the app; the desk never
          re-renders a mobile twin. */}
      <div className="flex shrink-0 flex-col items-center gap-3">
        <iframe
          src={frameSrc}
          title="Workstation (phone)"
          allow="camera; fullscreen"
          className="h-[844px] max-h-[calc(100dvh-6rem)] w-[390px] rounded-xl border border-border-soft bg-surface-canvas"
        />
        <p className="text-role-caption text-text-soft">
          The live phone surface — scans, tapes and the preview all run in it.
        </p>
      </div>

      {/* The day, readable at desk distance. Taps drive the frame. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="text-role-title font-semibold text-text-default">Workstation</h1>
        <RailStackBands
          model={model}
          onResume={(id) => {
            const scanType = sessionById.get(id)?.scanType;
            const href = scanType != null ? SURFACE_HREF[scanType] : null;
            if (href) setFrameSrc(href);
          }}
          onOpenQueue={(tableId) => {
            if (tableId.startsWith('/m/')) setFrameSrc(tableId);
          }}
          onFind={() => setFrameSrc(FRAME_HOME)}
        />
      </div>
    </div>
  );
}
