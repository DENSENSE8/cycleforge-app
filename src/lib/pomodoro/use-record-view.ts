'use client';

import { useEffect, useRef } from 'react';
import type { PomodoroKind } from './use-pomodoro';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** One durable viewed event per detail opening, not per render, timer poll or tab. */
export function useRecordView(kind: PomodoroKind, id: number | null, date?: string) {
  const opened = useRef<{ key: string; eventId: string } | null>(null);
  useEffect(() => {
    if (id == null) {
      opened.current = null;
      return;
    }
    const key = `${kind}:${id}:${date ?? ''}`;
    if (opened.current?.key === key) return;
    const eventId = safeRandomUUID();
    opened.current = { key, eventId };
    void fetch('/api/pomodoro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, ...(date ? { date } : {}), action: 'view', clientEventId: eventId }),
    }).then((res) => {
      if (!res.ok) console.error('Could not record task view', res.status);
    }).catch((error: unknown) => {
      console.error('Could not record task view', error);
    });
  }, [kind, id, date]);
}
