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
  ALL_PHOTOS_CONTEXT_TITLE,
  describePhotoLibraryContext,
  resolvePhotoLibraryFolderLeafLabel,
} from '@/lib/photos/library-context-label';
import { photoShareTitle } from '@/lib/photos/display-names';
import { buildPhotoDateTree } from '@/lib/photos/date-tree';
import {
  PHOTO_LIBRARY_HEADER_DISPLAY_MODES,
  sourceScopeFromFilters,
} from '@/lib/photos/library-filter-state';
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
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { Panel } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { PhotoContextMenu, type PhotoContextMenuItem } from './PhotoContextMenu';
import { PhotoDateBreadcrumb } from './PhotoDateBreadcrumb';
import { PhotoDisplayControls } from './PhotoDisplayControls';
import { PhotoLibraryGrid } from './PhotoLibraryGrid';
import { PhotoLibraryHeader } from './PhotoLibraryHeader';
import { PhotoBatchInspectorPanel } from './photo-inspector/PhotoBatchInspectorPanel';
import { PhotoLibraryScopeBand } from './PhotoLibraryScopeBand';
import { PhotoLibraryWorkspaceHeader } from './PhotoLibraryWorkspaceHeader';
import { PhotoLibraryTicketNasBackup } from './PhotoLibraryTicketNasBackup';
import { PhotoLabelEditor } from './PhotoLabelEditor';
import { MediaLibraryShortcutsModal } from './MediaLibraryShortcutsModal';
import { PhotoInspectorPanel } from './photo-inspector/PhotoInspectorPanel';
import { photoLibraryShowsGridControls } from '@/lib/photos/photo-grid-density';

/** Fixed share-link lifetime (24h) for copied links + share pages. */
/**
 * The one phrase for "how many photos are in view".
 *
 * Two places say it — the path strip's readout and the end-of-stream footer —
 * and they are counts of the same set, so they must not drift into `Photos 48`
 * in one and `48 photos` in the other. Pluralised because `1 photos` is the
 * kind of small wrongness an operator reads as the surface being careless with
 * the rest of its numbers.
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

/** Right pane: workbench chrome + the flat photo stream. Filters live in the header. */
export function PhotoLibraryPage() {
  const { filters, display, setView, patch } = usePhotoLibraryUrlState();
  const { view } = display;

  // Always fetch photos. The folder drill used to gate this query behind
  // `view !== 'folders' || isLeaf`, which is why a bare load painted year tiles
  // and fetched nothing; every view now renders photos, so there is no gate.
  const { query, photos, isSettled } = usePhotoLibrary(filters);
  const { density: gridDensity, setDensity: setGridDensity } = usePhotoGridDensity();
  const queryClient = useQueryClient();

  // A finder search OR a carton deep-link (receivingId) resolves to one PO when
  // every loaded photo shares it. Mirror that PO into the breadcrumb + folder-path
  // chrome so the right panel reads like an opened PO folder — without writing
  // poRef to the URL when the search box / receivingId is the source of truth.
  // An explicit PO drill (filters.poRef) always wins; a multi-PO result stays
  // generic.
  const resolvedPoRef = useMemo<string | undefined>(() => {
    if (filters.poRef) return filters.poRef;
    const canInfer = Boolean(filters.poFinder) || Boolean(filters.receivingId);
    if (!canInfer || photos.length === 0) return undefined;
    const refs = new Set(photos.map((p) => p.poRef ?? '').filter(Boolean));
    return refs.size === 1 ? [...refs][0] : undefined;
  }, [filters.poRef, filters.poFinder, filters.receivingId, photos]);

  const scope = sourceScopeFromFilters(filters);

  const resolvedTicketId = useMemo<string | undefined>(() => {
    if (filters.ticketId?.trim()) return filters.ticketId.trim().replace(/^#/, '');
    // Claims search typed as a ticket # — carry it for leaf chrome + NAS archive
    // even before photos resolve (same folder name as ReceivingClaimModal).
    if (scope === 'claims' && filters.poFinder) {
      const digits = filters.poFinder.trim().replace(/^#/, '');
      if (/^\d+$/.test(digits)) return digits;
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
  // Keyboard-shortcut cheat sheet (toggled with `?`).
  const [showShortcuts, setShowShortcuts] = useState(false);

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
  const { title: contextTitle } = describePhotoLibraryContext(displayFilters);

  // ── The desk inspector ────────────────────────────────────────────────────
  //
  // Cardinality is the mode switch, and there is no third state: one photo
  // selected opens the rail; two or more hand the chrome slot to the bulk
  // toolbar; zero closes both. The tile click is untouched — it still opens the
  // fullscreen viewer (operator ruling 2026-08-09).
  //
  // `?photoId=` is written FROM this selection and cleared WITH it, which is the
  // eviction rule: the `scopeKey` effect below already clears the selection
  // whenever a filter swaps `photos` out, so the rail closes with it and there
  // is no "open photo" state that can outlive the set it was picked from.
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
  const inspectorIndex = useMemo(
    () => (inspectorPhoto ? photos.findIndex((p) => p.id === inspectorPhoto.id) : -1),
    [inspectorPhoto, photos],
  );

  // Seed the selection from the URL exactly ONCE, so a reload lands on the same
  // photo. Gated on `isSettled` because the first page has to be in hand before
  // "is this photo in the set" can be answered; a seed that is NOT in the set
  // stays unselected, and the sync effect below then clears the param — the same
  // eviction rule, applied at load.
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

  /**
   * The batch rail and the record inspector are ONE right-edge slot at two
   * cardinalities, so they are mutually exclusive by construction rather than by
   * two booleans that can both be true. `selectionActive && !inspectorPhoto`
   * also keeps the pencil's zero-selected entry state (Select all N) exactly as
   * it was — that state moved into the rail with the verbs rather than being
   * dropped with the toolbar.
   */
  const showBatchRail = selectionActive && inspectorPhoto === null;

  /** `↑` steps toward the top of the stream, `↓` toward the bottom. */
  const stepInspector = useCallback(
    (delta: number) => {
      if (inspectorIndex < 0) return;
      const next = photos[inspectorIndex + delta];
      if (next) selectIds([next.id]);
    },
    [inspectorIndex, photos, selectIds],
  );

  // Trailing breadcrumb crumb naming the entity in view (PO / ticket / carton).
  //
  // This used to be gated on `folderIsLeaf` — i.e. only while the operator had
  // physically descended to a folder leaf. With the drill gone, the crumb is
  // gated on the thing it actually describes: whether an entity filter is
  // active. That KEEPS the capability rather than dropping it with the folders
  // — `?poRef=` still reads as "… › PO 14-…" — and it now works in every view,
  // including List, which the old gate excluded for no reason.
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

  // A view switch is presentation only — it never touches the filter set. The
  // old `folders` branch cleared poRef/ticketId because entering the drill had
  // to reset to the top of the hierarchy; there is no hierarchy to re-enter now,
  // and silently dropping an entity filter on a display toggle would be a
  // surprise (switch to List, lose the PO you were looking at).
  const handleViewChange = setView;
  const mostRecentDay = useMemo(
    () => buildPhotoDateTree(photos)[0]?.months[0]?.days[0]?.ymd,
    [photos],
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    clear();
  }, [clear]);

  // Reset selection when the BROWSE SCOPE changes — a folder drill, breadcrumb
  // jump, source-scope switch, or search. Selection is keyed by id and (by
  // design) survives paging, but a scope change swaps `photos` out from under it,
  // leaving stale ids from the previous folder in the set: the count desyncs and
  // bulk delete/share/copy silently operate on photos the user can no longer see.
  // Keyed on `filters` (the folder/breadcrumb/source/search identity), NOT on
  // `photos`, so loading more pages within one folder still keeps the selection.
  const scopeKey = useMemo(() => JSON.stringify(filters), [filters]);
  const prevScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKey.current === scopeKey) return;
    prevScopeKey.current = scopeKey;
    exitSelectMode();
  }, [scopeKey, exitSelectMode]);

  // "Select all matching filters" — fetch every matching photo id (capped) for
  // the current filter set and select them, so a bulk share/ZIP/delete spans the
  // whole result, not just the loaded page.
  const selectAllMatching = useCallback(async () => {
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
  }, [filters, selectIds]);

  // Grid keyboard shortcuts (the viewer owns its own keys). `?` help, `⌘A`
  // select-all while selecting, `Esc` exit, digit → view switch.
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);
  const selectViewByIndex = useCallback(
    (index: number) => {
      const next = PHOTO_LIBRARY_HEADER_DISPLAY_MODES[index];
      if (next) handleViewChange(next);
    },
    [handleViewChange],
  );
  useMediaLibraryShortcuts({
    selectionActive,
    onToggleHelp: toggleShortcuts,
    onSelectAll: selectAll,
    onEscape: exitSelectMode,
    onSelectViewIndex: selectViewByIndex,
  });

  // Infinite scroll lives in {@link PhotoLibraryLoadMoreSentinel} (needs scroll-shell root).

  /**
   * The path strip's meta is a READOUT — how many photos, and what they are of.
   *
   * It used to render the context *subtitle*, which on the default scope is
   * "Browse receiving, packing, and unit photos": an instruction to a
   * first-time visitor, parked permanently in 28px ops chrome, describing the
   * same seven sources Band 1's tabs are already showing. It said nothing that
   * changed as the operator worked.
   *
   * The count answers "how much is in view". The context TITLE is appended only
   * when it names something narrower than the whole archive — `PO 14-14825`,
   * `Carton #88`, `#9599` — because that is the fact the breadcrumb above does
   * not always carry. On the whole archive it is `All photos`, which the tabs
   * and the breadcrumb both already say, so it is dropped rather than repeated.
   */
  const metaLine = query.isLoading
    ? 'Loading…'
    : [
        photoCountLabel(photos.length),
        contextTitle === ALL_PHOTOS_CONTEXT_TITLE ? null : contextTitle,
      ]
        .filter(Boolean)
        .join(' · ');

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
              label: 'Add photos',
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
    // `min-w-0 flex-1` is load-bearing, not decoration: this host is a flex ITEM
    // in `<main>`'s row, and without a grow it sizes to `max-content` — which
    // measured **721px inside a 1440 viewport**, i.e. below `MIN_WORK_SURFACE_PX`
    // (784). Deleting the left rail reclaimed the column but handed the width to
    // nobody; the S1 report read that 720 as the rail's cost when it was actually
    // this. Pinned by `tests/e2e/photos-railless-frame.spec.ts`.
    <RightPaneOverlayHost className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <DashboardScrollShell
      chrome={
        // Flush sheet chrome — THREE bands stack with `gap-0` inside ONE
        // non-scrolling slot (Sheets flush mount recipe). No host `px`/`py`:
        // the outer host is flush and readable pad lives on each band's row.
        //
        //   Band 1  lifecycle tabs + media-type cube  (PhotoLibraryScopeBand)
        //   Band 2  the search band                   (PhotoLibraryWorkspaceHeader)
        //   Band 3  breadcrumb + display controls     (PhotoLibraryHeader)
        //
        // That order INVERTS the house Band 2 = KPI / Band 3 = find, and the
        // divergence is deliberate: there is no KPI band here (so Band 2 is
        // free, not displaced); search is this surface's approved entry path
        // rather than a refinement, so it earns its own band; and a path strip
        // is a context readout, which is the altitude a KPI strip occupies on a
        // queue. Recorded in `.claude/rules/display/media-library.md`.
        //
        // The bands STAY MOUNTED under selection (2026-08-09). A bulk-action
        // toolbar used to swap itself in over all three, so ticking two photos
        // took away the lifecycle tabs, the search field and the breadcrumb —
        // the operator lost their place in the archive to read a row of icons.
        // Bulk verbs are armed ROWS on the right edge now
        // (`PhotoBatchInspectorPanel`), which is where "what can I do to the
        // picked record" already lived at n = 1.
        <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
          <PhotoLibraryScopeBand />
          <PhotoLibraryWorkspaceHeader />
          <PhotoLibraryHeader
            breadcrumb={
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
            metaLine={metaLine}
            controls={
              <PhotoDisplayControls
                view={view}
                onViewChange={handleViewChange}
                density={gridDensity}
                onDensityChange={setGridDensity}
                showDensity={showGridControls}
                selectionActive={selectionActive}
                onStartSelect={() => setSelectMode(true)}
                onRefresh={refreshLibrary}
                isRefreshing={isRefreshing}
              />
            }
          />
        </div>
      }
    >
      <div className={WORKBENCH_SHEET_HOST}>
        {resolvedTicketId ? (
          <PhotoLibraryTicketNasBackup ticketId={resolvedTicketId} />
        ) : null}

        {/* The sheet plane: flush, borderless, no lift — the chrome bands above
            own every hairline. Still not `TABLE_SURFACE_SHEET_CLASS`, but the
            reason changed: that token is the LedgerGrid sheet's framed shell,
            and this surface is a media stream, not a grid. (The old reason —
            its `overflow-hidden` clipping the tile hero-morph mid-flight — died
            with the morph on 2026-08-09.) */}
        <Panel
          data-testid="photo-library-display"
          padding="none"
          elevation="none"
          borderless
          className="relative min-h-0 flex-1 inset-field"
        >
          <PhotoLibraryGrid
            photos={photos}
            view={view}
            gridDensity={gridDensity}
            sourceScope={sourceScopeFromFilters(filters)}
            onPhotoDeleted={() => {
              void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
              // The picker modal still browses server folder aggregates, so its
              // counts must drop too when a photo is deleted from here.
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
            />
          ) : !query.isLoading && photos.length > 0 ? (
            /*
              End-of-stream. It used to read `Photos 48` — the same count the
              path strip already shows, in the same words, saying nothing about
              why it is there. The operator scrolled to the bottom; what they
              need to know is that there is no more to load.
            */
            <p className="mt-6 text-center text-role-micro uppercase tracking-widest text-text-faint">
              {`End of results · ${photoCountLabel(photos.length)}`}
            </p>
          ) : null}
        </Panel>
      </div>

      {/* Registers into the global `RightRailHost` (already mounted by
          ResponsiveLayout) and renders null here — geometry belongs to the host,
          not to this page. Closing clears the selection, which clears the param. */}
      {inspectorPhoto ? (
        <PhotoInspectorPanel
          photo={inspectorPhoto}
          scope={scope}
          position={inspectorIndex + 1}
          total={photos.length}
          onPrev={() => stepInspector(-1)}
          onNext={() => stepInspector(1)}
          prevDisabled={inspectorIndex <= 0}
          nextDisabled={inspectorIndex < 0 || inspectorIndex >= photos.length - 1}
          onClose={clear}
        />
      ) : null}

      {/* The n ≠ 1 face of the SAME slot — armed rows for the bulk verbs that
          used to be a chrome toolbar. `showBatchRail` is the toolbar's own
          predicate unchanged, so the zero-selected entry state ("Select all
          48") is relocated rather than dropped, and the two panels stay
          mutually exclusive by construction. */}
      {showBatchRail ? (
        <PhotoBatchInspectorPanel
          rows={selectedPhotos}
          total={photos.length}
          selectedCount={selected.size}
          hasMore={query.hasNextPage}
          onSelectAllMatching={() => void selectAllMatching()}
          actions={photoBulkActions}
          onDeleteSelected={deleteSelectedPhotos}
          onSelectAll={selectAll}
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

      <MediaLibraryShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </DashboardScrollShell>
    </RightPaneOverlayHost>
  );
}

/** Sentinel inside {@link DashboardScrollShell} so IntersectionObserver roots on the scroll port. */
function PhotoLibraryLoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const scrollParent = useDashboardScrollParent();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollParent.current;
    if (!el) return;
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
  }, [hasNextPage, isFetchingNextPage, onLoadMore, scrollParent]);

  return (
    <div
      ref={sentinelRef}
      className="flex items-center justify-center py-6 text-role-micro uppercase tracking-widest text-text-faint"
    >
      {isFetchingNextPage ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more…
        </>
      ) : null}
    </div>
  );
}
