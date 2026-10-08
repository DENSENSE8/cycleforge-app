'use client';

/**
 * The Media Library's ONE verb set. The bottom {@link PhotoSelectionDock} and
 * the right-click {@link PhotoContextMenu} both read it, so a verb exists in
 * one place and the two surfaces can never offer different actions.
 *
 * A verb acts on a {@link PhotoVerbTarget}: the selection, or the one photo a
 * right-click landed on outside the selection. `ids` is the true target (it can
 * exceed the loaded `rows` under "select all matching"); row-bound verbs (open,
 * tag, attach) only fire when every target id is loaded.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  Link2,
  Maximize2,
  Tag,
  TicketHelp,
} from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoShareLinks } from '@/hooks/usePhotoShareLinks';
import { photoShareTitle } from '@/lib/photos/display-names';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { toast } from '@/lib/toast';
import { dispatchReceivingPhotoChanged } from '@/utils/events';
import { isLibraryDocument, libraryDocumentId, type LibraryPhoto } from './photo-library-types';

const DEFAULT_SHARE_TTL_SECONDS = 24 * 60 * 60;

/** Server cap on ids per share / share-pack request (share-links.ts MAX_PHOTOS_PER_REQUEST). */
const MAX_SHARE_PHOTOS = 200;

/** Menu-row glyph size (dock Actions menu and right-click menu). */
const VERB_ICON = 'h-4 w-4';

export interface PhotoVerbTarget {
  /** Every photo the verb acts on. */
  ids: number[];
  /** The loaded rows among `ids`. */
  rows: LibraryPhoto[];
}

export type PhotoVerb = SelectionAction<LibraryPhoto>;

async function downloadFile(url: string, filename: string): Promise<void> {
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
}

export function usePhotoVerbs({
  scope,
  onOpen,
  onTag,
  onAttachToTicket,
}: {
  scope: PhotoLibrarySourceScope;
  /** Show these photos in the fullscreen viewer. */
  onOpen: (rows: LibraryPhoto[]) => void;
  /** Open the label editor over these photos. */
  onTag: (rows: LibraryPhoto[]) => void;
  /** Open the ticket modal (update an existing ticket or file a new one) with these photos. */
  onAttachToTicket: (rows: LibraryPhoto[]) => void;
}) {
  const queryClient = useQueryClient();
  const { generateAndCopy, createSharePage, downloadZip, ready: shareReady, dismissReady } = usePhotoShareLinks();
  const { has } = useAuth();
  const canZendesk = has('integrations.zendesk');
  const canManagePhotos = has('photos.manage');
  const canShare = has('photos.share');

  /** True when the target is outbound documents (labels, slips): they only download. */
  const isDocumentTarget = useCallback(
    (target: PhotoVerbTarget) => target.rows.length > 0 && target.rows.every(isLibraryDocument),
    [],
  );

  const verbsFor = useCallback(
    (target: PhotoVerbTarget): PhotoVerb[] => {
      const { ids } = target;
      const loaded = target.rows.length === ids.length;
      const unloadedReason = `Scroll to load all ${ids.length} selected photos`;
      const shareCapReason = `Select ${MAX_SHARE_PHOTOS} or fewer`;

      if (isDocumentTarget(target)) {
        return [
          {
            key: 'download',
            label: target.rows.length === 1 ? 'Download' : `Download ${target.rows.length}`,
            icon: <Download className={VERB_ICON} />,
            run: async () => {
              const docs = target.rows;
              if (docs.length >= 2) {
                const docIds = docs.map((row) => libraryDocumentId(row)).join(',');
                const title = docs[0]?.poRef ? `Order-${docs[0].poRef}-documents` : 'outbound-documents';
                window.open(`/api/documents/download-zip?ids=${docIds}&title=${encodeURIComponent(title)}`, '_blank');
                toast.success(`Downloading ${docs.length} documents`);
                return;
              }
              const row = docs[0]!;
              const id = libraryDocumentId(row);
              const ext = row.mimeType === 'image/png' ? 'png' : 'pdf';
              await downloadFile(`/api/documents/${id}/content?download=1`, row.filename ?? `document-${id}.${ext}`).then(
                () => toast.success('Downloaded 1 document'),
                () => toast.error('Download failed'),
              );
            },
          },
        ];
      }

      return [
        {
          // The fullscreen viewer over exactly the target, at full resolution.
          key: 'open',
          label: 'Open',
          icon: <Maximize2 className={VERB_ICON} />,
          enabled: () => loaded,
          disabledReason: unloadedReason,
          run: () => onOpen(target.rows),
        },
        {
          // One file → direct download; 2+ → one ZIP (GET /api/photos/download-zip).
          key: 'download',
          label: 'Download',
          icon: <Download className={VERB_ICON} />,
          run: async () => {
            if (ids.length >= 2) {
              downloadZip(ids, { title: photoShareTitle(target.rows, scope, ids.length) });
              return;
            }
            const id = ids[0];
            if (id == null) return;
            await downloadFile(`/api/photos/${id}/content?download=1`, `photo-${id}.jpg`).then(
              () => toast.success('Downloaded 1 photo'),
              () => toast.error('Download failed'),
            );
          },
        },
        ...(canShare
          ? [
              {
                // Ephemeral signed links as one paste-ready block.
                key: 'copy-link',
                label: ids.length === 1 ? 'Copy link' : 'Copy links',
                icon: <Link2 className={VERB_ICON} />,
                enabled: () => ids.length <= MAX_SHARE_PHOTOS,
                disabledReason: shareCapReason,
                run: async () => {
                  await generateAndCopy(ids, { ttlSeconds: DEFAULT_SHARE_TTL_SECONDS });
                },
              } satisfies PhotoVerb,
              {
                // One durable public /share/photos/:token page for the set.
                key: 'share-page',
                label: 'Create share page',
                icon: <ExternalLink className={VERB_ICON} />,
                enabled: () => ids.length <= MAX_SHARE_PHOTOS,
                disabledReason: shareCapReason,
                run: async () => {
                  await createSharePage(ids, {
                    title: photoShareTitle(target.rows, scope, ids.length),
                  });
                },
              } satisfies PhotoVerb,
            ]
          : []),
        ...(canZendesk
          ? [
              {
                key: 'attach-ticket',
                label: 'Attach to ticket',
                icon: <TicketHelp className={VERB_ICON} />,
                enabled: () => loaded,
                disabledReason: unloadedReason,
                run: () => onAttachToTicket(target.rows),
              } satisfies PhotoVerb,
            ]
          : []),
        ...(canManagePhotos
          ? [
              {
                // The label editor over the target (bulk add/remove diff).
                key: 'tag',
                label: 'Tag',
                icon: <Tag className={VERB_ICON} />,
                enabled: () => loaded,
                disabledReason: unloadedReason,
                run: () => onTag(target.rows),
              } satisfies PhotoVerb,
            ]
          : []),
      ];
    },
    [
      canManagePhotos,
      canShare,
      canZendesk,
      isDocumentTarget,
      onAttachToTicket,
      onOpen,
      onTag,
      scope,
      createSharePage,
      downloadZip,
      generateAndCopy,
    ],
  );

  /** Whether the target can be deleted at all (documents cannot). */
  const canDelete = useCallback(
    (target: PhotoVerbTarget) => !isDocumentTarget(target) && target.ids.some((id) => id > 0),
    [isDocumentTarget],
  );

  /** Delete every photo in `ids` — the caller has already confirmed. */
  const deletePhotos = useCallback(
    async (ids: number[]) => {
      const photoIds = ids.filter((id) => id > 0);
      if (photoIds.length === 0) return;
      const results = await Promise.allSettled(
        photoIds.map(async (id) => {
          const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) throw new Error(data?.error || `Delete failed for photo ${id}`);
          return id;
        }),
      );
      const deletedIds = results
        .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failures = results.length - deletedIds.length;
      if (deletedIds.length > 0) {
        dispatchReceivingPhotoChanged({ action: 'delete', photoIds: deletedIds });
      }
      await queryClient.invalidateQueries({ queryKey: ['photo-library'] });
      const noun = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
      if (failures > 0) toast.error(`Deleted ${noun(deletedIds.length)}; ${failures} failed`);
      else toast.success(`Deleted ${noun(deletedIds.length)}`);
    },
    [queryClient],
  );

  return {
    verbsFor,
    canDelete,
    deletePhotos,
    /** The last copy-link / share-page result, for {@link PhotoShareSheet}. */
    shareReady,
    dismissShareReady: dismissReady,
  };
}
