import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SIDEBAR_SPINE_PEEK_INSET_PX } from './sidebar-spine';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { springSnappy } from '@/design-system/motion/tokens';
import { zIndex } from '@/design-system/tokens/z-index';

describe('SIDEBAR_SPINE_PEEK_INSET_PX', () => {
  it('insets the peek card from the viewport edge', () => {
    assert.equal(SIDEBAR_SPINE_PEEK_INSET_PX, 8);
  });

  it('hides the staff account footer on the miniaturized peek card', () => {
    assert.match(
      readFileSync(new URL('./SidebarNavColumn.tsx', import.meta.url), 'utf8'),
      /data-spine-account-footer/,
    );
    assert.match(
      readFileSync(new URL('./master-nav/StaffAccountFooter.tsx', import.meta.url), 'utf8'),
      /data-spine-account-footer/,
    );
  });

  it('stacks the peek above station panel overlays', () => {
    assert.ok(zIndex.navPeek > zIndex.panelOverlay);
    assert.ok(zIndex.navPeek > zIndex.detailStack);
    assert.ok(zIndex.navPeek < zIndex.modalBackdrop);
    const host = readFileSync(new URL('./SidebarNavColumn.tsx', import.meta.url), 'utf8');
    assert.match(host, /zIndex\.navPeek/);
    assert.doesNotMatch(
      host,
      /pathname|usePathname|\/unbox/,
      'peek stacking is one host token — not a per-route special case',
    );
  });
});

describe('the closed spine', () => {
  const host = readFileSync(new URL('./SidebarNavColumn.tsx', import.meta.url), 'utf8');

  it('is zero width — there is no collapsed icon face', () => {
    // The outer box is what the frame charges for. Any non-zero literal here
    // is the 48px glyph rail coming back, which the operator ruled out on
    // 2026-09-05: open, or gone.
    assert.match(host, /width: open \? width : 0 \}/);
    // …and the inner <aside> writes the same 0, so the open spine's clipped
    // rows cannot paint into the gutter.
    assert.match(host, /\{ width: open \? width : 0, transformOrigin/);
    assert.doesNotMatch(host, /SidebarSpineRail|SIDEBAR_SPINE_RAIL_WIDTH_PX/);
  });

  it('leaves the open spine inert while closed, and the reopen door outside it', () => {
    assert.match(host, /inert=\{!navVisible && !peekFace\}/);
    const asideEnd = host.indexOf('</motion.aside>');
    const doorMount = host.indexOf('data-testid="sidebar-spine-open-strip"');
    assert.ok(asideEnd > 0 && doorMount > asideEnd, 'the only way back is inside an inert subtree');
  });

  it('keeps the grab-to-open door on the collapsed edge, handlers untouched', () => {
    assert.match(host, /onPointerDown=\{onOpenStripPointerDown\}/);
    assert.match(host, /onKeyDown=\{onOpenStripKeyDown\}/);
    // At width 0 the leading and trailing edges are one line, so the strip
    // rides `left-0`; at `right-0` it would paint outside the viewport.
    //
    // The TARGET is `w-6` (24px, the WCAG 2.5.8 floor) and the PAINT is the
    // 6px `::before` seam — it was 6px of both, which put the only way back
    // into the navigator under a quarter of that floor, right beside the
    // resize seam. A `w-1.5` here again is that regression.
    assert.match(host, /absolute inset-y-0 left-0 z-sticky w-6 cursor-col-resize/);
    assert.match(host, /before:w-1\.5/);
    // One action, one accessible name — the header toggle says the same.
    assert.match(host, /aria-label="Show navigation"/);
  });

  it('does not tween the collapse', () => {
    assert.doesNotMatch(host, /transition-\[width\]|animate=\{\{ width/);
  });
});

describe('navDropdownFromTop', () => {
  it('drops from the top edge (scale + y) on the snappy spring', () => {
    const { initial, animate, exit } = framerPresence.navDropdownFromTop;
    assert.equal((initial as { scale: number }).scale, 0.96);
    assert.equal((animate as { y: number }).y, 0);
    assert.equal((initial as { y: number }).y, -8);
    assert.equal((exit as { y: number }).y, -8);
    assert.equal(framerTransition.navDropdownFromTop, springSnappy);
  });
});
