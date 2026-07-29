'use client';

/**
 * Carton inspector — the READ view of a carton.
 *
 * `/unbox` is the WORK view. This is the read door, so "what happened to this
 * box?" stops meaning "open the editor" (plan D4).
 *
 * ## Layout, and why (Gemini UX review, 2026-07-29)
 *
 * v1 shipped as a 720px single column of same-weight panels and was rejected on
 * sight: 25 facts on a 1440px screen, half the viewport empty, the word "Kai"
 * four times, and the 7 photos — the artifact that settles a damage claim —
 * hidden behind a click. That was **document calm**, which the house identity
 * explicitly bans ("legible throughput over document calm"). This is the rebuild:
 *
 *   1. **Answer first.** A lifecycle hero states DONE/not before anything else,
 *      because the operator scanned a finished box to ask exactly that.
 *   2. **Evidence leads.** Photos are a visible filmstrip at zero clicks. On an
 *      adjudication surface the images are the content, not an attachment.
 *   3. **Full width, two columns ≥1280px.** The old 720px cap came from
 *      `STATION_WORKBENCH_COLUMN`, a token that exists to keep a scan bench
 *      readable BESIDE A RAIL. There is no rail here; the constraint was
 *      inherited without its reason. Line-length limits govern prose, not data.
 *   4. **Provenance collapses.** One actor + one session = one line, with the
 *      second-precision audit rows behind an expander. Multi-actor never
 *      collapses (`collapseProvenance` refuses) — then the attribution IS the
 *      content.
 *
 * ## What is shared with the work view, and what is not
 *
 * The prior rule ("compose the SAME components") produced a read view built from
 * work-view parts with the working bits removed — the identity band rendered
 * nearly empty because it was the bench's header stripped of its live controls.
 * The boundary moved down a layer: this surface shares the **read model, the
 * presentation SoTs and the atoms** (`CopyChip` family, `conditionLabel`,
 * `formatDateTimePST`, `PhotoThumb`, semantic tokens) and assembles them for a
 * different job. Drift is prevented by the typed read model both sides consume,
 * not by forcing one layout onto two jobs.
 *
 * Still absolutely forbidden, and guarded: any write, and any import of the
 * editor shell. The escape to the bench is a LINK.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/design-system/primitives';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Wrench } from '@/components/Icons';
import { PoChip, SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { WorkspaceTimelineTab } from '@/components/station/workbench';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { conditionLabel } from '@/lib/conditions';
import { formatDateTimePST } from '@/utils/date';
import { getLast4 } from '@/lib/copy-chip-format';
import { cn } from '@/utils/_cn';
import {
  buildCartonMilestones,
  cartonContentsSummary,
  cartonLifecycle,
  cartonTimelineAnchor,
  collapseProvenance,
  type CartonInspectorPayload,
  type CartonLifecycle,
} from './carton-inspector-model';

interface ReceivingPhoto {
  id: number;
  photoUrl: string;
  caption: string | null;
}

/** Semantic tone → dot class. The model picks the tone; the view maps it. */
const HERO_DOT: Record<CartonLifecycle['tone'], string> = {
  neutral: 'bg-text-soft',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{children}</p>;
}

function StateBox({ tone, children }: { tone: 'muted' | 'error'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed inset-empty text-center text-role-caption',
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-text-danger'
          : 'border-border-soft bg-surface-canvas text-text-muted',
      )}
    >
      {children}
    </div>
  );
}

export function CartonInspector({ receivingId }: { receivingId: number }) {
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

  // Same query key the shared photos section uses, so the two share one cache
  // entry rather than double-fetching the carton's photos.
  //
  // This one must NOT swallow a failure into an empty list. "No photos exist"
  // and "we could not load the photos" are the same pixels but opposite facts,
  // and on a claim surface the first is a statement someone may act on. Let it
  // throw so the strip can say which happened (workbench.md → branch the empty
  // copy by TYPE; a sub-resource degrades, it never 500s the record).
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
  const lifecycle = useMemo(() => (receiving ? cartonLifecycle(receiving) : null), [receiving]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-soft bg-surface-card px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <HoverTooltip label="Back" focusable={false}>
            <Link
              href="/dashboard?mode=search"
              aria-label="Back to search"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-canvas hover:text-text-default"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </HoverTooltip>

          {/* ── Answer first: the lifecycle hero ─────────────────────────── */}
          {lifecycle ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', HERO_DOT[lifecycle.tone])} />
              <span className="text-role-title text-text-default">{lifecycle.label}</span>
              {lifecycle.done ? (
                <span className="rounded bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 inset-chip text-role-micro uppercase tracking-widest">
                  Work complete
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-role-title text-text-muted">Carton {receivingId}</span>
          )}

          {receiving ? (
            <div className="flex min-w-0 items-center gap-2 border-l border-border-soft pl-4">
              {receiving.zoho_purchaseorder_number ? (
                <PoChip
                  value={receiving.zoho_purchaseorder_number}
                  display={getLast4(receiving.zoho_purchaseorder_number)}
                />
              ) : null}
              {receiving.tracking ? <TrackingChip value={receiving.tracking} /> : null}
              {receiving.carrier ? (
                <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {receiving.carrier}
                </span>
              ) : null}
              {receiving.source_platform ? (
                <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {receiving.source_platform}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <Link href={openInUnboxHref(receivingId)} className="shrink-0">
          <Button variant="secondary" icon={<Wrench />}>
            Open in Unbox
          </Button>
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 px-6 py-10 text-role-caption text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading carton…
          </div>
        ) : isError || !receiving ? (
          <div className="px-6 py-6">
            <StateBox tone="error">
              Could not load this carton. It may have been removed, or belong to another workspace.
            </StateBox>
          </div>
        ) : (
          <div className="space-y-5 px-6 py-5 pb-16">
            {/* ── Evidence leads. Zero clicks. ───────────────────────────── */}
            <EvidenceStrip
              photos={photos}
              receivingId={receivingId}
              loading={photosLoading}
              errored={photosError}
            />

            {/* ── 60/40 at ≥1280px; stacks below that ────────────────────── */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Eyebrow>Contents</Eyebrow>
                  <span className="text-role-micro uppercase tracking-widest text-text-soft">
                    {cartonContentsSummary(data?.totals)}
                  </span>
                </div>
                <CartonContents lines={data?.lines ?? []} />
              </section>

              <section className="space-y-5">
                <div className="space-y-2">
                  <Eyebrow>Handling</Eyebrow>
                  <CartonProvenance receiving={receiving} />
                </div>
                <div className="space-y-2">
                  <Eyebrow>History</Eyebrow>
                  <WorkspaceTimelineTab {...cartonTimelineAnchor(receiving)} />
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The photo filmstrip.
 *
 * Three states, deliberately distinct — this is the one section where a generic
 * empty box would be a lie with consequences:
 *
 *   - **empty** — "no photos were captured" is itself a load-bearing fact on a
 *     damage claim, so it is stated outright rather than left as a section the
 *     reader has to notice is missing.
 *   - **errored** — says only that the load failed. It must never borrow the
 *     empty copy: an operator who reads "nothing to support a claim" and closes
 *     the tab has been told the opposite of the truth by a failed fetch.
 *   - **loading** — neither claim yet.
 */
function EvidenceStrip({
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
  if (loading) {
    return (
      <section className="space-y-2">
        <Eyebrow>Evidence</Eyebrow>
        <div className="flex items-center gap-2 text-role-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
        </div>
      </section>
    );
  }
  if (errored) {
    return (
      <section className="space-y-2">
        <Eyebrow>Evidence</Eyebrow>
        <StateBox tone="error">
          Could not load this carton&rsquo;s photos. This is a load failure, not a statement that
          none were taken — retry before relying on it for a claim.
        </StateBox>
      </section>
    );
  }
  if (photos.length === 0) {
    return (
      <section className="space-y-2">
        <Eyebrow>Evidence</Eyebrow>
        <StateBox tone="muted">
          No photos were captured for this carton — nothing to support a damage or shortage claim.
        </StateBox>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Evidence</Eyebrow>
        <span className="text-role-micro uppercase tracking-widest text-text-soft">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </div>
      {/* Wide content scrolls inside its own container; the page never does. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <a
            key={p.id}
            href={p.photoUrl}
            target="_blank"
            rel="noreferrer"
            className="block h-[120px] w-[120px] shrink-0 overflow-hidden rounded-lg border border-border-soft"
          >
            <PhotoThumb
              src={p.photoUrl}
              alt={p.caption || `Carton ${receivingId} photo`}
              ratio="fill"
            />
          </a>
        ))}
      </div>
    </section>
  );
}

function CartonProvenance({
  receiving,
}: {
  receiving: NonNullable<CartonInspectorPayload['receiving']>;
}) {
  const milestones = useMemo(() => buildCartonMilestones(receiving), [receiving]);
  const collapsed = useMemo(() => collapseProvenance(milestones), [milestones]);
  const [expanded, setExpanded] = useState(false);

  if (milestones.length === 0) {
    return <StateBox tone="muted">Nothing has been recorded against this carton yet.</StateBox>;
  }

  const rows = (
    <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card">
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

  // Multi-actor (or unattributed) never collapses — then the per-step
  // attribution is the content.
  if (!collapsed) return rows;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface-card px-3 py-2">
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
          className="flex shrink-0 items-center gap-1 text-role-micro uppercase tracking-widest text-text-soft hover:text-text-default"
        >
          {collapsed.steps} steps
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded ? rows : null}
    </div>
  );
}

function CartonContents({ lines }: { lines: NonNullable<CartonInspectorPayload['lines']> }) {
  if (lines.length === 0) {
    return <StateBox tone="muted">No lines were recorded on this carton.</StateBox>;
  }
  return (
    <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card">
      {lines.map((line) => {
        const expected = line.quantity_expected;
        const received = line.quantity_received ?? 0;
        const serials = line.serials ?? [];
        return (
          <li key={line.id} className="space-y-1 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
                {line.item_name?.trim() || line.sku?.trim() || 'Untitled line'}
              </span>
              <span className="shrink-0 text-role-caption tabular-nums text-text-muted">
                {expected != null && expected > 0 ? `${received}/${expected}` : received}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
              {line.sku ? <span className="truncate">{line.sku}</span> : null}
              {line.condition_grade ? <span>{conditionLabel(line.condition_grade, 'compact')}</span> : null}
              {line.zoho_purchaseorder_number ? (
                <PoChip
                  value={line.zoho_purchaseorder_number}
                  display={getLast4(line.zoho_purchaseorder_number)}
                />
              ) : null}
              {line.tracking_number ? <TrackingChip value={line.tracking_number} /> : null}
              {serials.map((s) => (
                <SerialChip key={s.id} value={s.serial_number} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
