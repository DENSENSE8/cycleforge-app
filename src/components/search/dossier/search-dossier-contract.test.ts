/** FIND dossier contract — one chrome tree for every `?sel=` type. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FIND_EVENT_KINDS,
  presentFindDossier,
  type FindDossier,
  type FindDossierDraft,
  type FindEvent,
  type FindEventKind,
} from '@/lib/search/find-dossier-model';
import { SearchDossierFrame } from './SearchDossierFrame';

const ENTITY_LABEL: Record<FindDossier['entityType'], string> = {
  order: 'Order',
  unit: 'Unit',
  receiving: 'Carton',
  sku: 'SKU',
  repair: 'Repair',
  fba: 'FBA',
};

function ev(partial: Pick<FindEvent, 'id' | 'kind' | 'at'> & Partial<FindEvent>): FindEvent {
  return { title: partial.kind, ...partial };
}

/** Org-1 shapes from §8: same chrome, different kinds. Findings empty on purpose. */
const DRAFTS: FindDossierDraft[] = [
  {
    entityType: 'order',
    id: 13924,
    title: '113-1397006-0292212',
    status: 'shipped',
    facts: [
      { id: 'status', label: 'Status', value: 'shipped' },
      { id: 'order', label: 'Order', value: '113-1397006-0292212' },
      { id: 'tracking', label: 'Tracking', value: '9405508106244533289572' },
    ],
    findings: [],
    handoffs: [{ href: '/shipping/orders?openOrderId=13924', label: 'Open on To-ship', primary: true }],
    events: [
      ev({ id: 'qty:order', kind: 'qty', at: '2026-09-01T00:00:00.000Z', qty: { ordered: 1, shipped: 1 } }),
      ev({
        id: 'sal:1',
        kind: 'custody',
        at: '2026-09-02T00:00:00.000Z',
        title: 'Scanned out',
        actor: 'Michael',
        bind: { tracking: '9405508106244533289572' },
      }),
      ev({
        id: 'carrier-shipment',
        kind: 'carrier',
        at: '2026-09-03T00:00:00.000Z',
        title: 'Shipment',
        children: [ev({ id: 'carrier:1', kind: 'custody', at: '2026-09-03T00:00:00.000Z', title: 'In transit' })],
      }),
    ],
  },
  {
    entityType: 'unit',
    id: 2562,
    title: '078338982650888AE',
    status: 'in stock',
    facts: [
      { id: 'status', label: 'Status', value: 'in stock' },
      { id: 'location', label: 'Location', value: 'A-01' },
      { id: 'serial', label: 'Serial', value: '078338982650888AE' },
    ],
    findings: [],
    handoffs: [{ href: '/inventory?unit=2562', label: 'Open inventory', primary: true }],
    events: [
      ev({ id: 'inv:1', kind: 'custody', at: '2026-08-30T00:00:00.000Z', title: 'Received', stationCaption: 'Unbox' }),
      ev({
        id: 'evidence:unit',
        kind: 'evidence',
        at: '2026-08-30T01:00:00.000Z',
        title: 'Photos',
        evidenceUrls: ['https://example.test/p1.jpg'],
      }),
      ev({ id: 'inv:2', kind: 'note', at: '2026-08-31T00:00:00.000Z', title: 'Tested clean' }),
    ],
  },
  {
    entityType: 'receiving',
    id: 52695,
    title: 'R-52695',
    status: 'matched',
    facts: [
      { id: 'status', label: 'Status', value: 'matched' },
      { id: 'po', label: 'PO', value: 'PO-1' },
    ],
    findings: [],
    handoffs: [{ href: '/unbox', label: 'Open Unbox', primary: false }],
    events: [
      ev({ id: 'qty:carton', kind: 'qty', at: '2026-08-28T00:00:00.000Z', qty: { ordered: 2, received: 2 } }),
      ev({ id: 'bind:carton', kind: 'bind', at: '2026-08-28T00:00:00.000Z', title: 'Linked', bind: { tracking: '1Z' } }),
      ev({ id: 'carton:1', kind: 'exception', at: '2026-08-29T00:00:00.000Z', title: 'Held', resolved: false }),
    ],
  },
  {
    entityType: 'sku',
    id: 2486,
    title: '01091-BK',
    status: 'catalog',
    facts: [
      { id: 'status', label: 'Status', value: 'catalog' },
      { id: 'sku', label: 'SKU', value: '01091-BK' },
    ],
    findings: [],
    handoffs: [{ href: '/products?sku=2486', label: 'Open products', primary: true }],
    events: [],
  },
];

function paint(dossier: FindDossier): string {
  return renderToStaticMarkup(
    React.createElement(SearchDossierFrame, {
      entity: ENTITY_LABEL[dossier.entityType],
      title: dossier.title,
      findings: dossier.findings,
      facts: dossier.facts,
      outline: dossier.outline,
      events: dossier.events,
      emptyLines: 'No chronology yet.',
      handoffs: dossier.handoffs,
    }),
  );
}

/** Every `data-testid="search-dossier-*"` band in paint order. */
function bandOrder(html: string): string[] {
  return [...html.matchAll(/data-testid="(search-dossier(?:-[a-z-]+)?)"/g)].map((m) => m[1]);
}

const DOSSIERS = DRAFTS.map((draft) => presentFindDossier(draft));

describe('FIND dossier contract — status first', () => {
  for (const dossier of DOSSIERS) {
    it(`${dossier.entityType}: the status pin is the first band and carries the badge`, () => {
      const html = paint(dossier);
      const bands = bandOrder(html);
      assert.equal(bands[0], 'search-dossier', 'the article wraps the column');
      assert.equal(bands[1], 'search-dossier-status-row', `status must be the first band, got ${bands[1]}`);
      const statusRow = html.indexOf('data-testid="search-dossier-status-row"');
      const entity = html.indexOf('data-testid="search-dossier-entity"');
      const badge = html.slice(statusRow, entity);
      assert.match(badge, new RegExp(dossier.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      assert.doesNotMatch(html, /search-dossier-banner|search-dossier-identity|search-dossier-pipeline/);
    });
  }
});

describe('FIND dossier contract — one chrome tree', () => {
  it('band order is identical across order / unit / carton / SKU', () => {
    const orders = DOSSIERS.map((dossier) => bandOrder(paint(dossier)).filter((b) => b !== 'search-dossier-outline-kinds' && b !== 'search-dossier-outline-overview' && b !== 'search-dossier-facts').join(' > '));
    for (const order of orders) assert.equal(order, orders[0]);
    assert.equal(
      orders[0],
      [
        'search-dossier',
        'search-dossier-status-row',
        'search-dossier-entity',
        'search-dossier-investigation',
        'search-dossier-outline',
        'search-dossier-chronology',
        'search-dossier-contents',
        'search-dossier-handoff',
      ].join(' > '),
    );
  });
});

describe('FIND dossier contract — handoff present, only write path', () => {
  for (const dossier of DOSSIERS) {
    it(`${dossier.entityType}: paints the handoff link and no form controls`, () => {
      const html = paint(dossier);
      const handoffAt = html.indexOf('data-testid="search-dossier-handoff"');
      assert.ok(handoffAt >= 0, 'handoff band missing');
      const handoff = html.slice(handoffAt);
      for (const h of dossier.handoffs) {
        assert.match(handoff, new RegExp(`href="${h.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;')}"`));
        assert.match(handoff, new RegExp(h.label));
      }
      assert.doesNotMatch(html, /<form|<textarea|<input|<select/);
    });
  }
});

describe('FIND dossier contract — empty kinds omitted', () => {
  for (const dossier of DOSSIERS) {
    it(`${dossier.entityType}: outline and stream carry only kinds that exist`, () => {
      const present = new Set<FindEventKind>(dossier.outline.map((entry) => entry.kind));
      for (const entry of dossier.outline) assert.ok(entry.count > 0, `${entry.kind} has count 0`);
      const html = paint(dossier);
      for (const kind of FIND_EVENT_KINDS) {
        const painted = html.includes(`data-kind="${kind}"`);
        assert.equal(painted, present.has(kind), `${kind}: painted=${painted} outline=${present.has(kind)}`);
      }
    });
  }

  it('SKU with no stream paints no outline chips and no stream', () => {
    const sku = DOSSIERS.find((dossier) => dossier.entityType === 'sku');
    assert.ok(sku);
    assert.deepEqual(sku.outline, []);
    const html = paint(sku);
    assert.doesNotMatch(html, /search-dossier-outline-kinds/);
    assert.doesNotMatch(html, /search-find-stream/);
    assert.match(html, /No chronology yet\./);
  });

  it('carrier children count as hops in the outline (nested hops are truthful)', () => {
    const order = DOSSIERS.find((dossier) => dossier.entityType === 'order');
    assert.ok(order);
    const hop = order.outline.find((entry) => entry.kind === 'custody');
    assert.equal(hop?.count, 2);
    assert.equal(order.outline.find((entry) => entry.kind === 'carrier')?.count, 1);
  });
});
