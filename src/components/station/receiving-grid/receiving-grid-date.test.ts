import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivingActivityDateCell } from './receiving-grid-date';

describe('receivingActivityDateCell', () => {
  it('paints civil day on the face and a short day · time tip', () => {
    const cell = receivingActivityDateCell('2026-08-06T16:54:00-07:00');
    assert.ok(cell);
    assert.equal(cell!.label, 'Aug 6');
    assert.equal(cell!.tooltip, 'Thu, Aug 6, 2026 · 4:54 PM');
    // No stage / staff biography — that lives on the row inspector.
    assert.doesNotMatch(cell!.tooltip, /Unboxed|Scanned| by /);
  });

  it('returns null for missing / sentinel instants', () => {
    assert.equal(receivingActivityDateCell(null), null);
    assert.equal(receivingActivityDateCell(''), null);
    assert.equal(receivingActivityDateCell('1'), null);
  });
});
