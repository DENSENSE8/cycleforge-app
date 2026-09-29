'use client';

/** Unbox Displays → Photos → Actions — keyboard-armed verb list. */

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ColumnsTwo,
  Download,
  Image as ImageIcon,
  Images,
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
import { NAV_KEY_HINT_CLASS, useNavRegion } from '@/lib/keyboard/nav-keys';
import { cn } from '@/utils/_cn';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import {
  fetchReceivingPhotoList,
  RECEIVING_PHOTOS_STALE_MS,
  receivingPhotoListQueryKey,
  refreshReceivingPhotos,
} from '@/lib/queries/receiving-queries';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';
import { resolveReceivingPhotoTarget } from '@/lib/receiving/photo-scope';
import {
  ARMED_CURSOR_CHEVRON_CLASS,
  ARMED_CURSOR_MARKER_PULSE_CLASS,
  ARMED_CURSOR_TRACK_CLASS,
} from '@/components/station/displays/armed-cursor-face';
import { useArmedCursorList } from '@/components/station/displays/useArmedCursorList';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ChevronRight } from '@/components/Icons';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';
import { PHOTO_VERB_NAV_KEY } from './photo-verb-nav-keys';
import type {
  PhotosHeavyVerb,
  PhotosToolStatus,
} from './PhotosActionsToolRuntime';

const PhotosActionsToolRuntime = dynamic(
  () =>
    import('./PhotosActionsToolRuntime').then((m) => m.PhotosActionsToolRuntime),
  { ssr: false, loading: () => null },
);

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
  | 'link'
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

const HEAVY_VERBS = new Set<VerbId>([
  'view',
  'phone',
  'upload',
  'download',
  'details',
]);

function isHeavyVerb(id: VerbId): id is PhotosHeavyVerb {
  return HEAVY_VERBS.has(id);
}

export function PhotosActionsArmedList({
  row,
  staffId,
  onOpenLink,
  onOpenCompare,
  onOpenMove,
  onOpenSend,
}: {
  row: ReceivingLineRow;
  staffId: number;
  onOpenLink: () => void;
  onOpenCompare: () => void;
  onOpenMove: () => void;
  onOpenSend: () => void;
}) {
  const receivingId = row.receiving_id ?? 0;
  const poRef = row.zoho_purchaseorder_number ?? null;
  const poRouteRef =
    row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null;
  const router = useRouter();
  const queryClient = useQueryClient();

  const photoParams = { receivingId, photoIntent: RECEIVING_PHOTO_LIST_INTENT_CARTON };
  const { data } = useQuery<PhotosPayload>({
    queryKey: receivingPhotoListQueryKey(photoParams),
    queryFn: () => fetchReceivingPhotoList(photoParams),
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: RECEIVING_PHOTOS_STALE_MS,
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

  const [toolsMounted, setToolsMounted] = useState(false);
  const [pendingHeavy, setPendingHeavy] = useState<PhotosHeavyVerb | null>(null);
  const [toolStatus, setToolStatus] = useState<PhotosToolStatus | null>(null);

  const hasPhotos = photos.length > 0;
  const canUpload = toolStatus?.canUpload ?? uploadTarget != null;
  const uploading = toolStatus?.uploading ?? false;
  const downloading = toolStatus?.downloading ?? false;
  const phonePending = toolStatus?.phonePending ?? false;
  const canDownload =
    !downloading && hasPhotos && !(toolStatus && !toolStatus.hasGalleryPhotos);

  const verbs = useMemo<VerbDef[]>(
    () => [
      {
        id: 'view',
        label: String(photos.length),
        icon: (p) => <ImageIcon className={p.className} />,
        disabled: !hasPhotos,
      },
      {
        id: 'phone',
        label: phonePending ? 'Sending…' : 'Send to phone',
        icon: (p) => <Smartphone className={p.className} />,
        disabled: phonePending,
      },
      {
        id: 'upload',
        label: uploading ? 'Uploading…' : 'Upload',
        icon: (p) =>
          uploading ? (
            <Loader2 className={cn(p.className, 'animate-spin')} />
          ) : (
            <Upload className={p.className} />
          ),
        disabled: !canUpload || uploading,
      },
      {
        id: 'download',
        label: downloading ? 'Downloading…' : 'Download',
        icon: (p) =>
          downloading ? (
            <Loader2 className={cn(p.className, 'animate-spin')} />
          ) : (
            <Download className={p.className} />
          ),
        disabled: !canDownload,
      },
      {
        id: 'media',
        label: 'Media library',
        icon: (p) => <Images className={p.className} />,
        disabled: !libraryHref,
      },
      {
        id: 'link',
        label: 'Link a photo',
        icon: (p) => <Images className={p.className} />,
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
    [
      canDownload,
      canUpload,
      downloading,
      hasPhotos,
      libraryHref,
      phonePending,
      photos.length,
      uploading,
    ],
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

  const {
    cursorId,
    setCursorId,
    commitArmed,
    handleCommitPointerDown,
    handleCommitClick,
    handleNavKeyDown,
  } = useArmedCursorList({
    orderedIds,
    activeId: null,
    rootRef,
    rowRefs,
    regionActive: rightOwnsKeyboard,
  });

  const rightTargets = useMemo(
    () =>
      orderedIds.map((id) => ({
        id,
        preferredKey: PHOTO_VERB_NAV_KEY[id as VerbId] ?? null,
      })),
    [orderedIds],
  );

  const armHeavyVerb = useCallback((verb: PhotosHeavyVerb) => {
    setToolsMounted(true);
    setPendingHeavy(verb);
  }, []);

  const clearPendingHeavy = useCallback(() => {
    setPendingHeavy(null);
  }, []);

  const runVerb = useCallback(
    (id: string) => {
      const verb = verbById.get(id as VerbId);
      if (!verb || verb.disabled) return;
      switch (verb.id) {
        case 'view':
        case 'phone':
        case 'upload':
        case 'download':
        case 'details':
          if (isHeavyVerb(verb.id)) armHeavyVerb(verb.id);
          break;
        case 'media':
          // Same-tab app nav to /ops/photos — never a browser new-tab display.
          if (libraryHref) router.push(libraryHref);
          break;
        case 'link':
          onOpenLink();
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
      }
    },
    [
      armHeavyVerb,
      libraryHref,
      onOpenLink,
      onOpenCompare,
      onOpenMove,
      onOpenSend,
      router,
      verbById,
    ],
  );

  const { armed: regionArmed, keymap: navKeymap } = useNavRegion({
    id: 'right',
    targets: rightTargets,
    onCommit: (targetId) => commitArmed(targetId, runVerb),
  });

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

  const onPhotoDeleted = useCallback(
    (photoId: number) => {
      refresh(photoId);
    },
    [refresh],
  );
  const onPhotoReassigned = useCallback(() => {
    refresh();
  }, [refresh]);
  const onPhotoUploaded = useCallback(() => {
    refresh();
  }, [refresh]);

  if (!(receivingId > 0)) {
    return (
      <div className="px-3 py-4 text-role-caption text-text-soft">
        Open a carton to triage photos.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="unbox-photos-actions">
      {toolsMounted ? (
        <PhotosActionsToolRuntime
          receivingId={receivingId}
          staffId={staffId}
          photos={photos}
          uploadTarget={uploadTarget}
          libraryHref={libraryHref}
          poRouteRef={poRouteRef}
          onOpenMove={onOpenMove}
          onOpenSend={onOpenSend}
          onPhotoDeleted={onPhotoDeleted}
          onPhotoReassigned={onPhotoReassigned}
          onPhotoUploaded={onPhotoUploaded}
          pendingVerb={pendingHeavy}
          onPendingConsumed={clearPendingHeavy}
          onStatusChange={setToolStatus}
        />
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
            const navLetter = regionArmed ? navKeymap.get(verb.id) : undefined;
            return (
              <li key={verb.id}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rowRefs.current.set(verb.id, el);
                    else rowRefs.current.delete(verb.id);
                  }}
                  disabled={verb.disabled}
                  onPointerDown={(e) => {
                    if (verb.disabled) return;
                    handleCommitPointerDown(e, verb.id, runVerb);
                  }}
                  onClick={() => {
                    if (verb.disabled) return;
                    handleCommitClick(verb.id, runVerb);
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
                  aria-keyshortcuts={navLetter ?? undefined}
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
                  {navLetter ? (
                    <span className={NAV_KEY_HINT_CLASS} aria-hidden>
                      {navLetter}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
