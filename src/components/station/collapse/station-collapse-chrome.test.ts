import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  StationCollapseAllAction,
  StationCollapsibleBlock,
  StationExpandAllAction,
} from './StationCollapsibleBlock';
import { StationBandStack } from './StationBandStack';
import {
  BAND_COLLAPSE_INITIAL,
  bandCollapseReducer,
  isBandOpen,
} from './band-collapse';

/**
 * The station centre's band chrome.
 *
 * Deliberately a `.test.ts` and not a `.test.tsx`: `run-unit-tests.mjs` globs
 * `*.test.ts` only, so the JSX sibling next door has never run under
 * `npm run verify`. A pin nobody executes is not a pin.
 */
describe('hairline band strip', () => {
  const render = (collapsed: boolean) =>
    renderToStaticMarkup(
      React.createElement(
        StationCollapsibleBlock,
        { face: 'hairline', label: 'Items', collapsed, onToggle: () => {} },
        React.createElement('p', null, 'BAND_BODY'),
      ),
    );

  it('reads from the LEFT edge, where the operator scans the centre', () => {
    // Right-aligned until 2026-08-30 (operator ruling): stacked, three bands
    // read as a ragged column shoved against the Displays rail, and the band
    // names were the one thing missing from the centre's left edge.
    const html = render(false);
    assert.match(html, /justify-start/);
    assert.doesNotMatch(html, /justify-end/);
  });

  it('the whole header row is the disclose hit target — not a 12px seam', () => {
    const html = render(false);
    assert.match(html, /data-collapse-toggle/);
    assert.match(html, /absolute inset-0/);
    assert.match(html, /min-h-8/);
    assert.doesNotMatch(
      html,
      /top-0 z-0 h-3/,
      'the 12px top-seam target is the thing this retired',
    );
  });

  it('paints a trailing chevron so the row reads as a disclosure', () => {
    const open = render(false);
    const shut = render(true);
    assert.match(open, /rotate-0/);
    assert.match(shut, /-rotate-90/);
    assert.match(open, /aria-expanded="true"/);
    assert.match(shut, /aria-expanded="false"/);
  });

  it('still unmounts its body when collapsed — never a height tween', () => {
    assert.match(render(false), /BAND_BODY/);
    assert.doesNotMatch(render(true), /BAND_BODY/);
  });
});

describe('Collapse all — one control, not one per station', () => {
  it('carries one stable test id and accessible name', () => {
    const html = renderToStaticMarkup(
      React.createElement(StationCollapseAllAction, { onCollapseAll: () => {} }),
    );
    assert.match(html, /data-testid="station-collapse-all"/);
    assert.match(html, /aria-label="Collapse all centre bands"/);
    assert.match(html, /Collapse all/);
  });

  it('is not hand-rolled by Unbox or Testing any more', () => {
    // Two copies of a control are two chances for one of them to quietly stop
    // reaching an altitude, on one station only — which is exactly what
    // per-line collapse would have caused. Both stations now hand their bands
    // to one stack, and the stack owns the control.
    for (const path of [
      'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
      'src/components/tech/TestingPanel.tsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      assert.match(src, /<StationBandStack\b/, path);
      assert.doesNotMatch(
        src,
        /data-testid="station-collapse-all"/,
        `${path} still spells the control out by hand`,
      );
      assert.doesNotMatch(
        src,
        /<StationCollapsibleBlock\b/,
        `${path} still stacks bands itself — that is how three empty strips happen`,
      );
    }
  });

  it('Unbox no longer mounts a Placement band — Label is the sticker disclose', () => {
    const src = readFileSync(
      'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
      'utf8',
    );
    assert.doesNotMatch(src, /unbox-band-placement/);
    assert.doesNotMatch(src, /UnboxPlacementSection/);
  });

  it('Unbox and Testing do not auto-collapse the centre on scroll', () => {
    // Scroll-collapse unmounted Items, remounted the serial input, and
    // scrollIntoView yanked the label the operator was reading.
    for (const path of [
      'src/components/receiving/workspace/LineEditPanel.tsx',
      'src/components/tech/TestingPanel.tsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      assert.doesNotMatch(
        src,
        /onScroll=\{bandCollapse\.onScroll\}/,
        `${path} still collapses the centre on scroll`,
      );
    }
  });
});

describe('Expand all — one control, on the first closed header', () => {
  it('carries one stable test id and accessible name', () => {
    const html = renderToStaticMarkup(
      React.createElement(StationExpandAllAction, { onExpandAll: () => {} }),
    );
    assert.match(html, /data-testid="station-expand-all"/);
    assert.match(html, /aria-label="Expand all centre bands"/);
    assert.match(html, /Expand all/);
  });
});

/**
 * ONE layout: a full-width accordion row per band, always in declared order.
 *
 * These walk the sequence the operator reported. Closed bands used to become
 * chips in a wrap rail at the top, so closing a band re-laid-out the centre
 * and opening it re-laid it out back. A band that stays a row, and only
 * unmounts its body, cannot do that.
 */
describe('StationBandStack', () => {
  const BANDS = [
    { id: 'items', label: 'Items', body: React.createElement('p', null, 'ITEMS_BODY') },
    { id: 'label', label: 'Label', body: React.createElement('p', null, 'LABEL_BODY') },
    {
      id: 'placement',
      label: 'Placement',
      body: React.createElement('p', null, 'PLACEMENT_BODY'),
    },
  ];

  /** A real controller over the pure reducer — no hand-faked booleans. */
  function controller(allCollapsed: boolean, pressed: string[] = []) {
    const state = pressed.reduce(
      (s, bandId) => bandCollapseReducer(s, { kind: 'toggle', bandId, allCollapsed }),
      BAND_COLLAPSE_INITIAL,
    );
    return {
      isOpen: (id: string) => isBandOpen(state, id, allCollapsed),
      toggle: () => {},
      open: () => {},
      close: () => {},
      expandAll: () => {},
    };
  }

  const render = (allCollapsed: boolean, pressed: string[] = []) =>
    renderToStaticMarkup(
      React.createElement(StationBandStack, {
        bands: BANDS,
        collapse: controller(allCollapsed, pressed),
        onCollapseAll: () => {},
      }),
    );

  const header = (html: string, id: string) => html.includes(`data-station-band="${id}"`);
  const body = (html: string, id: string) => html.includes(`${id.toUpperCase()}_BODY`);

  it('never paints the retired chip rail', () => {
    for (const html of [render(true), render(false), render(true, ['placement'])]) {
      assert.doesNotMatch(html, /data-station-band-rail/);
    }
  });

  it('keeps every closed band as a full-width header and opens nothing', () => {
    const html = render(true);
    for (const id of ['items', 'label', 'placement']) {
      assert.ok(header(html, id), `${id} stays a row`);
      assert.ok(!body(html, id), `${id} must not also render a body`);
    }
  });

  it('opening ONE band leaves every other header in place', () => {
    // Press Placement out of a fully collapsed centre.
    const html = render(true, ['placement']);

    assert.ok(body(html, 'placement'), 'Placement opened');
    assert.ok(header(html, 'placement'), 'and kept its row');

    assert.ok(header(html, 'items'), 'Items is untouched');
    assert.ok(header(html, 'label'), 'Label is untouched');
    assert.ok(!body(html, 'items'));
    assert.ok(!body(html, 'label'));

    // Declared order, not press order — Items still leads.
    assert.ok(
      html.indexOf('data-station-band="items"') < html.indexOf('PLACEMENT_BODY'),
      'the untouched bands stay in declared order',
    );
  });

  it('closing it again returns exactly that band to a header', () => {
    const html = render(true, ['placement', 'placement']);
    assert.deepEqual(
      ['items', 'label', 'placement'].map((id) => header(html, id)),
      [true, true, true],
    );
    assert.doesNotMatch(html, /_BODY/, 'nothing left open');
  });

  it('opens a second band without moving the first', () => {
    const html = render(true, ['placement', 'items']);
    assert.ok(body(html, 'placement'));
    assert.ok(body(html, 'items'));
    assert.ok(header(html, 'label') && !body(html, 'label'), 'the one still shut stays a header');
    assert.ok(html.indexOf('ITEMS_BODY') < html.indexOf('PLACEMENT_BODY'));
  });

  it('opens every body once nothing is closed', () => {
    const html = render(false);
    for (const id of ['items', 'label', 'placement']) {
      assert.ok(header(html, id));
      assert.ok(body(html, id));
    }
  });

  it('carries exactly one Collapse all, on the first header, while all are open', () => {
    const html = render(false);
    assert.equal((html.match(/data-testid="station-collapse-all"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /station-expand-all/);
    assert.ok(
      html.indexOf('station-collapse-all') < html.indexOf('LABEL_BODY'),
      'it rides the first row, not the last',
    );
  });

  it('offers Expand all, not Collapse all, while every band is shut', () => {
    const html = render(true);
    assert.match(html, /data-testid="station-expand-all"/);
    assert.doesNotMatch(html, /data-testid="station-collapse-all"/);
  });

  it('offers neither all-control in a mixed stack — click the row you mean', () => {
    const html = render(true, ['placement']);
    assert.doesNotMatch(html, /data-testid="station-collapse-all"/);
    assert.doesNotMatch(html, /data-testid="station-expand-all"/);
  });

  it('the header bar is flush — name padding lives on the row, not around it', () => {
    const html = render(false);
    assert.doesNotMatch(html, /bg-surface-card/);
    assert.doesNotMatch(html, /bg-surface-canvas/);
    // Names keep the workbench px-3 inset on the header bar…
    assert.match(html, /px-3/);
    // …but the bar itself must not sit in an outer gutter. `px-3 py-2` on the
    // section was the white margin on every side of LABEL in the scan station.
    assert.doesNotMatch(html, /px-3 py-2/);
    assert.match(html, /bg-border-subtle/);
    assert.doesNotMatch(html, /bg-border-hairline/);
  });

  it('skips the seam above the first thing on the sheet', () => {
    // A rule above the first band is a boundary with nothing on its far side.
    const html = render(false);
    assert.equal(
      (html.match(/bg-border-subtle/g) ?? []).length,
      2,
      'three bands, two boundaries',
    );
  });
});

/**
 * Icons first, then words.
 *
 * A band is recognised by its shape at bench distance long before it is read.
 * The glyph therefore leads in BOTH states, and the two must not disagree.
 */
describe('band identity glyphs', () => {
  const Glyph = ({ className }: { className?: string }) =>
    React.createElement('svg', { className, 'data-band-glyph': true });

  const BANDS = [
    { id: 'status', label: 'Status', icon: Glyph, body: React.createElement('p', null, 'S') },
    { id: 'items', label: 'Items', body: React.createElement('p', null, 'I') },
  ];

  const controller = (allCollapsed: boolean) => ({
    isOpen: () => !allCollapsed,
    toggle: () => {},
    open: () => {},
    close: () => {},
    expandAll: () => {},
  });

  const render = (allCollapsed: boolean, face: 'label' | 'hairline' = 'label') =>
    renderToStaticMarkup(
      React.createElement(StationBandStack, {
        bands: BANDS,
        face,
        collapse: controller(allCollapsed),
      }),
    );

  /**
   * Accessible names legitimately carry the word ("Collapse Status"), and they
   * are attributes on the wrapper — always ahead of the painted glyph. Compare
   * what is PAINTED, or the assertion measures the aria-label instead.
   */
  const painted = (html: string) => html.replace(/aria-label="[^"]*"/g, '');

  for (const face of ['label', 'hairline'] as const) {
    it(`draws the glyph before the word on the ${face} face`, () => {
      const html = painted(render(false, face));
      assert.ok(
        html.indexOf('data-band-glyph') < html.indexOf('Status'),
        'icon first, then the word',
      );
    });
  }

  it('draws the glyph before the word on a closed row too', () => {
    const shown = painted(render(true));
    assert.ok(shown.indexOf('data-band-glyph') < shown.indexOf('Status'));
  });

  it('a band with no glyph still renders — the icon is optional', () => {
    for (const collapsed of [true, false]) {
      assert.match(render(collapsed), /Items/);
    }
  });
});
