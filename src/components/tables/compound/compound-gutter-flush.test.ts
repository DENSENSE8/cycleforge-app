import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOUND_TRACKS } from './compound-columns';
import { renderCompoundGridCell } from './CompoundGridCell';
import type { CompoundRowView } from './compound-row-model';

/** The two GUTTERS render edge to edge; every other track keeps its inset. */

const VIEW: CompoundRowView = {
  id: '1',
  thumbUrl: null,
  title: 'A thing',
  note: 'a note',
  orderId: 'ORD-1',
  tracking: '1Z999',
  platformValue: null,
  carrier: null,
  stateLabel: 'PENDING',
  stateTone: 'neutral',
  delay: null,
  amount: null,
};

const paint = (key: string, detail?: { open: boolean }) =>
  renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderCompoundGridCell({
        col: COMPOUND_TRACKS.find((c) => c.key === key)!,
        columns: COMPOUND_TRACKS,
        rule: true,
        view: VIEW,
        onOpen: () => {},
        select: {
          checked: false,
          onToggle: () => {},
          label: 'Select row',
          // A row with a DETAIL chevron is the case every Orders row is in, and
          // the case the detail-less paint below cannot see.
          detail: detail
            ? { open: detail.open, onToggle: () => {}, label: 'this line' }
            : undefined,
        },
      }) as React.ReactElement,
    ),
  );

describe('the compound gutters are flush', () => {
  for (const key of ['select', 'thumb']) {
    it(`${key} emits no horizontal or vertical cell inset`, () => {
      const html = paint(key);
      assert.doesNotMatch(html, /\bpx-2\b/, `${key} must not inset horizontally`);
      assert.doesNotMatch(html, /\bpy-1\.5\b/, `${key} must not inset vertically`);
      assert.match(html, /\bp-0\b/, `${key} must declare zero padding`);
      // A full-bleed child stretches to the box rather than centring in it.
      assert.match(html, /items-stretch/);
      // …and nothing may escape the track under horizontal scroll.
      assert.match(html, /overflow-hidden/);
    });
  }

  it('pins the select mark to the TOP of the track, past the edge rail', () => {
    // Operator 2026-09-04 "most top of the column per rows", reaffirmed 2026-09-15 after a pass floated the mark to the middle of the row:
    const html = paint('select');
    assert.match(html, /items-start/);
    assert.match(html, /\bpt-1\b/);
    assert.match(html, /pl-\[3px\]/);
  });

  it('gives a detail row a chevron BAND below the pinned mark', () => {
    // The failure this pins:
    const html = paint('select', { open: false });
    assert.match(html, /data-row-detail/);
    assert.match(html, /absolute inset-x-0 bottom-0 h-6/);
    assert.doesNotMatch(html, /grid-rows-2/);
    // The chevron is still a REACH affordance while closed.
    assert.match(html, /opacity-0 group-hover\/row:opacity-100/);
  });

  it('stands the detail chevron once the band is open', () => {
    const html = paint('select', { open: true });
    assert.match(html, /data-row-detail/);
    assert.match(html, /absolute inset-x-0 bottom-0 h-6/);
    assert.doesNotMatch(html, /opacity-0 group-hover\/row:opacity-100/);
  });

  for (const key of ['fulfillment', 'item', 'state']) {
    it(`${key} KEEPS its inset — flush is for the gutters only`, () => {
      // Text that touches the column rule is unreadable.
      const cellClass = paint(key).match(
        new RegExp(`<div data-col="${key}"[^>]*class="([^"]*)"`),
      )?.[1];
      assert.ok(cellClass, `${key} must render a cell wrapper`);
      assert.match(cellClass, /\bpx-[\d.]+\b/, `${key} must keep its text inset`);
      assert.doesNotMatch(cellClass, /\bpx-0\b/, `${key} must not be flush`);
    });
  }
});

describe('the select gutter is the shared cell, under a compound model only', () => {
  it('paints the checkmark face and the gutter hook', () => {
    const html = paint('select');
    assert.match(html, /data-col="select"/);
    // Kept from the Orders row this cell replaced — one attribute, one meaning,
    // on every family now.
    assert.match(html, /data-select-gutter/);
    // 2026-09-04: the body face is the 16px rounded square revealed by row
    // hover, not the full-bleed block. The MARK is still present at rest —
    // hover reveals the box around it, it does not summon the check.
    assert.match(html, /data-select-chrome="hover"/);
    assert.match(html, /data-select-square-face="off"/);
    assert.doesNotMatch(html, /data-click-select-face/, 'no full-bleed face in the body gutter');
    // The click point stays the whole cell — operators never aim at the box.
    assert.match(html, /h-full w-full/);
  });

  it('keeps hover chrome when the leaf also has a detail chevron', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'select')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: VIEW,
          select: {
            checked: false,
            onToggle: () => {},
            label: 'Select row',
            detail: { open: false, onToggle: () => {}, label: 'A thing' },
          },
        }),
      ),
    );
    assert.match(html, /data-select-chrome="hover"/);
    assert.match(html, /data-row-detail/);
  });

  it('refuses `select` when a FLAT model is mounted', () => {
    // Every spreadsheet in the repo has a `select` column. Claiming the key
    // unconditionally would hand the 48px compound gutter to Pickup, Catalog
    // and Repair — surfaces that never opted into this layout.
    const flat = [
      { key: 'select', width: 'minmax(2rem, 2rem)' },
      { key: 'title', width: 'minmax(16rem, 16rem)' },
    ];
    const painted = renderCompoundGridCell({
      col: flat[0],
      columns: flat,
      rule: true,
      view: VIEW,
      select: { checked: false, onToggle: () => {}, label: 'Select row' },
    });
    assert.equal(painted, null, 'a flat grid keeps its own select cell');
  });

  it('renders an empty — but still flush — track when no capability is passed', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'select')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: VIEW,
        }) as React.ReactElement,
      ),
    );
    assert.match(html, /data-col="select"/);
    assert.doesNotMatch(html, /role="checkbox"/);
    assert.doesNotMatch(html, /data-select-square-face/);
  });

  it('is decorative — not a second control — when the ROW owns the toggle', () => {
    // Click-select surfaces put `role="checkbox"` on the row itself. A second
    // one in the gutter is a duplicate a screen reader has to disambiguate.
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'select')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: VIEW,
          select: { checked: true, label: 'Selected' },
        }) as React.ReactElement,
      ),
    );
    assert.doesNotMatch(html, /role="checkbox"/);
    // …but it still PAINTS membership, which is the point.
    assert.match(html, /data-select-square-face="on"/);
  });
});

/**
 * The ids cell distinguishes an ORDER handle from a TRACKING number by dot
 * SHAPE, not by colour alone.
 */
describe('the ids cell says which identifier is which', () => {
  const idsHtml = () =>
    renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'fulfillment')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: { ...VIEW, orderId: 'ORD-1', tracking: 'ORD-1' },
        }) as React.ReactElement,
      ),
    );

  it('rings the tracking dot and leaves the order dot solid', () => {
    const html = idsHtml();
    // Counted on the PREFIXED property, one per ringed element — the standard `mask-image` is emitted alongside it, so counting the gradient…
    const rings = html.match(/-webkit-mask-image/g) ?? [];
    assert.equal(rings.length, 1, 'the ring is the tracking line, and only it');
  });

  it('works when the order id and the tracking number are the SAME string', () => {
    // Incoming does this routinely. Colour alone told an operator nothing here;
    // shape still does.
    const html = idsHtml();
    assert.ok(html.includes('ORD-1'), 'both lines render the value');
    assert.match(html, /radial-gradient\(circle/);
  });
});
