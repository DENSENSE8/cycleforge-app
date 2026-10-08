'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from '@/components/Icons';
import { usePhotoInspectorParam } from '@/hooks/usePhotoInspectorParam';
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import { usePhotoSelection } from '@/hooks/usePhotoSelection';
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
import { resolveSelectionAction } from '@/lib/selection/selection-actions';
import { requestConfirm } from '@/design-system/components/confirm';
import { usePackerPhotosRealtimeRefresh } from '@/hooks/usePackerPhotosRealtimeRefresh';
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
import { PhotoSelectionDock } from './PhotoSelectionDock';
import { PhotoShareSheet } from './PhotoShareSheet';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { PhotoLibraryTicketNasBackup } from './PhotoLibraryTicketNasBackup';
import { PhotoLabelEditor } from './PhotoLabelEditor';
import { LightboxPortal } from './photo-library-grid/LightboxPortal';
import { toGalleryInputs } from './photo-library-grid/photo-grid-format';
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

// `LibraryPhoto` moved to ./photo-library-types so the grid + hook can share it
// without importing this page (cycle). Re-exported here for compatibility.
export type { LibraryPhoto } from './photo-library-types';
import type { LibraryPhoto } from './photo-library-types';
import { usePhotoVerbs, type PhotoVerbTarget } from './usePhotoVerbs';

/** Right pane: workbench chrome + the flat photo stream. Filters live in the left sidebar (`NAV_PAGE_DECLS['ops-photos']`). */
export function PhotoLibraryPage() {
  const { filters, display, setView, patch } = usePhotoLibraryUrlState();
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
  // Photos staged for the "Create support ticket" modal (null = closed).
  const [claimPhotos, setClaimPhotos] = useState<ClaimPhotoInput[] | null>(null);
  // Photos staged for the label editor (null = closed; 1 = single PUT, N = bulk).
  const [labelEditorPhotos, setLabelEditorPhotos] = useState<LibraryPhoto[] | null>(null);
  // Right-click context menu target (null = closed).
  const [ctxMenu, setCtxMenu] = useState<{ photo: LibraryPhoto; x: number; y: number } | null>(null);
  // Selected photos open in the fullscreen viewer from the action control (null = closed).
  const [viewerPhotos, setViewerPhotos] = useState<LibraryPhoto[] | null>(null);

  // Live-refresh when a packer's phone commits a GCS upload (station channel),
  // mirroring how receiving photos already propagate into the library.
  const refreshLibraryOnPackerPhoto = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
    void queryClient.invalidateQueries({ queryKey: ['photo-library-folders'] });
  }, [queryClient]);
  usePackerPhotosRealtimeRefresh(null, refreshLibraryOnPackerPhoto);

  // Selection starts from a tile's checkmark or a modifier-click (Google-Photos
  // model) — the one selection method. It persists across the client pages
  // (see usePhotoSelection): a bulk action carries the whole set.
  const { selected, selectedPhotos, isActive: selectionActive, selectTile, selectAll, selectIds, toggleGroupSelection, clear } =
    usePhotoSelection(photos);

  // ── `?photoId=` — a single selection survives a reload / deep link ─────────
  const { photoId: openPhotoId, setPhotoId } = usePhotoInspectorParam();
  /** `?photoId=` as it stood on first paint — the reload / deep-link seed. */
  const [seedPhotoId] = useState(() => openPhotoId);
  const [inspectorHydrated, setInspectorHydrated] = useState(() => openPhotoId === null);

  // Resolved against the LOADED stream: "select all matching" can hold ids that
  // were never fetched, and an id we do not have is not worth a URL.
  const soloPhotoId = useMemo(() => {
    if (selected.size !== 1) return null;
    const photo = photos.find((p) => selected.has(p.id));
    return photo ? String(photo.id) : null;
  }, [photos, selected]);

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
    if (!inspectorHydrated || openPhotoId === soloPhotoId) return;
    setPhotoId(soloPhotoId);
  }, [inspectorHydrated, soloPhotoId, openPhotoId, setPhotoId]);

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

  const refreshAfterPhotoDelete = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
    void queryClient.invalidateQueries({ queryKey: ['photo-library-folders'] });
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

  // Reset selection when the BROWSE SCOPE changes — a folder drill, breadcrumb jump, source-scope switch, or search.
  const scopeKey = useMemo(() => JSON.stringify(filters), [filters]);
  const prevScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKey.current === scopeKey) return;
    prevScopeKey.current = scopeKey;
    clear();
  }, [scopeKey, clear]);

  /** Every id the find-bar is currently painting — the select-all target. */
  const visibleIds = useMemo(() => visiblePhotos.map((p) => p.id), [visiblePhotos]);

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
    onEscape: clear,
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

  const attachToTicket = useCallback((rows: LibraryPhoto[]) => {
    setClaimPhotos(
      rows.map((row) => ({
        id: row.id,
        src: row.thumbUrl,
        displayUrl: row.displayUrl,
        poRef: row.poRef,
        caption: row.caption ?? null,
      })),
    );
  }, []);

  // The ONE verb set: the dock and the right-click menu both read it.
  const { verbsFor, canDelete, deletePhotos, shareReady, dismissShareReady } = usePhotoVerbs({
    scope,
    onOpen: setViewerPhotos,
    onTag: setLabelEditorPhotos,
    onAttachToTicket: attachToTicket,
  });

  /** The selection as a verb target — every selected id, plus its loaded rows. */
  const selectionTarget = useMemo<PhotoVerbTarget>(
    () => ({ ids: [...selected], rows: selectedPhotos }),
    [selected, selectedPhotos],
  );
  const selectionVerbs = useMemo(() => verbsFor(selectionTarget), [verbsFor, selectionTarget]);

  /** Confirm, then delete — the dock and the right-click menu share this one path. */
  const confirmAndDelete = useCallback(
    async (ids: number[], clearsSelection: boolean) => {
      const count = ids.length;
      const ok = await requestConfirm({
        description: `Delete ${count === 1 ? 'this photo' : `${count} photos`}? This cannot be undone.`,
        tone: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
      await deletePhotos(ids);
      if (clearsSelection) clear();
    },
    [deletePhotos, clear],
  );
  const deleteSelection = useMemo(
    () =>
      canDelete(selectionTarget)
        ? () => void confirmAndDelete(selectionTarget.ids, true)
        : undefined,
    [canDelete, confirmAndDelete, selectionTarget],
  );

  // Right-click acts on the selection when the photo is in it, else on that one
  // photo (Finder / Photos model) — through the same verbs as the dock.
  const menuItems = useMemo<PhotoContextMenuItem[]>(() => {
    if (!ctxMenu) return [];
    const inSelection = selected.has(ctxMenu.photo.id);
    const target: PhotoVerbTarget = inSelection
      ? selectionTarget
      : { ids: [ctxMenu.photo.id], rows: [ctxMenu.photo] };
    const items: PhotoContextMenuItem[] = verbsFor(target).map((verb) => {
      const resolved = resolveSelectionAction(verb, target.rows);
      return {
        key: verb.key,
        label: resolved.label,
        icon: verb.icon,
        disabled: resolved.disabled,
        onClick: () => void verb.run(target.rows),
      };
    });
    if (canDelete(target)) {
      const count = target.ids.length;
      items.push({
        key: 'delete',
        label: count === 1 ? 'Delete' : `Delete ${count}`,
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        separatorBefore: true,
        onClick: () => void confirmAndDelete(target.ids, inSelection),
      });
    }
    return items;
  }, [canDelete, confirmAndDelete, ctxMenu, selected, selectionTarget, verbsFor]);

  const viewerInputs = useMemo(
    () => (viewerPhotos ? toGalleryInputs(viewerPhotos, scope) : null),
    [viewerPhotos, scope],
  );

  return (
    /* The one page frame (2026-08-31) — `@/design-system/components/DeskPageChrome` via `DeskPageLayout`. */
    <DeskPageLayout className="h-full" title="Media" recordViews={false}>
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
          view={view}
          onViewChange={handleViewChange}
          density={gridDensity}
          onDensityChange={setGridDensity}
          showDensity={showGridControls}
          onRefresh={refreshLibrary}
          isRefreshing={isRefreshing}
        />
      }
      footer={
        // Outside the scroll port (same law as `chrome`) — sticky-inside cannot
        // pin a foot when a flex-1 panel overflows mid-column. The selection
        // dock floats just above it, over the photos' bottom edge.
        <>
          <PhotoShareSheet ready={shareReady} onDismiss={dismissShareReady} aboveDock={selected.size > 0} />
          <PhotoSelectionDock
            count={selected.size}
            rows={selectedPhotos}
            verbs={selectionVerbs}
            onDelete={deleteSelection}
            onClear={clear}
            shownCount={visiblePhotos.length}
            onSelectAll={selectAllShown}
          />
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
        </>
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
          // While the dock floats, the stream ends above it, never under it.
          className={cn('relative min-h-0 flex-1', selected.size > 0 && 'pb-24')}
        >
          <PhotoLibraryGrid
            photos={visiblePhotos}
            searchQuery={searchQuery}
            view={view}
            gridDensity={gridDensity}
            sourceScope={sourceScopeFromFilters(filters)}
            onPhotoDeleted={refreshAfterPhotoDelete}
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

      {claimPhotos !== null ? (
        <ZendeskClaimModal
          open
          photos={claimPhotos}
          onClose={() => setClaimPhotos(null)}
          onDone={() => {
            clear();
            void queryClient.invalidateQueries({ queryKey: ['photo-library'] });
          }}
        />
      ) : null}

      {ctxMenu ? (
        <PhotoContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
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

      {viewerInputs ? (
        // The grid stays mounted under the viewer, so closing it leaves the
        // scroll port and the selection exactly where they were.
        <LightboxPortal
          photos={viewerInputs}
          onClose={() => setViewerPhotos(null)}
          onPhotoDeleted={refreshAfterPhotoDelete}
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
