'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminEmptyDetail } from './shared';
import { useAdminLogsPage } from './admin-logs-query';

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

/** The picked event (`?eventId=`) — looked up on the page the stage picker shows (`offset`). */
export function AdminLogsTab({ offset }: { offset: number }) {
  const searchParams = useSearchParams();
  const selectedEventId = searchParams.get('eventId') ?? '';
  const query = useAdminLogsPage(offset);

  const event = useMemo(
    () => query.data?.rows.find((r) => r.event_id === selectedEventId) ?? null,
    [query.data, selectedEventId],
  );

  if (!selectedEventId) {
    return (
      <AdminEmptyDetail
        title="Pick an event"
        hint="Select an audit or station activity log entry from the left to see its full envelope."
      />
    );
  }

  if (query.isLoading) {
    return <AdminEmptyDetail title="Loading event…" />;
  }

  if (!event) {
    return (
      <AdminEmptyDetail
        title="Event not found"
        hint="It may have scrolled off this page. Try clearing filters or paging back."
      />
    );
  }

  const actorLabel = event.actor_name?.trim()
    ? `${event.actor_name} (#${event.actor_staff_id ?? '-'})`
    : event.actor_staff_id != null
      ? `#${event.actor_staff_id}`
      : 'System';

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-canvas">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-role-micro text-text-soft">
                {event.kind === 'AUDIT' ? 'Audit' : event.kind} event
              </p>
              <h2 className="mt-0.5 break-words text-lg font-semibold text-text-default">
                {event.action}
              </h2>
              <p className="mt-0.5 break-all font-mono text-role-caption text-text-faint">
                {event.event_id}
              </p>
            </div>
            <span
              className={`inline-flex flex-shrink-0 rounded-full px-2.5 py-1 text-role-micro font-semibold ${
                event.kind === 'AUDIT'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-purple-50 text-purple-700'
              }`}
            >
              {event.kind === 'AUDIT' ? 'Audit' : event.kind}
            </span>
          </header>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailCard label="When" value={formatDateTime(event.created_at)} />
            <DetailCard label="Actor" value={actorLabel} />
            <DetailCard label="Role" value={event.actor_role ?? '-'} />
            <DetailCard label="Station" value={event.station ?? '-'} />
            <DetailCard label="Source" value={event.source ?? '-'} />
            <DetailCard
              label="Entity"
              value={event.entity_type ? `${event.entity_type}:${event.entity_id ?? ''}` : '-'}
            />
          </div>

          {(event.detail_value || event.detail_route) && (
            <div className="rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro text-text-soft">Detail</p>
              {event.detail_value ? (
                <p className="mt-1 break-words text-sm text-text-default">{event.detail_value}</p>
              ) : null}
              {event.detail_route ? (
                <a
                  href={event.detail_route}
                  className="mt-2 inline-block text-role-caption font-semibold text-blue-600 hover:underline"
                >
                  Open route →
                </a>
              ) : null}
            </div>
          )}

          {event.notes ? (
            <div className="rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro text-text-soft">Notes</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-default">
                {event.notes}
              </p>
            </div>
          ) : null}

          {(event.scan_ref || event.fnsku) && (
            <div className="grid grid-cols-2 gap-3">
              {event.scan_ref ? <DetailCard label="Scan ref" value={event.scan_ref} /> : null}
              {event.fnsku ? <DetailCard label="FNSKU" value={event.fnsku} /> : null}
            </div>
          )}

          {event.metadata && Object.keys(event.metadata).length > 0 ? (
            <div className="rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro text-text-soft">Metadata</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-canvas p-3 text-role-caption text-text-default">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DetailCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-none border border-border-soft bg-surface-card p-3">
      <p className="text-role-micro text-text-soft">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold text-text-default">{value}</div>
    </div>
  );
}
