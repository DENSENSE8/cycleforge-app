'use client';

/**
 * Carton read assembly — floating identity chrome, contents column, progress rail.
 *
 * Shares the read model + atoms with Unbox. Never imports workbench editors
 * (decision D6 / anti-pattern: lobotomized work chrome).
 *
 * Progress reuses the details-stack carton pipeline (`ReceivingCartonPipeline`
 * + stage rows) on a Panel surface; photos use the same
 * `ReceivingPhotosSection` (read-only) below the stepper. Header floats as a
 * top context bookmark (station-bookmark SoT) with PO title · tracking · PO#
 * plus quiet actions — never an in-flow pinned band.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import {
  Camera,
  ChevronRight,
  Copy,
  History,
  Link2,
  Loader2,
  Wrench,
} from '@/components/Icons';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  PoChip,
  SerialChip,
  SkuScanRefChip,
  TrackingChip,
} from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ReceivingAuditRail } from '@/components/receiving/workspace/ReceivingAuditRail';
import { CartonUnitJourneyHistory } from './CartonUnitJourneyHistory';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { ReceivingCartonPipeline } from '@/components/station/receiving/ReceivingCartonPipeline';
import { CartonPhotoTriage } from './CartonPhotoTriage';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import { deriveCartonReadiness } from '@/lib/receiving/carton-readiness';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from '@/components/layout/header-shell';
import {
  STATION_IDENTITY_SCROLL_CLEARANCE,
  stationBookmarkPanelClass,
  stationContextBarHostClass,
} from '@/components/station/entity-context/station-bookmark';
import {
  buildCartonReadCopyText,
  shareCartonLink,
} from '@/lib/receiving/carton-read-utilities';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatDateTimePST } from '@/utils/date';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { getLast8 } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import {
  cartonContentsSummary,
  cartonDisposition,
  cartonFacts,
  cartonHeaderIdentity,
  cartonRecordMeta,
  type CartonDisposition,
  type CartonException,
  type CartonFact,
  type CartonHeaderIdentity,
  type CartonInspectorEvent,
  type CartonInspectorLine,
  type CartonInspectorPayload,
  type CartonInspectorReceiving,
} from '../carton-inspector-model';

const EXCEPTION_TONE: Record<CartonException['tone'], string> = {
  info: 'border-blue-200 bg-blue-50/80',
  warning: 'border-amber-200 bg-amber-50/80',
  danger: 'border-rose-200 bg-rose-50/80',
};

function toReceivingDetailsLog(receiving: CartonInspectorReceiving): ReceivingDetailsLog {
  return {
    id: String(receiving.id),
    timestamp: receiving.created_at ?? '',
    tracking: receiving.tracking ?? undefined,
    source: receiving.source,
    source_platform: receiving.source_platform,
    intake_type: receiving.intake_type,
    qa_status: receiving.qa_status,
    disposition_code: receiving.disposition_code,
    condition_grade: receiving.condition_grade,
    is_return: receiving.is_return ?? undefined,
    return_platform: receiving.return_platform,
    return_reason: receiving.return_reason,
    needs_test: receiving.needs_test ?? undefined,
    target_channel: receiving.target_channel,
    received_at: receiving.received_at,
    received_by: receiving.received_by ?? null,
    received_by_name: receiving.received_by_name,
    unboxed_at: receiving.unboxed_at,
    unboxed_by: receiving.unboxed_by ?? null,
    unboxed_by_name: receiving.unboxed_by_name,
    tracking_scanned_at: receiving.tracking_scanned_at,
    tracking_scanned_by: receiving.tracking_scanned_by ?? null,
    tracking_scanned_by_name: receiving.tracking_scanned_by_name,
    unbox_opened_at: receiving.unbox_opened_at,
    unbox_opened_by: receiving.unbox_opened_by ?? null,
    unbox_opened_by_name: receiving.unbox_opened_by_name,
    zoho_purchase_receive_id: receiving.zoho_purchase_receive_id,
    zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
    zoho_purchaseorder_number: receiving.zoho_purchaseorder_number,
    listing_url: receiving.listing_url,
    staging_location_label: receiving.staging_location_label,
    priority_lane: receiving.priority_lane,
    pairing_state: receiving.pairing_state,
    triage_complete: receiving.triage_complete,
    triage_completed_at: receiving.triage_completed_at,
  };
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

  const {
    data,
    isLoading,
    isError,
  } = useQuery<CartonInspectorPayload>({
    queryKey: ['carton-inspector', receivingId],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/${receivingId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load carton ${receivingId}`);
      return (await res.json()) as CartonInspectorPayload;
    },
    enabled,
    staleTime: 30_000,
  });

  const receiving = data?.receiving;
  const lines = data?.lines;
  const disposition = useMemo(
    () => (receiving ? cartonDisposition(receiving, data?.totals, lines) : null),
    [receiving, data?.totals, lines],
  );
  const headerIdentity = useMemo(
    () => (receiving ? cartonHeaderIdentity(receiving, lines) : null),
    [receiving, lines],
  );
  const facts = useMemo(() => (receiving ? cartonFacts(receiving) : []), [receiving]);
  const recordMeta = useMemo(() => (receiving ? cartonRecordMeta(receiving) : []), [receiving]);

  const [auditOpen, setAuditOpen] = useState(false);
  const [copyingAll, setCopyingAll] = useState(false);

  // Photo count for the CTA. Same cache entry the triage panel reads, so opening
  // it costs no second fetch.
  const { photos: cartonPhotos, settled: photosSettled } = useReceivingPhotos(receivingId, {
    readOnly: true,
  });

  // `?photos=1` is durable on purpose: `/carton/[id]` exists to be the shareable
  // read record (every search hit lands here), so "look at this box's photos" has
  // to survive a reload and paste into a ticket. The lane and drill inside the
  // panel stay local — they are a reading posture, not an address.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const photosOpen = searchParams.get('photos') === '1';

  const setPhotosOpen = useCallback(
    (open: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (open) next.set('photos', '1');
      else next.delete('photos');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const photosPresence = useMotionPresence(framerPresence.collapseHeight);
  const photosTransition = useMotionTransition(framerTransition.stationCollapse);

  const handleShare = useCallback(async () => {
    const result = await shareCartonLink(
      receivingId,
      receiving?.zoho_purchaseorder_number,
    );
    if (result === 'copied') toast.success('Link copied to clipboard');
    else if (result === 'failed') toast.error('Could not copy link');
  }, [receivingId, receiving?.zoho_purchaseorder_number]);

  const handleCopy = useCallback(async () => {
    if (!receiving || copyingAll) return;
    setCopyingAll(true);
    try {
      const ok = await copyToClipboard(buildCartonReadCopyText(receiving));
      if (ok) toast.success('Copied receiving details');
      else toast.error('Could not copy to clipboard');
    } finally {
      window.setTimeout(() => setCopyingAll(false), 800);
    }
  }, [receiving, copyingAll]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <DispositionBar
        receivingId={receivingId}
        identity={headerIdentity}
        utilsDisabled={receiving == null}
        copyingAll={copyingAll}
        photoCount={photosSettled ? cartonPhotos.length : null}
        photosOpen={photosOpen}
        onTogglePhotos={() => setPhotosOpen(!photosOpen)}
        onShare={() => void handleShare()}
        onCopy={() => void handleCopy()}
        onAudit={() => setAuditOpen(true)}
      />

      <div className={cn('min-h-0 flex-1 overflow-y-auto', STATION_IDENTITY_SCROLL_CLEARANCE)}>
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
            {/*
              Photos open ABOVE the two columns, not beside them: an investigative
              read means looking at a shot and the line it belongs to at the same
              time, so the band must not cover Contents. The height tween is the
              sanctioned layout animation — an explicit operator toggle, once.
            */}
            <AnimatePresence initial={false}>
              {photosOpen ? (
                <motion.div
                  key="carton-photos"
                  initial={photosPresence.initial}
                  animate={photosPresence.animate}
                  exit={photosPresence.exit}
                  transition={photosTransition}
                  className="overflow-hidden"
                >
                  <CartonPhotoTriage
                    receivingId={receiving.id}
                    poRef={
                      receiving.zoho_purchaseorder_number ||
                      receiving.zoho_purchaseorder_id ||
                      null
                    }
                    onClose={() => setPhotosOpen(false)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/*
              Col 1 is WHAT IS IN THE BOX — contents, then the sparse record.
              Col 2 is WHAT HAPPENED TO IT — pipeline · activity · history ·
              findings. Activity moved across (2026-08-02): it is an event
              stream, and reading it next to the other two event streams beats
              reading it under the line list it does not describe.
            */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <ContentsColumn
                receiving={receiving}
                lines={lines ?? []}
                totalsSummary={cartonContentsSummary(data?.totals)}
                facts={facts}
                recordMeta={recordMeta}
                purchaseOrders={data?.purchase_orders}
                hideEmptyContents={disposition.exceptions.some((e) => e.key === 'no_lines')}
              />
              <ProgressRail
                receiving={receiving}
                disposition={disposition}
                events={data?.events ?? []}
              />
            </div>
          </div>
        )}
      </div>

      <ReceivingAuditRail
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        receivingId={receivingId}
      />
    </div>
  );
}

function cartonHeaderTitle(identity: CartonHeaderIdentity): string {
  if (identity.poNumber) {
    const platform = identity.platform ? sourcePlatformLabel(identity.platform) : '';
    return [platform, `PO ${identity.poNumber}`].filter(Boolean).join(' · ');
  }
  if (identity.productTitle) return identity.productTitle;
  return `Carton ${identity.cartonId}`;
}

function DispositionBar({
  receivingId,
  identity,
  utilsDisabled,
  copyingAll,
  photoCount,
  photosOpen,
  onTogglePhotos,
  onShare,
  onCopy,
  onAudit,
}: {
  receivingId: number;
  identity: CartonHeaderIdentity | null;
  utilsDisabled: boolean;
  copyingAll: boolean;
  /** `null` until the photo query settles — a `0` that later jumps is a lie. */
  photoCount: number | null;
  photosOpen: boolean;
  onTogglePhotos: () => void;
  onShare: () => void;
  onCopy: () => void;
  onAudit: () => void;
}) {
  const title = identity ? cartonHeaderTitle(identity) : `Carton ${receivingId}`;
  const tracking = identity?.tracking ?? null;
  const poNumber = identity?.poNumber ?? null;

  return (
    <div className={cn(stationContextBarHostClass, 'px-2 sm:px-4')}>
      <Panel
        padding="none"
        radius="2xl"
        elevation="none"
        borderless
        role="banner"
        className={cn(
          stationBookmarkPanelClass,
          'pointer-events-auto flex min-h-10 w-full max-w-full items-center justify-between gap-3 overflow-visible px-3 py-1.5',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="truncate text-role-title text-text-default">{title}</span>
          {tracking || poNumber ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-l border-border-soft pl-3">
              {poNumber ? <PoChip value={poNumber} display={getLast8(poNumber)} /> : null}
              {tracking ? <TrackingChip value={tracking} /> : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            The primary look affordance leads, before the quiet utilities. This is
            the one control the read surface exists for — "show me what this box
            looked like" — and it used to be a card halfway down the right column.
          */}
          <Button
            variant={photosOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={onTogglePhotos}
            disabled={utilsDisabled}
            aria-expanded={photosOpen}
            ariaLabel={photosOpen ? 'Hide carton photos' : 'Show carton photos'}
            icon={<Camera />}
            className="shrink-0"
          >
            <span className="inline-flex items-center gap-1.5">
              Photos
              {photoCount != null ? (
                <span className="tabular-nums opacity-70">{photoCount}</span>
              ) : null}
            </span>
          </Button>

          <div className={HEADER_ICON_CLUSTER}>
            <div className={HEADER_ICON_WRAP}>
              <HoverTooltip label="Share receiving link" asChild>
                <IconButton
                  size="md"
                  disabled={utilsDisabled}
                  onClick={onShare}
                  ariaLabel="Share receiving link"
                  className={HEADER_ICON_BTN_CLASS}
                  icon={<Link2 className={TOP_CHROME_ICON_GLYPH} />}
                />
              </HoverTooltip>
            </div>
            <div className={HEADER_ICON_WRAP}>
              <HoverTooltip label="Copy package + PO details" asChild>
                <IconButton
                  size="md"
                  disabled={utilsDisabled || copyingAll}
                  onClick={onCopy}
                  ariaLabel="Copy all receiving details"
                  className={HEADER_ICON_BTN_CLASS}
                  icon={<Copy className={cn(TOP_CHROME_ICON_GLYPH, copyingAll && 'animate-pulse')} />}
                />
              </HoverTooltip>
            </div>
            <div className={HEADER_ICON_WRAP}>
              <HoverTooltip label="Audit log" asChild>
                <IconButton
                  size="md"
                  disabled={utilsDisabled}
                  onClick={onAudit}
                  ariaLabel="View audit log"
                  className={HEADER_ICON_BTN_CLASS}
                  icon={<History className={TOP_CHROME_ICON_GLYPH} />}
                />
              </HoverTooltip>
            </div>
          </div>

          <HoverTooltip label="Work on this carton" asChild>
            <Link
              href={openInUnboxHref(receivingId)}
              aria-label="Work on this carton"
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-soft hover:bg-surface-canvas hover:text-text-default',
                focusRing('control', 'accent'),
              )}
            >
              <Wrench className="h-4 w-4" />
            </Link>
          </HoverTooltip>
        </div>
      </Panel>
    </div>
  );
}

function ContentsColumn({
  receiving,
  lines,
  totalsSummary,
  facts,
  recordMeta,
  purchaseOrders,
  hideEmptyContents,
}: {
  receiving: CartonInspectorReceiving;
  lines: CartonInspectorLine[];
  totalsSummary: string;
  facts: CartonFact[];
  recordMeta: CartonFact[];
  purchaseOrders?: CartonInspectorPayload['purchase_orders'];
  hideEmptyContents: boolean;
}) {
  return (
    <section className="space-y-5">
      {lines.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Contents</p>
            <span className="text-role-micro uppercase tracking-widest text-text-soft">{totalsSummary}</span>
          </div>
          <ContentsList lines={lines} />
        </div>
      ) : hideEmptyContents ? null : (
        <p className="text-role-caption text-text-muted">No lines on this carton yet.</p>
      )}

      {facts.length > 0 || recordMeta.length > 0 ? (
        <Panel padding="sm" radius="xl" elevation="none" className="space-y-4">
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

          {recordMeta.length > 0 ? (
            <div className="flex flex-wrap items-start justify-start gap-x-6 gap-y-3">
              {recordMeta.map((m) => (
                <div key={m.key} className="min-w-0 shrink-0 space-y-1">
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
        </Panel>
      ) : receiving.listing_url?.trim() ? (
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

      {receiving.support_notes?.trim() ? (
        <Panel padding="sm" radius="xl" elevation="none">
          <p className="whitespace-pre-wrap text-role-caption text-text-default">
            {receiving.support_notes.trim()}
          </p>
        </Panel>
      ) : null}
    </section>
  );
}

function ProgressRail({
  receiving,
  disposition,
}: {
  receiving: CartonInspectorReceiving;
  disposition: CartonDisposition;
}) {
  const readiness = useMemo(() => deriveCartonReadiness(receiving), [receiving]);
  const log = useMemo(() => toReceivingDetailsLog(receiving), [receiving]);

  return (
    <section className="space-y-5">
      {/*
        No photo card here any more. Photos are the DispositionBar's primary CTA
        and open in-flow above both columns — a mid-rail launcher beside it would
        be a second front door to one surface.
      */}
      <div className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Progress</p>
        <Panel padding="sm" radius="xl" elevation="none">
          <ReceivingCartonPipeline log={log} readiness={readiness} />
        </Panel>
      </div>

      <div className="space-y-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">History</p>
        <Panel padding="sm" radius="xl" elevation="none">
          <CartonUnitJourneyHistory receivingId={receiving.id} />
        </Panel>
      </div>

      {disposition.exceptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Findings</p>
          <ul className="space-y-2">
            {disposition.exceptions.map((ex) => (
              <li
                key={ex.key}
                className={cn(
                  'rounded-xl border bg-surface-card px-3 py-2.5',
                  EXCEPTION_TONE[ex.tone],
                )}
              >
                <p className="text-role-caption font-semibold text-text-default">{ex.label}</p>
                <p className="mt-0.5 text-role-caption text-text-muted">{ex.ctaHint}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * CONTENTS items — same collapsed PO-row chrome as {@link PoLineRow} (title +
 * {@link PoLineMetaGrid} chips), without the active-row bottom body (condition
 * pills / serial adder). Shared atoms only — never mounts PoLinesAccordion /
 * PoLineRow (D6: no lobotomized work chrome).
 */
function ContentsList({ lines }: { lines: CartonInspectorLine[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-2">
      {lines.map((line) => {
        const title = line.item_name?.trim() || line.sku?.trim() || 'Untitled line';
        const sku = (line.sku || '').trim();
        const serials = (line.serials ?? [])
          .map((s) => (s.serial_number || '').trim())
          .filter(Boolean);
        return (
          <li
            key={line.id}
            className="relative min-w-0 overflow-hidden rounded-xl border border-border-soft bg-surface-card"
          >
            <div className="w-full min-w-0 px-3 pb-1 pt-1 text-left">
              <p
                className="min-w-0 truncate text-role-caption font-semibold text-text-default"
                title={title}
              >
                {title}
              </p>
              <PoLineMetaGrid
                qty={
                  <ProgressBadge
                    received={line.quantity_received ?? 0}
                    expected={line.quantity_expected}
                  />
                }
                sku={
                  sku ? (
                    <SkuScanRefChip value={sku} display={getLast8(sku)} dense />
                  ) : (
                    <EmptySkuChipFace dense />
                  )
                }
                condition={<ConditionGradeChip grade={line.condition_grade} dense />}
                serial={
                  serials.length > 0 ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      {serials.map((sn) => (
                        <SerialChip key={sn} value={sn} width="w-fit max-w-full" dense />
                      ))}
                    </span>
                  ) : undefined
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EventsList({ events }: { events: CartonInspectorEvent[] }) {
  return (
    <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card">
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
