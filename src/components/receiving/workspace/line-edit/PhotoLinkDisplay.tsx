'use client';

/**
 * Photos Displays → **Link** drill — the exact-linkage attach surface.
 *
 * Lives in the right rail under the Photos index (`?photoAction=link`), sibling
 * of Move / Send / Compare. Dock Link (Arrival · carton bench · item strip) and
 * the Photos Actions "Link a photo" row all open this leaf — never a popover.
 *
 * Top selectors answer *what am I linking, and as what*:
 *   - **Link to** — carton step (Shipping label · The box · Packing material)
 *     or a PO item on this carton. Defaults from the open handoff.
 *   - **Link as** — item aspects only (hidden when Link to is a carton step).
 *
 * Below, the shared {@link PhotoAttachGrid}: select carton photos → one Check
 * commits by target kind (claim-stage / aspect / reassign).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PhotoAttachGrid,
  type PhotoAttachCandidate,
} from '@/components/photos/photo-library-grid/PhotoAttachGrid';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingPhotosQueryKey, refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import {
  ASPECTS_BY_STAGE,
  photoAspectLabel,
  type PhotoAspect,
} from '@/lib/photos/photo-aspects';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { reassignPhotoToReceivingLine } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { toast } from '@/lib/toast';

/** No aspect chosen — reassign only, leave the shot's classification alone. */
const KEEP_ASPECT = '';

/** Carton Link-to options (procedure door/bench shots). */
const CARTON_LINK_ASPECTS = [
  'shipping_label',
  'box_exterior',
  'packing_material',
] as const satisfies readonly PhotoAspect[];

type CartonLinkAspect = (typeof CARTON_LINK_ASPECTS)[number];

type LinkTarget =
  | { kind: 'carton'; aspect: CartonLinkAspect }
  | { kind: 'line'; lineId: number };

function encodeTarget(target: LinkTarget): string {
  return target.kind === 'carton'
    ? `carton:${target.aspect}`
    : `line:${target.lineId}`;
}

function parseTarget(value: string | number | null): LinkTarget | null {
  if (value == null) return null;
  const raw = String(value);
  if (raw.startsWith('carton:')) {
    const aspect = raw.slice('carton:'.length) as CartonLinkAspect;
    if ((CARTON_LINK_ASPECTS as readonly string[]).includes(aspect)) {
      return { kind: 'carton', aspect };
    }
    return null;
  }
  if (raw.startsWith('line:')) {
    const lineId = Number(raw.slice('line:'.length));
    return Number.isFinite(lineId) && lineId > 0
      ? { kind: 'line', lineId }
      : null;
  }
  // Legacy bare numeric line id (Actions open without handoff encoding).
  const lineId = typeof value === 'number' ? value : Number(raw);
  return Number.isFinite(lineId) && lineId > 0
    ? { kind: 'line', lineId }
    : null;
}

function isDoorClaimAspect(aspect: CartonLinkAspect): boolean {
  return aspect === 'shipping_label' || aspect === 'box_exterior';
}

interface CartonPhotoRow {
  id: number;
  photoUrl: string;
}

interface SiblingsResponse {
  receiving_lines: ReceivingLineRow[];
}

/** Product identity for a line — Zoho item title precedence, then a bare id. */
function lineTitle(line: ReceivingLineRow): string {
  return (
    line.zoho_item_title ||
    line.catalog_product_title ||
    line.item_name ||
    `Item ${line.id}`
  );
}

function lineMeta(line: ReceivingLineRow): string | undefined {
  const serial =
    line.serials?.find((s) => !!s.serial_number?.trim())?.serial_number ?? null;
  const parts = [line.sku, serial].filter((v): v is string => !!v?.trim());
  return parts.length ? parts.join(' · ') : undefined;
}

function resolveDefaultTarget(
  defaultCartonAspect: PhotoAspect | null | undefined,
  defaultTargetLineId: number,
): LinkTarget {
  if (
    defaultCartonAspect &&
    (CARTON_LINK_ASPECTS as readonly string[]).includes(defaultCartonAspect)
  ) {
    return { kind: 'carton', aspect: defaultCartonAspect as CartonLinkAspect };
  }
  return { kind: 'line', lineId: defaultTargetLineId };
}

export function PhotoLinkDisplay({
  receivingId,
  defaultTargetLineId,
  defaultCartonAspect = null,
  focusRequestId = 0,
  onClose,
}: {
  receivingId: number;
  /** Active / handed-off line — initial "Link to" when no carton aspect. */
  defaultTargetLineId: number;
  /** Dock photo-step handoff — initial "Link to" carton aspect. */
  defaultCartonAspect?: PhotoAspect | null;
  /** Bump to re-default the target when re-opened from a different handoff. */
  focusRequestId?: number;
  /** Pop back to the Photos Actions list after a successful commit. */
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [target, setTarget] = useState<LinkTarget>(() =>
    resolveDefaultTarget(defaultCartonAspect, defaultTargetLineId),
  );
  const [linkAsAspect, setLinkAsAspect] = useState<PhotoAspect | ''>(KEEP_ASPECT);

  useEffect(() => {
    setTarget(resolveDefaultTarget(defaultCartonAspect, defaultTargetLineId));
    setLinkAsAspect(KEEP_ASPECT);
  }, [defaultCartonAspect, defaultTargetLineId, focusRequestId]);

  const linesQuery = useQuery<SiblingsResponse>({
    queryKey: ['receiving-lines', receivingId, 'photo-link-targets'],
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const photosQuery = useQuery<{ photos: CartonPhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), RECEIVING_PHOTO_LIST_INTENT_CARTON],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: RECEIVING_PHOTO_LIST_INTENT_CARTON,
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const linkToOptions = useMemo(
    () => [
      ...CARTON_LINK_ASPECTS.map((aspect) => ({
        value: encodeTarget({ kind: 'carton', aspect }),
        label: photoAspectLabel(aspect),
        group: 'Carton',
      })),
      ...(linesQuery.data?.receiving_lines ?? []).map((line) => ({
        value: encodeTarget({ kind: 'line', lineId: line.id }),
        label: lineTitle(line),
        meta: lineMeta(line),
        group: 'Items',
      })),
    ],
    [linesQuery.data],
  );

  const aspectOptions = useMemo(
    () => [
      { value: KEEP_ASPECT, label: 'Keep unclassified' },
      ...ASPECTS_BY_STAGE.unbox_item.map((aspect) => ({
        value: aspect,
        label: photoAspectLabel(aspect),
      })),
    ],
    [],
  );

  const candidates = useMemo<PhotoAttachCandidate[]>(
    () =>
      (photosQuery.data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => ({ id: p.id, photoUrl: p.photoUrl })),
    [photosQuery.data],
  );

  const isItemTarget = target.kind === 'line';

  const handFocusBack = useCallback(() => {
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, []);

  const commit = useCallback(
    async (ids: number[]) => {
      if (target.kind === 'line') {
        if (!target.lineId || target.lineId <= 0) {
          toast.error('Pick a PO item to link these photos to');
          throw new Error('no-target');
        }
        try {
          await Promise.all(
            ids.map(async (photoId) => {
              await reassignPhotoToReceivingLine(photoId, target.lineId);
              if (linkAsAspect) {
                const res = await fetch(`/api/photos/${photoId}/aspect`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ aspect: linkAsAspect }),
                });
                if (!res.ok) {
                  const json = (await res.json().catch(() => null)) as {
                    error?: string;
                  } | null;
                  throw new Error(json?.error || `HTTP ${res.status}`);
                }
              }
            }),
          );
          refreshReceivingPhotos(queryClient, receivingId);
          toast.success(
            ids.length === 1
              ? 'Photo linked to PO item'
              : `${ids.length} photos linked to PO item`,
          );
          onClose();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not link these photos.');
          handFocusBack();
          throw err;
        }
        return;
      }

      // Carton aspect target.
      const aspect = target.aspect;
      try {
        await Promise.all(
          ids.map(async (photoId) => {
            if (isDoorClaimAspect(aspect)) {
              const res = await fetch(`/api/photos/${photoId}/claim-stage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: 'arrival_package', aspect }),
              });
              if (!res.ok) {
                const json = (await res.json().catch(() => null)) as {
                  error?: string;
                } | null;
                throw new Error(json?.error || `HTTP ${res.status}`);
              }
            } else {
              const res = await fetch(`/api/photos/${photoId}/aspect`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aspect }),
              });
              if (!res.ok) {
                const json = (await res.json().catch(() => null)) as {
                  error?: string;
                } | null;
                throw new Error(json?.error || `HTTP ${res.status}`);
              }
            }
          }),
        );
        refreshReceivingPhotos(queryClient, receivingId);
        toast.success(
          ids.length === 1
            ? `Photo linked as ${photoAspectLabel(aspect).toLowerCase()}`
            : `${ids.length} photos linked as ${photoAspectLabel(aspect).toLowerCase()}`,
        );
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not link these photos.');
        handFocusBack();
        throw err;
      }
    },
    [target, linkAsAspect, queryClient, receivingId, onClose, handFocusBack],
  );

  const checkNoun =
    target.kind === 'carton'
      ? `as ${photoAspectLabel(target.aspect).toLowerCase()}`
      : 'to PO item';

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="unbox-photo-link-display"
    >
      <div className="grid shrink-0 grid-cols-1 gap-0 border-b border-border-hairline">
        <SearchableSelectField
          appearance="flush"
          label="Link to"
          ariaLabel="Link to carton step or PO item"
          placeholder={linesQuery.isPending ? 'Loading…' : 'Pick a target'}
          searchPlaceholder="Search targets…"
          emptyMessage="No link targets"
          value={encodeTarget(target)}
          options={linkToOptions}
          onChange={(v) => {
            const next = parseTarget(v);
            if (next) {
              setTarget(next);
              if (next.kind === 'carton') setLinkAsAspect(KEEP_ASPECT);
            }
          }}
        />
        {isItemTarget ? (
          <SearchableSelectField
            appearance="flush"
            label="Link as"
            ariaLabel="Link as aspect"
            placeholder="Keep unclassified"
            searchPlaceholder="Aspect…"
            value={linkAsAspect}
            options={aspectOptions}
            onChange={(v) => setLinkAsAspect((v as PhotoAspect | '') ?? KEEP_ASPECT)}
          />
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col" data-photo-link-attach>
        <PhotoAttachGrid
          candidates={candidates}
          isPending={photosQuery.isPending}
          isError={photosQuery.isError}
          onRefresh={() => void photosQuery.refetch()}
          isRefreshing={photosQuery.isFetching && !photosQuery.isPending}
          onCommit={commit}
          countNoun="Link"
          checkLabel="Link"
          checkNoun={checkNoun}
          tileNoun="carton photo"
          emptyText="No carton photos to link yet — upload or send to phone."
        />
      </div>
    </div>
  );
}
