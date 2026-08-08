'use client';

/**
 * Unbox Displays → Photos → Actions — keyboard-armed verb list.
 *
 * Replaces the identity hover PhotoLauncher toolbar (`CopyChipHoverMenuPanel`)
 * with Station Action-plane rows: ↑↓ / Home / End via {@link useArmedCursorList};
 * Enter / Space / click runs the verb in the same turn (no hit-marker DOM
 * withhold). Esc stays on the Displays push stack. Mounts gallery viewer +
 * upload overlay owned by this leaf.
 *
 * Verbs: View · Phone · Upload · Download · Media · Move · Send · Compare ·
 * Details. Drill altitude (tools → evidence): Move · Send · Compare open
 * URL-backed leaf bodies (no nested TabDisplay). Default leaf = this list.
 */

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ColumnsTwo,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Loader2,
  Send,
  Smartphone,
  Upload,
} from '@/components/Icons';
import { useReducedMotion } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { PhotoUploadOverlay } from '@/components/shipped/photo-gallery/PhotoUploadOverlay';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import { receivingPhotosQueryKey, refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { resolveReceivingPhotoTarget } from '@/lib/receiving/photo-scope';
import {
  getReceivingPhotoRequestChannelName,
  publishReceivingPhotoRequest,
} from '@/lib/realtime/receiving-photo-request';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { SendToDeviceStatus } from '@/components/station/send-to-device/SendToDeviceStatus';
import { toast } from '@/lib/toast';
import {
  ARMED_CURSOR_CHEVRON_CLASS,
  ARMED_CURSOR_MARKER_PULSE_CLASS,
  ARMED_CURSOR_TRACK_CLASS,
} from '@/components/station/displays/armed-cursor-face';
import { useArmedCursorList } from '@/components/station/displays/useArmedCursorList';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ChevronRight } from '@/components/Icons';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';

interface PhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

interface PhotosPayload {
  photos: PhotoRow[];
}

type VerbId =
  | 'view'
  | 'phone'
  | 'upload'
  | 'download'
  | 'media'
  | 'compare'
  | 'move'
  | 'send'
  | 'details';

type VerbDef = {
  id: VerbId;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  disabled?: boolean;
};

export function PhotosActionsArmedList({
  row,
  staffId,
  onOpenCompare,
  onOpenMove,
  onOpenSend,
}: {
  row: ReceivingLineRow;
  staffId: number;
  onOpenCompare: () => void;
  onOpenMove: () => void;
  onOpenSend: () => void;
}) {
  const receivingId = row.receiving_id ?? 0;
  const poRef = row.zoho_purchaseorder_number ?? null;
  const poRouteRef =
    row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { getClient } = useAblyClient();

  const queryKey = useMemo(
    () =>
      [
        ...receivingPhotosQueryKey(receivingId),
        RECEIVING_PHOTO_LIST_INTENT_CARTON,
        'carton',
        'any',
      ] as const,
    [receivingId],
  );

  const { data } = useQuery<PhotosPayload>({
    queryKey,
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

  const refresh = useCallback(
    (deletedPhotoId?: number) => {
      refreshReceivingPhotos(queryClient, receivingId, deletedPhotoId);
    },
    [queryClient, receivingId],
  );

  const photos = useMemo(
    () =>
      (data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => receivingPhotoToGalleryInput(p, { poRef })),
    [data, poRef],
  );

  const uploadTarget = useMemo(() => {
    if (!(receivingId > 0)) return undefined;
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId: null,
        stage: 'unbox_carton',
        aspect: null,
      });
    } catch {
      return undefined;
    }
  }, [receivingId]);

  const libraryHref = buildUnboxingCartonLibraryHref({
    receivingId,
    poRef,
  });

  const g = usePhotoGallery({
    photos,
    orderId: `RCV-${receivingId}`,
    receivingId,
    uploadTarget,
    allowReassign: true,
    launcherLayout: 'toolbar',
    toolbarShowLabel: false,
    compact: true,
    libraryHref,
    onPhotoDeleted: (photoId) => refresh(photoId),
    onPhotoReassigned: () => refresh(),
    onPhotoUploaded: () => refresh(),
    onOpenMovePhotosExternal: onOpenMove,
    onSendToTicket: onOpenSend,
  });

  const routeRef = String(poRouteRef ?? '').trim();
  const phone = useSendToDevice('receiving_photo');
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffId);

  const handleRequestOnPhone = useCallback(async () => {
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    await phone.send({
      channelName: ackChannelName,
      publish: async (requestId) => {
        const client = await getClient();
        await publishReceivingPhotoRequest(client, orgId, staffId, receivingId, {
          stage: 'unbox_carton',
          receivingLineId: null,
          poRef: routeRef || null,
          requestId,
        });
      },
    });
  }, [ackChannelName, getClient, orgId, phone, receivingId, routeRef, staffId]);

  const hasPhotos = g.photoItems.length > 0;
  const canDownload =
    !g.downloading && hasPhotos && !g.photoItems.every((p) => p.status === 'error');

  const verbs = useMemo<VerbDef[]>(
    () => [
      {
        id: 'view',
        label: 'View',
        icon: (p) => <ImageIcon className={p.className} />,
        disabled: !hasPhotos,
      },
      {
        id: 'phone',
        label: phone.pending ? 'Sending…' : 'Send to phone',
        icon: (p) => <Smartphone className={p.className} />,
        disabled: phone.pending,
      },
      {
        id: 'upload',
        label: g.uploading ? 'Uploading…' : 'Upload',
        icon: (p) =>
          g.uploading ? (
            <Loader2 className={cn(p.className, 'animate-spin')} />
          ) : (
            <Upload className={p.className} />
          ),
        disabled: !g.canUpload || g.uploading,
      },
      {
        id: 'download',
        label: g.downloading ? 'Downloading…' : 'Download',
        icon: (p) =>
          g.downloading ? (
            <Loader2 className={cn(p.className, 'animate-spin')} />
          ) : (
            <Download className={p.className} />
          ),
        disabled: !canDownload,
      },
      {
        id: 'media',
        label: 'Media library',
        icon: (p) => <ExternalLink className={p.className} />,
        disabled: !libraryHref,
      },
      {
        id: 'move',
        label: 'Move',
        icon: (p) => <ArrowLeftRight className={p.className} />,
        disabled: !hasPhotos,
      },
      {
        id: 'send',
        label: 'Send to ticket',
        icon: (p) => <Send className={p.className} />,
      },
      {
        id: 'compare',
        label: 'Compare',
        icon: (p) => <ColumnsTwo className={p.className} />,
      },
      {
        id: 'details',
        label: 'Details',
        icon: (p) => <Info className={p.className} />,
        disabled: !hasPhotos,
      },
    ],
    [canDownload, g.canUpload, g.downloading, g.uploading, hasPhotos, libraryHref, phone.pending],
  );

  const orderedIds = useMemo(() => verbs.map((v) => v.id), [verbs]);
  const verbById = useMemo(() => new Map(verbs.map((v) => [v.id, v])), [verbs]);

  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const listId = useId();

  const reduce = useReducedMotion();
  const markerPulse = reduce ? undefined : ARMED_CURSOR_MARKER_PULSE_CLASS;
  const { isOwner: isKeyboardRegion } = useKeyboardRegionOwner();
  const rightOwnsKeyboard = isKeyboardRegion('right');

  const { cursorId, setCursorId, commitArmed, handleNavKeyDown } =
    useArmedCursorList({
      orderedIds,
      activeId: null,
      rootRef,
      rowRefs,
      regionActive: rightOwnsKeyboard,
    });

  const runVerb = useCallback(
    (id: string) => {
      const verb = verbById.get(id as VerbId);
      if (!verb || verb.disabled) return;
      switch (verb.id) {
        case 'view':
          g.openViewer(0);
          break;
        case 'phone':
          void handleRequestOnPhone();
          break;
        case 'upload':
          g.openUploadOverlay();
          break;
        case 'download':
          void g.handleDownloadAll();
          break;
        case 'media':
          if (libraryHref) window.open(libraryHref, '_blank', 'noopener,noreferrer');
          break;
        case 'compare':
          onOpenCompare();
          break;
        case 'move':
          onOpenMove();
          break;
        case 'send':
          onOpenSend();
          break;
        case 'details':
          g.openViewer(0, { details: true });
          break;
      }
    },
    [
      g,
      handleRequestOnPhone,
      libraryHref,
      onOpenCompare,
      onOpenMove,
      onOpenSend,
      verbById,
    ],
  );

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const verb = verbById.get(id as VerbId);
        if (verb?.disabled) return;
        commitArmed(id, runVerb);
        return;
      }
      handleNavKeyDown(e, id);
    },
    [commitArmed, handleNavKeyDown, runVerb, verbById],
  );

  if (!(receivingId > 0)) {
    return (
      <div className="px-3 py-4 text-role-caption text-text-soft">
        Open a carton to triage photos.
      </div>
    );
  }

  const uploadOverlay = g.canUpload ? (
    <PhotoUploadOverlay
      open={g.uploadOverlayOpen}
      onClose={g.closeUploadOverlay}
      onFiles={g.handleUploadFiles}
      uploading={g.uploading}
      uploadError={g.uploadError}
      onClearError={g.clearUploadError}
      secondaryAction={{
        label: 'Send to phone',
        onClick: () => void handleRequestOnPhone(),
        loading: phone.pending,
        disabled: phone.pending,
      }}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="unbox-photos-actions">
      {phone.state !== 'idle' ? (
        <div className="shrink-0 border-b border-border-hairline px-3 py-2">
          <SendToDeviceStatus state={phone.state} onRetry={phone.retry} />
        </div>
      ) : null}
      <div
        ref={rootRef}
        data-station-action-dossier=""
        data-testid="unbox-photos-actions-list"
        {...{ [LIST_KEY_OWNER_ATTR]: '' }}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto outline-none"
      >
        <ul
          aria-labelledby={listId}
          className="divide-y divide-border-hairline border-y border-border-hairline"
        >
          <li className="sr-only">
            <h3 id={listId}>Photo actions</h3>
          </li>
          {verbs.map((verb) => {
            const isArmed = cursorId != null && cursorId === verb.id;
            const Icon = verb.icon;
            return (
              <li key={verb.id}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rowRefs.current.set(verb.id, el);
                    else rowRefs.current.delete(verb.id);
                  }}
                  disabled={verb.disabled}
                  onClick={() => {
                    if (verb.disabled) return;
                    commitArmed(verb.id, runVerb);
                  }}
                  onFocus={() => setCursorId(verb.id)}
                  onKeyDown={(e) => onRowKeyDown(e, verb.id)}
                  className={cn(
                    'group/row ds-raw-button relative flex w-full items-center gap-2 py-3 pl-3 pr-3 text-left',
                    'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40',
                    // Armed face = `>` + bottom track. No focusRing twin while
                    // armed (blue ring-offset bands). ds-allow-focus
                    isArmed
                      ? 'outline-none'
                      : focusRing('control', 'accent'),
                    cornerClass('flush'),
                  )}
                  data-testid={`unbox-photos-action-${verb.id}`}
                  data-active={isArmed ? 'true' : undefined}
                  aria-current={isArmed ? 'true' : undefined}
                >
                  {isArmed ? (
                    <span
                      className={cn(ARMED_CURSOR_TRACK_CLASS, markerPulse)}
                      aria-hidden
                      data-photos-armed-track=""
                    />
                  ) : null}
                  <span className="relative z-raised flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    {isArmed ? (
                      <span data-photos-armed-chevron="" aria-hidden>
                        <ChevronRight
                          className={cn(
                            ARMED_CURSOR_CHEVRON_CLASS,
                            markerPulse,
                          )}
                        />
                      </span>
                    ) : null}
                    <Icon className="h-4 w-4 shrink-0 text-accent-bg" />
                    <span className="truncate text-role-caption font-semibold text-text-default">
                      {verb.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {uploadOverlay}
      {g.photoItems.length > 0 ? <PhotoViewerPortal g={g} /> : null}
    </div>
  );
}
