'use client';

/**
 * Carton read assembly — disposition bar, evidence stage, findings, audit.
 *
 * Shares the read model + atoms with Unbox. Never imports workbench editors
 * (decision D6 / anti-pattern: lobotomized work chrome).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/design-system/primitives';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wrench,
} from '@/components/Icons';
import { PoChip, SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { WorkspaceTimelineTab } from '@/components/station/workbench';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { workflowStageDot, workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { unitStatusChipClass } from '@/lib/unit-status';
import { formatDateTimePST } from '@/utils/date';
import { getLast4 } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import {
  buildCartonMilestones,
  cartonContentsSummary,
  cartonDisposition,
  cartonFacts,
  cartonFlags,
  cartonRecordMeta,
  cartonTimelineAnchor,
  collapseProvenance,
  type CartonDisposition,
  type CartonException,
  type CartonFact,
  type CartonFlag,
  type CartonInspectorEvent,
  type CartonInspectorLine,
  type CartonInspectorPayload,
  type CartonInspectorReceiving,
} from '../carton-inspector-model';

interface ReceivingPhoto {
  id: number;
  photoUrl: string;
  caption: string | null;
}

const DISPOSITION_DOT: Record<CartonDisposition['tone'], string> = {
  neutral: 'bg-text-soft',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
};

const FLAG_TONE: Record<CartonFlag['tone'], string> = {
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const EXCEPTION_TONE: Record<CartonException['tone'], string> = {
  info: 'border-blue-200 bg-blue-50/80',
  warning: 'border-amber-200 bg-amber-50/80',
  danger: 'border-rose-200 bg-rose-50/80',
};

function FlagChip({ flag }: { flag: CartonFlag }) {
  return (
    <span
      className={cn(
        'rounded ring-1 ring-inset inset-chip text-role-micro uppercase tracking-widest',
        FLAG_TONE[flag.tone],
      )}
    >
      {flag.label}
    </span>
  );
}

function FactValue({ fact }: { fact: CartonFact }) {
  switch (fact.kind) {
    case 'condition':
      return (
        <span className={cn('text-role-caption', conditionGradeTextClass(fact.value))}>
          {conditionLabel(fact.value, 'compact')}
        </span>
      );
    case 'platform':
      return <span className="text-role-caption text-text-default">{sourcePlatformLabel(fact.value)}</span>;
    case 'receivingType':
      return <span className="text-role-caption text-text-default">{receivingTypeMeta(fact.value).label}</span>;
    default:
      return <span className="truncate text-role-caption text-text-default">{fact.value}</span>;
  }
}

export function CartonInspectionPage({ receivingId }: { receivingId: number }) {
  const enabled = Number.isFinite(receivingId) && receivingId > 0;

  const { data, isLoading, isError } = useQuery<CartonInspectorPayload>({
    queryKey: ['carton-inspector', receivingId],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/${receivingId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load carton ${receivingId}`);
      return (await res.json()) as CartonInspectorPayload;
    },
    enabled,
    staleTime: 30_000,
  });

  const {
    data: photoData,
    isLoading: photosLoading,
    isError: photosError,
  } = useQuery<{ photos: ReceivingPhoto[] }>({
    queryKey: ['receiving-photos', String(receivingId)],
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${receivingId}`);
      if (!res.ok) throw new Error(`Failed to load photos for carton ${receivingId}`);
      return (await res.json()) as { photos: ReceivingPhoto[] };
    },
    enabled,
    staleTime: 30_000,
  });

  const receiving = data?.receiving;
  const photos = photoData?.photos ?? [];
  const disposition = useMemo(
    () => (receiving ? cartonDisposition(receiving, data?.totals) : null),
    [receiving, data?.totals],
  );
  const flags = useMemo(() => (receiving ? cartonFlags(receiving) : []), [receiving]);
  const facts = useMemo(() => (receiving ? cartonFacts(receiving) : []), [receiving]);
  const recordMeta = useMemo(() => (receiving ? cartonRecordMeta(receiving) : []), [receiving]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <DispositionBar
        receivingId={receivingId}
        receiving={receiving ?? null}
        disposition={disposition}
        flags={flags}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 px-6 py-10 text-role-caption text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading carton…
          </div>
        ) : isError || !receiving || !disposition ? (
          <div className="px-6 py-6">
            <p className="rounded-xl border border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-text-danger">
              Could not load this carton. It may have been removed, or belong to another workspace.
            </p>
          </div>
        ) : (
          <div className="space-y-5 px-6 py-5 pb-16">
            {/* Findings lead (left); evidence stages on the right — not a photo-first dashboard. */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <FindingsRail
                disposition={disposition}
                receivingId={receivingId}
                lines={data?.lines ?? []}
                totalsSummary={cartonContentsSummary(data?.totals)}
                facts={facts}
                purchaseOrders={data?.purchase_orders}
              />
              <EvidenceStage
                photos={photos}
                receivingId={receivingId}
                loading={photosLoading}
                errored={photosError}
              />
            </div>

            <AuditDrawer
              receiving={receiving}
              events={data?.events ?? []}
              recordMeta={recordMeta}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DispositionBar({
  receivingId,
  receiving,
  disposition,
  flags,
}: {
  receivingId: number;
  receiving: CartonInspectorReceiving | null;
  disposition: CartonDisposition | null;
  flags: CartonFlag[];
}) {
  const needsWork = disposition ? !disposition.settled : true;

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-soft bg-surface-card px-6 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <HoverTooltip label="Back" focusable={false}>
          <Link
            href="/search"
            aria-label="Back to search"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-canvas hover:text-text-default"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </HoverTooltip>

        {disposition ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DISPOSITION_DOT[disposition.tone])} />
            <span className="text-role-title text-text-default">{disposition.label}</span>
            {disposition.settled ? (
              <span className="rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 inset-chip text-role-micro uppercase tracking-widest">
                Settled
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-role-title text-text-muted">Carton {receivingId}</span>
        )}

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-l border-border-soft pl-3 text-role-caption text-text-muted">
          <span className="font-semibold tabular-nums text-text-default">Carton {receivingId}</span>
          {receiving?.tracking ? <TrackingChip value={receiving.tracking} /> : null}
          {receiving?.zoho_purchaseorder_number ? (
            <PoChip
              value={receiving.zoho_purchaseorder_number}
              display={getLast4(receiving.zoho_purchaseorder_number)}
            />
          ) : null}
          {receiving?.carrier ? (
            <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              {receiving.carrier}
            </span>
          ) : null}
        </div>

        {flags.length > 0 ? (
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            {flags.map((f) => (
              <FlagChip key={f.key} flag={f} />
            ))}
          </div>
        ) : null}
      </div>

      <Link href={openInUnboxHref(receivingId)} className="shrink-0">
        <Button variant={needsWork ? 'primary' : 'secondary'} icon={<Wrench />}>
          Open in Unbox
        </Button>
      </Link>
    </header>
  );
}

function EvidenceStage({
  photos,
  receivingId,
  loading,
  errored,
}: {
  photos: ReceivingPhoto[];
  receivingId: number;
  loading: boolean;
  errored: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  // URL-only inputs — omit numeric ids so the shared viewer stays read-only
  // (no delete/upload). Mutations belong on Unbox, not the look-up surface.
  const galleryPhotos = useMemo<PhotoGalleryInput[]>(
    () => photos.map((p) => ({ url: p.photoUrl })),
    [photos],
  );
  const gallery = usePhotoGallery({ photos: galleryPhotos });
  const selected = photos[selectedIdx] ?? photos[0] ?? null;

  if (loading) {
    return (
      <section className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Evidence</p>
        <div className="flex h-56 items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-card text-role-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
        </div>
      </section>
    );
  }

  if (errored) {
    return (
      <section className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Evidence</p>
        <p className="rounded-xl border border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-text-danger">
          Could not load this carton&rsquo;s photos. This is a load failure, not a statement that
          none were taken — retry before relying on it for a claim.
        </p>
      </section>
    );
  }

  if (photos.length === 0) {
    return (
      <section className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Evidence</p>
        <p className="text-role-caption text-text-muted">
          No photos were captured for this carton — nothing to support a damage or shortage claim.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Evidence</p>
        <span className="text-role-micro uppercase tracking-widest text-text-soft">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </div>

      {selected ? (
        <button
          type="button"
          onClick={() => gallery.openViewer(selectedIdx)}
          className="ds-raw-button relative block w-full overflow-hidden rounded-xl border border-border-soft bg-surface-card"
          aria-label="Open photo in viewer"
        >
          <div className="relative aspect-[4/3] w-full">
            <PhotoThumb
              src={selected.photoUrl}
              alt={selected.caption || `Carton ${receivingId} photo`}
              ratio="fill"
            />
          </div>
        </button>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'ds-raw-button h-16 w-16 shrink-0 overflow-hidden rounded-lg border',
              i === selectedIdx ? 'border-blue-500 ring-2 ring-blue-200' : 'border-border-soft',
            )}
            aria-label={`Select photo ${i + 1}`}
            aria-pressed={i === selectedIdx}
          >
            <PhotoThumb
              src={p.photoUrl}
              alt={p.caption || `Carton ${receivingId} photo ${i + 1}`}
              ratio="fill"
            />
          </button>
        ))}
      </div>

      <PhotoViewerPortal g={gallery} />
    </section>
  );
}

function FindingsRail({
  disposition,
  receivingId,
  lines,
  totalsSummary,
  facts,
  purchaseOrders,
}: {
  disposition: CartonDisposition;
  receivingId: number;
  lines: CartonInspectorLine[];
  totalsSummary: string;
  facts: CartonFact[];
  purchaseOrders?: CartonInspectorPayload['purchase_orders'];
}) {
  return (
    <div className="space-y-4">
      {disposition.exceptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Findings</p>
          <ul className="space-y-2">
            {disposition.exceptions.map((ex) => (
              <li
                key={ex.key}
                className={cn(
                  'rounded-xl border px-3 py-2.5',
                  EXCEPTION_TONE[ex.tone],
                )}
              >
                <p className="text-role-caption font-semibold text-text-default">{ex.label}</p>
                <p className="mt-0.5 text-role-caption text-text-muted">{ex.ctaHint}</p>
                <Link
                  href={openInUnboxHref(receivingId)}
                  className="mt-2 inline-flex items-center gap-1 text-role-caption font-semibold text-text-accent hover:underline"
                >
                  Open in Unbox
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Contents</p>
            <span className="text-role-micro uppercase tracking-widest text-text-soft">{totalsSummary}</span>
          </div>
          <ContentsList lines={lines} />
        </div>
      ) : disposition.exceptions.some((e) => e.key === 'no_lines') ? null : (
        <p className="text-role-caption text-text-muted">No lines on this carton yet.</p>
      )}

      {facts.length > 0 ? (
        <div className="flex flex-wrap items-start justify-start gap-x-6 gap-y-2">
          {facts.slice(0, 6).map((f) => (
            <div key={f.key} className="min-w-0 shrink-0 space-y-0.5">
              <p className="text-role-micro uppercase tracking-widest text-text-soft">{f.label}</p>
              <FactValue fact={f} />
            </div>
          ))}
        </div>
      ) : null}

      {(purchaseOrders?.length ?? 0) > 1 ? (
        <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card">
          {purchaseOrders!.map((po) => (
            <li
              key={po.zoho_purchaseorder_id ?? po.zoho_purchaseorder_number ?? 'po'}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <span className="truncate text-role-caption text-text-default">
                {po.zoho_purchaseorder_number ?? 'Unnumbered PO'}
              </span>
              <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
                {po.line_count} {po.line_count === 1 ? 'line' : 'lines'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ContentsList({ lines }: { lines: CartonInspectorLine[] }) {
  return (
    <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card">
      {lines.map((line) => {
        const expected = line.quantity_expected;
        const received = line.quantity_received ?? 0;
        const serials = line.serials ?? [];
        return (
          <li key={line.id} className="space-y-1.5 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', workflowStageDot(line.workflow_status))}
                />
                <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
                  {line.item_name?.trim() || line.sku?.trim() || 'Untitled line'}
                </span>
              </span>
              <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
                {expected != null && expected > 0 ? `${received}/${expected}` : received}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
              {line.sku ? <span className="truncate">{line.sku}</span> : null}
              {line.workflow_status ? <span>{workflowStageLabel(line.workflow_status)}</span> : null}
              {line.condition_grade ? (
                <span className={conditionGradeTextClass(line.condition_grade)}>
                  {conditionLabel(line.condition_grade, 'compact')}
                </span>
              ) : null}
              {line.zoho_purchaseorder_number ? (
                <PoChip
                  value={line.zoho_purchaseorder_number}
                  display={getLast4(line.zoho_purchaseorder_number)}
                />
              ) : null}
              {line.tracking_number ? <TrackingChip value={line.tracking_number} /> : null}
            </div>
            {serials.length > 0 ? (
              <ul className="space-y-1 border-l-2 border-border-soft pl-3">
                {serials.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SerialChip value={s.serial_number} />
                    {s.current_status ? (
                      <span
                        className={cn(
                          'rounded ring-1 ring-inset inset-chip text-role-micro uppercase tracking-widest',
                          unitStatusChipClass(s.current_status),
                        )}
                      >
                        {s.current_status}
                      </span>
                    ) : null}
                    {s.current_location ? (
                      <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                        {s.current_location}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function AuditDrawer({
  receiving,
  events,
  recordMeta,
}: {
  receiving: CartonInspectorReceiving;
  events: CartonInspectorEvent[];
  recordMeta: CartonFact[];
}) {
  const [open, setOpen] = useState(false);
  const milestones = useMemo(() => buildCartonMilestones(receiving), [receiving]);
  const collapsed = useMemo(() => collapseProvenance(milestones), [milestones]);

  return (
    <section className="rounded-xl border border-border-soft bg-surface-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ds-raw-button flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Handling · activity · record
        </span>
        <span className="flex items-center gap-2 text-role-micro uppercase tracking-widest text-text-soft">
          {collapsed ? `${collapsed.actor} · ${collapsed.steps} steps` : `${milestones.length} milestones`}
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-border-soft px-4 py-4">
          <ProvenanceBlock milestones={milestones} collapsed={collapsed} />

          {events.length > 0 ? (
            <div className="space-y-2">
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Activity</p>
              <EventsList events={events} />
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">History</p>
            <WorkspaceTimelineTab {...cartonTimelineAnchor(receiving)} />
          </div>

          {receiving.support_notes?.trim() ? (
            <p className="whitespace-pre-wrap text-role-caption text-text-default">
              {receiving.support_notes.trim()}
            </p>
          ) : null}

          {recordMeta.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
              {recordMeta.map((m) => (
                <div key={m.key} className="min-w-0 space-y-1">
                  <p className="text-role-micro uppercase tracking-widest text-text-soft">{m.label}</p>
                  <p className="truncate text-role-caption tabular-nums text-text-default">
                    {m.key === 'created' || m.key === 'updated'
                      ? formatDateTimePST(m.value)
                      : m.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {receiving.listing_url?.trim() ? (
            <a
              href={receiving.listing_url.trim()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-role-caption text-text-accent hover:underline"
            >
              Open the source listing
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProvenanceBlock({
  milestones,
  collapsed,
}: {
  milestones: ReturnType<typeof buildCartonMilestones>;
  collapsed: ReturnType<typeof collapseProvenance>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (milestones.length === 0) {
    return <p className="text-role-caption text-text-muted">Nothing recorded against this carton yet.</p>;
  }

  const rows = (
    <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
      {milestones.map((m) => (
        <li key={m.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
          <span className="text-role-caption font-semibold text-text-default">{m.label}</span>
          <span className="flex items-center gap-3 text-role-caption text-text-muted">
            <span className="whitespace-nowrap tabular-nums">{formatDateTimePST(m.at)}</span>
            <span className="whitespace-nowrap font-semibold text-text-default">{m.byName ?? '—'}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  if (!collapsed) return rows;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border-soft px-3 py-2">
        <span className="min-w-0 truncate text-role-caption text-text-default">
          <span className="font-semibold">{collapsed.actor}</span>
          <span className="text-text-muted">
            {' · '}
            {formatDateTimePST(collapsed.firstAt)} → {formatDateTimePST(collapsed.lastAt)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ds-raw-button flex shrink-0 items-center gap-1 text-role-micro uppercase tracking-widest text-text-soft hover:text-text-default"
        >
          {collapsed.steps} steps
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded ? rows : null}
    </div>
  );
}

function EventsList({ events }: { events: CartonInspectorEvent[] }) {
  return (
    <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
      {events.map((e) => {
        const moved = e.prev_status && e.next_status && e.prev_status !== e.next_status;
        return (
          <li key={e.id} className="space-y-1 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
                {e.notes?.trim() || e.event_type || 'Event'}
              </span>
              <span className="shrink-0 whitespace-nowrap text-role-caption tabular-nums text-text-muted">
                {formatDateTimePST(e.occurred_at)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
              {moved ? (
                <span className="text-text-muted">
                  {e.prev_status} → {e.next_status}
                </span>
              ) : null}
              {e.station ? <span>{e.station}</span> : null}
              {e.serial_number ? <SerialChip value={e.serial_number} /> : null}
              {e.actor_name ? <span className="text-text-default">{e.actor_name}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
