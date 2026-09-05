import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemRecordRow } from './ItemRecordRow';
import { STATION_SCAN_INSET_BEVEL_CLASS } from '@/components/station/scan-depth';

/**
 * Per-row disclosure of the `body`.
 *
 * The row owns the FACE and the unmount; the host owns the state. What these
 * pin is the pair of claims a collapse can quietly break: a collapsed row must
 * remove its body from the TREE (not hide it — hidden bodies keep their queries
 * and their focus targets alive, which is how a scan lands in an invisible
 * field), and the toggle must stay reachable so a collapsed row can be reopened.
 */
const ITEM = {
  id: 7,
  title: 'ThinkPad X1 Carbon Gen 9',
  sku: 'LEN-X1C-G9',
  quantity: { counted: 0, expected: 1 },
  serials: [] as string[],
};

function render(props: Partial<React.ComponentProps<typeof ItemRecordRow>> = {}) {
  return renderToStaticMarkup(
    React.createElement(ItemRecordRow, {
      item: ITEM,
      body: React.createElement('p', null, 'CAPTURE_BODY_MARKER'),
      ...props,
    }),
  );
}

describe('ItemRecordRow disclosure', () => {
  it('renders the body with no disclosure at all — the pre-existing shape', () => {
    const html = render();
    assert.match(html, /CAPTURE_BODY_MARKER/);
    assert.doesNotMatch(
      html,
      /data-item-record-disclosure/,
      'a row without a disclosure must not grow a dead toggle',
    );
  });

  it('expanded keeps the body and reports aria-expanded=true', () => {
    const html = render({ disclosure: { expanded: true, onToggle: () => {} } });
    assert.match(html, /CAPTURE_BODY_MARKER/);
    assert.match(html, /aria-expanded="true"/);
  });

  it('collapsed removes the body from the markup, not just from view', () => {
    const html = render({ disclosure: { expanded: false, onToggle: () => {} } });
    assert.doesNotMatch(
      html,
      /CAPTURE_BODY_MARKER/,
      'a collapsed line must unmount its capture body — a hidden one still holds the caret',
    );
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /data-item-record-collapsed="true"/);
  });

  it('keeps the toggle reachable in both states', () => {
    for (const expanded of [true, false]) {
      const html = render({ disclosure: { expanded, onToggle: () => {} } });
      assert.match(html, /data-item-record-disclosure/);
      assert.match(html, new RegExp(`aria-expanded="${expanded}"`));
    }
  });

  it('never tweens a layout property — the collapse is instant', () => {
    const html = render({ disclosure: { expanded: false, onToggle: () => {} } });
    // Rotation composites and moves no neighbour; height/width/top/left do not.
    assert.doesNotMatch(html, /transition-\[?(height|width|top|left|margin|padding)/);
    assert.doesNotMatch(html, /animate-\[?height/);
  });

  it('a row with NO body paints no toggle, however the host asks', () => {
    // This is what lets one host hand the same controller to every line list it
    // owns without first working out which of them render bodies: the
    // ledger-only surfaces (Testing centre, /search Items, Arrival) opt out by
    // construction rather than by a flag each caller has to remember.
    for (const expanded of [true, false]) {
      const html = renderToStaticMarkup(
        React.createElement(ItemRecordRow, {
          item: ITEM,
          disclosure: { expanded, onToggle: () => {} },
        }),
      );
      assert.doesNotMatch(
        html,
        /data-item-record-disclosure/,
        'a disclosure control with nothing to disclose is a lie',
      );
      assert.doesNotMatch(html, /data-item-record-collapsed/);
    }
  });

  it('recesses the empty thumb as a placeholder well against the row face', () => {
    const html = render();
    const thumbAt = html.indexOf('data-item-record-thumb');
    assert.ok(thumbAt >= 0, 'the cube cell is the ItemRecordThumb');
    const thumb = html.slice(thumbAt, thumbAt + 420);
    assert.match(
      thumb,
      /bg-surface-station-slot/,
      'empty cube is the station slot — deeper than the well',
    );
  });

  it('draws no hairlines — not on the row, the thumb, the meta, or the body', () => {
    // Operator ruling 2026-08-30: the PO line display carries no rules. What
    // separates one line from the next is the thumb's height and the active
    // row's fill, the same way the station plane carries no tone changes.
    const html = render({ disclosure: { expanded: true, onToggle: () => {} } });
    // A rule is a non-zero WIDTH utility (`border`, `border-t`, `border-2`,
    // `divide-x`). `border-0` is a removal. The empty thumb's inset bevel is
    // the cube carve, not a row hairline.
    const thumbBevel = new Set(STATION_SCAN_INSET_BEVEL_CLASS.split(' '));
    const rules = [...html.matchAll(/class="([^"]*)"/g)]
      .flatMap((m) => m[1].split(' '))
      .filter(
        (t) =>
          !thumbBevel.has(t) &&
          /^(border(-[trblxy])?(-[1-9]\d*)?|divide-[xy](-[1-9]\d*)?)$/.test(t),
      );
    assert.deepEqual(rules, [], `unexpected rules: ${rules.join(', ')}`);
  });

  it('the identity face survives a collapse — thumb · title · meta · price', () => {
    const html = render({ disclosure: { expanded: false, onToggle: () => {} } });
    assert.match(html, /ThinkPad X1 Carbon Gen 9/);
    assert.match(html, /LEN-X1C-G9|X1C-G9/, 'the SKU ledger cell still paints');
    assert.deepEqual(
      [...html.matchAll(/data-col="([^"]+)"/g)].map((m) => m[1]),
      ['qty', 'price', 'condition', 'sku', 'serial', 'location'],
    );
  });
});
