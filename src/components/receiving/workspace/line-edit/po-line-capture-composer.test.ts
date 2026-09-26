import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PoLineCaptureRow } from './PoLineCaptureRow';
import { STATION_SCAN_INSET_BEVEL_CLASS } from '@/components/station/scan-depth';

/** The Unbox capture composer's ANATOMY, pinned in the rendered DOM rather than in prose. */
function render(props: Partial<React.ComponentProps<typeof PoLineCaptureRow>> = {}) {
  return renderToStaticMarkup(
    React.createElement(PoLineCaptureRow, {
      condition: 'USED_A',
      onConditionChange: () => {},
      receivingId: 42,
      lineId: 7,
      onAddSerial: () => {},
      onMarkNoSerial: () => {},
      ...props,
    }),
  );
}

/** First index of an attribute in the markup, or -1. */
function at(html: string, needle: string): number {
  return html.indexOf(needle);
}

describe('PO-line capture composer anatomy', () => {
  it('puts the trailing actions AFTER the serial field in document order', () => {
    const html = render();
    const field = at(html, 'data-unbox-serial-input');
    const actions = at(html, 'data-serial-actions');
    assert.ok(field >= 0, 'the Serial field is the middle of the composer');
    assert.ok(actions >= 0, 'the trailing actions render as one cluster');
    assert.ok(
      field < actions,
      'text left, actions right — the verification cluster must follow the field',
    );
  });

  it('joins the green no-serial check and Photos into the SAME cluster', () => {
    const html = render();
    const actions = at(html, 'data-serial-actions');
    const check = at(html, 'aria-label="Mark this item as having no serial number"');
    const photos = at(html, 'data-capture-segment="photos"');
    assert.ok(check > actions, 'the exact / no-serial check sits inside the cluster');
    assert.ok(photos > check, 'Photos follows the check — fixed order, left to right');
  });

  it('keeps the cluster pinned right when the commit cell drops out (waived line)', () => {
    // A waived line has no check and no commit +; the camera must NOT slide
    // into the middle of the bar — it stays in the trailing cluster.
    const html = render({ noSerialActive: true, noSerialSlot: React.createElement('i', null, 'WAIVED') });
    const waiver = at(html, 'WAIVED');
    const actions = at(html, 'data-serial-actions');
    const photos = at(html, 'data-capture-segment="photos"');
    assert.ok(actions > waiver, 'the cluster still follows the field cell');
    assert.ok(photos > actions, 'Photos is still inside the trailing cluster');
    assert.doesNotMatch(
      html,
      /Mark this item as having no serial number/,
      'an already-waived line offers no second waiver',
    );
  });

  it('makes every trailing cell the same square as the field height', () => {
    const html = render();
    const cluster = html.slice(at(html, 'data-serial-actions'));
    // h-11 is the bar height; w-11 makes check and camera one square cluster.
    assert.match(cluster, /h-11/);
    assert.ok(
      !/\bw-14\b/.test(cluster),
      'a 56px check beside a 44px camera reads as two unrelated controls',
    );
  });

  it('recesses the flush Serial field, not the whole capture bar', () => {
    const html = render();
    const composerAt = at(html, 'data-capture-composer');
    const bar = html.slice(Math.max(0, composerAt - 220), composerAt + 40);
    assert.match(bar, /bg-surface-station-bar/, 'the joined bar stays the raised face');
    assert.doesNotMatch(
      bar,
      /bg-surface-canvas|bg-surface-sunken/,
      'greying the whole bar is the shortcut this retired',
    );
    const fieldAt = at(html, 'data-unbox-serial-input');
    const field = html.slice(Math.max(0, fieldAt - 500), fieldAt);
    assert.match(field, /bg-surface-station-slot/, 'the flush Serial input is the hole');
    assert.match(field, /border-t-border-station-shadow/, 'inset dual-edge carves the field');
  });

  it('draws no rules at all — no bar hairlines, no cell seams', () => {
    // The cells already separate themselves:
    const html = render();
    // A rule is a non-zero WIDTH utility (`border`, `border-t`, `border-2`,
    // `divide-x`). `border-0` is a removal. The Serial field's inset bevel
    // (`border` + per-side colours) is the carve, not a cell seam.
    const fieldBevel = new Set(STATION_SCAN_INSET_BEVEL_CLASS.split(' '));
    const rules = [...html.matchAll(/class="([^"]*)"/g)]
      .flatMap((m) => m[1].split(' '))
      .filter(
        (t) =>
          !fieldBevel.has(t) &&
          /^(border(-[trblxy])?(-[1-9]\d*)?|divide-[xy](-[1-9]\d*)?)$/.test(t),
      );
    assert.deepEqual(rules, [], `unexpected rules: ${rules.join(', ')}`);
  });

  it('never tweens a layout property on the bar', () => {
    const html = render();
    const bar = html.slice(at(html, 'data-capture-composer'), at(html, 'data-capture-composer') + 400);
    assert.doesNotMatch(bar, /transition-all|duration-\d+\s+.*\bh-/, bar);
    // transition-colors composites; anything that moves a neighbour does not.
    assert.doesNotMatch(bar, /transition-\[?(height|width|top|left|margin|padding)/, bar);
  });

  it('gives the open field the serial segment identity the moving outline needs', () => {
    // While the field is open there is no icon segment to carry the dock's
    // `data-active-step='serial'` outline — the field itself is the segment.
    const html = render({ activeStep: 'serial' });
    assert.match(html, /data-active-step="serial"/);
    const field = html.slice(at(html, 'data-unbox-serial-input') - 200, at(html, 'data-unbox-serial-input') + 300);
    assert.match(field, /data-capture-segment="serial"/);
  });
});
