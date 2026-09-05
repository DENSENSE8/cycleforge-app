'use client';

/**
 * Media library verb catalog — the five photo verbs PhotoLibraryPage used to mint.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §5.2 step 3.
 * The page binds this array; it does not declare SelectionAction literals.
 * Claim-modal and label-editor overlay state live here (the receiving catalog
 * owns `claimRow` the same way).
 */

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Link2, Tag, TicketHelp } from '@/components/Icons';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import { dispatchReceivingPhotoChanged } from '@/utils/events';
import { photoShareTitle } from '@/lib/photos/display-names';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { ClaimPhotoInput } from '@/components/support/zendesk/claim/claim-types';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { isLibraryDocument, libraryDocumentId } from '@/components/photos/photo-library-types';
import type { usePhotoShareLinks } from '@/hooks/usePhotoShareLinks';

/** Server cap on ids per share / share-pack request (share-links.ts MAX_PHOTOS_PER_REQUEST). */
const MAX_SHARE_PHOTOS = 200;
const DEFAULT_SHARE_TTL_SECONDS = 24 * 60 * 60;

export interface UseMediaLibrarySelectionArgs {
  scope: PhotoLibrarySourceScope;
  selected: Set<number>;
  canZendesk: boolean;
  canShare: boolean;
  canManagePhotos: boolean;
  shareLinks: ReturnType<typeof usePhotoShareLinks>;
  exitSelectMode: () => void;
}

export interface MediaLibrarySelection {
  bulkActions: SelectionAction<LibraryPhoto>[];
  claimPhotos: ClaimPhotoInput[] | null;
  setClaimPhotos: Dispatch<SetStateAction<ClaimPhotoInput[] | null>>;
  labelEditorPhotos: LibraryPhoto[] | null;
  setLabelEditorPhotos: Dispatch<SetStateAction<LibraryPhoto[] | null>>;
  downloadPhotoFile: (url: string, filename: string) => Promise<void>;
  deletePhotoFromMenu: (id: number) => Promise<void>;
  deleteSelectedPhotos: () => Promise<void>;
}

export function useMediaLibrarySelection({
  scope,
  selected,
  canZendesk,
  canShare,
  canManagePhotos,
  shareLinks,
  exitSelectMode,
}: UseMediaLibrarySelectionArgs): MediaLibrarySelection {
  const queryClient = useQueryClient();
  const [claimPhotos, setClaimPhotos] = useState<ClaimPhotoInput[] | null>(null);
  const [labelEditorPhotos, setLabelEditorPhotos] = useState<LibraryPhoto[] | null>(null);

  const downloadPhotoFile = useCallback(async (url: string, filename: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${filename}`);
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }, []);

  const deletePhotoFromMenu = useCallback(
    async (id: number) => {
      const ok = await requestConfirm({
        description: 'Delete this photo? This cannot be undone.',
        tone: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || 'Delete failed');
        }
        dispatchReceivingPhotoChanged({ action: 'delete', photoIds: [id] });
        await queryClient.invalidateQueries({ queryKey: ['photo-library'] });
        toast.success('Photo deleted');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [queryClient],
  );

  const deleteSelectedPhotos = useCallback(async () => {
    const ids = [...selected].filter((id) => id > 0);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error || `Delete failed for photo ${id}`);
        return id;
      }),
    );
    const deletedIds = results
      .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failures = results.filter((result) => result.status === 'rejected');
    if (deletedIds.length > 0) {
      dispatchReceivingPhotoChanged({ action: 'delete', photoIds: deletedIds });
    }
    await queryClient.invalidateQueries({ queryKey: ['photo-library'] });
    exitSelectMode();
    if (failures.length > 0) {
      toast.error(
        `Deleted ${deletedIds.length} photo${deletedIds.length === 1 ? '' : 's'}; ${failures.length} failed`,
      );
    } else {
      toast.success(`Deleted ${ids.length} photo${ids.length === 1 ? '' : 's'}`);
    }
  }, [exitSelectMode, queryClient, selected]);

  const bulkActions = useMemo<SelectionAction<LibraryPhoto>[]>(() => {
    if (scope === 'outbound') {
      return [
        {
          key: 'download',
          label: 'Download selected',
          icon: <Download className="h-4 w-4" />,
          tone: 'blue' as const,
          primary: true,
          run: async (rows: LibraryPhoto[]) => {
            const docs = rows.filter(isLibraryDocument);
            if (docs.length === 0) return;
            if (docs.length >= 2) {
              const ids = docs.map((row) => libraryDocumentId(row)).join(',');
              const title = docs[0]?.poRef ? `Order-${docs[0].poRef}-documents` : 'outbound-documents';
              window.open(
                `/api/documents/download-zip?ids=${ids}&title=${encodeURIComponent(title)}`,
                '_blank',
              );
              toast.success(`Downloading ${docs.length} documents`);
              return;
            }
            const row = docs[0]!;
            const id = libraryDocumentId(row);
            const ext = row.mimeType === 'image/png' ? 'png' : 'pdf';
            await downloadPhotoFile(
              `/api/documents/${id}/content?download=1`,
              row.filename ?? `document-${id}.${ext}`,
            );
            toast.success('Downloaded 1 document');
          },
        } satisfies SelectionAction<LibraryPhoto>,
      ];
    }

    return [
      ...(canZendesk
        ? [
            {
              key: 'zendesk',
              label: 'Attach to ticket',
              icon: <TicketHelp className="h-4 w-4" />,
              tone: 'blue' as const,
              primary: true,
              run: (rows: LibraryPhoto[]) => {
                setClaimPhotos(
                  rows.map((row) => ({
                    id: row.id,
                    src: row.thumbUrl,
                    displayUrl: row.displayUrl,
                    poRef: row.poRef,
                    caption: row.caption ?? null,
                  })),
                );
              },
            } satisfies SelectionAction<LibraryPhoto>,
          ]
        : []),
      ...(canShare
        ? [
            {
              key: 'copy-links',
              label: 'Copy shareable links',
              icon: <Link2 className="h-4 w-4" />,
              tone: 'blue' as const,
              primary: false,
              maxSelected: MAX_SHARE_PHOTOS,
              disabledReason: `Select ${MAX_SHARE_PHOTOS} or fewer to copy links`,
              run: () => {
                const ids = [...selected];
                if (ids.length > MAX_SHARE_PHOTOS) {
                  toast.error(`Select ${MAX_SHARE_PHOTOS} or fewer to copy links`);
                  return;
                }
                void shareLinks.generateAndCopy(ids, { ttlSeconds: DEFAULT_SHARE_TTL_SECONDS });
              },
            } satisfies SelectionAction<LibraryPhoto>,
            {
              key: 'share-page',
              label: 'Create share page',
              icon: <ExternalLink className="h-4 w-4" />,
              tone: 'blue' as const,
              primary: false,
              maxSelected: MAX_SHARE_PHOTOS,
              disabledReason: `Select ${MAX_SHARE_PHOTOS} or fewer to build a share page`,
              run: (rows: LibraryPhoto[]) => {
                const ids = [...selected];
                if (ids.length > MAX_SHARE_PHOTOS) {
                  toast.error(`Select ${MAX_SHARE_PHOTOS} or fewer to build a share page`);
                  return;
                }
                void shareLinks.createSharePage(ids, {
                  title: photoShareTitle(rows, scope, ids.length),
                });
              },
            } satisfies SelectionAction<LibraryPhoto>,
          ]
        : []),
      {
        key: 'download',
        label: 'Download selected',
        icon: <Download className="h-4 w-4" />,
        tone: 'blue',
        primary: false,
        run: async (rows) => {
          const ids = [...selected];
          if (ids.length === 0) return;
          if (ids.length >= 2) {
            shareLinks.downloadZip(ids, { title: photoShareTitle(rows, scope, ids.length) });
            return;
          }
          const row = rows[0];
          if (!row) return;
          await downloadPhotoFile(`/api/photos/${row.id}/content?download=1`, `photo-${row.id}.jpg`).then(
            () => toast.success('Downloaded 1 photo'),
            () => toast.error('Download failed'),
          );
        },
      },
      ...(canManagePhotos
        ? [
            {
              key: 'labels',
              label: 'Edit labels',
              icon: <Tag className="h-4 w-4" />,
              tone: 'violet' as const,
              primary: false,
              run: (rows: LibraryPhoto[]) => setLabelEditorPhotos(rows),
            } satisfies SelectionAction<LibraryPhoto>,
          ]
        : []),
    ];
  }, [
    canManagePhotos,
    canShare,
    canZendesk,
    downloadPhotoFile,
    scope,
    selected,
    shareLinks,
  ]);

  return {
    bulkActions,
    claimPhotos,
    setClaimPhotos,
    labelEditorPhotos,
    setLabelEditorPhotos,
    downloadPhotoFile,
    deletePhotoFromMenu,
    deleteSelectedPhotos,
  };
}
