import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchDossierFrame } from './SearchDossierFrame';

describe('SearchDossierFrame', () => {
  it('paints status pin, outline, chronology, findings, and sticky handoff', () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchDossierFrame, {
        entity: 'Order',
        title: 'Bose remote',
        outline: [{ kind: 'exception', count: 1 }, { kind: 'bind', count: 1 }],
        findings: [
          {
            key: 'unpaired',
            label: 'Unpaired SKU',
            hint: 'Clear this on the exceptions desk.',
            href: '/shipping/exceptions?order=1',
            hrefLabel: 'Open exceptions',
          },
        ],
        facts: [
          { id: 'status', label: 'Status', value: 'pending' },
          { id: 'sku', label: 'SKU', value: 'SKU-1' },
        ],
        lines: [{ id: 1, title: 'Bose remote', meta: 'SKU-1 · qty 1', finding: null }],
        emptyLines: 'No item',
        handoffs: [{ href: '/shipping/exceptions?order=1', label: 'Open exceptions', primary: true }],
      }),
    );
    assert.match(html, /data-testid="search-dossier"/);
    assert.match(html, /data-testid="search-dossier-status-row"/);
    assert.match(html, /data-testid="search-dossier-outline"/);
    assert.match(html, /data-testid="search-dossier-findings"/);
    assert.match(html, /Unpaired SKU/);
    assert.match(html, /data-testid="search-dossier-facts"/);
    assert.match(html, /data-testid="search-dossier-chronology"/);
    assert.match(html, /data-testid="search-dossier-contents"/);
    assert.match(html, /data-testid="search-dossier-handoff"/);
    assert.match(html, /data-testid="search-dossier-investigation"/);
    assert.match(html, /data-testid="search-dossier-outline-overview"/);
    assert.doesNotMatch(html, /lg:hidden/);
    assert.doesNotMatch(html, /search-dossier-banner/);
    assert.doesNotMatch(html, /search-dossier-pipeline/);
    assert.doesNotMatch(html, /search-dossier-identity/);
    assert.doesNotMatch(html, /search-dossier-toolbar/);
    assert.doesNotMatch(html, /bg-surface-station-well/);
    const status = html.indexOf('data-testid="search-dossier-status-row"');
    const outline = html.indexOf('data-testid="search-dossier-outline"');
    const chronology = html.indexOf('data-testid="search-dossier-chronology"');
    const handoff = html.indexOf('data-testid="search-dossier-handoff"');
    assert.ok(status >= 0 && outline > status && chronology > outline && handoff > chronology);
  });

  it('omits the findings band when the record is clean', () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchDossierFrame, {
        entity: 'Order',
        title: 'Clean order',
        findings: [],
        facts: [{ id: 'status', label: 'Status', value: 'packed' }],
        lines: [{ id: 1, title: 'Item', meta: 'SKU' }],
        emptyLines: 'No item',
        handoffs: [{ href: '/shipping/orders?openOrderId=1', label: 'Open on To-ship', primary: true }],
      }),
    );
    assert.doesNotMatch(html, /data-testid="search-dossier-findings"/);
  });

  it('always paints the top status row even with no facts', () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchDossierFrame, {
        entity: 'Order',
        title: 'Bare',
        findings: [],
        facts: [],
        lines: [],
        emptyLines: 'No item',
        handoffs: [],
      }),
    );
    assert.match(html, /data-testid="search-dossier-status-row"/);
    assert.match(html, /data-testid="search-dossier-outline"/);
    assert.match(html, /data-testid="search-dossier-chronology"/);
  });

  it('paints stream faces in chronology when events exist', () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchDossierFrame, {
        entity: 'Order',
        title: 'Bose remote',
        findings: [],
        facts: [{ id: 'status', label: 'Status', value: 'open' }],
        outline: [{ kind: 'hop', count: 1 }],
        events: [
          {
            id: 'h1',
            kind: 'hop',
            at: '2026-09-01T00:00:00.000Z',
            title: 'Received',
            stationCaption: 'Unbox',
            bind: { serial: 'AE1' },
          },
        ],
        emptyLines: 'No chronology',
        handoffs: [{ href: '/shipping/orders', label: 'Open on To-ship', primary: true }],
      }),
    );
    assert.match(html, /data-testid="search-find-stream"/);
    assert.match(html, /data-kind="hop"/);
    assert.match(html, /Received/);
    assert.doesNotMatch(html, /data-kind="note"/);
  });

  it('keeps one chronology tree (density classes only)', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'SearchDossierFrame.tsx'),
      'utf8',
    );
    assert.equal((src.match(/data-testid="search-dossier-chronology"/g) || []).length, 1);
    assert.doesNotMatch(src, /lg:hidden/);
    assert.doesNotMatch(src, /FilterRefinementBar/);
  });

  it('omits empty outline kinds', () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchDossierFrame, {
        entity: 'Order',
        title: 'Bose remote',
        outline: [{ kind: 'qty', count: 2 }],
        findings: [],
        facts: [{ id: 'status', label: 'Status', value: 'pending' }],
        lines: [{ id: 1, title: 'Bose remote', meta: 'SKU-1 · qty 1' }],
        emptyLines: 'No item',
        handoffs: [{ href: '/shipping/orders', label: 'Open on To-ship', primary: true }],
      }),
    );
    assert.match(html, /Qty/);
    assert.doesNotMatch(html, />Hops</);
    assert.doesNotMatch(html, />Notes</);
  });
});
