import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyProfile,
  headerSignature,
  matchProfile,
  normalizeHeader,
  readStoredProfiles,
  removeProfile,
  upsertProfile,
  type ImportMappingProfile,
} from './mapping-profiles';

const SUPPLIER: ImportMappingProfile = {
  name: 'Supplier — October',
  headers: ['Order #', 'Item Title', 'Qty Ordered', 'Ship By'],
  mapping: {
    order_number: 'Order #',
    item_title: 'Item Title',
    quantity: 'Qty Ordered',
    ship_by: 'Ship By',
  },
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('normalizeHeader', () => {
  it('folds case and surrounding space', () => {
    assert.equal(normalizeHeader('  Order #  '), 'order #');
  });

  it('strips the BOM a spreadsheet export leaves on the first column', () => {
    assert.equal(normalizeHeader('﻿Order #'), 'order #');
  });

  it('does NOT collapse different words — that is the alias map’s job', () => {
    // Two rulesets for one question is how the two would disagree.
    assert.notEqual(normalizeHeader('Order #'), normalizeHeader('Order Number'));
  });
});

describe('headerSignature', () => {
  it('is order-independent — a reordered export is the same supplier', () => {
    assert.equal(
      headerSignature(['Order #', 'Item Title']),
      headerSignature(['Item Title', 'Order #']),
    );
  });

  it('ignores duplicates and blanks', () => {
    assert.equal(headerSignature(['A', 'A', '', '  ']), headerSignature(['A']));
  });
});

describe('matchProfile', () => {
  it('finds nothing when there are no profiles', () => {
    assert.equal(matchProfile([], ['Order #']), null);
  });

  it('matches an identical header row exactly', () => {
    const hit = matchProfile([SUPPLIER], [...SUPPLIER.headers]);
    assert.equal(hit?.kind, 'exact');
    assert.equal(hit?.coverage, 1);
  });

  it('matches exactly even when the columns moved', () => {
    const hit = matchProfile([SUPPLIER], ['Ship By', 'Order #', 'Qty Ordered', 'Item Title']);
    assert.equal(hit?.kind, 'exact');
  });

  it('matches PARTIALLY when the file gained a column', () => {
    const hit = matchProfile([SUPPLIER], [...SUPPLIER.headers, 'Cust Ref']);
    assert.equal(hit?.kind, 'partial');
    assert.equal(hit?.coverage, 1);
  });

  it('matches partially when the file LOST a column', () => {
    const hit = matchProfile([SUPPLIER], ['Order #', 'Item Title', 'Qty Ordered']);
    assert.equal(hit?.kind, 'partial');
    assert.equal(hit?.coverage, 0.75);
  });

  it('offers NOTHING below the floor — a wrong mapping beats no mapping only in theory', () => {
    assert.equal(matchProfile([SUPPLIER], ['Order #', 'Totally', 'Different', 'Sheet']), null);
  });

  it('prefers the higher-coverage profile', () => {
    const loose: ImportMappingProfile = {
      ...SUPPLIER,
      name: 'Loose',
      headers: ['Order #', 'Item Title', 'Qty Ordered', 'Ship By', 'Cust Ref', 'Notes'],
    };
    const hit = matchProfile([loose, SUPPLIER], [...SUPPLIER.headers]);
    assert.equal(hit?.profile.name, SUPPLIER.name, 'the exact match wins outright');
  });

  it('breaks a coverage tie with the most recently used profile', () => {
    const older: ImportMappingProfile = {
      ...SUPPLIER,
      name: 'Older',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const newer: ImportMappingProfile = {
      ...SUPPLIER,
      name: 'Newer',
      updatedAt: '2026-08-30T00:00:00.000Z',
    };
    // Both partial at the same coverage — one column missing from the file.
    const headers = ['Order #', 'Item Title', 'Qty Ordered'];
    assert.equal(matchProfile([older, newer], headers)?.profile.name, 'Newer');
    assert.equal(matchProfile([newer, older], headers)?.profile.name, 'Newer');
  });
});

describe('applyProfile', () => {
  it('returns the mapping when every header is present', () => {
    assert.deepEqual(applyProfile(SUPPLIER, [...SUPPLIER.headers]), {
      order_number: 'Order #',
      item_title: 'Item Title',
      quantity: 'Qty Ordered',
      ship_by: 'Ship By',
    });
  });

  it('DROPS a binding whose column this file does not have', () => {
    // Keeping it would read as mapped in the UI and resolve to blank in every
    // row. Dropping it puts the field back in the unmapped count, where the
    // operator will actually see it.
    const out = applyProfile(SUPPLIER, ['Order #', 'Item Title', 'Qty Ordered']);
    assert.equal('ship_by' in out, false);
    assert.equal(out.order_number, 'Order #');
  });

  it("uses the FILE's spelling, not the profile's", () => {
    // The parser looks the header up by what is actually in the file.
    const out = applyProfile(SUPPLIER, ['ORDER #', 'Item Title', 'Qty Ordered', 'Ship By']);
    assert.equal(out.order_number, 'ORDER #');
  });

  it('is empty for a file that shares nothing', () => {
    assert.deepEqual(applyProfile(SUPPLIER, ['a', 'b']), {});
  });
});

describe('upsertProfile / removeProfile', () => {
  it('adds a new profile', () => {
    assert.equal(upsertProfile([], SUPPLIER).length, 1);
  });

  it('REPLACES by name rather than growing a near-duplicate', () => {
    const renamedCase = { ...SUPPLIER, name: 'supplier — october', mapping: { a: 'b' } };
    const out = upsertProfile([SUPPLIER], renamedCase);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0]!.mapping, { a: 'b' });
  });

  it('trims the stored name', () => {
    const out = upsertProfile([], { ...SUPPLIER, name: '  Padded  ' });
    assert.equal(out[0]!.name, 'Padded');
  });

  it('refuses a blank name instead of storing an unnameable row', () => {
    assert.deepEqual(upsertProfile([], { ...SUPPLIER, name: '   ' }), []);
  });

  it('removes by name, case-insensitively', () => {
    assert.deepEqual(removeProfile([SUPPLIER], 'SUPPLIER — OCTOBER'), []);
  });
});

describe('readStoredProfiles', () => {
  it('reads a well-formed blob', () => {
    assert.equal(readStoredProfiles([SUPPLIER]).length, 1);
  });

  it('returns [] for anything that is not an array', () => {
    for (const raw of [null, undefined, {}, 'x', 3]) {
      assert.deepEqual(readStoredProfiles(raw), []);
    }
  });

  it('DROPS a malformed entry rather than repairing it', () => {
    // A half-understood mapping silently writing the wrong column into live
    // orders is the one outcome worth being strict about.
    const raw = [
      { ...SUPPLIER },
      { name: '', headers: ['A'], mapping: { a: 'A' } },
      { name: 'no headers', headers: [], mapping: { a: 'A' } },
      { name: 'no mapping', headers: ['A'], mapping: {} },
      { name: 'mapping not an object', headers: ['A'], mapping: 'nope' },
      { name: 'headers not an array', headers: 'A', mapping: { a: 'A' } },
      null,
    ];
    const out = readStoredProfiles(raw);
    assert.deepEqual(out.map((p) => p.name), [SUPPLIER.name]);
  });

  it('drops non-string mapping values but keeps the rest of the row', () => {
    const out = readStoredProfiles([
      { name: 'Mixed', headers: ['A', 'B'], mapping: { a: 'A', b: 7, c: null } },
    ]);
    assert.deepEqual(out[0]!.mapping, { a: 'A' });
  });
});
