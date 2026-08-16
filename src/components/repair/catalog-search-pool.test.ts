/**
 * Catalog search-pool choice — drives the shipped helpers ProductSelector uses.
 * Kiosk-split first-page paint (showAllProducts) must still hydrate the
 * whole-catalog pool so a query like "Wave Radio II" is not a first-page miss.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  isCatalogRootSearchLevel,
  resolveCatalogProductPool,
  shouldHydrateRootSearchPool,
} from './catalog-search-pool';

const SELECTOR = join(process.cwd(), 'src/components/repair/ProductSelector.tsx');

const firstPage = [
  { id: '1', name: 'Bose 321 GSX', sku: '00128-RS' },
  { id: '2', name: 'Bose 321 Series I', sku: '00074-RS' },
];
const waveRadio = { id: '99', name: 'Wave Radio II', sku: 'wave-ii' };
const wholeCatalog = [...firstPage, waveRadio];

describe('isCatalogRootSearchLevel', () => {
  it('stays root on kiosk-split all-products first-page paint', () => {
    assert.equal(
      isCatalogRootSearchLevel({
        currentCategoryId: null,
        showAllProducts: true,
        kioskSplit: true,
      }),
      true,
    );
  });

  it('leaves root when staff stacked opens All products', () => {
    assert.equal(
      isCatalogRootSearchLevel({
        currentCategoryId: null,
        showAllProducts: true,
        kioskSplit: false,
      }),
      false,
    );
  });

  it('leaves root when a category is drilled', () => {
    assert.equal(
      isCatalogRootSearchLevel({
        currentCategoryId: 'cat-speakers',
        showAllProducts: true,
        kioskSplit: true,
      }),
      false,
    );
  });

  it('is root on staff stacked before All products', () => {
    assert.equal(
      isCatalogRootSearchLevel({
        currentCategoryId: null,
        showAllProducts: false,
        kioskSplit: false,
      }),
      true,
    );
  });
});

describe('shouldHydrateRootSearchPool', () => {
  it('hydrates the 100-item pool on a 2+ char root query when the pool is empty', () => {
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel: true,
        search: 'Wave Radio II',
        hasPool: false,
      }),
      true,
    );
  });

  it('does not start-guard on a loading flag — rootSearchPool is the once-only latch', () => {
    const helper = readFileSync(
      join(process.cwd(), 'src/components/repair/catalog-search-pool.ts'),
      'utf8',
    );
    assert.doesNotMatch(helper, /loading: boolean/);
    assert.doesNotMatch(helper, /opts\.loading/);
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel: true,
        search: 'Wave Radio II',
        hasPool: false,
      }),
      true,
    );
  });

  it('does not hydrate on a one-character keystroke or when already loaded', () => {
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel: true,
        search: 'W',
        hasPool: false,
      }),
      false,
    );
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel: true,
        search: 'Wave',
        hasPool: true,
      }),
      false,
    );
  });

  it('does not hydrate when a category is drilled (not root)', () => {
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel: false,
        search: 'Wave Radio II',
        hasPool: false,
      }),
      false,
    );
  });
});

describe('resolveCatalogProductPool', () => {
  it('uses the whole-catalog pool for a kiosk all-products query so Wave Radio II is a hit', () => {
    const isAtRootLevel = isCatalogRootSearchLevel({
      currentCategoryId: null,
      showAllProducts: true,
      kioskSplit: true,
    });
    assert.equal(isAtRootLevel, true);
    assert.equal(
      shouldHydrateRootSearchPool({
        isAtRootLevel,
        search: 'Wave Radio II',
        hasPool: false,
      }),
      true,
    );

    const pool = resolveCatalogProductPool({
      isAtRootLevel,
      search: 'Wave Radio II',
      rootSearchPool: wholeCatalog,
      products: firstPage,
    });
    assert.equal(pool, wholeCatalog);
    assert.ok(pool.some((p) => p.name === 'Wave Radio II'));
    assert.equal(
      firstPage.some((p) => p.name === 'Wave Radio II'),
      false,
    );
  });

  it('keeps the first-page paint when the query is empty', () => {
    const pool = resolveCatalogProductPool({
      isAtRootLevel: true,
      search: '',
      rootSearchPool: wholeCatalog,
      products: firstPage,
    });
    assert.equal(pool, firstPage);
  });

  it('filters the category page when not at root', () => {
    const pool = resolveCatalogProductPool({
      isAtRootLevel: false,
      search: 'Wave Radio II',
      rootSearchPool: wholeCatalog,
      products: firstPage,
    });
    assert.equal(pool, firstPage);
    assert.equal(
      pool.some((p) => p.name === 'Wave Radio II'),
      false,
    );
  });
});

describe('ProductSelector wires the shipped pool helpers', () => {
  const src = readFileSync(SELECTOR, 'utf8');

  it('does not use the showAllProducts-kills-root formula', () => {
    assert.doesNotMatch(src, /const isAtRootLevel = !currentCategoryId && !showAllProducts/);
    assert.match(src, /isCatalogRootSearchLevel\(/);
    assert.match(src, /shouldHydrateRootSearchPool\(/);
    assert.match(src, /resolveCatalogProductPool\(/);
    assert.match(src, /from '\.\/catalog-search-pool'/);
  });

  it('does not list loadingRootSearch as a hydrate-effect dep or start-guard', () => {
    assert.doesNotMatch(
      src,
      /\[isAtRootLevel, search, rootSearchPool, loadingRootSearch, apiBasePath\]/,
    );
    assert.match(src, /\[isAtRootLevel, search, rootSearchPool, apiBasePath\]/);
    assert.doesNotMatch(src, /loading: loadingRootSearch/);
    assert.match(src, /hasPool: Boolean\(rootSearchPool\)/);
  });
});
