/**
 * Shortage coverage display — pin the Bose Amazon OOS sheet and the two faces
 * staging + live must never drift from.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SHORTAGE_COVERAGE_AWAITING,
  SHORTAGE_COVERAGE_UNCOVERED,
  TABLE_IMPORT_TRIAGE_LABEL,
  formatShortageCoverage,
  formatShortageCoverageEta,
  normalizeShortageCoverageToken,
  parseShortageCoverageFacts,
  parseShortageShortQty,
  shortageCoverageFace,
  shortageCoverageFromWire,
  shortageRowNamesProduct,
  tableImportTriagePaint,
} from './shortage-coverage';

describe('formatShortageCoverage — the live + staging face', () => {
  it('uncovered when PO and inbound are blank (ETA-only still Uncovered)', () => {
    assert.equal(
      formatShortageCoverage({ poNumber: null, inboundTracking: null, eta: null }),
      SHORTAGE_COVERAGE_UNCOVERED,
    );
    assert.equal(
      formatShortageCoverage({
        poNumber: null,
        inboundTracking: null,
        eta: '2026-09-04',
      }),
      `${SHORTAGE_COVERAGE_UNCOVERED} · ETA Sep 4`,
    );
  });

  it('awaiting inbound with optional PO and ETA — never paints the inbound TRK', () => {
    assert.equal(
      formatShortageCoverage({
        poNumber: '4501',
        inboundTracking: '9261290983197850083534',
        eta: '9/4/2026',
      }),
      `${SHORTAGE_COVERAGE_AWAITING} · PO 4501 · ETA Sep 4`,
    );
    assert.equal(
      formatShortageCoverage({
        poNumber: null,
        inboundTracking: '9261290983197850083534',
        eta: null,
      }),
      SHORTAGE_COVERAGE_AWAITING,
    );
    assert.doesNotMatch(
      formatShortageCoverage({
        poNumber: 'PO 99',
        inboundTracking: '1Z999',
        eta: null,
      }),
      /1Z999/,
    );
  });

  it('does not double the PO prefix', () => {
    assert.equal(
      formatShortageCoverage({
        poNumber: 'PO #4501',
        inboundTracking: null,
        eta: null,
      }),
      `${SHORTAGE_COVERAGE_AWAITING} · PO 4501`,
    );
  });

  it('staging string bags and live jsonb paint the same Bose face', () => {
    const fromFile = shortageCoverageFace({
      poNumber: null,
      inboundTracking: '9261290983197850083534',
      eta: 'Tracking Not Available',
    });
    const fromStore = shortageCoverageFromWire({
      po_number: null,
      inbound_tracking: '9261290983197850083534',
      eta: 'Tracking Not Available',
    }).label;
    assert.equal(fromFile, fromStore);
    assert.equal(fromFile, SHORTAGE_COVERAGE_AWAITING);
  });
});

describe('normalizeShortageCoverageToken', () => {
  it('drops Tracking Not Available (the Bose ETA cell) and blanks', () => {
    assert.equal(normalizeShortageCoverageToken('Tracking Not Available'), null);
    assert.equal(normalizeShortageCoverageToken('n/a'), null);
    assert.equal(normalizeShortageCoverageToken('  '), null);
    assert.equal(
      normalizeShortageCoverageToken('9261290983197850083534'),
      '9261290983197850083534',
    );
  });
});

describe('parseShortageCoverageFacts', () => {
  it('reads jsonb snake_case and camelCase', () => {
    assert.deepEqual(
      parseShortageCoverageFacts({
        po_number: '11',
        inbound_tracking: 'Tracking Not Available',
        eta: '2026-08-28',
      }),
      { poNumber: '11', inboundTracking: null, eta: '2026-08-28' },
    );
  });

  it('hostile values degrade to uncovered facts', () => {
    assert.deepEqual(parseShortageCoverageFacts(null), {
      poNumber: null,
      inboundTracking: null,
      eta: null,
    });
    assert.deepEqual(parseShortageCoverageFacts('awaiting'), {
      poNumber: null,
      inboundTracking: null,
      eta: null,
    });
  });
});

describe('formatShortageCoverageEta', () => {
  it('formats ISO and US civil dates without a year', () => {
    assert.equal(formatShortageCoverageEta('2026-08-28'), 'Aug 28');
    assert.equal(formatShortageCoverageEta('8/28/2026'), 'Aug 28');
  });
});

describe('classify helpers', () => {
  it('Bose title names the product without a SKU', () => {
    assert.equal(
      shortageRowNamesProduct({
        sku: '',
        itemNumber: '',
        itemTitle: 'Bose TV Speaker - Bluetooth, HDMI ARC',
      }),
      true,
    );
    assert.equal(shortageRowNamesProduct({ sku: '', itemNumber: '', itemTitle: '' }), false);
  });

  it('short qty must be a positive integer', () => {
    assert.equal(parseShortageShortQty('1'), 1);
    assert.equal(parseShortageShortQty('0'), null);
    assert.equal(parseShortageShortQty(''), null);
    assert.equal(parseShortageShortQty('1.5'), null);
  });
});

describe('tableImportTriagePaint — Ready / Action required never fork', () => {
  it('keeps the golden labels and chip tones', () => {
    assert.equal(tableImportTriagePaint('ready').label, TABLE_IMPORT_TRIAGE_LABEL.ready);
    assert.equal(tableImportTriagePaint('action_required').label, 'Action required');
    assert.equal(tableImportTriagePaint('ready').toneClass, 'bg-emerald-50 text-emerald-700');
    assert.equal(tableImportTriagePaint('action_required').dotClass, 'bg-amber-500');
  });
});
