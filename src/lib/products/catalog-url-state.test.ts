import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_CATALOG_REFINE,
  applyCatalogRefine,
  applyCatalogRefineParams,
  catalogPlatformTabs,
  catalogRefineIsHot,
  parseCatalogPlatform,
  parseCatalogRefine,
  parseLinkFilter,
} from './catalog-url-state';

describe('parseCatalogPlatform', () => {
  it('defaults to zoho', () => {
    assert.equal(parseCatalogPlatform(null), 'zoho');
    assert.equal(parseCatalogPlatform(''), 'zoho');
    assert.equal(parseCatalogPlatform('bogus'), 'zoho');
    assert.equal(parseCatalogPlatform('zoho'), 'zoho');
  });

  it('accepts hub platforms case-insensitively', () => {
    assert.equal(parseCatalogPlatform('amazon'), 'amazon');
    assert.equal(parseCatalogPlatform('eBay'), 'ebay');
    assert.equal(parseCatalogPlatform('FBA'), 'fba');
    assert.equal(parseCatalogPlatform('shopify'), 'shopify');
  });
});

describe('parseLinkFilter (refine)', () => {
  it('defaults to all when absent or unknown', () => {
    assert.equal(parseLinkFilter(null), 'all');
    assert.equal(parseLinkFilter(''), 'all');
    assert.equal(parseLinkFilter('bogus'), 'all');
    assert.equal(parseLinkFilter('all'), 'all');
  });

  it('accepts active_linked and unlinked_pending', () => {
    assert.equal(parseLinkFilter('active_linked'), 'active_linked');
    assert.equal(parseLinkFilter('unlinked_pending'), 'unlinked_pending');
  });
});

describe('catalogPlatformTabs', () => {
  it('starts with Zoho then hub channels', () => {
    const tabs = catalogPlatformTabs();
    assert.equal(tabs[0]?.id, 'zoho');
    assert.ok(tabs.some((t) => t.id === 'amazon'));
    assert.ok(tabs.some((t) => t.id === 'ebay'));
  });
});

describe('catalog refine URL state', () => {
  it('parses empty params as cold', () => {
    const refine = parseCatalogRefine(new URLSearchParams());
    assert.deepEqual(refine, EMPTY_CATALOG_REFINE);
    assert.equal(catalogRefineIsHot(refine), false);
  });

  it('parses flag params and linkFilter refine', () => {
    const refine = parseCatalogRefine(
      new URLSearchParams(
        'linkFilter=active_linked&pending=1&inactive=true&noChannels=1&noManuals=1&noQc=1',
      ),
    );
    assert.deepEqual(refine, {
      linkFilter: 'active_linked',
      pendingOnly: true,
      inactiveOnly: true,
      missingChannels: true,
      missingManuals: true,
      missingQc: true,
    });
    assert.equal(catalogRefineIsHot(refine), true);
  });

  it('writes and clears refine params', () => {
    const params = new URLSearchParams('view=catalog&q=bose');
    applyCatalogRefineParams(params, {
      linkFilter: 'unlinked_pending',
      pendingOnly: true,
      missingQc: true,
    });
    assert.equal(params.get('linkFilter'), 'unlinked_pending');
    assert.equal(params.get('pending'), '1');
    assert.equal(params.get('noQc'), '1');
    assert.equal(params.get('q'), 'bose');

    applyCatalogRefineParams(params, null);
    assert.equal(params.get('linkFilter'), null);
    assert.equal(params.get('pending'), null);
    assert.equal(params.get('noQc'), null);
    assert.equal(params.get('view'), 'catalog');
  });

  it('clears linkFilter when set back to all', () => {
    const params = new URLSearchParams('linkFilter=active_linked');
    applyCatalogRefineParams(params, { linkFilter: 'all' });
    assert.equal(params.get('linkFilter'), null);
  });

  it('filters rows by client refine flags', () => {
    const rows = [
      {
        is_active: true,
        has_pending_action: true,
        platform_count: 0,
        manual_count: 1,
        qc_step_count: 0,
      },
      {
        is_active: false,
        has_pending_action: false,
        platform_count: 2,
        manual_count: 0,
        qc_step_count: 3,
      },
    ];

    assert.equal(applyCatalogRefine(rows, { ...EMPTY_CATALOG_REFINE, pendingOnly: true }).length, 1);
    assert.equal(applyCatalogRefine(rows, { ...EMPTY_CATALOG_REFINE, inactiveOnly: true }).length, 1);
    assert.equal(
      applyCatalogRefine(rows, { ...EMPTY_CATALOG_REFINE, missingChannels: true }).length,
      1,
    );
    assert.equal(
      applyCatalogRefine(rows, {
        ...EMPTY_CATALOG_REFINE,
        missingManuals: true,
        missingQc: true,
      }).length,
      0,
    );
  });
});
