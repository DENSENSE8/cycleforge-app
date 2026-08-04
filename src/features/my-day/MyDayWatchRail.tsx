'use client';

/**
 * Today **Watch** right rail — Unbox Displays pattern.
 *
 * `SectionTabsSlider density="icon"` switches Ticket / Tracking list displays.
 * Each display is add-field + watched list (rail stays open on Watch success).
 *
 * Ticket → self-assign (`support_ticket_assignments` → Today Attention).
 * Tracking → subscribe to the linked inbound carton (`staff_subscriptions`).
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, Loader2, MessageSquare, Plus } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
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
        <MyDayWatchRailBody
          canTicket={canTicket}
          canTracking={canTracking}
          onClose={onClose}
        />
      ) : null}
    </DetailStackRailRegistrar>
  );
}

function MyDayWatchRailBody({
  canTicket,
  canTracking,
  onClose,
}: {
  canTicket: boolean;
  canTracking: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const defaultKind: WatchKind = canTicket ? 'ticket' : 'tracking';
  const [kind, setKind] = useState<WatchKind>(defaultKind);

  useEffect(() => {
    if (kind === 'ticket' && !canTicket && canTracking) setKind('tracking');
    if (kind === 'tracking' && !canTracking && canTicket) setKind('ticket');
  }, [canTicket, canTracking, kind]);

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

  const tabs = useMemo((): SectionTab[] => {
    const next: SectionTab[] = [];
    if (canTicket) {
      next.push({
        id: 'ticket',
        label: 'Ticket',
        icon: MessageSquare,
        count: tickets.length || undefined,
        content: (
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
        ),
      });
    }
    if (canTracking) {
      next.push({
        id: 'tracking',
        label: 'Tracking',
        icon: Barcode,
        count: tracking.length || undefined,
        content: (
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

  if (tabs.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <WatchRailHeader onClose={onClose} />
        <p className="p-4 text-role-caption text-text-muted">
          You do not have permission to watch tickets or tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WatchRailHeader onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        <SectionTabsSlider
          tabs={tabs}
          value={kind}
          onChange={(id) => setKind(id as WatchKind)}
          ariaLabel="Watch displays"
          density="icon"
          compact
        />
      </div>
    </div>
  );
}

function WatchRailHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
      <DeskRailChromeRow onClose={onClose} closeTitle="Close watch" />
      <div className="flex min-w-0 flex-col gap-0.5 px-2 pb-2 pt-1">
        <PaneHeaderLabel
          eyebrow="Watch"
          value="Ticket or tracking"
          valueClassName="truncate text-role-caption font-semibold text-text-default"
        />
      </div>
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
