'use client';

/**
 * Carton photo triage — the in-flow browse surface behind the DispositionBar
 * Photos CTA.
 *
 * Read-only by construction: the gallery input carries `{ url, meta }` and never
 * a numeric `id`, and no `receivingId` prop is passed, so `usePhotoGallery`
 * leaves both `canDeleteCurrent` and `canUpload` false. Drill-in is the shared
 * `PhotoViewerPortal` — there is no second lightbox here.
 *
 * Lanes and buckets are resolved by `buildCartonPhotoTriage`; this file renders
 * what that model returns and decides nothing about which photo goes where.
 * Placement + lane rationale: `docs/todo/carton-photo-triage-RESEARCH-RULING.md`.
 */

import { useMemo, useState } from 'react';
import { Camera, Check, Minus, Search, X } from '@/components/Icons';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { receivingPhotoMeta } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components/SectionTabsSlider';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { photoGridLeafClass } from '@/lib/photos/photo-grid-density';
import { photoStageLabel } from '@/lib/photos/stages';
import { resolvePhotoThumbUrl } from '@/lib/photos/display-url';
import {
  buildCartonPhotoTriage,
  cartonPhotoBucketLabel,
  cartonPhotoBucketRows,
  cartonPhotoLaneLabel,
  cartonPhotoTrailReasonLabel,
  type CartonClaimReadinessLine,
  type CartonPhotoBucket,
  type CartonPhotoLane,
  type CartonPhotoTriageModel,
  type CartonPhotoTriageRow,
} from '@/lib/receiving/carton-photo-triage';
import { useReceivingPhotos, type ReceivingPhotoRow } from '@/hooks/useReceivingPhotos';
import { cn } from '@/utils/_cn';

/** Contact-sheet density — a median carton is 7 photos, so one row at `sm`. */
const TRIAGE_GRID_DENSITY = 'sm' as const;

type ExactDrill = CartonPhotoBucket | 'claim' | null;

export function CartonPhotoTriage({
  receivingId,
  poRef,
  onClose,
}: {
  receivingId: number;
  poRef: string | null;
  onClose: () => void;
}) {
  const { photos, isError, isFetching, settled } = useReceivingPhotos(receivingId, {
    readOnly: true,
  });
  const model = useMemo(() => buildCartonPhotoTriage(photos), [photos]);
  const [drill, setDrill] = useState<ExactDrill>(null);
  // Exact leads because it is the lane that is populated on every carton — see
  // the ruling. A default lane that can be empty is the failure this avoids.
  const [lane, setLane] = useState<CartonPhotoLane>('exact');

  const tabs = useMemo<SectionTab[]>(
    () => [
      {
        id: 'exact',
        label: cartonPhotoLaneLabel('exact'),
        icon: Camera,
        count: model.counts.all,
        content: (
          <ExactLane
            model={model}
            drill={drill}
            onDrill={setDrill}
            photos={photos}
            poRef={poRef}
            settled={settled}
            isFetching={isFetching}
            isError={isError}
          />
        ),
      },
      {
        id: 'investigative',
        label: cartonPhotoLaneLabel('investigative'),
        icon: Search,
        count: model.counts.investigative,
        content: (
          <InvestigativeLane
            model={model}
            photos={photos}
            poRef={poRef}
            settled={settled}
            isFetching={isFetching}
            isError={isError}
          />
        ),
      },
    ],
    [model, drill, photos, poRef, settled, isFetching, isError],
  );

  return (
    // A flush band on the read plane, not a card floating above it — the panel
    // opens BETWEEN the identity chrome and the two columns, so it is a section
    // of the same sheet.
    <div className="inset-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Photos</p>
          <p className="text-role-caption text-text-muted">
            Evidence captured for this carton. Select a photo to open it full size.
          </p>
        </div>
        <HoverTooltip label="Close photos" asChild>
          <IconButton
            size="sm"
            onClick={onClose}
            ariaLabel="Close photos"
            icon={<X className="h-4 w-4" />}
          />
        </HoverTooltip>
      </div>

      <SectionTabsSlider
        tabs={tabs}
        value={lane}
        onChange={(id) => setLane(id as CartonPhotoLane)}
        ariaLabel="Carton photo lanes"
      />
    </div>
  );
}

function ExactLane({
  model,
  drill,
  onDrill,
  photos,
  poRef,
  settled,
  isFetching,
  isError,
}: {
  model: CartonPhotoTriageModel;
  drill: ExactDrill;
  onDrill: (next: ExactDrill) => void;
  photos: ReceivingPhotoRow[];
  poRef: string | null;
  settled: boolean;
  isFetching: boolean;
  isError: boolean;
}) {
  const rows = cartonPhotoBucketRows(model, drill);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <DrillChip label="All" count={model.counts.all} active={drill === null} onClick={() => onDrill(null)} />
        <DrillChip
          label={cartonPhotoBucketLabel('box')}
          count={model.counts.box}
          active={drill === 'box'}
          onClick={() => onDrill('box')}
        />
        <DrillChip
          label={cartonPhotoBucketLabel('item')}
          count={model.counts.item}
          active={drill === 'item'}
          onClick={() => onDrill('item')}
        />
        {/*
          Box and Item show an honest 0; Claim evidence disappears at 0. That is
          not an inconsistency — they answer different kinds of question.
          Box/Item are the FIXED taxonomy of carton evidence, so `Item 0` is a
          fact worth reading (it is why the readiness line below crosses out
          "Item shot"). A claim link is CONTINGENT: 72% of cartons were never
          claimed, so the chip would be permanent noise that filters to nothing.
          Absent, never disabled.
        */}
        {model.counts.claim > 0 ? (
          <DrillChip
            label="Claim evidence"
            count={model.counts.claim}
            active={drill === 'claim'}
            onClick={() => onDrill('claim')}
          />
        ) : null}
      </div>

      <ClaimReadiness lines={model.readiness} aspectsUnwritten={model.aspectsUnwritten} />

      <PhotoTiles
        rows={rows}
        photos={photos}
        poRef={poRef}
        settled={settled}
        isFetching={isFetching}
        isError={isError}
        emptyMessage={
          drill === null
            ? 'No photos were captured for this carton.'
            : drill === 'claim'
              ? 'No photos on this carton are linked to a claim.'
              : drill === 'box'
                ? 'No shots of the box were captured.'
                : 'No item shots were captured for this carton.'
        }
      />
    </div>
  );
}

function InvestigativeLane({
  model,
  photos,
  poRef,
  settled,
  isFetching,
  isError,
}: {
  model: CartonPhotoTriageModel;
  photos: ReceivingPhotoRow[];
  poRef: string | null;
  settled: boolean;
  isFetching: boolean;
  isError: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-role-caption text-text-muted">
        Evidence on this carton that is also tied to something else — a filed claim, a share pack,
        or a shot whose capture stage was never recorded.
      </p>
      <PhotoTiles
        rows={model.investigative}
        photos={photos}
        poRef={poRef}
        settled={settled}
        isFetching={isFetching}
        isError={isError}
        showTrailReasons
        // An empty lane here is a fact about the carton, not a gap in the surface.
        emptyMessage="Nothing on this carton is linked to a claim or a share pack, and every shot has a recorded stage."
      />
    </div>
  );
}

function DrillChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    // ds-raw-button: a pressed-state filter CHIP (rounded-full, micro type, ring
    // anatomy), not an action button — <Button>'s five variants all paint a
    // control. A TabSwitch here would be a second tab band inside the lane tabs.
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ds-raw-button inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset inset-chip',
        'text-role-micro uppercase tracking-widest transition-colors',
        active
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : 'bg-surface-canvas text-text-soft ring-border-soft hover:text-text-default',
        focusRing('control', 'accent'),
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

const READINESS_ICON = {
  present: Check,
  missing: X,
  unclassified: Minus,
} as const;

const READINESS_TONE = {
  present: 'text-text-success',
  missing: 'text-text-soft',
  unclassified: 'text-text-faint',
} as const;

/**
 * The carrier three-shot checklist.
 *
 * `unclassified` deliberately renders as a neutral dash, not a cross. Aspect is
 * NULL on every row captured before the vocabulary shipped, and NULL means
 * *unclassified evidence*, never *missing evidence* — painting a cross there
 * would tell an operator their good photos do not exist.
 */
function ClaimReadiness({
  lines,
  aspectsUnwritten,
}: {
  lines: CartonClaimReadinessLine[];
  aspectsUnwritten: boolean;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border-soft bg-surface-canvas inset-cozy">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Claim readiness</p>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {lines.map((line) => {
          const Icon = READINESS_ICON[line.state];
          return (
            <li key={line.key} className="flex items-center gap-1.5">
              <Icon className={cn('h-3.5 w-3.5', READINESS_TONE[line.state])} aria-hidden />
              <span className="text-role-caption text-text-default">{line.label}</span>
              {line.state === 'unclassified' ? (
                <span className="text-role-micro uppercase tracking-widest text-text-faint">
                  not classified
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {aspectsUnwritten ? (
        <p className="text-role-micro text-text-faint">
          No shot on this carton records which view it shows, so the first two lines report
          classification, not whether the photo was taken.
        </p>
      ) : null}
    </div>
  );
}

function PhotoTiles({
  rows,
  photos,
  poRef,
  settled,
  isFetching,
  isError,
  emptyMessage,
  showTrailReasons = false,
}: {
  rows: CartonPhotoTriageRow[];
  photos: ReceivingPhotoRow[];
  poRef: string | null;
  settled: boolean;
  isFetching: boolean;
  isError: boolean;
  emptyMessage: string;
  showTrailReasons?: boolean;
}) {
  // Meta by URL — the gallery input omits the numeric id (that is what keeps
  // delete off), so the URL is the only join key back to the source row.
  const metaByUrl = useMemo(() => {
    const map = new Map<string, ReturnType<typeof receivingPhotoMeta>>();
    for (const p of photos) map.set(p.photoUrl, receivingPhotoMeta(p, { poRef }));
    return map;
  }, [photos, poRef]);

  const g = usePhotoGallery({
    // Indexes must line up with the tiles the operator can see, so the gallery
    // is fed the FILTERED rows and re-inits when the drill changes.
    photos: useMemo(
      () => rows.map((r) => ({ url: r.url, meta: metaByUrl.get(r.url) })),
      [rows, metaByUrl],
    ),
    launcherTitle: 'Carton photos',
  });

  if (isError) {
    return (
      <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-text-danger">
        Photos unavailable — this carton&rsquo;s evidence could not be loaded. This is not the same
        as having none.
      </p>
    );
  }

  if (!settled && isFetching) {
    return (
      <div className={photoGridLeafClass(TRIAGE_GRID_DENSITY)} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square rounded-lg bg-surface-sunken" aria-hidden />
        ))}
        <span className="sr-only">Loading photos</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <ul className={photoGridLeafClass(TRIAGE_GRID_DENSITY)}>
        {rows.map((row, index) => {
          const stageLabel = row.stage ? photoStageLabel(row.stage) : 'Stage not recorded';
          const reasons = showTrailReasons
            ? row.trailReasons.map(cartonPhotoTrailReasonLabel).join(' · ')
            : '';
          return (
            <li key={row.key} className="min-w-0 space-y-1">
              <HoverTooltip label={`${stageLabel} — open full size`} asChild>
                {/* ds-raw-button: photo thumbnail image tile, not a standard action button */}
                <button
                  type="button"
                  onClick={() => g.openViewer(index)}
                  aria-label={`${stageLabel}, photo ${index + 1} of ${rows.length} — open full size`}
                  className={cn(
                    'ds-raw-button block w-full overflow-hidden rounded-lg border border-border-soft bg-surface-card',
                    'hover:border-border-default',
                    focusRing('control', 'accent'),
                  )}
                >
                  <PhotoThumb
                    src={resolvePhotoThumbUrl({ id: row.photoId, url: row.url })}
                    alt=""
                    ratio="square"
                  />
                </button>
              </HoverTooltip>
              <p className="truncate text-role-micro uppercase tracking-widest text-text-soft">
                {reasons || stageLabel}
              </p>
            </li>
          );
        })}
      </ul>

      {g.photoItems.length > 0 ? <PhotoViewerPortal g={g} /> : null}
    </>
  );
}
