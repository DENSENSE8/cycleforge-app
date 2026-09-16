/**
 * `/search` is a FIND surface: diagnostic case-file, not workstation execution.
 *
 * Timeline shapes display methods. The investigation outline is derived from
 * the stream. Handoff is the only write. Recents and station Displays leaves
 * stay off this route. Phase 0 records remaining identity/pipeline/peek ports
 * as shrink-only debt ({@link SEARCH_FIND_MARKER_DEBT}). Phase 1 emptied
 * that list by stripping identity, pipeline, and peek ports. Phase 6 deleted
 * the `components/search/station/*` ports outright (nothing imported them);
 * the scan preview embed ({@link SEARCH_FIND_PREVIEW_EMBED_FILE}) is the
 * FIND column with no Displays index ({@link SEARCH_FIND_DISPLAYS_INDEX_MARKERS}).
 *
 * Tripwire: `search-find-law.test.ts`.
 * Model: `find-dossier-model.ts`.
 */

export const SEARCH_FIND_LAW = `
/search is FIND: a diagnostic case-file. Query is the object, the hit is a
confirmation, work happens on the handoff. Timeline shapes display methods
(kind faces appear iff that event exists). The investigation outline is
derived from the stream (kind counts; Overview is a filter, not a page).
Handoff is the only write path. Do not restore recents on this route. Do not
mount station Displays leaves. Never mount EntityStationPane, a workbench,
PO line items, Monitor cards, station identity, scan pipelines, or
PhotoPeekFan as page chrome.
` as const;

/** Page path + the components that paint it. Station adapters are not FIND. */
export const SEARCH_FIND_SURFACE_FILES = [
  'src/app/search/page.tsx',
  'src/app/m/(shell)/search/page.tsx',
  'src/components/search/SearchFindSurface.tsx',
  'src/components/search/SearchFindPreviewEmbed.tsx',
  'src/components/search/SearchBrowseShell.tsx',
  'src/components/search/SearchResultsSurface.tsx',
  'src/components/search/SearchDetailWorkspace.tsx',
  'src/components/search/hits-grid/search-hits-row-view.ts',
  'src/components/search/SearchPrimaryPaintShell.tsx',
  'src/components/search/dossier/SearchDossier.tsx',
  'src/components/search/dossier/SearchDossierFrame.tsx',
  'src/components/search/dossier/SearchOrderDossier.tsx',
  'src/components/search/dossier/SearchUnitDossier.tsx',
  'src/components/search/dossier/SearchReceivingDossier.tsx',
  'src/components/search/dossier/SearchGenericDossier.tsx',
  'src/components/search/dossier/SearchFindStream.tsx',
] as const;

/**
 * Import / identifier markers that mean the FIND path is wearing work chrome.
 * Matched against comment-stripped source.
 */
export const SEARCH_FIND_FORBIDDEN_MARKERS = [
  'EntityStationPane',
  'StationBandStack',
  'StationScanPaneHost',
  'StationWorkbench',
  'StationContextBar',
  'StationDisplaysPushStack',
  'StationUnitJourneys',
  'PoItemsSection',
  'PoLinesAccordion',
  'ItemRecordCard',
  'MonitorListBlock',
  'SearchEntityCentre',
  'SearchOrderStationPane',
  'SearchUnitStationPane',
  'SearchReceivingStationPane',
  'motionRole.swap.scan',
  'bg-surface-station-well',
  'OrderStationIdentity',
  'UnitStationIdentity',
  'OrderPipelineSection',
  'ReceivingCartonPipeline',
  'PhotoPeekFan',
  'SearchReceivingIdentity',
  'ReceivingPhotoPeek',
  'UnitPackPhotoPeek',
  'search-order-display-index',
  'buildSearchOrderDisplayIndexRows',
  'search-unit-display-index',
  'buildSearchUnitDisplayIndexRows',
  'search-display-index-rows',
  'components/search/station/',
  '@/components/station/displays',
  'STATION_DISPLAY_INDEX',
  'StationDisplaysPushColumn',
  'StationDisplayIndexList',
  'DisplaysIndexLeafStage',
  'OrderTimelineSection',
  'EventTimeline',
  'TimelineSection',
  'FilterRefinementBar',
] as const;

/**
 * Displays-index markers — the station Displays registry and the deleted
 * `components/search/station/*` ports (Phase 6, 2026-09-11). A scan preview
 * embed is FIND; it never mounts a Displays index. Subset of
 * {@link SEARCH_FIND_FORBIDDEN_MARKERS}; the tripwire asserts containment.
 */
export const SEARCH_FIND_DISPLAYS_INDEX_MARKERS = [
  'search-order-display-index',
  'buildSearchOrderDisplayIndexRows',
  'search-unit-display-index',
  'buildSearchUnitDisplayIndexRows',
  'search-display-index-rows',
  'components/search/station/',
  '@/components/station/displays',
  'STATION_DISPLAY_INDEX',
  'StationDisplaysPushStack',
  'StationDisplaysPushColumn',
  'StationDisplayIndexList',
  'DisplaysIndexLeafStage',
] as const;

/** The scan-station preview embed. Structurally the `/m/search?sel=` column. */
export const SEARCH_FIND_PREVIEW_EMBED_FILE =
  'src/components/search/SearchFindPreviewEmbed.tsx' as const;

/**
 * Shrink-only leftover ports. Phase 1 emptied this list.
 */
export const SEARCH_FIND_MARKER_DEBT = [] as const;
