'use client';

/**
 * Carton read assembly — floating identity chrome, contents column, progress rail.
 *
 * Shares the read model + atoms with Unbox.
 *
 * **Not yet ported to the station assembly.** Decision D6 ("never imports
 * workbench editors") was retired 2026-08-20 when `/search?sel=order:` moved
 * onto `EntityStationPane` in `preview` stance. The carton read job should
 * follow — compose the station host with a declared stance rather than keep a
 * parallel read layout. Until it does, this file stays as-is; it is a TODO,
 * not a standing exemption.
 *
 * **Its DISPLAY LANGUAGE is ported, though** (2026-08-21). The section header
 * is `StationBlockLabel` / `StationCollapsibleBlock` — the promotion this file
 * donated in the first place, which it then kept a byte-identical `SectionLabel`
 * fork of — and loading / absence go through `UniversalLoader` and `EmptyState`
 * instead of a hand-rolled spinner row and a rose dashed paragraph. That matters
 * beyond tidiness here: `/search?sel=receiving:` mounts this component next to
 * `/search?sel=order:`, so the two branches of ONE dispatch were wearing two
 * different empty states and two different spinners.
 *
 * Progress reuses the details-stack carton pipeline (`ReceivingCartonPipeline`
 * + stage rows) on a Panel surface; photos use the same
 * `ReceivingPhotosSection` (read-only) below the stepper. Header floats as a
 * top context identity (`station-identity-chrome` SoT) with PO title · tracking · PO#
 * plus quiet actions — never an in-flow pinned band.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { Button, EmptyState, IconButton, Panel } from '@/design-system/primitives';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import {
  StationBlockLabel,
  StationCollapsibleBlock,
} from '@/components/station/collapse';
import {
  Camera,
  Copy,
  ExternalLink,
  History,
  Maximize2,
  Package,
  Wrench,
} from '@/components/Icons';
import {
  CopyableCellValue,
  PoChip,
  SerialChip,
  TrackingChip,
} from '@/components/ui/CopyChip';
import { CarrierMark } from '@/components/ui/CarrierMark';
import { PlatformMark } from '@/components/ui/PlatformMark';
import {
  GridDateTimeCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatar } from '@/components/identity';
import { TIMELINE_GLYPH_ICONS } from '@/components/ui/timeline-glyph-icons';
import { resolveStationGlyph } from '@/lib/timeline/timeline-glyphs';
import { ReceivingAuditRail } from '@/components/receiving/workspace/ReceivingAuditRail';
import { CartonUnitJourneyHistory } from './CartonUnitJourneyHistory';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { ReceivingLineContentsRow } from '@/components/receiving/contents/ReceivingLineContentsRow';
import { receivingLineContentsTitle } from '@/components/receiving/contents/receiving-line-contents-title';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { ReceivingCartonPipeline } from '@/components/station/receiving/ReceivingCartonPipeline';
import { CartonPhotoTriage } from './CartonPhotoTriage';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import { deriveCartonReadiness } from '@/lib/receiving/carton-readiness';
import {
  STATION_IDENTITY_SCROLL_CLEARANCE,
  stationIdentityPanelClass,
  stationContextBarHostClass,
} from '@/components/station/entity-context/station-identity-chrome';
import { buildCartonReadCopyText } from '@/lib/receiving/carton-read-utilities';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import {
  CARRIER_BRANDS,
  displayCarrierFromHint,
} from '@/lib/carrier-brand';
import { sourcePlatformLabel, sourcePlatformMeta } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { formatDateTimePST } from '@/utils/date';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import { getLast8 } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import { listingLinksForReceivingRow } from '@/lib/receiving/listing-links';
import {
  cartonContentsSummary,
  cartonDisposition,
  cartonEventSignature,
  cartonEventTitle,
  cartonFacts,
  cartonHeaderIdentity,
  cartonRecordMeta,
  qaStatusMeta,
  receivingSourceLabel,
  type CartonDisposition,
  type CartonException,
  type CartonFact,
  type CartonHeaderIdentity,
  type CartonInspectorEvent,
  type CartonInspectorLine,
  type CartonInspectorPayload,
  type CartonInspectorReceiving,
} from '../carton-inspector-model';

/** Record-meta keys that read full-bleed under the compact 3-track fact grid. */
const WIDE_RECORD_META_KEYS = new Set(['poId', 'receiveId', 'created', 'updated']);

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
    case 'platform': {
      const meta = sourcePlatformMeta(fact.value);
      const label = sourcePlatformLabel(fact.value);
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <PlatformMark platformValue={fact.value} meta={meta} preferBrandTile />
          <span className="min-w-0 truncate text-role-caption text-text-default">{label}</span>
        </span>
      );
    }
    case 'carrier': {
      const hint = displayCarrierFromHint(fact.value);
      const brand = hint ? CARRIER_BRANDS[hint] : CARRIER_BRANDS.Unknown;
      const label = brand.carrier !== 'Unknown' ? brand.label : fact.value;
      return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CarrierMark meta={brand} />
          <span className="min-w-0 truncate text-role-caption uppercase tracking-wide text-text-default">
            {label}
          </span>
        </span>
      );
    }
    case 'qaStatus': {
      const qa = qaStatusMeta(fact.value);
      return (
        <GridStatusCellValue label={qa.label} toneClass={qa.badge} dotClass={qa.dot} />
      );
    }
    case 'receivingType':
      return (
        <span className="text-role-caption text-text-default">
          {receivingTypeMeta(fact.value).label}
        </span>
      );
    case 'source':
      return (
        <span className="block truncate text-role-caption text-text-default">
          {receivingSourceLabel(fact.value)}
        </span>
      );
    case 'id':
      return (
        <CopyableCellValue
          value={fact.value}
          dense
          className="font-mono tabular-nums text-role-caption text-text-default"
        />
      );
    case 'externalId':
      // Full mono face — long provider ids stay retypable; copy ritual on click.
      return (
        <CopyableCellValue
          value={fact.value}
          dense
          className="break-all font-mono tabular-nums text-role-caption text-text-default"
        />
      );
    case 'instant':
      return (
        <GridDateTimeCellValue
          raw={fact.value}
          className="text-role-caption text-text-muted"
        />
      );
    default:
      // `block` is load-bearing: `truncate` sets overflow+ellipsis, which an
      // inline span ignores — so a long staging label used to run past the
      // column instead of clipping. Only visible once the rail narrowed.
      return <span className="block truncate text-role-caption text-text-default">{fact.value}</span>;
  }
}

/** One labelled fact cell — shared by the operational strip and system meta. */
function RecordFactCell({
  fact,
  wide = false,
  quietLabel = false,
}: {
  fact: CartonFact;
  wide?: boolean;
  quietLabel?: boolean;
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', wide && 'col-span-full')}>
      <p
        className={cn(
          'text-role-micro uppercase tracking-widest',
          quietLabel ? 'text-text-faint' : 'text-text-soft',
        )}
      >
        {fact.label}
      </p>
      <FactValue fact={fact} />
    </div>
  );
}

/** Quiet egress to the marketplace listing — secondary to facts, not a hero CTA. */
function SourceListingButton({ href, label }: { href: string; label?: string | null }) {
  const name = (label || '').trim();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={<ExternalLink className="h-3.5 w-3.5" />}
      onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      ariaLabel={name ? `Open listing: ${name}` : 'Open source listing'}
      className="h-auto px-0 text-text-muted hover:text-text-default"
    >
      {name || 'Source listing'}
    </Button>
  );
}

/**
 * Every listing link on the carton, not just the pasted one. A Zoho PO carries
 * its links in header sync notes — a four-auction PO used to render nothing
 * here, because `listing_url` alone was empty. Each link shows the buyer's own
 * title so the reader can tell them apart.
 *
 * No SKU is passed on purpose: this is a READ surface and must not invent a
 * storefront-search link from an inventory SKU.
 */
function SourceListingLinks({
  receiving,
  className,
}: {
  receiving: CartonInspectorReceiving;
  className?: string;
}) {
  const links = useMemo(
    () =>
      listingLinksForReceivingRow({
        receiving_listing_url: receiving.listing_url,
        receiving_zoho_notes: receiving.zoho_notes,
        source_platform: receiving.source_platform,
        zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
      }),
    [
      receiving.listing_url,
      receiving.zoho_notes,
      receiving.source_platform,
      receiving.zoho_purchaseorder_id,
    ],
  );
  if (links.length === 0) return null;
  return (
    <div className={cn('flex flex-col items-start', className)}>
      {links.map((l) => (
        <SourceListingButton key={l.href} href={l.href} label={l.title} />
      ))}
    </div>
  );
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
    // ONE continuous plane. The sunken identity band above is the only surface
    // step; everything below reads as a single card, sectioned by hairlines.
    <div className="relative flex h-full min-h-0 w-full flex-col bg-surface-card">
      <DispositionBar
        receivingId={receivingId}
        identity={headerIdentity}
        utilsDisabled={receiving == null}
        copyingAll={copyingAll}
        photoCount={photosSettled ? cartonPhotos.length : null}
        photosOpen={photosOpen}
        onTogglePhotos={() => setPhotosOpen(!photosOpen)}
        onCopy={() => void handleCopy()}
        onAudit={() => setAuditOpen(true)}
      />

      <div className={cn('min-h-0 flex-1 overflow-y-auto', STATION_IDENTITY_SCROLL_CLEARANCE)}>
        {isLoading ? (
          <UniversalLoader isLoading label="Loading carton" />
        ) : isError || !receiving || !disposition ? (
          <div className="inset-card">
            <EmptyState
              tone="danger"
              icon={<Package className="h-6 w-6 text-text-danger" />}
              title="Carton not found"
              description="It may have been removed, or belong to another workspace."
            />
          </div>
        ) : (
          <div className="pb-16">
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
                  className="overflow-hidden border-b border-border-soft"
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

              Tracks are 2fr | 1fr (ruled 2026-08-03): contents + record need
              the wider column so long line titles wrap honestly; progress /
              activity stay readable on the narrower timeline. The prior 22rem
              rail starved the title.

              The columns are FLUSH (gap-0, hairline seam) — depth is planes,
              not gutters. A `gap-5` between two sections of one record read as
              two floating cards; the vertical rule says "same sheet, next
              question" instead.
            */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <ContentsColumn
                receiving={receiving}
                lines={lines ?? []}
                totalsSummary={cartonContentsSummary(data?.totals)}
                purchaseOrders={data?.purchase_orders}
                hideEmptyContents={disposition.exceptions.some((e) => e.key === 'no_lines')}
              />
              <ProgressRail
                receiving={receiving}
                disposition={disposition}
                events={data?.events ?? []}
                facts={facts}
                recordMeta={recordMeta}
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

/**
 * Lead title — a name a person recognises, never the internal carton id.
 *
 * The row number is a database handle: an operator arrived here by scanning a
 * tracking number or looking up a PO, and neither of those is `14215`. The id
 * still addresses the record (the URL, the audit rail, Unbox), it just does not
 * get the one line that answers "what am I looking at". Order is what the
 * warehouse says out loud: the product, then the PO, then the parcel. When we
 * genuinely know none of the three we say so rather than substituting a number.
 */
function cartonHeaderTitle(identity: CartonHeaderIdentity): string {
  if (identity.productTitle?.trim()) return identity.productTitle.trim();
  if (identity.poNumber) {
    const platform = identity.platform ? sourcePlatformLabel(identity.platform) : '';
    return [platform, `PO ${identity.poNumber}`].filter(Boolean).join(' · ');
  }
  if (identity.tracking?.trim()) return `Parcel ${getLast8(identity.tracking.trim())}`;
  return 'Unidentified carton';
}

function DispositionBar({
  receivingId,
  identity,
  utilsDisabled,
  copyingAll,
  photoCount,
  photosOpen,
  onTogglePhotos,
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
  onCopy: () => void;
  onAudit: () => void;
}) {
  const router = useRouter();
  const title = identity ? cartonHeaderTitle(identity) : 'Loading…';
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
          stationIdentityPanelClass,
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
            ariaLabel={photosOpen ? 'Hide photos' : 'Show photos'}
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

          <Button
            variant="ghost"
            size="sm"
            disabled={utilsDisabled || copyingAll}
            onClick={onCopy}
            ariaLabel="Copy all receiving details"
            icon={<Copy className={cn(copyingAll && 'animate-pulse')} />}
            className="shrink-0 text-text-soft"
          >
            Copy
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={utilsDisabled}
            onClick={onAudit}
            ariaLabel="View audit log"
            icon={<History />}
            className="shrink-0 text-text-soft"
          >
            History
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={utilsDisabled}
            onClick={() => router.push(openInUnboxHref(receivingId))}
            ariaLabel="Work on this carton"
            icon={<Wrench />}
            className="shrink-0 text-text-soft"
          >
            Unbox
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/**
 * ONE section header for the whole read surface.
 *
 * Every section on this sheet answers a different question, so the only thing
 * that should differ between their headers is the word. Before this they did
 * not: Progress wore `text-text-muted` while its five siblings wore
 * `text-text-soft`, Contents put its total in a bare span, and Activity built a
 * third shape out of a button, a count and an icon — three inks and three row
 * heights down one 1fr column, which reads as three unrelated widgets rather
 * than one record.
 *
 * `count` is the section's own trailing fact (12 events, 3 of 4 received);
 * `action` is the one control the section owns. `onToggle` turns the label into
 * the disclosure so the chevron sits inside the word it opens.
 */
function ContentsColumn({
  receiving,
  lines,
  totalsSummary,
  purchaseOrders,
  hideEmptyContents,
}: {
  receiving: CartonInspectorReceiving;
  lines: CartonInspectorLine[];
  totalsSummary: string;
  purchaseOrders?: CartonInspectorPayload['purchase_orders'];
  hideEmptyContents: boolean;
}) {
  // The line list is a disclosure, not the resting state: the summary answers
  // "how much is in here" in one row, and a carton with eight lines used to
  // push Purchase orders and Note below the fold to say it eight times.
  const [linesOpen, setLinesOpen] = useState(false);

  return (
    // Sections, not cards. `divide-y` rules BETWEEN siblings only, so the last
    // section never trails an unfinished hairline into open plane — which is
    // what a per-section `border-b` would do on two columns of unequal length.
    <section className="divide-y divide-border-hairline" data-testid="carton-contents-column">
      {lines.length > 0 ? (
        <div className="inset-card">
          {/* A true disclosure, so it takes the BLOCK rather than the bare
              header — which also gives the line list the house height tween it
              never had (it used to appear and vanish on a frame). */}
          <StationCollapsibleBlock
            label="Contents"
            count={totalsSummary}
            collapsed={!linesOpen}
            onToggle={() => setLinesOpen((v) => !v)}
            bodyClassName="pt-2"
            testId="carton-contents-block"
          >
            <ContentsList lines={lines} />
          </StationCollapsibleBlock>
        </div>
      ) : hideEmptyContents ? null : (
        <p className="inset-card text-role-caption text-text-muted">No lines on this carton yet.</p>
      )}

      {(purchaseOrders?.length ?? 0) > 1 ? (
        <div className="inset-card space-y-2">
          <StationBlockLabel label="Purchase orders" />
          <ul className="divide-y divide-border-hairline">
            {purchaseOrders!.map((po) => (
              <li
                key={po.zoho_purchaseorder_id ?? po.zoho_purchaseorder_number ?? 'po'}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="truncate text-role-caption text-text-default">
                  {po.zoho_purchaseorder_number ?? 'Unnumbered PO'}
                </span>
                <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
                  {po.line_count} lines
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {receiving.support_notes?.trim() ? (
        <div className="inset-card space-y-2">
          <StationBlockLabel label="Note" />
          <p className="whitespace-pre-wrap text-role-caption text-text-default">
            {receiving.support_notes.trim()}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * RECORD — the row's own system facts, and they live in the RIGHT column.
 *
 * The left column answers "what is in the box" and the right answers
 * "what happened to it / what is this row". Platform · QA · carrier · source ·
 * ids · stamps are the second question, and parking them under the line list
 * put a 3-track fact grid between the contents and the notes about them.
 * It leads the right column: an operator who arrived from a search reads
 * "which record am I on" before the pipeline.
 */
function RecordSection({
  receiving,
  facts,
  recordMeta,
}: {
  receiving: CartonInspectorReceiving;
  facts: CartonFact[];
  recordMeta: CartonFact[];
}) {
  if (facts.length === 0 && recordMeta.length === 0) {
    return <SourceListingLinks receiving={receiving} className="inset-card" />;
  }
  return (
    <div className="inset-card space-y-3">
      <StationBlockLabel label="Record" />
      {facts.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
          {facts.slice(0, 6).map((f) => (
            <RecordFactCell key={f.key} fact={f} />
          ))}
        </div>
      ) : null}

      {recordMeta.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
          {recordMeta.map((m) => (
            <RecordFactCell
              key={m.key}
              fact={m}
              wide={WIDE_RECORD_META_KEYS.has(m.key)}
              quietLabel
            />
          ))}
        </div>
      ) : null}

      <SourceListingLinks receiving={receiving} />
    </div>
  );
}

function ProgressRail({
  receiving,
  disposition,
  events,
  facts,
  recordMeta,
}: {
  receiving: CartonInspectorReceiving;
  disposition: CartonDisposition;
  events: CartonInspectorEvent[];
  facts: CartonFact[];
  recordMeta: CartonFact[];
}) {
  const readiness = useMemo(() => deriveCartonReadiness(receiving), [receiving]);
  const log = useMemo(() => toReceivingDetailsLog(receiving), [receiving]);

  return (
    // The seam between the two questions is a rule, not a gutter: a top hairline
    // when the tracks stack, a left one once they sit side by side.
    <section
      className="divide-y divide-border-hairline border-t border-border-soft xl:border-t-0 xl:border-l"
      data-testid="carton-timeline-column"
    >
      {/* Which record am I on — leads the column (see RecordSection). */}
      <RecordSection receiving={receiving} facts={facts} recordMeta={recordMeta} />

      {/*
        No photo card here any more. Photos are the DispositionBar's primary CTA
        and open in-flow above both columns — a mid-rail launcher beside it would
        be a second front door to one surface.
      */}
      <div className="inset-card space-y-2">
        <StationBlockLabel label="Progress" />
        <ReceivingCartonPipeline log={log} readiness={readiness} />
      </div>

      {/*
        FINDINGS sits under Progress and ABOVE Activity/History (2026-08-03).
        With Activity collapsed by default, exceptions must not hide behind the
        disclosure header. Progress still leads — WHERE before WHAT IS WRONG.
      */}
      {disposition.exceptions.length > 0 ? (
        <div className="inset-card space-y-2">
          <StationBlockLabel label="Findings" />
          <ul className="space-y-1.5">
            {disposition.exceptions.map((ex) => (
              // A finding keeps its tone — that is state, not decoration — but
              // wears it as a flush tinted band with a left accent rule. An edge
              // accent must be a border on the element itself; `rounded-*-[inherit]`
              // on a child renders as a lens/notch.
              <li
                key={ex.key}
                className={cn('border-l-2 inset-field', EXCEPTION_TONE[ex.tone])}
              >
                <p className="text-role-caption font-semibold text-text-default">{ex.label}</p>
                <p className="mt-0.5 text-role-caption text-text-muted">{ex.ctaHint}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        Activity is a disclosure (ruled 2026-08-03): the stream is unbounded and
        used to bury Findings + History. Progress stays the lead answer; the
        event list opens on demand with a count on the header.
      */}
      {events.length > 0 ? <ActivitySection events={events} /> : null}

      <div className="inset-card space-y-2">
        <StationBlockLabel label="History" />
        <CartonUnitJourneyHistory receivingId={receiving.id} />
      </div>
    </section>
  );
}

/**
 * CONTENTS items — one card per line via {@link ReceivingLineContentsRow}.
 *
 * Shared ATOMS only, never `PoLinesAccordion` / `PoLineRow` (no lobotomized
 * work chrome). It also deliberately does not mount `PoLineMetaGrid`: that is
 * the Unbox accordion's FIXED-TRACK grid. House one-row anatomy: Zoho thumb ·
 * title pinned top · details pinned bottom.
 */
function ContentsList({ lines }: { lines: CartonInspectorLine[] }) {
  const galleryPhotos = useMemo(
    () =>
      lines
        .map((l) => (l.image_url || '').trim())
        .filter(Boolean),
    [lines],
  );
  const gallery = usePhotoGallery({ photos: galleryPhotos });

  return (
    <>
      {/*
        Rows on the shared plane, not a stack of cards. A list of bordered cards
        inside a section IS the nested-cards-as-rows ban — and the card's own
        `overflow-hidden` (there to clip the radius) was shearing the focus ring
        off the thumb button inside it.
      */}
      <ul className="flex min-w-0 flex-col divide-y divide-border-hairline">
        {lines.map((line) => {
          const imageUrl = (line.image_url || '').trim() || null;
          const galleryIndex = imageUrl ? galleryPhotos.indexOf(imageUrl) : -1;
          const serials = (line.serials ?? [])
            .map((s) => (s.serial_number || '').trim())
            .filter(Boolean);
          return (
            <li key={line.id} className="relative min-w-0 py-2">
              <ReceivingLineContentsRow
                title={receivingLineContentsTitle(line)}
                imageUrl={imageUrl}
                sku={(line.sku || '').trim()}
                conditionGrade={line.condition_grade}
                serials={serials}
                qtySlot={
                  <span className="tabular-nums text-role-eyebrow uppercase tracking-widest">
                    <ProgressBadge
                      received={line.quantity_received ?? 0}
                      expected={line.quantity_expected}
                    />
                  </span>
                }
                titleMode="wrap"
                onOpenImage={
                  galleryIndex >= 0
                    ? () => gallery.openViewer(galleryIndex)
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>
      {gallery.photoItems.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </>
  );
}

/**
 * Activity — latest event on display; expand for the full stream; maximize for
 * a page-level overlay of the same list.
 *
 * `events` arrive newest-first (`readTimeline` ORDER BY occurred_at DESC). The
 * collapsed surface shows `events[0]` so the operator still sees what just
 * happened without opening the unbounded feed.
 */
function ActivitySection({ events }: { events: CartonInspectorEvent[] }) {
  const [listOpen, setListOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const presence = useMotionPresence(framerPresence.collapseHeight);
  const transition = useMotionTransition(framerTransition.stationCollapse);

  const newest = events[0]!;
  const countLabel = `${events.length} events`;
  const canExpandList = events.length > 1;
  const visibleEvents = listOpen || !canExpandList ? events : [newest];

  return (
    <div className="inset-card space-y-2">
      {/* The header only. This body is a SWAP — newest event when closed, the
          full list when open — so `StationCollapsibleBlock` would remove the one
          row the section exists to show. `onToggle` is deliberately conditional:
          with a single event there is nothing to open. */}
      <StationBlockLabel
        label="Activity"
        count={countLabel}
        open={listOpen}
        onToggle={canExpandList ? () => setListOpen((v) => !v) : undefined}
        action={
          <HoverTooltip label="Expand activity" asChild>
            <IconButton
              size="sm"
              ariaLabel="Expand activity on page"
              onClick={() => setPageOpen(true)}
              icon={<Maximize2 />}
              className="-my-1 text-text-soft"
            />
          </HoverTooltip>
        }
      />

      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={listOpen ? 'activity-all' : 'activity-latest'}
          initial={listOpen ? presence.initial : false}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          className="overflow-hidden"
        >
          <EventsList events={visibleEvents} chipScope={events} />
        </motion.div>
      </AnimatePresence>

      <Dialog open={pageOpen} onOpenChange={setPageOpen}>
        <DialogContent className="flex max-h-[min(85vh,52rem)] w-[min(42rem,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Activity · {countLabel}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <EventsList events={events} chipScope={events} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventsList({
  events,
  chipScope,
}: {
  events: CartonInspectorEvent[];
  /** Full feed used to decide whether serial chips disambiguate — not just the visible slice. */
  chipScope?: CartonInspectorEvent[];
}) {
  // Same rule the unit journeys use (`mergeStationUnitJourneys`): an identity
  // chip exists to say WHICH unit a row is about, so on a feed with one distinct
  // serial it repeats the same last-8 down the column and disambiguates nothing.
  // Keeping it here while the journeys below dropped it would put two answers to
  // one question on a single page.
  const scope = chipScope ?? events;
  const distinctSerials = new Set(
    scope.map((e) => e.serial_number?.trim()).filter((s): s is string => Boolean(s)),
  );
  const chipDisambiguates = distinctSerials.size > 1;

  return (
    <ul className="divide-y divide-border-hairline">
      {events.map((e) => {
        // What makes this row different from the one above it. Derived in the
        // model, never re-decided in JSX (same rule as the photo buckets).
        const { kind, trail } = cartonEventSignature(e);
        const station = resolveStationGlyph(e.station);
        const StationGlyph = station ? TIMELINE_GLYPH_ICONS[station.id] : null;
        return (
          <li key={e.id} className="space-y-1 py-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-role-caption font-semibold text-text-default">
                {cartonEventTitle(e)}
              </span>
              <span className="shrink-0 whitespace-nowrap text-role-caption tabular-nums text-text-muted">
                {formatDateTimePST(e.occurred_at)}
              </span>
            </div>
            {/*
              WHO leads. An event is someone's action, and the face is the
              fastest thing on the row to recognise — the name used to sit last,
              after the machine tokens. `StaffAvatar` resolves the photo by
              staff ID (never from the name), so a feed carrying only an actor
              id still gets the right face.

              One caption size for the whole meta line (name · glyph · kind ·
              trail) — never mix eyebrow/micro under a caption title.
            */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-caption text-text-muted">
              {e.actor_staff_id != null || e.actor_name ? (
                <span className="flex items-center gap-1.5 text-text-default">
                  <StaffAvatar staffId={e.actor_staff_id} name={e.actor_name} size="xs" />
                  {e.actor_name ? <span>{e.actor_name}</span> : null}
                </span>
              ) : null}
              {/*
                The bench is a glyph, not a shouted word: `RECEIVING` in caps
                out-weighed the note it belonged to. Same shape MasterNav uses
                for that station (StationReceiving IS PackageOpen), minus the
                nav stroke wrapper which muddies 14px. An unmapped bench keeps
                its text rather than vanishing.
              */}
              {StationGlyph && station ? (
                <HoverTooltip
                  label={station.tooltip}
                  className={cn('inline-flex items-center', focusRing('control', 'accent'))}
                >
                  <StationGlyph className="h-3.5 w-3.5 text-text-soft" />
                  {/* The glyph replaced a word; keep the word for a reader. */}
                  <span className="sr-only">{station.tooltip}</span>
                </HoverTooltip>
              ) : e.station ? (
                <span>{e.station}</span>
              ) : null}
              {kind ? <span>{kind}</span> : null}
              {trail ? <span>{trail}</span> : null}
              {chipDisambiguates && e.serial_number ? (
                <SerialChip value={e.serial_number} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
