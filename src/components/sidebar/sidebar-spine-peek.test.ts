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
    assert.match(
      readFileSync(new URL('./SidebarNavColumn.tsx', import.meta.url), 'utf8'),
      /zIndex\.navPeek/,
    );
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
