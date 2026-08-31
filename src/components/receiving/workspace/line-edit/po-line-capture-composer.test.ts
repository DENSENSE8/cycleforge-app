import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PoLineCaptureRow } from './PoLineCaptureRow';

/**
 * The Unbox capture composer's ANATOMY, pinned in the rendered DOM rather than
 * in prose.
 *
 *     [ Tags ][ Serial ……… grows ][ ✓ exact │ 📷 photos ]
 *
 * Left is the job (which grade, which identifier); right is what verifies it.
 * The two properties worth a test are the two that silently broke before: the
 * trailing controls must come AFTER the field in document order, and they must
 * be ONE group — otherwise a state that drops the commit cell (a waived line)
 * leaves the camera floating in the middle of the bar.
 */
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

  it('draws no rules at all — no bar hairlines, no cell seams', () => {
    // The cells already separate themselves: Tags is a filled plate, Serial is
    // a white field, the check is emerald, Photos is blue. A seam between two
    // cells that are already different colours draws a line over a boundary
    // that was never in question.
    const html = render();
    // A rule is a non-zero WIDTH utility (`border`, `border-t`, `border-2`,
    // `divide-x`). `border-0` is a removal and a bare colour token paints
    // nothing without a width, so neither counts.
    const rules = [...html.matchAll(/class="([^"]*)"/g)]
      .flatMap((m) => m[1].split(' '))
      .filter((t) => /^(border(-[trblxy])?(-[1-9]\d*)?|divide-[xy](-[1-9]\d*)?)$/.test(t));
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
