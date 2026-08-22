'use client';

/**
 * Today **Watch** right rail — Unbox index→leaf desk grammar.
 *
 * {@link DeskInspectorIndexShell} switches Ticket / Tracking list displays.
 * Each leaf is add-field + watched list (rail stays open on Watch success).
 *
 * Ticket → self-assign (`support_ticket_assignments` → Today Attention).
 * Tracking → subscribe to the linked inbound carton (`staff_subscriptions`).
 *
 * **ONE band (2026-08-21).** The rail used to paint a `WatchRailHeader` above
 * the shell — an eyebrow (`Watch`) over `Ticket or tracking`, a second header
 * line restating on two rows what the index below it already lists as two rows.
 * `Watch` is now the band's single-word title on the index stage, and each leaf
 * replaces it with its own segment (`Ticket` / `Tracking`). Back and the
 * reserved host `⤢ ✕` cell come with the shell's band; the rail paints no close
 * of its own.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, Loader2, MessageSquare, Plus } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  DESK_INSPECTOR_INDEX,
  DeskInspectorIndexShell,
  type DeskInspectorLeaf,
} from '@/components/right-rail/DeskInspectorIndexShell';
import { Button, TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const MY_DAY_WATCH_RAIL_ID = 'my-day-watch';
const WATCH_LIST_QUERY_KEY = ['my-day-watch'] as const;

type WatchKind = 'ticket' | 'tracking';

type WatchListResponse = {
  ok: boolean;
  tickets: Array<{ ticketId: number; subject: string | null; updatedAtMs: number }>;
  tracking: Array<{ receivingId: number; tracking: string | null; updatedAtMs: number }>;
};

export function MyDayWatchRail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { has } = useAuth();
  const canTicket = has('integrations.zendesk');
  const canTracking = has('home.subscriptions.manage');

  return (
    <DetailStackRailRegistrar
      id={MY_DAY_WATCH_RAIL_ID}
      enabled={open}
      onClose={onClose}
      modal={false}
      ariaLabel="Watch ticket or tracking"
    >
      {open ? (
        <MyDayWatchRailBody canTicket={canTicket} canTracking={canTracking} />
      ) : null}
    </DetailStackRailRegistrar>
  );
}

function MyDayWatchRailBody({
  canTicket,
  canTracking,
}: {
  canTicket: boolean;
  canTracking: boolean;
}) {
  const queryClient = useQueryClient();
  const defaultKind: WatchKind = canTicket ? 'ticket' : 'tracking';
  /** Index | leaf — opens on first permitted topic; Back → topics. */
  const [navId, setNavId] = useState<string>(defaultKind);

  useEffect(() => {
    if (navId === DESK_INSPECTOR_INDEX) return;
    if (navId === 'ticket' && !canTicket && canTracking) setNavId('tracking');
    if (navId === 'tracking' && !canTracking && canTicket) setNavId('ticket');
  }, [canTicket, canTracking, navId]);

  const listQuery = useQuery({
    queryKey: WATCH_LIST_QUERY_KEY,
    queryFn: async (): Promise<WatchListResponse> => {
      const res = await fetch('/api/my-day/watch', { credentials: 'include' });
      const body = (await res.json().catch(() => null)) as WatchListResponse | { error?: string } | null;
      if (!res.ok || !body || !('ok' in body) || !body.ok) {
        throw new Error(
          (body && 'error' in body && body.error) || `Could not load watches (${res.status})`,
        );
      }
      return body;
    },
  });

  const invalidateLists = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WATCH_LIST_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['my-day'] }),
    ]);
  }, [queryClient]);

  const tickets = listQuery.data?.tickets ?? [];
  const tracking = listQuery.data?.tracking ?? [];

  const leaves = useMemo((): DeskInspectorLeaf[] => {
    const next: DeskInspectorLeaf[] = [];
    if (canTicket) {
      next.push({
        id: 'ticket',
        label: 'Ticket',
        subtitle: tickets.length ? `${tickets.length} watched` : 'Watch a ticket',
        icon: MessageSquare,
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
            <WatchKindDisplay
              kind="ticket"
              rows={tickets.map((t) => ({
                id: String(t.ticketId),
                title: t.subject?.trim() || `Ticket #${t.ticketId}`,
                identity: `#${t.ticketId}`,
              }))}
              loading={listQuery.isLoading}
              onWatched={invalidateLists}
              onStop={async (id) => {
                const ticketId = Number(id);
                const res = await fetch(`/api/zendesk/tickets/${ticketId}/assign`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ staffId: null }),
                });
                if (!res.ok) {
                  const body = (await res.json().catch(() => null)) as { error?: string } | null;
                  throw new Error(body?.error || `Could not stop watching (${res.status})`);
                }
                toast.success(`Stopped watching ticket #${ticketId}`);
                await invalidateLists();
              }}
            />
          </div>
        ),
      });
    }
    if (canTracking) {
      next.push({
        id: 'tracking',
        label: 'Tracking',
        subtitle: tracking.length ? `${tracking.length} watched` : 'Watch tracking',
        icon: Barcode,
        content: (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
            <WatchKindDisplay
              kind="tracking"
              rows={tracking.map((t) => ({
                id: String(t.receivingId),
                title: t.tracking ?? `Carton #${t.receivingId}`,
                identity: t.tracking ?? `Carton #${t.receivingId}`,
              }))}
              loading={listQuery.isLoading}
              onWatched={invalidateLists}
              onStop={async (id) => {
                const receivingId = Number(id);
                const res = await fetch('/api/subscriptions/toggle', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    entityType: 'receiving',
                    entityId: receivingId,
                    desired: 'muted',
                  }),
                });
                if (!res.ok) {
                  const body = (await res.json().catch(() => null)) as { error?: string } | null;
                  throw new Error(body?.error || `Could not stop watching (${res.status})`);
                }
                toast.success('Stopped watching tracking');
                await invalidateLists();
              }}
            />
          </div>
        ),
      });
    }
    return next;
  }, [
    canTicket,
    canTracking,
    invalidateLists,
    listQuery.isLoading,
    tickets,
    tracking,
  ]);

  // No permitted topic ⇒ no index to route through, so the band declares
  // `standalone` (and owes no Back) rather than offering a chevron to nowhere.
  if (leaves.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          stance="standalone"
          title="Watch"
          ariaLabel="Watch"
          testId="my-day-watch-inspector-index"
          body={
            <p className="p-4 text-role-caption text-text-muted">
              You do not have permission to watch tickets or tracking.
            </p>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DeskInspectorIndexShell
        stance="index"
        // Index-stage title. On a leaf the band paints that leaf's own segment
        // (`Ticket` / `Tracking`) — the current segment, never a trail.
        title="Watch"
        leaves={leaves}
        activeId={navId}
        onActiveIdChange={setNavId}
        ariaLabel="Watch topics"
        testId="my-day-watch-inspector-index"
        backLabel="Back to topics"
      />
    </div>
  );
}

function WatchKindDisplay({
  kind,
  rows,
  loading,
  onWatched,
  onStop,
}: {
  kind: WatchKind;
  rows: Array<{ id: string; title: string; identity: string }>;
  loading: boolean;
  onWatched: () => Promise<void>;
  onStop: (id: string) => Promise<void>;
}) {
  const inputId = useId();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fieldLabel = kind === 'ticket' ? 'Ticket number' : 'Tracking number';
  const copy =
    kind === 'ticket'
      ? 'Follow a Zendesk ticket on Today. You get notified when its status or subject changes.'
      : 'Follow an inbound carton by tracking number. You get notified when delivery or unbox status changes.';
  const emptyCopy =
    kind === 'ticket' ? 'No tickets watched yet.' : 'No tracking watched yet.';

  const submit = useCallback(async () => {
    const value = raw.trim();
    if (!value) {
      setError(kind === 'ticket' ? 'Enter a ticket number.' : 'Enter a tracking number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/my-day/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind, value }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        ticketId?: number;
        tracking?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || `Could not start watching (${res.status})`);
      }
      if (kind === 'ticket' && body?.ticketId != null) {
        toast.success(`Watching ticket #${body.ticketId}`);
      } else {
        toast.success(
          body?.tracking ? `Watching tracking ${body.tracking}` : 'Watching this carton',
        );
      }
      setRaw('');
      await onWatched();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start watching');
    } finally {
      setBusy(false);
    }
  }, [kind, onWatched, raw]);

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-role-caption text-text-muted">{copy}</p>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          id={inputId}
          label={fieldLabel}
          value={raw}
          onChange={(v) => {
            setRaw(v);
            setError(null);
          }}
          mono={kind === 'tracking'}
          autoFocus={kind === 'ticket'}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <p className="text-role-caption text-text-soft">
          {kind === 'ticket' ? 'Example: #8192' : 'Paste a full carrier tracking number'}
        </p>
        {error ? (
          <p className="text-role-caption text-text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || !raw.trim()}
            icon={busy ? <Loader2 className="animate-spin" /> : <Plus />}
          >
            {busy ? 'Watching…' : 'Watch'}
          </Button>
        </div>
      </form>

      <div className="border-t border-border-hairline pt-2">
        {loading && rows.length === 0 ? (
          <p className="py-3 text-role-caption text-text-soft">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-3 text-role-caption text-text-soft">{emptyCopy}</p>
        ) : (
          <ul className="divide-y divide-border-hairline" aria-label={`Watched ${kind} list`}>
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-role-caption font-semibold text-text-default">
                    <span className={cn(kind === 'tracking' && 'font-mono')}>{row.identity}</span>
                  </p>
                  {row.title !== row.identity ? (
                    <p className="truncate text-role-caption text-text-soft">{row.title}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={stoppingId === row.id}
                  onClick={() => {
                    setStoppingId(row.id);
                    void onStop(row.id)
                      .catch((err) => {
                        toast.error(
                          err instanceof Error ? err.message : 'Could not stop watching',
                        );
                      })
                      .finally(() => setStoppingId(null));
                  }}
                >
                  {stoppingId === row.id ? 'Stopping…' : 'Stop'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
