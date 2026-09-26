import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import {
  collectKioskTriage,
  countKioskBlockers,
  firstKioskBlocker,
  type KioskTriageSession,
} from '@/lib/kiosk/visit-triage';

function session(over: Partial<KioskTriageSession> = {}): KioskTriageSession {
  return {
    lines: [],
    customerPhone: '503-555-0142',
    customerName: 'Pat Doe',
    customerEmail: 'pat@example.com',
    customerAddress: '12 Main St',
    ...over,
  };
}

function repairLine(over: Record<string, unknown> = {}): KioskCartLine {
  return {
    id: 'l1',
    type: 'REPAIR',
    title: 'Bose 321 repair',
    quantity: 1,
    unitAmountCents: 9900,
    payload: {
      productModel: 'Bose 321',
      serialNumber: 'SN-1',
      price: '99',
      signatureDataUrl: 'data:image/png;base64,x',
      repairNotes: 'no power',
      ...over,
    },
  } as KioskCartLine;
}

function retailLine(over: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 'r1',
    type: 'RETAIL',
    title: 'Cable',
    quantity: 1,
    unitAmountCents: 1200,
    payload: { variationId: null, sku: 'CBL-1' },
    ...over,
  } as KioskCartLine;
}

function buybackLine(over: Record<string, unknown> = {}): KioskCartLine {
  return {
    id: 'b1',
    type: 'BUYBACK',
    title: 'iPhone 12 trade-in',
    quantity: 1,
    unitAmountCents: -15000,
    payload: { imei: '356938035643809', ...over },
  } as KioskCartLine;
}

describe('kiosk visit triage', () => {
  it('an empty cart with no customer blocks on both, cart first', () => {
    const items = collectKioskTriage(
      session({ lines: [], customerPhone: '', customerName: '', customerEmail: '', customerAddress: '' }),
    );
    assert.equal(items[0].id, 'cart:empty');
    assert.equal(items[1].id, 'customer:phone');
    // Identity warnings must not outrank a blocker.
    assert.equal(items.at(-1)?.id, 'customer:address');
  });

  it('a complete visit is clear — no blockers, no gate', () => {
    const s = session({ lines: [repairLine()] });
    assert.deepEqual(collectKioskTriage(s), []);
    assert.equal(firstKioskBlocker(s), null);
    assert.equal(countKioskBlockers(s), 0);
  });

  it('reports EVERY missing repair field, not just the first', () => {
    const s = session({
      lines: [repairLine({ serialNumber: '', price: '', signatureDataUrl: null })],
    });
    const fields = collectKioskTriage(s)
      .filter((i) => i.severity === 'block')
      .map((i) => i.field);
    assert.deepEqual(fields, ['serial', 'price', 'signature']);
    // Each one names the line it belongs to — the old single-string gate could not.
    for (const item of collectKioskTriage(s)) {
      if (item.target === 'line') assert.equal(item.lineTitle, 'Bose 321 repair');
    }
  });

  it('a repair with no issue text warns but does not block', () => {
    const s = session({ lines: [repairLine({ repairNotes: '', repairReasons: [] })] });
    assert.equal(firstKioskBlocker(s), null);
    assert.equal(collectKioskTriage(s).at(0)?.severity, 'warn');
  });

  it('a trade-in without an IMEI blocks — it is the only identifier on the paper', () => {
    const s = session({ lines: [buybackLine({ imei: '' })] });
    assert.equal(countKioskBlockers(s), 1);
    assert.match(firstKioskBlocker(s) ?? '', /IMEI/);
  });

  it('a $0 retail line warns; a zero quantity blocks', () => {
    const zeroPrice = session({ lines: [retailLine({ unitAmountCents: 0 })] });
    assert.equal(countKioskBlockers(zeroPrice), 0);
    const zeroQty = session({ lines: [retailLine({ quantity: 0 })] });
    assert.equal(countKioskBlockers(zeroQty), 1);
  });

  it('two complete repairs on one visit is a NORMAL visit, not a blocker', () => {
    // This used to assert /remove 1 extra/ — a cart-level block that existed only because submit kept the first repair and silently dropped…
    const s = session({
      lines: [repairLine(), { ...repairLine(), id: 'l2' } as KioskCartLine],
    });
    assert.equal(firstKioskBlocker(s), null);
  });

  it('each device still raises its OWN blockers — nothing is under-checked', () => {
    const s = session({
      lines: [
        repairLine(),
        { ...repairLine({ serialNumber: '' }), id: 'l2' } as KioskCartLine,
      ],
    });
    const items = collectKioskTriage(s);
    assert.ok(
      items.some((i) => i.id === 'l2:serial'),
      'the second device is checked as thoroughly as the first',
    );
    assert.equal(items.some((i) => i.id === 'l1:serial'), false);
  });

  it('a short phone blocks even though the field is non-empty', () => {
    const s = session({ lines: [repairLine()], customerPhone: '503' });
    assert.match(firstKioskBlocker(s) ?? '', /incomplete/);
  });

  it('ids are stable per line + field so the panel can key on them', () => {
    const s = session({ lines: [repairLine({ serialNumber: '' })] });
    assert.equal(collectKioskTriage(s)[0].id, 'l1:serial');
    assert.deepEqual(collectKioskTriage(s), collectKioskTriage(s));
  });
});
