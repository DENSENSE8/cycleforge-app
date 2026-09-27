'use client';

import { motion } from '@/design-system/motion';
import {
  AlertTriangle, Calendar, Camera, ChevronRight, ExternalLink, FileText, Hash,
  Image as ImageIcon, Layers, Package, ScanBarcode, Sparkles, Tag, Truck, User,
} from '../../Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { formatDateTimePST } from '@/utils/date';
import { useZendeskTicketSubject } from '@/hooks/useZendeskTicketSubject';
import { usePhotoReceivingContext } from '@/hooks/usePhotoReceivingContext';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { photoStageLabel } from '@/lib/photos/stages';
import type { PhotoIdentityMeta } from '@/components/photos/photo-library-types';
import {
  describePhotoWorkflow,
  resolveLinkedEntityDisplay,
  resolveProvenanceNavLink,
  unboxingPoLabel,
  type PhotoWorkflowKind,
} from './photo-context-provenance';
import type { PhotoItem } from './photo-gallery-utils';

/** Right-side info panel for the fullscreen viewer — the "where did this photo come from" surface. */

const WORKFLOW_ICONS = {
  unboxing: Package,
  packing: Layers,
  claims: FileText,
  unknown: ImageIcon,
} as const satisfies Record<PhotoWorkflowKind, typeof Package>;

function ProvenanceLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-role-micro uppercase tracking-widest text-text-faint">{children}</p>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-role-micro uppercase tracking-widest text-text-faint">
        <span className="text-text-soft">{icon}</span>
        {label}
      </p>
      <div className="text-sm text-stage-soft">{children}</div>
    </div>
  );
}

export function PhotoContextPanel({
  photo,
  onCollapse,
}: {
  photo: PhotoItem | undefined;
  onCollapse: () => void;
}) {
  const meta = photo?.meta;
  // One transition for BOTH directions — the drawer is a single reversible
  // toggle (close == open reversed). Under reduced motion this collapses to
  // duration 0, so the width snaps open/closed instantly.
  const panelTransition = useMotionTransition(motionTransition.photoContextPanelMount);
  // Hooks must run unconditionally; each self-disables for null/invalid ids.
  const ticketSubject = useZendeskTicketSubject(meta?.ticketId ?? null);
  // Lazy provenance detail (serial / tracking / claim) — fetched only while the
  // details panel is open (this component unmounts when collapsed).
  const receivingCtx = usePhotoReceivingContext(photo?.id ?? null);

  if (!photo) return null;

  const workflow = meta ? describePhotoWorkflow(meta) : describePhotoWorkflow({});
  const linked = resolveLinkedEntityDisplay(workflow, meta, ticketSubject.data);
  const navLink = resolveProvenanceNavLink(workflow, meta);
  const WorkflowIcon = WORKFLOW_ICONS[workflow.kind];

  // Discrete provenance identifiers, shown as their own fields so the viewer surfaces the WHOLE picture (PO + claim + SKU + serial +…
  const ctx = receivingCtx.data;
  // Library rows thread SKU · serial · stage through the gallery meta
  // (photo-grid-format → libraryPhotoMeta); non-library callers simply omit it.
  const identity: PhotoIdentityMeta = (meta ?? {}) as PhotoIdentityMeta;
  const stage = identity.stage ?? null;
  const sku = identity.sku?.trim() || null;
  const metaSerial = identity.serialNumber?.trim() || null;
  const serials = ctx?.serials?.length ? ctx.serials : metaSerial ? [metaSerial] : [];
  const tracking = ctx?.tracking ?? null;
  const claimRaw = ctx?.claim ?? (meta?.ticketId != null ? `#${meta.ticketId}` : null);
  const claimDisplay = claimRaw ? (claimRaw.startsWith('#') ? claimRaw : `#${claimRaw}`) : null;
  const poRef = meta?.poRef?.trim() || null;
  const poDisplay = poRef ? unboxingPoLabel(poRef) : null;
  const primaryIsClaim = workflow.kind === 'claims';
  const primaryIsPo = workflow.kind === 'unboxing' && !!poRef;
  const showClaimField = !!claimDisplay && !primaryIsClaim;
  const showPoField = !!poDisplay && !primaryIsPo;
  const hasIdentifiers =
    showClaimField || showPoField || !!sku || serials.length > 0 || !!tracking;

  const analysisNode = meta?.damageDetected
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200 ring-1 ring-inset ring-rose-400/30"><AlertTriangle className="h-3.5 w-3.5" /> Damage detected</span>
    : meta?.hasAnalysis
      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30"><Sparkles className="h-3.5 w-3.5" /> Analyzed · clear</span>
      : <span className="text-xs text-text-faint">Not analyzed yet</span>;

  return (
    <motion.aside
      data-testid="photo-context-panel"
      // Animate the drawer's OWN WIDTH (flex sibling) so the image lane + toolbar reflow live and concurrently in BOTH directions — no…
      initial={{ width: 0 }}
      animate={{ width: '20rem' }}
      exit={{ width: 0 }}
      transition={panelTransition}
      aria-label="Photo details"
      className="pointer-events-auto relative z-20 h-full max-w-[85vw] shrink-0 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex h-full w-80 max-w-[85vw] flex-col gap-5 overflow-y-auto border-l border-glass/10 bg-scrim/60 px-5 pb-5 pt-6 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-micro uppercase tracking-widest text-text-faint">Details</p>
        <HoverTooltip label="Hide details (i)" asChild>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onCollapse();
            }}
            // Match the viewer toolbar's icon-button box (p-3 + h-5) so this
            // chevron sits on the same baseline as the X / Info / Download cluster
            // across the divider, instead of a smaller button riding higher.
            className="rounded-full border border-glass/20 bg-glass/10 p-3 text-white transition-colors hover:bg-glass/20"
            ariaLabel="Hide photo details"
            icon={<ChevronRight className="h-5 w-5 text-white" />}
          />
        </HoverTooltip>
      </div>

      {/* Provenance — workflow type vs linked entity are separate fields. */}
      <section className="space-y-3" aria-labelledby="photo-provenance-type">
        <div className="space-y-1.5">
          <ProvenanceLabel>Type</ProvenanceLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              id="photo-provenance-type"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ring-1 ring-inset ${workflow.tone}`}
            >
              <WorkflowIcon className="h-3.5 w-3.5" />
              {workflow.label}
            </span>
            {stage ? (
              <span
                data-testid="photo-context-stage"
                className="inline-flex items-center rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-text-soft ring-1 ring-inset ring-border-soft"
              >
                {photoStageLabel(stage)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <ProvenanceLabel>Linked to</ProvenanceLabel>
          {linked.primary ? (
            <div className="space-y-0.5">
              <p data-testid="photo-context-ref" className="text-base font-semibold leading-snug text-white">
                {linked.primary}
              </p>
              {linked.secondary ? (
                <p className="text-sm font-semibold tabular-nums text-text-faint">{linked.secondary}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1">
              <p
                data-testid="photo-context-ref-missing"
                className="text-sm font-semibold text-stage-soft"
              >
                {linked.missingHeadline}
              </p>
              {linked.missingDetail ? (
                <p className="text-xs leading-snug text-text-faint">{linked.missingDetail}</p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {navLink ? (
        <a
          data-testid="photo-context-source-link"
          href={navLink.href}
          className="flex items-center justify-center gap-2 rounded-lg border border-glass/15 bg-glass/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-glass/20"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          {navLink.label}
        </a>
      ) : null}

      {/* Provenance identifiers — PO / claim / serial(s) / tracking, resolved
          lazily from the photo's receiving carton. Each field is hidden when
          empty or already shown as the primary "Linked to" headline above. */}
      {hasIdentifiers ? (
        <div className="space-y-4">
          {showClaimField ? (
            <Field icon={<Hash className="h-3.5 w-3.5" />} label="Claim">
              <span className="font-semibold tabular-nums text-white">{claimDisplay}</span>
            </Field>
          ) : null}
          {showPoField ? (
            <Field icon={<Package className="h-3.5 w-3.5" />} label="Purchase order">
              <span className="font-semibold text-white">{poDisplay}</span>
            </Field>
          ) : null}
          {sku ? (
            <Field icon={<Tag className="h-3.5 w-3.5" />} label="SKU">
              <span data-testid="photo-context-sku" className="font-semibold tabular-nums text-white">
                {sku}
              </span>
            </Field>
          ) : null}
          {serials.length > 0 ? (
            <Field icon={<ScanBarcode className="h-3.5 w-3.5" />} label={serials.length > 1 ? 'Serials' : 'Serial'}>
              <div className="flex flex-wrap gap-1">
                {serials.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-glass/10 px-1.5 py-0.5 font-mono text-xs text-stage-soft ring-1 ring-inset ring-glass/15"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Field>
          ) : null}
          {tracking ? (
            <Field icon={<Truck className="h-3.5 w-3.5" />} label="Tracking">
              <span className="font-mono text-xs tabular-nums text-stage-soft">{tracking}</span>
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="h-px bg-glass/10" />

      {/* Capture metadata */}
      <div className="space-y-4">
        {meta?.takenByStaffName ? (
          <Field icon={<User className="h-3.5 w-3.5" />} label="Taken by">
            {meta.takenByStaffName}
          </Field>
        ) : null}

        {/* Capture vs upload are two different instants and the gap between them is the whole point: */}
        {meta?.clientCapturedAt ? (
          <Field icon={<Camera className="h-3.5 w-3.5" />} label="Captured">
            <time dateTime={meta.clientCapturedAt} className="tabular-nums">
              {formatDateTimePST(meta.clientCapturedAt)}
            </time>
            <p className="mt-0.5 text-xs leading-snug text-text-faint">
              Reported by the capture device — not server-verified.
            </p>
          </Field>
        ) : null}

        {meta?.createdAt ? (
          <Field icon={<Calendar className="h-3.5 w-3.5" />} label="Uploaded">
            <time dateTime={meta.createdAt} className="tabular-nums">{formatDateTimePST(meta.createdAt)}</time>
          </Field>
        ) : null}

        <Field icon={<ImageIcon className="h-3.5 w-3.5" />} label="Dimensions">
          {photo.naturalWidth && photo.naturalHeight ? (
            <span className="tabular-nums">{photo.naturalWidth} × {photo.naturalHeight} px</span>
          ) : (
            <span className="text-text-faint">—</span>
          )}
        </Field>

        <Field icon={<Sparkles className="h-3.5 w-3.5" />} label="Analysis">
          {analysisNode}
        </Field>

        {meta?.stage ? (
          <Field icon={<Package className="h-3.5 w-3.5" />} label="Stage">
            <span>{photoStageLabel(meta.stage)}</span>
          </Field>
        ) : null}

        {meta?.caption ? (
          <Field icon={<FileText className="h-3.5 w-3.5" />} label="Caption">
            <p className="whitespace-pre-wrap text-sm leading-snug text-stage-soft">{meta.caption}</p>
          </Field>
        ) : null}
      </div>
      </div>
    </motion.aside>
  );
}
