import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySourceScopeTab,
  clearStructuredPhotoFilters,
  countActivePhotoLibraryFilters,
  defaultPhotoLibraryMediaTypePatch,
  fieldForFinderKind,
  finderKindForField,
  formatPhotoLibraryDateRange,
  isPhotoFinderKind,
  isPhotoLibraryMediaTypeUnset,
  isPhotoLibraryStage,
  parsePhotoLibraryDisplayParams,
  parsePhotoLibraryFilters,
  parsePhotoLibraryViewMode,
  photoLibraryFiltersToParams,
  photoLibraryUrlParams,
  sourceScopeFromFilters,
  todayFoldersDateFilter,
  DEFAULT_PHOTO_LIBRARY_MEDIA_SCOPE,
  DEFAULT_PHOTO_LIBRARY_VIEW,
  PHOTO_LIBRARY_HEADER_DISPLAY_MODES,
  PHOTO_LIBRARY_SCOPE_TAB_LABEL,
  PHOTO_LIBRARY_SCOPE_TABS,
  PHOTO_LIBRARY_VIEW_ORDER,
  PHOTO_LIBRARY_PAGE_SIZE,
  PHOTO_SEARCH_FIELDS,
  PHOTO_SEARCH_FIELD_LABELS,
  type PhotoLibrarySourceScope,
  type PhotoLibraryViewMode,
} from '@/lib/photos/library-filter-state';

test('todayFoldersDateFilter pins both ends to the same PST day', () => {
  const { dateFrom, dateTo } = todayFoldersDateFilter();
  assert.equal(dateFrom, dateTo);
  assert.match(dateFrom ?? '', /^\d{4}-\d{2}-\d{2}$/);
});

test('parsePhotoLibraryFilters supports outbound scope and documentType', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=outbound&documentType=shipping_label&poRef=ORD-1'),
  );
  assert.equal(filters.sourceScope, 'outbound');
  assert.equal(filters.documentType, 'shipping_label');
  assert.equal(filters.poRef, 'ORD-1');
});

test('photoLibraryFiltersToParams serializes outbound documentType', () => {
  const params = photoLibraryFiltersToParams({
    sourceScope: 'outbound',
    documentType: 'packing_slip',
  });
  assert.equal(params.get('sourceScope'), 'outbound');
  assert.equal(params.get('documentType'), 'packing_slip');
});

test('parsePhotoLibraryFilters validates source scope and ignores legacy entity params', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=packing&sort=oldest&entityType=RECEIVING&entityId=12'),
  );

  assert.equal(filters.sourceScope, 'packing');
  assert.equal(filters.sort, 'oldest');
  assert.equal((filters as { entityType?: string }).entityType, undefined);
  assert.equal((filters as { entityId?: string }).entityId, undefined);
});

test('photoLibraryFiltersToParams omits default all scope and preserves scoped values', () => {
  const allParams = photoLibraryFiltersToParams({ sourceScope: 'all', poRef: '4421', sort: 'recent' });
  assert.equal(allParams.get('sourceScope'), null);
  assert.equal(allParams.get('sort'), null);
  assert.equal(allParams.get('poRef'), '4421');

  const scopedParams = photoLibraryFiltersToParams({ sourceScope: 'claims', sort: 'oldest', staffId: '7' });
  assert.equal(scopedParams.get('sourceScope'), 'claims');
  assert.equal(scopedParams.get('sort'), 'oldest');
  assert.equal(scopedParams.get('staffId'), '7');
});

test('formatPhotoLibraryDateRange renders explicit custom ranges', () => {
  assert.equal(
    formatPhotoLibraryDateRange({ dateFrom: '2026-06-01', dateTo: '2026-06-03' }),
    'Jun 1 to Jun 3',
  );
});

test('business-ID filters survive the URL round-trip', () => {
  const qs =
    'tracking=1Z999&serial=SN-42&sku=ABC-001&ticketId=12345&pickupId=77&rma=RMA-9';
  const filters = parsePhotoLibraryFilters(new URLSearchParams(qs));
  assert.equal(filters.tracking, '1Z999');
  assert.equal(filters.serial, 'SN-42');
  assert.equal(filters.sku, 'ABC-001');
  assert.equal(filters.ticketId, '12345');
  assert.equal(filters.pickupId, '77');
  assert.equal(filters.rma, 'RMA-9');

  // Re-serializing reproduces every business id (deep-link safe).
  const params = photoLibraryFiltersToParams(filters);
  for (const [key, val] of Object.entries({
    tracking: '1Z999',
    serial: 'SN-42',
    sku: 'ABC-001',
    ticketId: '12345',
    pickupId: '77',
    rma: 'RMA-9',
  })) {
    assert.equal(params.get(key), val);
  }
});

test('business-ID filters clear together but do not count toward the filter badge', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('tracking=1Z999&serial=SN-42&sku=ABC-001&ticketId=5&pickupId=6&rma=RMA-9'),
  );
  assert.equal(countActivePhotoLibraryFilters(filters), 0);

  const cleared = clearStructuredPhotoFilters(filters);
  assert.equal(cleared.tracking, undefined);
  assert.equal(cleared.serial, undefined);
  assert.equal(cleared.sku, undefined);
  assert.equal(cleared.ticketId, undefined);
  assert.equal(cleared.pickupId, undefined);
  assert.equal(cleared.rma, undefined);
  assert.equal(countActivePhotoLibraryFilters(cleared), 0);
});

test('poFinder + kind round-trip, count once, and clear as structured', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('poFinder=SN-42&poFinderKind=serial'),
  );
  assert.equal(filters.poFinder, 'SN-42');
  assert.equal(filters.poFinderKind, 'serial');
  // The finder is one structured refinement regardless of which field it scopes.
  assert.equal(countActivePhotoLibraryFilters(filters), 1);

  // Deep-link safe: value + kind both reproduce.
  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('poFinder'), 'SN-42');
  assert.equal(params.get('poFinderKind'), 'serial');

  const cleared = clearStructuredPhotoFilters(filters);
  assert.equal(cleared.poFinder, undefined);
  assert.equal(cleared.poFinderKind, undefined);
  assert.equal(countActivePhotoLibraryFilters(cleared), 0);
});

test('poFinder ticket kind round-trips in URL params', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=claims&poFinder=4821&poFinderKind=ticket'),
  );
  assert.equal(filters.sourceScope, 'claims');
  assert.equal(filters.poFinder, '4821');
  assert.equal(filters.poFinderKind, 'ticket');
  assert.equal(fieldForFinderKind('ticket'), 'ticket');

  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('poFinder'), '4821');
  assert.equal(params.get('poFinderKind'), 'ticket');
});

test('parsePhotoLibraryFilters rejects an unknown poFinderKind', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('poFinder=4421&poFinderKind=bogus'),
  );
  assert.equal(filters.poFinder, '4421');
  // Invalid kind is dropped; library.ts then defaults the resolution to 'po'.
  assert.equal(filters.poFinderKind, undefined);
});

test('label round-trips through parse + serialize and counts/clears as structured', () => {
  const filters = parsePhotoLibraryFilters(new URLSearchParams('label=defect&imageType=listing'));
  assert.equal(filters.label, 'defect');
  // imageType is a navigator scope (not counted); label is a structured refinement.
  assert.equal(countActivePhotoLibraryFilters(filters), 1);

  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('label'), 'defect');
  assert.equal(params.get('imageType'), 'listing');

  const cleared = clearStructuredPhotoFilters(filters);
  assert.equal(cleared.label, undefined);
  // The image-type navigator survives a structured clear.
  assert.equal(cleared.imageType, 'listing');
  assert.equal(countActivePhotoLibraryFilters(cleared), 0);
});

// ── Unboxing stage sub-filter + SKU search field (WS-PHOTO Plan 3) ──────────

test('stage sub-filter round-trips under the unboxing scope', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=unboxing&stage=unbox_item'),
  );
  assert.equal(filters.sourceScope, 'unboxing');
  assert.equal(filters.stage, 'unbox_item');
  // Navigator scope, not a structured refinement.
  assert.equal(countActivePhotoLibraryFilters(filters), 0);

  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('sourceScope'), 'unboxing');
  assert.equal(params.get('stage'), 'unbox_item');

  const restored = parsePhotoLibraryFilters(params);
  assert.deepEqual(restored, filters);
});

test('stage is dropped from the URL when the scope is not unboxing', () => {
  // A scope switch that forgets to clear stage must not leak it into the next
  // scope's deep link — the serializer is the guard, not every call site.
  const params = photoLibraryFiltersToParams({ sourceScope: 'packing', stage: 'unbox_carton' });
  assert.equal(params.get('sourceScope'), 'packing');
  assert.equal(params.get('stage'), null);
  // No scope at all (defaults to All) also drops it.
  assert.equal(photoLibraryFiltersToParams({ stage: 'arrival_package' }).get('stage'), null);
});

test('parsePhotoLibraryFilters rejects an unknown stage value', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=unboxing&stage=bogus'),
  );
  assert.equal(filters.stage, undefined);
  assert.equal(isPhotoLibraryStage('arrival_package'), true);
  assert.equal(isPhotoLibraryStage('unbox_carton'), true);
  assert.equal(isPhotoLibraryStage('unbox_item'), true);
  assert.equal(isPhotoLibraryStage('testing'), false);
  assert.equal(isPhotoLibraryStage(null), false);
});

test('stage survives a structured clear but resets with the default media-type patch', () => {
  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=unboxing&stage=unbox_item&poFinder=SN-1'),
  );
  const cleared = clearStructuredPhotoFilters(filters);
  assert.equal(cleared.stage, 'unbox_item');
  assert.equal(cleared.poFinder, undefined);

  assert.equal(defaultPhotoLibraryMediaTypePatch().stage, undefined);
});

test('SKU is an explicit sidebar search field mapped to the sku finder kind', () => {
  assert.ok(PHOTO_SEARCH_FIELDS.includes('sku'));
  assert.equal(PHOTO_SEARCH_FIELD_LABELS.sku, 'SKU');
  assert.equal(finderKindForField('sku'), 'sku');
  assert.equal(fieldForFinderKind('sku'), 'sku');
  assert.equal(isPhotoFinderKind('sku'), true);

  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('poFinder=WM-1023&poFinderKind=sku'),
  );
  assert.equal(filters.poFinder, 'WM-1023');
  assert.equal(filters.poFinderKind, 'sku');

  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('poFinder'), 'WM-1023');
  assert.equal(params.get('poFinderKind'), 'sku');
});

test('Repair and Customer are explicit sidebar fields mapped to their finder kinds', () => {
  assert.ok(PHOTO_SEARCH_FIELDS.includes('repair'));
  assert.ok(PHOTO_SEARCH_FIELDS.includes('customer'));
  assert.equal(PHOTO_SEARCH_FIELD_LABELS.repair, 'Repair');
  assert.equal(PHOTO_SEARCH_FIELD_LABELS.customer, 'Customer');
  assert.equal(finderKindForField('repair'), 'repair');
  assert.equal(finderKindForField('customer'), 'customer');
  assert.equal(fieldForFinderKind('repair'), 'repair');
  assert.equal(fieldForFinderKind('customer'), 'customer');
  assert.equal(isPhotoFinderKind('repair'), true);
  assert.equal(isPhotoFinderKind('customer'), true);

  const filters = parsePhotoLibraryFilters(
    new URLSearchParams('poFinder=RS-125&poFinderKind=repair'),
  );
  assert.equal(filters.poFinder, 'RS-125');
  assert.equal(filters.poFinderKind, 'repair');

  const params = photoLibraryFiltersToParams(filters);
  assert.equal(params.get('poFinder'), 'RS-125');
  assert.equal(params.get('poFinderKind'), 'repair');
});

test('the Repair lifecycle scope maps to the REPAIR_SERVICE entity type', () => {
  // The library query widens this single param to REPAIR_SERVICE + SERIAL_UNIT;
  // the mapping itself must stay the repair-service handle so the scope tab and
  // the entityType filter agree on what "Repair" means.
  assert.equal(entityTypeForSourceScope('repair'), 'REPAIR_SERVICE');
});

test('the header display toggle lists List only — grid size is on row 3', () => {
  assert.deepEqual(PHOTO_LIBRARY_HEADER_DISPLAY_MODES, ['list']);
});

test('PHOTO_LIBRARY_VIEW_ORDER lists the 4 surviving view modes, unique', () => {
  // `folders` was the 3rd entry (digit "3") before the drill was retired.
  assert.equal(PHOTO_LIBRARY_VIEW_ORDER.length, 4);
  assert.equal(new Set(PHOTO_LIBRARY_VIEW_ORDER).size, 4);
  const valid: PhotoLibraryViewMode[] = ['grid-sm', 'grid-lg', 'grid-ticket', 'list'];
  for (const mode of PHOTO_LIBRARY_VIEW_ORDER) assert.ok(valid.includes(mode));
  assert.ok(
    !(PHOTO_LIBRARY_VIEW_ORDER as readonly string[]).includes('folders'),
    'the folder drill must not come back as a view mode',
  );
});

test('PHOTO_LIBRARY_PAGE_SIZE matches the server request (no 24-vs-48 drift)', () => {
  assert.equal(PHOTO_LIBRARY_PAGE_SIZE, 48);
});

test('the bare-load view is the flat stream, not the folder drill', () => {
  // The landing state must fetch photos. PhotoLibraryPage gates the photo query
  // on `view !== 'folders' || foldersIsLeaf`, so a `folders` default painted
  // year tiles and Recent could never show a photo.
  assert.equal(parsePhotoLibraryViewMode(null), DEFAULT_PHOTO_LIBRARY_VIEW);
  assert.notEqual(DEFAULT_PHOTO_LIBRARY_VIEW, 'folders');
  // An unknown/garbage mode falls back to the same default.
  assert.equal(parsePhotoLibraryViewMode('nonsense'), DEFAULT_PHOTO_LIBRARY_VIEW);
});

test('every view mode round-trips through the URL, and only the default is omitted', () => {
  // Generic over PHOTO_LIBRARY_VIEW_ORDER so a future mode cannot reintroduce
  // the parse/serialize desync: `parsePhotoLibraryViewMode` and
  // `photoLibraryUrlParams` must agree on which single mode is implicit.
  for (const mode of PHOTO_LIBRARY_VIEW_ORDER) {
    const params = photoLibraryUrlParams({}, { view: mode, page: 1 });
    const raw = params.get('view');
    if (mode === DEFAULT_PHOTO_LIBRARY_VIEW) {
      assert.equal(raw, null, `${mode} is the default and must not be serialized`);
    } else {
      assert.equal(raw, mode, `${mode} must be serialized explicitly`);
    }
    // Round-trip: what the URL says (or omits) parses back to the same mode.
    assert.equal(parsePhotoLibraryViewMode(raw), mode);
  }
});

test('every lifecycle facet tab is reachable and round-trips to itself', () => {
  // Unlike the date tabs these replaced, every position maps to exactly one tab.
  for (const scope of PHOTO_LIBRARY_SCOPE_TABS) {
    const next = applySourceScopeTab(scope);
    assert.equal(sourceScopeFromFilters(next), scope, `${scope} must light its own tab`);
    assert.ok(PHOTO_LIBRARY_SCOPE_TAB_LABEL[scope], `${scope} needs a label`);
  }
  // 'all' is the absent-param state, so it must NOT serialize a scope.
  assert.equal(applySourceScopeTab('all').sourceScope, undefined);
});

test('switching facet drops scope-DEPENDENT refinements', () => {
  // stage/documentType/label/entity-leaf are meaningless under another scope and
  // would silently produce an unexplainable empty result.
  const dirty = applySourceScopeTab('repair');
  assert.equal(dirty.stage, undefined);
  assert.equal(dirty.imageType, undefined);
  assert.equal(dirty.label, undefined);
  assert.equal(dirty.poRef, undefined);
  assert.equal(dirty.ticketId, undefined);
  assert.equal(dirty.receivingId, undefined);
  assert.equal(dirty.documentType, undefined);
  assert.equal(dirty.outboundMedia, undefined);
  // Outbound seeds its own media filter rather than leaving it unset.
  assert.equal(applySourceScopeTab('outbound').outboundMedia, 'documents');
});

test('switching facet PRESERVES the search box, date range, and sort', () => {
  // The core search-first job: hunting one serial across lifecycle stages must
  // not require retyping it. applySourceScopeTab returns a PATCH, so any key it
  // does not name survives the merge.
  const before = {
    poFinder: 'SN-1234',
    poFinderKind: 'any' as const,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-20',
    sort: 'oldest' as const,
  };
  const after = { ...before, ...applySourceScopeTab('claims') };
  assert.equal(after.poFinder, 'SN-1234');
  assert.equal(after.poFinderKind, 'any');
  assert.equal(after.dateFrom, '2026-07-01');
  assert.equal(after.dateTo, '2026-07-20');
  assert.equal(after.sort, 'oldest');
});

test('the facet tabs cover every source scope — no scope stranded off-strip', () => {
  // A new PhotoLibrarySourceScope that never gets a tab is only reachable via
  // the media-type menu, which is how local_pickup nearly shipped hidden.
  const everyScope: PhotoLibrarySourceScope[] = [
    'all', 'unboxing', 'local_pickup', 'packing', 'repair', 'claims', 'outbound',
  ];
  for (const scope of everyScope) {
    assert.ok(
      PHOTO_LIBRARY_SCOPE_TABS.includes(scope),
      `${scope} has no lifecycle tab and would be reachable only via the menu`,
    );
  }
  assert.equal(new Set(PHOTO_LIBRARY_SCOPE_TABS).size, PHOTO_LIBRARY_SCOPE_TABS.length);
});

test('?photoId= is a DISPLAY param and never a filter', () => {
  // Reinstated 2026-08-09 for the desk inspector, on the axis the retired
  // `PhotoInspectorPanel` failed: it is written from SELECTION (never from the
  // tile click, which still opens the fullscreen viewer) and it is a display
  // param, so it cannot reach `buildLibraryWhere` and narrow the very stream the
  // photo was picked from.
  const display = parsePhotoLibraryDisplayParams(new URLSearchParams('photoId=4210&page=3'));
  assert.deepEqual(Object.keys(display).sort(), ['page', 'photoId', 'view']);
  assert.equal(display.page, 3);
  assert.equal(display.photoId, '4210');

  // Only positive integer ids parse — a junk deep link resolves to "closed",
  // never to a rail mounted on a record that cannot exist.
  for (const junk of ['0', '-3', 'abc', '4210x', '']) {
    assert.equal(
      parsePhotoLibraryDisplayParams(new URLSearchParams(`photoId=${junk}`)).photoId,
      undefined,
      `?photoId=${junk} must not open the inspector`,
    );
  }

  const filters = parsePhotoLibraryFilters(new URLSearchParams('photoId=4210&sourceScope=claims'));
  assert.equal((filters as Record<string, unknown>).photoId, undefined);
  assert.equal(filters.sourceScope, 'claims');
  assert.equal(photoLibraryFiltersToParams(filters).get('photoId'), null);
});

test('a display bag with no photoId DROPS the param — this is the eviction rule', () => {
  // `applyView` / `clearAll` construct a fresh display bag rather than copying
  // the current one, so neither has to name `photoId` to close the inspector.
  // A saved view that reopened one photo would be a bug.
  const filters = parsePhotoLibraryFilters(new URLSearchParams('sourceScope=claims'));
  const base = new URLSearchParams('photoId=4210&sourceScope=claims');

  assert.equal(
    photoLibraryUrlParams(filters, { view: DEFAULT_PHOTO_LIBRARY_VIEW, page: 1 }, base).get(
      'photoId',
    ),
    null,
  );
  assert.equal(
    photoLibraryUrlParams(
      filters,
      { view: DEFAULT_PHOTO_LIBRARY_VIEW, page: 1, photoId: '4210' },
      base,
    ).get('photoId'),
    '4210',
  );
});

test('a legacy ?view=folders deep link degrades to the flat stream', () => {
  // The hierarchy is gone, so a bookmarked drill or a saved view stored with
  // `view: 'folders'` must land somewhere real rather than throwing or painting
  // an empty surface. Every photo it used to reach is still reachable — as a
  // filter rather than a descent.
  assert.equal(parsePhotoLibraryViewMode('folders'), DEFAULT_PHOTO_LIBRARY_VIEW);
});

test('a saved-view filter snapshot round-trips through parse + serialize', () => {
  // Mirrors the media saved-view payload: an arbitrary filter set is restored
  // verbatim when applied (replaceFilters) after being stored in JSONB.
  const snapshot = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=claims&label=defect&poFinder=14-123&poFinderKind=po'),
  );
  const params = photoLibraryFiltersToParams(snapshot);
  const restored = parsePhotoLibraryFilters(params);
  assert.deepEqual(restored, snapshot);
});

test('default media type landing is all-types recent (no scope or date pin)', () => {
  assert.equal(DEFAULT_PHOTO_LIBRARY_MEDIA_SCOPE, 'unboxing');
  assert.equal(isPhotoLibraryMediaTypeUnset({}), true);
  assert.equal(isPhotoLibraryMediaTypeUnset({ sourceScope: 'all' }), true);
  assert.equal(isPhotoLibraryMediaTypeUnset({ sourceScope: 'packing' }), false);
  assert.equal(isPhotoLibraryMediaTypeUnset({ imageType: 'listing' }), false);

  const patch = defaultPhotoLibraryMediaTypePatch();
  assert.equal(patch.sourceScope, undefined);
  assert.equal(patch.imageType, undefined);
  assert.equal(patch.dateFrom, undefined);
  assert.equal(patch.dateTo, undefined);
  assert.equal(patch.sort, 'recent');

  const withStructured = parsePhotoLibraryFilters(
    new URLSearchParams('sourceScope=unboxing&poFinder=SN-1&dateFrom=2026-01-01'),
  );
  const cleared = clearStructuredPhotoFilters(withStructured);
  assert.equal(cleared.sourceScope, 'unboxing');
  assert.equal(countActivePhotoLibraryFilters(cleared), 0);
});

test('every lifecycle tab is a distinct, reachable URL state', () => {
  // Carried forward from the deleted recency-tab suite, which is what caught the
  // original defect: the old `all` tab serialized byte-identically to `recent`
  // (both = no date pin), so it could never light up. Generic over the tab list
  // so a future facet cannot reintroduce a tab that is unreachable by URL.
  const seen = new Map<string, PhotoLibrarySourceScope>();
  for (const tab of PHOTO_LIBRARY_SCOPE_TABS) {
    const params = photoLibraryFiltersToParams(applySourceScopeTab(tab)).toString();
    const collision = seen.get(params);
    assert.equal(collision, undefined, `${tab} collides with ${collision} (both → "${params}")`);
    seen.set(params, tab);
  }
});
