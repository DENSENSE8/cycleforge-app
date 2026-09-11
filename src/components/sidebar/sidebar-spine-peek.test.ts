import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SIDEBAR_SPINE_PEEK_INSET_PX } from './sidebar-spine';
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
  });
});

describe('the closed spine', () => {
  const host = readFileSync(new URL('./SidebarNavColumn.tsx', import.meta.url), 'utf8');

  it('is zero width — there is no collapsed icon face', () => {
    assert.match(host, /width: open \? width : 0 \}/);
    assert.match(host, /\{ width: open \? width : 0, transformOrigin/);
  });

  it('leaves the open spine inert while closed, and the reopen door outside it', () => {
    assert.match(host, /inert=\{!navVisible && !peekFace\}/);
    const asideEnd = host.indexOf('</motion.aside>');
    const doorMount = host.indexOf('data-testid="sidebar-spine-open-strip"');
    assert.ok(asideEnd > 0 && doorMount > asideEnd);
  });
});
