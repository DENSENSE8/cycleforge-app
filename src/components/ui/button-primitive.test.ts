import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button';

/**
 * The shadcn/ui Button primitive, and the chrome that must sit on it.
 *
 * Every expand / collapse control in the station centre was a raw
 * `<button className="ds-raw-button …">` with the focus ring, the hover fill and
 * the disabled state hand-copied at each site — five copies that could drift
 * one at a time. They compose this now.
 */
describe('shadcn Button primitive', () => {
  const render = (props: Partial<React.ComponentProps<typeof Button>> = {}) =>
    renderToStaticMarkup(React.createElement(Button, props, 'Press'));

  it('defaults to type=button — chrome must never submit a form by accident', () => {
    assert.match(render(), /type="button"/);
  });

  it('honours an explicit type', () => {
    assert.match(render({ type: 'submit' }), /type="submit"/);
  });

  it('carries the house focus ring, not the upstream palette', () => {
    const html = render();
    assert.doesNotMatch(html, /bg-primary|text-primary-foreground|ring-offset-background/);
    assert.match(html, /focus-visible:/);
  });

  it('renders the child element under asChild — no nested buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Button,
        { asChild: true },
        React.createElement('a', { href: '/x' }, 'Go'),
      ),
    );
    assert.match(html, /<a /);
    assert.doesNotMatch(html, /<button/);
  });

  it('lets a pre-sized glyph keep its own size', () => {
    // `[&_svg]:size-*` generates a descendant rule that outranks a class the
    // icon sets on itself, so the chrome sizes must not emit one — a 14px
    // chevron would silently paint at the button's size.
    for (const size of ['eyebrow', 'iconTight'] as const) {
      assert.doesNotMatch(render({ size }), /\[&_svg\]:size|_svg\]:size/);
    }
  });

  it('never tweens a layout property', () => {
    // transition-colors composites; anything that moves a neighbour does not.
    const html = render();
    assert.doesNotMatch(html, /transition-\[?(height|width|top|left|margin|padding)/);
    assert.doesNotMatch(html, /transition-all/);
  });
});

describe('station collapse chrome sits on the primitive', () => {
  /** Files whose ONLY controls are disclosure controls. */
  const PURE_DISCLOSURE = [
    'src/components/station/collapse/StationCollapsibleBlock.tsx',
  ];
  /**
   * Files that own a disclosure control among others. `ItemRecordRow`'s meta
   * cells (qty · condition · serials) are activators on a fixed face, not
   * disclosures — a different control family, deliberately out of scope here.
   */
  const MIXED = ['src/design-system/components/item-record/ItemRecordRow.tsx'];

  it('every expand / collapse control composes the shadcn Button', () => {
    for (const path of [...PURE_DISCLOSURE, ...MIXED]) {
      assert.match(
        readFileSync(path, 'utf8'),
        /from '@\/components\/ui\/button'/,
        `${path} must build its disclosure control on the primitive`,
      );
    }
  });

  it('leaves no hand-rolled button behind in the collapse module', () => {
    for (const path of PURE_DISCLOSURE) {
      assert.doesNotMatch(
        readFileSync(path, 'utf8'),
        /ds-raw-button/,
        `${path} still hand-rolls a bare button — that is the drift this removed`,
      );
    }
  });
});
