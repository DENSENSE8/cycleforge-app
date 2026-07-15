'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Folder,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageOpen,
  Search,
  ShoppingCart,
  Tag,
  Wrench,
  TicketHelp,
} from '@/components/Icons';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { PhotoDateBreadcrumb } from '@/components/photos/PhotoDateBreadcrumb';
import { MediaLibraryPickerFolders } from '@/components/photos/MediaLibraryPickerFolders';
import { useMediaLibraryPickerPhotos } from '@/components/photos/useMediaLibraryPickerPhotos';
import type { PhotoDateNav } from '@/components/photos/photo-library-grid/types';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { PhotoGridDisplayControls } from '@/components/photos/PhotoGridDisplayControls';
import { resolveFolderBrowseState } from '@/components/photos/photo-library-grid/date-folder-tree';
import { SearchBar } from '@/components/ui/SearchBar';
import type { ClaimPhotoInput } from '@/components/support/zendesk/claim/claim-types';
import { useImageTypes } from '@/hooks/useImageTypes';
import { usePhotoGridDensity } from '@/hooks/usePhotoGridDensity';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import { mediaPickerShowsGridControls, photoGridLeafClass, photoGridTileProps } from '@/lib/photos/photo-grid-density';
import { sourceScopeFromFilters } from '@/lib/photos/library-filter-state';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';

export type MediaLibraryPickerTab = 'browse' | 'ticket' | 'carton';

type IconCmp = typeof Package;

const ICONS: Record<string, IconCmp> = {
  PackageOpen,
  ShoppingCart,
  Package,
  Wrench,
  TicketHelp,
  Tag,
  Folder,
  Image: ImageIcon,
};

const BUILTIN_ICON_OVERRIDE: Partial<Record<string, IconCmp>> = {
  claims: TicketHelp,
};

interface MediaTypeSelection {
  scope?: PhotoLibrarySourceScope;
  imageType?: string;
  label: string;
}

export interface MediaLibraryPickerContentProps {
  /** When set, enables the “This ticket” tab. */
  ticketId?: number;
  /** When set, enables the “Current carton” tab (receivingId scope). */
  receivingId?: number;
  /** Initial tab — defaults to ticket → carton → browse by context. */
  defaultTab?: MediaLibraryPickerTab;
  selected: ClaimPhotoInput[];
  onSelectedChange: (photos: ClaimPhotoInput[]) => void;
  excludePhotoIds?: Set<number>;
  /** Hide the browse / ticket / carton tab toggle. */
  showScopeToggle?: boolean;
}

function toClaimPhotoInput(photo: LibraryPhoto): ClaimPhotoInput {
  return {
    id: photo.id,
    src: photo.thumbUrl,
    displayUrl: photo.displayUrl,
    poRef: photo.poRef,
    caption: photo.caption ?? null,
  };
}

const EMPTY_DATE_NAV: PhotoDateNav = {};

function initialTab(opts: {
  defaultTab?: MediaLibraryPickerTab;
  ticketId?: number;
  receivingId?: number;
}): MediaLibraryPickerTab {
  if (opts.defaultTab) return opts.defaultTab;
  if (opts.ticketId) return 'ticket';
  if (opts.receivingId) return 'carton';
  return 'browse';
}

function seedNavForTab(
  tab: MediaLibraryPickerTab,
  ticketId?: number,
  receivingId?: number,
): PhotoDateNav {
  if (tab === 'ticket' && ticketId) return { ticketId: String(ticketId) };
  // Carton tab uses forceLeaf — no date seed needed; receivingId filters the API.
  if (tab === 'carton' && receivingId) return EMPTY_DATE_NAV;
  return EMPTY_DATE_NAV;
}

/**
 * Media-selection form — pick a media type, drill Year → Month → Week → Day, then
 * select photos. Scoped API reads keep each fetch bounded to the active folder.
 */
export function MediaLibraryPickerContent({
  ticketId,
  receivingId,
  defaultTab,
  selected,
  onSelectedChange,
  excludePhotoIds,
  showScopeToggle,
}: MediaLibraryPickerContentProps) {
  const hasTicketTab = Boolean(ticketId);
  const hasCartonTab = Boolean(receivingId);
  const scopeToggleVisible = showScopeToggle ?? (hasTicketTab || hasCartonTab);
  const { builtIn, custom, isLoading: typesLoading } = useImageTypes();
  const { density: gridDensity, setDensity: setGridDensity } = usePhotoGridDensity();
  const today = getCurrentPSTDateKey();

  const [tab, setTab] = useState<MediaLibraryPickerTab>(() =>
    initialTab({ defaultTab, ticketId, receivingId }),
  );
  const [mediaType, setMediaType] = useState<MediaTypeSelection | null>(null);
  const [dateNav, setDateNav] = useState<PhotoDateNav>(() =>
    seedNavForTab(initialTab({ defaultTab, ticketId, receivingId }), ticketId, receivingId),
  );
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);
  const onTicketTab = tab === 'ticket';
  const onCartonTab = tab === 'carton';
  const onTypeList = tab === 'browse' && mediaType === null;
  const browseActive = onTicketTab || onCartonTab || (tab === 'browse' && mediaType !== null);
  const searchActive = Boolean(debounced) && tab === 'browse' && !onTicketTab && !onCartonTab;

  const { photos, query: photosQuery, filters } = useMediaLibraryPickerPhotos({
    enabled: browseActive,
    mediaType,
    ticketTab: onTicketTab,
    cartonTab: onCartonTab,
    ticketId,
    receivingId,
    dateNav,
    search: searchActive ? debounced : undefined,
  });

  const scope: PhotoLibrarySourceScope = onTicketTab
    ? 'claims'
    : filters
      ? sourceScopeFromFilters(filters)
      : mediaType?.scope ?? 'all';

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  // Reset when ticket / carton context changes (e.g. switching tickets).
  useEffect(() => {
    const next = initialTab({ defaultTab, ticketId, receivingId });
    setTab(next);
    setMediaType(null);
    setDateNav(seedNavForTab(next, ticketId, receivingId));
    setQuery('');
    setDebounced('');
  }, [ticketId, receivingId, defaultTab]);

  const toggle = (photo: LibraryPhoto) => {
    const input = toClaimPhotoInput(photo);
    if (selectedIds.has(photo.id)) {
      onSelectedChange(selected.filter((p) => p.id !== photo.id));
    } else {
      onSelectedChange([...selected, input]);
    }
  };

  const pickBuiltIn = (scopeKey: PhotoLibrarySourceScope, label: string) => {
    setMediaType({ scope: scopeKey, label });
    setDateNav(EMPTY_DATE_NAV);
    setQuery('');
    setDebounced('');
  };

  const pickCustom = (imageType: string, label: string) => {
    setMediaType({ imageType, label });
    setDateNav(EMPTY_DATE_NAV);
    setQuery('');
    setDebounced('');
  };

  const backToTypes = () => {
    setMediaType(null);
    setDateNav(EMPTY_DATE_NAV);
    setQuery('');
    setDebounced('');
  };

  const switchTab = (next: MediaLibraryPickerTab) => {
    setTab(next);
    setMediaType(null);
    setDateNav(seedNavForTab(next, ticketId, receivingId));
    setQuery('');
    setDebounced('');
  };

  const resolvedPickerTicketId =
    dateNav.ticketId ?? (onTicketTab && ticketId ? String(ticketId) : undefined);

  const cartonPoRef = useMemo(() => {
    if (!onCartonTab || photos.length === 0) return undefined;
    const refs = new Set(photos.map((p) => p.poRef ?? '').filter(Boolean));
    return refs.size === 1 ? [...refs][0] : undefined;
  }, [onCartonTab, photos]);

  const resolvedPickerPoRef = dateNav.poRef ?? cartonPoRef;

  const breadcrumbFilters = useMemo(
    () => ({
      dateFrom: dateNav.dateFrom,
      dateTo: dateNav.dateTo,
      poRef: resolvedPickerPoRef,
      ticketId: resolvedPickerTicketId,
    }),
    [dateNav.dateFrom, dateNav.dateTo, resolvedPickerPoRef, resolvedPickerTicketId],
  );

  const onBreadcrumbNavigate = ({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) => {
    // Keep contextual leaf ids when navigating dates on ticket/carton tabs.
    setDateNav({
      dateFrom,
      dateTo,
      ...(resolvedPickerTicketId ? { ticketId: resolvedPickerTicketId } : {}),
      ...(resolvedPickerPoRef ? { poRef: resolvedPickerPoRef } : {}),
    });
  };

  const visibleSearchPhotos = useMemo(() => {
    if (!searchActive) return [];
    return photos.filter((p) => !excludePhotoIds?.has(p.id));
  }, [searchActive, photos, excludePhotoIds]);

  const folderIsLeaf = useMemo(() => {
    if (!browseActive || onTypeList || searchActive) return false;
    if (onCartonTab) return true;
    return resolveFolderBrowseState({
      photos,
      scope,
      dateFrom: dateNav.dateFrom,
      dateTo: dateNav.dateTo,
      poRef: resolvedPickerPoRef,
      ticketId: resolvedPickerTicketId,
    }).isLeaf;
  }, [
    browseActive,
    onTypeList,
    searchActive,
    onCartonTab,
    photos,
    scope,
    dateNav.dateFrom,
    dateNav.dateTo,
    resolvedPickerPoRef,
    resolvedPickerTicketId,
  ]);

  const showGridControls = mediaPickerShowsGridControls({
    onMediaTypeList: onTypeList,
    searchActive,
    folderIsLeaf,
  });

  const folderLeafLabel = useMemo(() => {
    if (!folderIsLeaf) return undefined;
    if (onCartonTab && receivingId) return `Carton #${receivingId}`;
    return resolveFolderBrowseState({
      photos,
      scope,
      dateFrom: dateNav.dateFrom,
      dateTo: dateNav.dateTo,
      poRef: resolvedPickerPoRef,
      ticketId: resolvedPickerTicketId,
    }).leafTitle;
  }, [
    folderIsLeaf,
    onCartonTab,
    receivingId,
    photos,
    scope,
    dateNav.dateFrom,
    dateNav.dateTo,
    resolvedPickerPoRef,
    resolvedPickerTicketId,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-border-hairline px-4 py-3">
        {scopeToggleVisible ? (
          <div className="inline-flex flex-wrap rounded-lg bg-surface-sunken p-0.5">
            {/* ds-raw-button */}
            <button
              type="button"
              onClick={() => switchTab('browse')}
              className={cn(
                'rounded-md px-3 py-1 text-role-caption font-bold transition',
                tab === 'browse' ? 'bg-surface-card text-blue-700 shadow-sm' : 'text-text-soft hover:text-text-muted',
              )}
            >
              Media types
            </button>
            {hasTicketTab ? (
              /* ds-raw-button */
              <button
                type="button"
                onClick={() => switchTab('ticket')}
                className={cn(
                  'rounded-md px-3 py-1 text-role-caption font-bold transition',
                  tab === 'ticket' ? 'bg-surface-card text-blue-700 shadow-sm' : 'text-text-soft hover:text-text-muted',
                )}
              >
                This ticket
              </button>
            ) : null}
            {hasCartonTab ? (
              /* ds-raw-button */
              <button
                type="button"
                onClick={() => switchTab('carton')}
                className={cn(
                  'rounded-md px-3 py-1 text-role-caption font-bold transition',
                  tab === 'carton' ? 'bg-surface-card text-blue-700 shadow-sm' : 'text-text-soft hover:text-text-muted',
                )}
              >
                Current carton
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === 'browse' && mediaType ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToTypes}
              className="ds-raw-button inline-flex items-center gap-1 rounded-lg px-2 py-1 text-role-caption font-bold text-text-soft hover:bg-surface-sunken hover:text-text-default"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Media types
            </button>
            <span className="text-role-caption font-semibold text-text-muted">{mediaType.label}</span>
          </div>
        ) : null}

        {browseActive && tab === 'browse' && mediaType ? (
          <SearchBar
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder={`Search ${mediaType.label.toLowerCase()}…`}
            variant="blue"
            size="compact"
          />
        ) : null}

        {browseActive && !searchActive ? (
          <div className="flex items-center justify-between gap-2">
            <PhotoDateBreadcrumb
              filters={breadcrumbFilters}
              onNavigate={onBreadcrumbNavigate}
              today={today}
              folderLeafLabel={folderLeafLabel}
            />
            {showGridControls ? (
              <PhotoGridDisplayControls
                density={gridDensity}
                onDensityChange={setGridDensity}
                onRefresh={() => void photosQuery.refetch()}
                isRefreshing={photosQuery.isFetching && !photosQuery.isLoading}
              />
            ) : null}
          </div>
        ) : null}

        {searchActive && showGridControls ? (
          <div className="flex justify-end">
            <PhotoGridDisplayControls
              density={gridDensity}
              onDensityChange={setGridDensity}
              onRefresh={() => void photosQuery.refetch()}
              isRefreshing={photosQuery.isFetching && !photosQuery.isLoading}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {onTypeList ? (
          <div className="space-y-2">
            <p className="px-1 text-role-eyebrow uppercase tracking-widest text-text-soft">Media type</p>
            <ul className="space-y-1">
              {builtIn.map((type) => {
                const Icon = BUILTIN_ICON_OVERRIDE[type.key] ?? ICONS[type.icon] ?? Folder;
                return (
                  <MediaTypeRow
                    key={type.key}
                    label={type.label}
                    Icon={Icon}
                    onClick={() => pickBuiltIn(type.key, type.label)}
                  />
                );
              })}
              {custom.map((type) => {
                const Icon = (type.icon && ICONS[type.icon]) || Folder;
                return (
                  <MediaTypeRow
                    key={type.id}
                    label={type.label}
                    Icon={Icon}
                    onClick={() => pickCustom(type.key, type.label)}
                  />
                );
              })}
              {typesLoading && custom.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-2 text-role-caption text-text-faint">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading types…
                </li>
              ) : null}
            </ul>
          </div>
        ) : photosQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : photosQuery.isError ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-600">
            Failed to load photos
          </div>
        ) : searchActive ? (
          visibleSearchPhotos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
              <Search className="mx-auto mb-2 h-5 w-5 text-text-faint" />
              <p className="text-role-caption font-semibold text-text-muted">No photos match</p>
              <p className="mt-1 text-role-micro text-text-faint">Try a different search.</p>
            </div>
          ) : (
            <div className={photoGridLeafClass(gridDensity)}>
              {visibleSearchPhotos.map((p) => {
                const on = selectedIds.has(p.id);
                const tile = photoGridTileProps(p, gridDensity);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p)}
                    aria-pressed={on}
                    className={cn(
                      'ds-raw-button relative overflow-hidden rounded-lg border-2 transition',
                      on ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-border-default',
                    )}
                  >
                    <PhotoThumb src={tile.imageUrl} alt={p.caption ?? ''} ratio={tile.ratio} />
                    {on ? (
                      <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <MediaLibraryPickerFolders
            photos={photos}
            scope={scope}
            gridDensity={gridDensity}
            dateNav={dateNav}
            onDateNav={setDateNav}
            selectedIds={selectedIds}
            onToggle={toggle}
            excludePhotoIds={excludePhotoIds}
            resolvedTicketId={resolvedPickerTicketId}
            resolvedPoRef={resolvedPickerPoRef}
            forceLeaf={onCartonTab}
          />
        )}
      </div>
    </div>
  );
}

function MediaTypeRow({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: IconCmp;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="ds-raw-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-role-body font-semibold text-text-muted transition hover:bg-surface-hover"
      >
        <Icon className="h-5 w-5 shrink-0 text-text-faint" />
        <span className="flex-1 truncate">{label}</span>
      </button>
    </li>
  );
}
