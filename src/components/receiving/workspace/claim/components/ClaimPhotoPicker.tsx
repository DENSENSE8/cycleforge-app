import { useCallback, useMemo, useState } from 'react';
import { Camera, Loader2, Pencil, Plus, ZoomIn } from '@/components/Icons';
import { PhotoGridDisplayControls } from '@/components/photos/PhotoGridDisplayControls';
import {
  photoAttachControlGroupClass,
  photoAttachDensityButtonClass,
  photoAttachIconButtonClass,
  photoLibraryControlButtonClass,
  photoLibraryControlGroupClass,
} from '@/components/photos/photo-library-controls';
import { SelectionMark } from '@/components/photos/photo-library-grid/SelectionMark';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { publishReceivingPhotoRequest } from '@/lib/realtime/receiving-photo-request';
import {
  type PhotoGridDensity,
  photoGridLeafClass,
} from '@/lib/photos/photo-grid-density';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { claimPhotoTileProps } from '../claim-helpers';
import type { UseClaimPhotos } from '../hooks/useClaimPhotos';

interface Props {
  photos: UseClaimPhotos;
  /** Carton receiving id — the photo request targets this carton. */
  receivingId: number | null | undefined;
  /**
   * `select` (default) — claim / Move / Send attachment picker (toggle + counts).
   * `view` — Photos gallery: inspect + capture only; no orphan attach chrome.
   */
  mode?: 'select' | 'view';
}

/**
 * Claim-local flush chrome — the shared attach-picker overrides
 * (`photo-library-controls.ts`). Aliased so the existing call sites below read
 * unchanged; the strings live in one place now.
 */
const CLAIM_CONTROL_GROUP = photoAttachControlGroupClass;
const CLAIM_ICON_BUTTON = photoAttachIconButtonClass;
const CLAIM_DENSITY_BUTTON = photoAttachDensityButtonClass;

/**
 * Photo grid for claim / Move / Send selection (`mode="select"`) and the Photos
 * Displays gallery (`mode="view"`). Same flow as the receiving workspace's
 * `ReceivingPhotoButton` for capture: the desktop never opens a camera —
 * clicking the camera/"+" publishes a `receiving_photo_request` to the
 * operator's paired phone (`publishReceivingPhotoRequest`), the phone captures,
 * and the uploads stream back over Ably — `useReceivingPhotosRealtimeRefresh`
 * refetches so the new photos appear here live. In select mode, checked photos
 * attach to the Zendesk ticket / Move / Send payload; all PO photos are saved
 * to local storage regardless. View mode is inspect + capture only — no attach
 * chrome (selection is owned by Move / Send / Claim).
 *
 * Flush claim band: gap-0 header/controls/grid (Media Library keeps its own
 * photoGridLeafClass gaps). Grid density defaults to large (natural-height
 * tiles); the header toggle adjusts for the session only.
 *
 * Evidence preference (Plan 5): line-scoped item shots order FIRST (they are
 * the claim's primary evidence per the identity law); arrival package shots
 * stay selectable below for outer-damage claims. Selection behavior is
 * unchanged — nothing preselected on first open.
 */
export function ClaimPhotoPicker({ photos, receivingId, mode = 'select' }: Props) {
  const selectable = mode === 'select';
  const { photos: list, selectedPhotoIds, togglePhoto, toggleSelectAll, refetch } = photos;
  // Item (line-scoped) evidence first; groups keep the API's stable id order.
  const ordered = useMemo(
    () =>
      [...list].sort(
        (a, b) =>
          (a.receivingLineId != null ? 0 : 1) - (b.receivingLineId != null ? 0 : 1),
      ),
    [list],
  );
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const { getClient } = useAblyClient();
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gridDensity, setGridDensity] = useState<PhotoGridDensity>('lg');

  // Live-refresh the grid when the phone's captures land (phone-bridge upload or
  // station NAS attach), matching this carton.
  useReceivingPhotosRealtimeRefresh(receivingId, staffId, refetch, !!orgId && staffId > 0);

  const g = usePhotoGallery({
    // Same item-first order as the grid so viewer indexes line up.
    photos: ordered.map((p) => p.url),
    launcherTitle: 'Claim photos',
  });

  const handleSendToPhone = useCallback(async () => {
    if (!receivingId) {
      toast.error('No carton to attach photos to');
      return;
    }
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    setSending(true);
    try {
      const client = await getClient();
      await publishReceivingPhotoRequest(client, orgId, staffId, receivingId);
      toast.success('Sent to phone — take photos there; they appear here automatically');
    } catch {
      toast.error('Could not send to phone');
    } finally {
      setSending(false);
    }
  }, [getClient, orgId, staffId, receivingId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const sendToPhoneControl = (
    <HoverTooltip label="Send to phone" asChild>
      <button
        type="button"
        onClick={() => void handleSendToPhone()}
        disabled={sending || !receivingId}
        aria-label="Send to phone"
        className={cn(
          'ds-raw-button relative flex items-center justify-center border border-border-soft bg-surface-card text-text-soft transition-colors',
          CLAIM_ICON_BUTTON,
          'hover:bg-surface-sunken hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Camera className="h-3.5 w-3.5" />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full bg-blue-600 text-white ring-2 ring-border-hairline">
              <Plus className="h-1.5 w-1.5" />
            </span>
          </>
        )}
      </button>
    </HoverTooltip>
  );

  // ── Empty state — no photos yet: flush dashed send-to-phone band ──────────
  if (list.length === 0) {
    return (
      // ds-raw-button: large multi-line dashed send-to-phone band, not a standard action button
      <button
        type="button"
        onClick={() => void handleSendToPhone()}
        disabled={sending || !receivingId}
        className="group flex w-full flex-col items-center justify-center gap-1.5 rounded-none border border-dashed border-border-hairline bg-surface-sunken px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="relative grid h-11 w-11 place-items-center rounded-none border border-border-hairline bg-surface-card text-text-faint transition-colors group-hover:border-blue-300 group-hover:text-blue-600">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {!sending ? (
            <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-none bg-blue-600 text-white ring-2 ring-border-hairline">
              <Plus className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </span>
        <span className="text-role-caption font-semibold text-text-muted group-hover:text-blue-700">
          {sending ? 'Sending…' : 'No photos taken yet'}
        </span>
        <span className="max-w-xs text-role-micro font-medium leading-4 text-text-faint">
          {sending
            ? 'Opening the camera on your phone…'
            : 'Send to phone — they appear here.'}
        </span>
      </button>
    );
  }

  return (
    <div className="min-h-0" data-testid="claim-photo-picker">
      <div className="flex items-center justify-between gap-0 border-b border-border-hairline px-0 py-0">
        <div className="flex min-w-0 items-center gap-0">
          <HoverTooltip label="Expand — view all photos closely" asChild>
            <IconButton
              icon={<ZoomIn className="h-3.5 w-3.5" />}
              ariaLabel="View all photos fullscreen"
              onClick={() => g.openViewer(0)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center !rounded-none text-text-faint hover:bg-surface-sunken hover:text-text-muted"
            />
          </HoverTooltip>
          <p className="truncate text-role-micro uppercase tracking-widest text-text-soft">
            {selectable
              ? `Attach photos ${selectedPhotoIds.size}/${list.length}`
              : `Photos ${list.length}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <PhotoGridDisplayControls
            density={gridDensity}
            onDensityChange={setGridDensity}
            onRefresh={() => void handleRefresh()}
            isRefreshing={refreshing}
            className="gap-0"
            groupClassName={CLAIM_CONTROL_GROUP}
            buttonClassName={CLAIM_DENSITY_BUTTON}
            refreshClassName={CLAIM_ICON_BUTTON}
          />
          {sendToPhoneControl}
          {selectable ? (
            <HoverTooltip
              label={selectedPhotoIds.size === list.length ? 'Clear all' : 'Select all'}
              asChild
            >
              <div className={cn(photoLibraryControlGroupClass, 'shrink-0', CLAIM_CONTROL_GROUP)}>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-label={selectedPhotoIds.size === list.length ? 'Clear all' : 'Select all'}
                  aria-pressed={selectedPhotoIds.size === list.length}
                  className={cn(
                    'ds-raw-button',
                    photoLibraryControlButtonClass(
                      selectedPhotoIds.size === list.length,
                      cn('w-7', CLAIM_DENSITY_BUTTON),
                    ),
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </HoverTooltip>
          ) : null}
        </div>
      </div>

      <div className={cn(photoGridLeafClass(gridDensity), 'gap-0')}>
        {ordered.map((p, index) => {
          const isSel = selectable && selectedPhotoIds.has(p.id);
          const tile = claimPhotoTileProps(p, gridDensity);
          return (
            <div
              key={p.id}
              className={cn(
                'group relative rounded-none border bg-surface-card text-left transition-colors',
                isSel
                  ? 'border-primary ring-2 ring-inset ring-primary'
                  : 'border-border hover:border-border-default',
              )}
            >
              {selectable ? (
                <SelectionMark
                  checked={isSel}
                  active={false}
                  onToggle={() => togglePhoto(p.id)}
                />
              ) : null}
              <HoverTooltip
                label={selectable ? (isSel ? 'Selected' : 'Attach') : 'View'}
                asChild
              >
                {/* ds-raw-button: photo thumbnail image tile (img selection / view target), not a standard action button */}
                <button
                  type="button"
                  onClick={() =>
                    selectable ? togglePhoto(p.id) : g.openViewer(index)
                  }
                  aria-label={
                    selectable ? (isSel ? 'Selected' : 'Attach') : 'View photo'
                  }
                  className={cn(
                    'ds-raw-button block w-full rounded-none text-left',
                    tile.ratio === 'natural' ? '' : 'aspect-square',
                  )}
                >
                  <PhotoThumb src={tile.imageUrl} alt="" ratio={tile.ratio} className="rounded-none" />
                </button>
              </HoverTooltip>
            </div>
          );
        })}
      </div>

      {g.photoItems.length > 0 ? <PhotoViewerPortal g={g} /> : null}
    </div>
  );
}
