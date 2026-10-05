'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Link2, Loader2, Tag, TicketHelp, Trash2 } from '@/components/Icons';
import { usePhotoInspectorParam } from '@/hooks/usePhotoInspectorParam';
import { usePhotoLibrary, photoLibraryFilterParams } from '@/hooks/usePhotoLibrary';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { usePhotoSelection } from '@/hooks/usePhotoSelection';
import { usePhotoShareLinks } from '@/hooks/usePhotoShareLinks';
import {
  resolvePhotoLibraryFolderLeafLabel,
} from '@/lib/photos/library-context-label';
import { photoShareTitle } from '@/lib/photos/display-names';
import { buildPhotoDateTree } from '@/lib/photos/date-tree';
import {
  PHOTO_LIBRARY_HEADER_DISPLAY_MODES,
  sourceScopeFromFilters,
} from '@/lib/photos/library-filter-state';
import { parsePhotoLibraryTicketSearch } from '@/lib/photos/ticket-search';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { useMediaLibraryShortcuts } from '@/hooks/useMediaLibraryShortcuts';
import { usePhotoGridDensity } from '@/hooks/usePhotoGridDensity';
import { getCurrentPSTDateKey } from '@/utils/date';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import { dispatchReceivingPhotoChanged } from '@/utils/events';
import { usePackerPhotosRealtimeRefresh } from '@/hooks/usePackerPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { ZendeskClaimModal } from '@/components/support/zendesk/claim/ZendeskClaimModal';
import type { ClaimPhotoInput } from '@/components/support/zendesk/claim/claim-types';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { DashboardScrollShell, useDashboardScrollParent } from '@/components/dashboard/DashboardScrollShell';
import { Panel } from '@/design-system/primitives';
import { PhotoContextMenu, type PhotoContextMenuItem } from './PhotoContextMenu';
import { PhotoDateBreadcrumb } from './PhotoDateBreadcrumb';
import { PhotoLibraryFindRow } from './PhotoLibraryFindRow';
import {
  PhotoLibraryDeskActions,
  type MediaUploadTarget,
} from './PhotoLibraryDeskActions';
import { PhotoLibraryGrid } from './PhotoLibraryGrid';
import { PhotoBatchInspectorPanel } from './photo-inspector/PhotoBatchInspectorPanel';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { PhotoLibraryTicketNasBackup } from './PhotoLibraryTicketNasBackup';
import { PhotoLabelEditor } from './PhotoLabelEditor';
import { PhotoInspectorPanel } from './photo-inspector/PhotoInspectorPanel';
import { photoLibraryShowsGridControls } from '@/lib/photos/photo-grid-density';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import type { PhotoLinkRole } from '@/lib/photos/types';

/**
 * The one phrase for "how many photos are in view" on the end-of-stream line.
 * Footer counts live on {@link TableStatusBar} — do not duplicate them here.
 */
function photoCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

const DEFAULT_SHARE_TTL_SECONDS = 24 * 60 * 60;

/** Server cap on ids per share / share-pack request (share-links.ts MAX_PHOTOS_PER_REQUEST). */
const MAX_SHARE_PHOTOS = 200;

// `LibraryPhoto` moved to ./photo-library-types so the grid + hook can share it
// without importing this page (cycle). Re-exported here for compatibility.
export type { LibraryPhoto } from './photo-library-types';
import type { LibraryPhoto } from './photo-library-types';
import { isLibraryDocument, libraryDocumentId } from './photo-library-types';

/** Right pane: workbench chrome + the flat photo stream. Filters live in the left sidebar (`NAV_PAGE_DECLS['ops-photos']`). */
export function PhotoLibraryPage() {
  const { filters, display, setView, patch, applyView } = usePhotoLibraryUrlState();
  const { view } = display;

  // Always fetch photos. The folder drill used to gate this query behind
  // `view !== 'folders' || isLeaf`, which is why a bare load painted year tiles
  // and fetched nothing; every view now renders photos, so there is no gate.
  const { query, photos, isSettled } = usePhotoLibrary(filters);
  const { density: gridDensity, setDensity: setGridDensity } = usePhotoGridDensity();
  const queryClient = useQueryClient();

  // A finder search OR a carton deep-link (receivingId) resolves to one PO when every loaded photo shares it.
  const resolvedPoRef = useMemo<string | undefined>(() => {
    if (filters.poRef) return filters.poRef;
    const canInfer = Boolean(filters.poFinder) || Boolean(filters.receivingId);
    if (!canInfer || photos.length === 0) return undefined;
    const refs = new Set(photos.map((p) => p.poRef ?? '').filter(Boolean));
    return refs.size === 1 ? [...refs][0] : undefined;
  }, [filters.poRef, filters.poFinder, filters.receivingId, photos]);

  const scope = sourceScopeFromFilters(filters);
  const searchQuery = filters.q ?? '';
  const visiblePhotos = photos;

  const resolvedTicketId = useMemo<string | undefined>(() => {
    if (filters.ticketId?.trim()) return filters.ticketId.trim().replace(/^#/, '');
    // A `?poFinder=` DEEP LINK typed as a ticket # (claims folder links) — carry
    // it for leaf chrome + NAS archive even before photos resolve. Nothing on
    // this page writes that param any more; the find-bar is local state.
    if (scope === 'claims') {
      const ticket = parsePhotoLibraryTicketSearch(filters.poFinder);
      if (ticket) return ticket;
    }
    if (scope !== 'claims' || !filters.poFinder || photos.length === 0) return undefined;
    const tickets = new Set(
      photos.map((p) => p.ticketId).filter((id): id is number => id != null && id > 0),
    );
    return tickets.size === 1 ? String([...tickets][0]) : undefined;
  }, [filters.ticketId, filters.poFinder, photos, scope]);
  // The PST capture-day span of the photos in view. Under a PO leaf this lets the
  // breadcrumb descend to the actual day(s) instead of stopping at the week — so a
  // single-day PO reads `… › Week 27 › Jun 30 › PO 14-…`. Tree order is newest-first.
  const photoDaySpan = useMemo<{ from: string; to: string } | null>(() => {
    const days: string[] = [];
    for (const yr of buildPhotoDateTree(photos))
      for (const mo of yr.months) for (const d of mo.days) days.push(d.ymd);
    return days.length ? { from: days[days.length - 1], to: days[0] } : null;
  }, [photos]);

  // Filters with the resolved PO + the photos' real day span folded in, for the
  // display chrome that reads `poRef`/dates (breadcrumbs, folder header, context
  // label). Identity-stable when there's no entity context to enrich.
  const displayFilters = useMemo(() => {
    let next = filters;
    if (resolvedPoRef && !filters.poRef) {
      next = { ...next, poRef: resolvedPoRef };
    }
    if (resolvedTicketId && !filters.ticketId) {
      next = { ...next, ticketId: resolvedTicketId };
    }
    const hasEntityLeaf = Boolean(
      resolvedPoRef ||
        filters.poRef ||
        resolvedTicketId ||
        filters.ticketId ||
        filters.receivingId,
    );
    if (!hasEntityLeaf) {
      return next;
    }
    return photoDaySpan
      ? { ...next, dateFrom: photoDaySpan.from, dateTo: photoDaySpan.to }
      : next;
  }, [filters, resolvedPoRef, resolvedTicketId, photoDaySpan]);
  const { has } = useAuth();
  const canZendesk = has('integrations.zendesk');
  const canManagePhotos = has('photos.manage');
  const canShare = has('photos.share');

  // Photos staged for the "Create support ticket" modal (null = closed).
  const [claimPhotos, setClaimPhotos] = useState<ClaimPhotoInput[] | null>(null);
  // Photos staged for the label editor (null = closed; 1 = single PUT, N = bulk).
  const [labelEditorPhotos, setLabelEditorPhotos] = useState<LibraryPhoto[] | null>(null);
  // Right-click context menu target (null = closed).
  const [ctxMenu, setCtxMenu] = useState<{ photo: LibraryPhoto; x: number; y: number } | null>(null);

  // Live-refresh when a packer's phone commits a GCS upload (station channel),
  // mirroring how receiving photos already propagate into the library.
  const refreshLibraryOnPackerPhoto = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
    void queryClient.invalidateQueries({ queryKey: ['photo-library-folders'] });
  }, [queryClient]);
  usePackerPhotosRealtimeRefresh(null, refreshLibraryOnPackerPhoto);

  // `selectMode` is the explicit pencil toggle; selection can also start via a
  // modifier-click / hover checkmark even when it's off (Google-Photos model).
  const [selectMode, setSelectMode] = useState(false);
  // Selection persists across the client pages (see usePhotoSelection): a bulk
  // action carries the whole set, not just the visible page.
  const { selected, selectedPhotos, isActive, selectTile, selectAll, selectIds, toggleGroupSelection, clear } =
    usePhotoSelection(photos);
  const selectionActive = selectMode || isActive;

  const shareLinks = usePhotoShareLinks();

  // ── The desk inspector ────────────────────────────────────────────────────
  // fullscreen viewer (operator ruling 2026-08-09).
  const { photoId: openPhotoId, setPhotoId } = usePhotoInspectorParam();
  /** `?photoId=` as it stood on first paint — the reload / deep-link seed. */
  const [seedPhotoId] = useState(() => openPhotoId);
  const [inspectorHydrated, setInspectorHydrated] = useState(() => openPhotoId === null);

  const inspectorPhoto = useMemo(() => {
    if (selected.size !== 1) return null;
    // Resolved against the LOADED stream on purpose: "select all matching" can
    // hold ids that were never fetched, and a record we do not have is one we
    // cannot inspect. That case falls through to the batch rail instead.
    return photos.find((p) => selected.has(p.id)) ?? null;
  }, [photos, selected]);
  const inspectorPhotoId = inspectorPhoto ? String(inspectorPhoto.id) : null;

  // Seed the selection from the URL exactly ONCE, so a reload lands on the same photo.
  useEffect(() => {
    if (inspectorHydrated || !seedPhotoId || !isSettled) return;
    const target = Number(seedPhotoId);
    if (Number.isFinite(target) && photos.some((p) => p.id === target)) {
      selectIds([target]);
    }
    setInspectorHydrated(true);
  }, [inspectorHydrated, seedPhotoId, isSettled, photos, selectIds]);

  // Selection → URL. Gated on hydration so the seed is never clobbered by the
  // empty selection that exists for the frame before it lands.
  useEffect(() => {
    if (!inspectorHydrated || openPhotoId === inspectorPhotoId) return;
    setPhotoId(inspectorPhotoId);
  }, [inspectorHydrated, inspectorPhotoId, openPhotoId, setPhotoId]);

  /** The batch rail and the record inspector are ONE right-edge slot at two cardinalities, so they are mutually exclusive by construction… */
  const showBatchRail = selectionActive && inspectorPhoto === null;

  // Trailing breadcrumb crumb naming the entity in view (PO / ticket / carton).
  const leafPoRef = resolvedPoRef ?? filters.poRef;
  const leafTicketId = resolvedTicketId ?? filters.ticketId;
  const leafReceivingId = filters.receivingId;
  const folderLeafLabel = useMemo(() => {
    if (!leafPoRef && !leafTicketId && !leafReceivingId) return null;
    return resolvePhotoLibraryFolderLeafLabel({
      scope,
      poRef: leafPoRef,
      ticketId: leafTicketId,
      receivingId: leafReceivingId,
    });
  }, [scope, leafPoRef, leafTicketId, leafReceivingId]);
  const showGridControls = photoLibraryShowsGridControls(view);

  const refreshLibrary = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
  }, [queryClient]);

  const isRefreshing = query.isFetching && !query.isLoading;

  // Date breadcrumb quick-jump defaults: today + the most recent
  // capture day across the loaded photos — both keyed off `created_at` (PST),
  // never the most-recent PO or photo type.
  const today = useMemo(() => getCurrentPSTDateKey(), []);

  // A view switch is presentation only — it never touches the filter set.
  const handleViewChange = setView;
  const mostRecentDay = useMemo(
    () => buildPhotoDateTree(photos)[0]?.months[0]?.days[0]?.ymd,
    [photos],
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    clear();
  }, [clear]);

  // Reset selection when the BROWSE SCOPE changes — a folder drill, breadcrumb jump, source-scope switch, or search.
  const scopeKey = useMemo(() => JSON.stringify(filters), [filters]);
  const prevScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKey.current === scopeKey) return;
    prevScopeKey.current = scopeKey;
    exitSelectMode();
  }, [scopeKey, exitSelectMode]);

  /** Every id the find-bar is currently painting — the select-all target. */
  const visibleIds = useMemo(() => visiblePhotos.map((p) => p.id), [visiblePhotos]);

  // "Select all matching filters" — fetch every matching photo id (capped) for the current filter set and select them, so a bulk…
  const selectAllMatching = useCallback(async () => {
    if (searchQuery.trim()) {
      selectIds(visibleIds);
      setSelectMode(true);
      toast.success(`Selected ${visibleIds.length} matching “${searchQuery.trim()}”`);
      return;
    }
    try {
      const qs = photoLibraryFilterParams(filters).toString();
      const res = await fetch(`/api/photos/library/ids?${qs}`);
      if (!res.ok) throw new Error('Failed to select all');
      const data = (await res.json()) as { ids: number[]; total: number; capped: boolean };
      selectIds(data.ids);
      setSelectMode(true);
      if (data.capped) {
        toast.success(
          `Selected first ${data.ids.length} of ${data.total} — narrow filters to select more`,
        );
      } else {
        toast.success(`Selected all ${data.ids.length} matching`);
      }
    } catch {
      toast.error('Could not select all matching photos');
    }
  }, [filters, selectIds, searchQuery, visibleIds]);

  /** `⌘A` / the rail's select-all: the painted rows, never the hidden ones. */
  const selectAllShown = useCallback(() => {
    if (!searchQuery.trim()) {
      selectAll();
      return;
    }
    selectIds(visibleIds);
  }, [searchQuery, selectAll, selectIds, visibleIds]);

  // Grid keyboard shortcuts (the viewer owns its own keys). House
  // KeyboardShortcutsCheatSheet owns `?` — do not open a page sheet (cohort).
  // `⌘A` select-all while selecting, `Esc` exit, digit → view switch.
  const selectViewByIndex = useCallback(
    (index: number) => {
      const next = PHOTO_LIBRARY_HEADER_DISPLAY_MODES[index];
      if (next) handleViewChange(next);
    },
    [handleViewChange],
  );
  useMediaLibraryShortcuts({
    selectionActive,
    onToggleHelp: () => {
      // Yield to KeyboardShortcutsCheatSheet / selection inline overlays.
    },
    onSelectAll: selectAllShown,
    onEscape: exitSelectMode,
    onSelectViewIndex: selectViewByIndex,
  });

  // Infinite scroll lives in {@link PhotoLibraryLoadMoreSentinel} (needs scroll-shell root).

  const shownIds = useMemo(
    () => visiblePhotos.map((p) => p.id).filter((id) => Number.isFinite(id) && id > 0),
    [visiblePhotos],
  );

  /**
   * Upload target for header Add photos. Upload requires entityType+entityId —
   * a lifecycle tab alone is not a folder. Armed on carton (`receivingId`) or
   * ticket leaf; poRef without a carton stays visible-disabled (find first).
   */
  const uploadTarget = useMemo<MediaUploadTarget | null>(() => {
    const receivingRaw = filters.receivingId?.trim();
    if (receivingRaw) {
      const entityId = Number(receivingRaw);
      if (Number.isFinite(entityId) && entityId > 0) {
        return {
          entityType: 'RECEIVING',
          entityId,
          photoType: filters.imageType ?? null,
          poRef: resolvedPoRef ?? filters.poRef ?? null,
        };
      }
    }
    const ticketRaw = (resolvedTicketId ?? filters.ticketId)?.trim().replace(/^#/, '');
    if (ticketRaw) {
      const entityId = Number(ticketRaw);
      if (Number.isFinite(entityId) && entityId > 0) {
        return {
          entityType: 'ZENDESK_TICKET',
          entityId,
          photoType: filters.imageType ?? null,
          linkRole: 'claim_evidence' as PhotoLinkRole,
        };
      }
    }
    return null;
  }, [filters.imageType, filters.poRef, filters.receivingId, filters.ticketId, resolvedPoRef, resolvedTicketId]);

  const exportTitle = useMemo(
    () => photoShareTitle(visiblePhotos, scope, shownIds.length) || 'photos',
    [visiblePhotos, scope, shownIds.length],
  );

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

  // Per-photo right-click actions — the "drilling" menu (view, copy link, attach
  // to a support ticket, download, delete). Mirrors the bulk toolbar for one photo.
  const photoMenuItems = useCallback(
    (photo: LibraryPhoto): PhotoContextMenuItem[] => [
      {
        key: 'open',
        label: 'Open in new tab',
        icon: <ExternalLink className="h-3.5 w-3.5" />,
        onClick: () => window.open(`/api/photos/${photo.id}/content`, '_blank', 'noopener'),
      },
      {
        key: 'copy',
        label: 'Copy shareable link',
        icon: <Link2 className="h-3.5 w-3.5" />,
        onClick: () =>
          void shareLinks.generateAndCopy([photo.id], { ttlSeconds: DEFAULT_SHARE_TTL_SECONDS }),
      },
      ...(canShare
        ? [
            {
              key: 'share-page',
              label: 'Create share page',
              icon: <ExternalLink className="h-3.5 w-3.5" />,
              onClick: () =>
                void shareLinks.createSharePage([photo.id], { title: photoShareTitle([photo], scope) }),
            } satisfies PhotoContextMenuItem,
          ]
        : []),
      ...(canZendesk
        ? [
            {
              key: 'zendesk',
              label: 'Attach to ticket',
              icon: <TicketHelp className="h-3.5 w-3.5" />,
              onClick: () =>
                setClaimPhotos([
                  {
                    id: photo.id,
                    src: photo.thumbUrl,
                    displayUrl: photo.displayUrl,
                    poRef: photo.poRef,
                    caption: photo.caption ?? null,
                  },
                ]),
            } satisfies PhotoContextMenuItem,
          ]
        : []),
      ...(canManagePhotos
        ? [
            {
              key: 'labels',
              label: 'Edit labels',
              icon: <Tag className="h-3.5 w-3.5" />,
              onClick: () => setLabelEditorPhotos([photo]),
            } satisfies PhotoContextMenuItem,
          ]
        : []),
      {
        key: 'download',
        label: 'Download',
        icon: <Download className="h-3.5 w-3.5" />,
        onClick: () =>
          void downloadPhotoFile(`/api/photos/${photo.id}/content?download=1`, `photo-${photo.id}.jpg`).catch(
            () => toast.error('Download failed'),
          ),
      },
      {
        key: 'delete',
        label: 'Delete',
        danger: true,
        separatorBefore: true,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onClick: () => void deletePhotoFromMenu(photo.id),
      },
    ],
    [canManagePhotos, canShare, canZendesk, deletePhotoFromMenu, downloadPhotoFile, shareLinks],
  );

  const deleteSelectedPhotos = useCallback(
    async () => {
      // Operate on the whole selection set (may exceed the loaded rows when
      // "select all matching" is active), not just the loaded selectedPhotos.
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
        toast.error(`Deleted ${deletedIds.length} photo${deletedIds.length === 1 ? '' : 's'}; ${failures.length} failed`);
      } else {
        toast.success(`Deleted ${ids.length} photo${ids.length === 1 ? '' : 's'}`);
      }
    },
    [exitSelectMode, queryClient, selected],
  );

  const photoBulkActions = useMemo<SelectionAction<LibraryPhoto>[]>(
    () => {
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
                window.open(`/api/documents/download-zip?ids=${ids}&title=${encodeURIComponent(title)}`, '_blank');
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
              // Attach the selection to a support ticket (new or existing).
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
              // Copy N ephemeral signed links as a formatted, paste-ready block.
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
              // Create one durable public /share/photos/:token page for the set.
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
                void shareLinks.createSharePage(ids, { title: photoShareTitle(rows, scope, ids.length) });
              },
            } satisfies SelectionAction<LibraryPhoto>,
          ]
        : []),
      {
        // One file → direct download; 2+ → single ZIP (GET /api/photos/download-zip).
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
          await downloadPhotoFile(
            `/api/photos/${row.id}/content?download=1`,
            `photo-${row.id}.jpg`,
          ).then(
            () => toast.success('Downloaded 1 photo'),
            () => toast.error('Download failed'),
          );
        },
      },
      ...(canManagePhotos
        ? [
            {
              // Open the label editor for the selection (bulk add/remove diff).
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
    },
    [canManagePhotos, canShare, canZendesk, downloadPhotoFile, scope, selected, shareLinks],
  );

  return (
    /* The one page frame (2026-08-31) — `@/design-system/components/DeskPageChrome` via `DeskPageLayout`. */
    <DeskPageLayout className="h-full" title="Media">
    <PhotoLibraryDeskActions
      shownIds={shownIds}
      shownCount={shownIds.length}
      exportTitle={exportTitle}
      uploadTarget={uploadTarget}
      onUploaded={refreshLibrary}
    />
    {/* `min-w-0 flex-1` is load-bearing, not decoration: */}
    <RightPaneOverlayHost className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <DashboardScrollShell
      chrome={
        // Card controls stay mounted under selection; the page-level Find lives
        // in the header and writes `?q=` through NAV_PAGE_DECLS.
        <PhotoLibraryFindRow
          filters={filters}
          view={view}
          onApplyView={(payload) => applyView(payload.filters, payload.view)}
          onViewChange={handleViewChange}
          density={gridDensity}
          onDensityChange={setGridDensity}
          showDensity={showGridControls}
          selectionActive={selectionActive}
          onToggleSelect={() => {
            if (selectionActive) exitSelectMode();
            else setSelectMode(true);
          }}
          onRefresh={refreshLibrary}
          isRefreshing={isRefreshing}
          canManageViews={canManagePhotos}
        />
      }
      footer={
        // Outside the scroll port (same law as `chrome`) — sticky-inside cannot
        // pin a foot when a flex-1 panel overflows mid-column.
        <TableStatusBar
          lead={
            <PhotoDateBreadcrumb
              filters={displayFilters}
              today={today}
              mostRecentDay={isSettled ? mostRecentDay : undefined}
              folderLeafLabel={folderLeafLabel ?? undefined}
              onNavigate={({ dateFrom, dateTo }) =>
                patch({
                  dateFrom,
                  dateTo,
                  poRef: undefined,
                  ticketId: undefined,
                  receivingId: undefined,
                })
              }
            />
          }
          shown={visiblePhotos.length}
          total={query.hasNextPage ? undefined : visiblePhotos.length}
          selected={selected.size}
        />
      }
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {resolvedTicketId ? (
          <PhotoLibraryTicketNasBackup ticketId={resolvedTicketId} />
        ) : null}

        <Panel
          data-testid="photo-library-display"
          padding="none"
          elevation="none"
          borderless
          // No inset-field — photos are flush to the card edge (operator 2026-09-01).
          className="relative min-h-0 flex-1"
        >
          <PhotoLibraryGrid
            photos={visiblePhotos}
            searchQuery={searchQuery}
            view={view}
            gridDensity={gridDensity}
            sourceScope={sourceScopeFromFilters(filters)}
            onPhotoDeleted={() => {
              void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
              void queryClient.invalidateQueries({ queryKey: ['photo-library-folders'] });
            }}
            selectionActive={selectionActive}
            selected={selected}
            onSelectTile={selectTile}
            onToggleGroupSelection={toggleGroupSelection}
            onPhotoContextMenu={(photo, e) => {
              e.preventDefault();
              setCtxMenu({ photo, x: e.clientX, y: e.clientY });
            }}
            isLoading={query.isLoading}
            error={query.error instanceof Error ? query.error.message : null}
          />
          {query.hasNextPage ? (
            <PhotoLibraryLoadMoreSentinel
              hasNextPage={query.hasNextPage}
              isFetchingNextPage={query.isFetchingNextPage}
              onLoadMore={() => void query.fetchNextPage()}
              autoLoad={!searchQuery.trim()}
            />
          ) : !query.isLoading && visiblePhotos.length > 0 ? (
            <p className="mt-6 text-center text-role-micro text-text-faint">
              {`End of results · ${photoCountLabel(visiblePhotos.length)}`}
            </p>
          ) : null}
        </Panel>
      </div>

      {inspectorPhoto ? (
        <PhotoInspectorPanel
          photo={inspectorPhoto}
          scope={scope}
          onClose={clear}
        />
      ) : null}

      {showBatchRail ? (
        <PhotoBatchInspectorPanel
          rows={selectedPhotos}
          total={visiblePhotos.length}
          selectedCount={selected.size}
          hasMore={query.hasNextPage}
          onSelectAllMatching={() => void selectAllMatching()}
          actions={photoBulkActions}
          onDeleteSelected={deleteSelectedPhotos}
          onSelectAll={selectAllShown}
          onClear={exitSelectMode}
        />
      ) : null}

      {claimPhotos !== null ? (
        <ZendeskClaimModal
          open
          photos={claimPhotos}
          onClose={() => setClaimPhotos(null)}
          onDone={() => {
            exitSelectMode();
            void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
          }}
        />
      ) : null}

      {ctxMenu ? (
        <PhotoContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={photoMenuItems(ctxMenu.photo)}
          onClose={() => setCtxMenu(null)}
        />
      ) : null}

      {labelEditorPhotos ? (
        <PhotoLabelEditor
          photos={labelEditorPhotos}
          scopeImageType={filters.imageType}
          onClose={() => setLabelEditorPhotos(null)}
        />
      ) : null}
    </DashboardScrollShell>
    </RightPaneOverlayHost>
    </DeskPageLayout>
  );
}

/** Sentinel inside {@link DashboardScrollShell} so IntersectionObserver roots on the scroll port. */
function PhotoLibraryLoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  autoLoad = true,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  autoLoad?: boolean;
}) {
  const scrollParent = useDashboardScrollParent();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollParent.current;
    if (!el || !autoLoad) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { root, rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoLoad, hasNextPage, isFetchingNextPage, onLoadMore, scrollParent]);

  return (
    <div
      ref={sentinelRef}
      className="flex items-center justify-center py-6 text-role-micro text-text-faint"
    >
      {isFetchingNextPage ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more…
        </>
      ) : autoLoad ? null : (
        <button
          type="button"
          onClick={onLoadMore}
          className={cn(
            'ds-raw-button px-3 py-1.5 text-role-micro text-text-soft hover:text-text-default',
            cornerClass('flush'),
            focusRing('control'),
          )}
        >
          Load more to search
        </button>
      )}
    </div>
  );
}
