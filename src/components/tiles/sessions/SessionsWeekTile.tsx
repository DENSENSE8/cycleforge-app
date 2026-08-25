'use client';

/**
 * THE WEEK'S SESSIONS TILE (operator, 2026-08-24) — opened from the beam's
 * session dropdown ("all the previous sessions within the current week…
 * triage through those sessions"). A TILE (C8), never a popover.
 *
 * Two honest bands:
 *   · THIS SHIFT — the client-side session blocks (the chronology), which
 *     are resumable in place; the host passes them in with their verbs.
 *   · THIS WEEK (RECORDED) — `GET /api/sessions/summary` over the durable
 *     `work_sessions` spine. The shell does not WRITE that spine yet
 *     (00-endgame D8 is still open), so this band tells the truth when it
 *     is empty instead of faking rows.
 *
 * HOST-AGNOSTIC: blocks and verbs arrive as props; the only import is the
 * fetch below. Tailwind + shadcn only (operator, 2026-08-25).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** The slice of a chronology block this tile renders. */
export interface WeekTileBlock {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
  readonly state: 'open' | 'armed' | 'parked' | 'ended' | 'error';
  readonly startedAt: number;
  readonly elapsedSeconds: number;
}

interface RecordedSession {
  readonly id?: string | number;
  readonly kind?: string;
  readonly scanType?: string | null;
  readonly status?: string;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
}

function hhmm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SessionsWeekTile({
  blocks,
  onResume,
}: {
  blocks: readonly WeekTileBlock[];
  /** Resume a parked block in place — elapsed continues where it froze. */
  onResume: (ref: string) => void;
}) {
  const [recorded, setRecorded] = useState<readonly RecordedSession[] | null | 'error'>(null);

  useEffect(() => {
    let alive = true;
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86_400_000);
    fetch(`/api/sessions/summary?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { sessions?: RecordedSession[] };
        if (alive) setRecorded(Array.isArray(body.sessions) ? body.sessions : []);
      })
      .catch(() => {
        if (alive) setRecorded('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="flex flex-col gap-1">
          <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">This shift</div>
          {blocks.length === 0 ? (
            <div className="text-xs text-muted-foreground">No sessions yet this shift — ⌘N starts one.</div>
          ) : (
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {blocks.map((b) => (
                <li key={b.id}>
                  {b.title}
                  <span className="block text-technical text-muted-foreground">
                    {b.state} · {hhmm(b.elapsedSeconds)} ·{' '}
                    {new Date(b.startedAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  {b.state === 'parked' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 self-start"
                      onClick={() => onResume(b.ref)}
                      title="Resume in place — elapsed continues where it froze"
                    >
                      Resume
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">This week (recorded)</div>
          {recorded === null ? (
            <div className="text-xs text-muted-foreground">Loading the week…</div>
          ) : recorded === 'error' ? (
            <div className="text-xs text-muted-foreground">The session record could not be read.</div>
          ) : recorded.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Nothing recorded — the durable session spine exists but the shell does not write
              it yet (D8). This band fills in when that lands.
            </div>
          ) : (
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {recorded.map((s, i) => (
                <li key={s.id ?? i}>
                  <span className="mono">{s.scanType ?? s.kind ?? 'session'}</span>
                  <span className="block text-technical text-muted-foreground">
                    {s.status ?? ''}
                    {s.startedAt
                      ? ` · ${new Date(s.startedAt).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
