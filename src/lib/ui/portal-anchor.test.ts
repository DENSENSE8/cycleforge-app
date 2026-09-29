/**
 * Portal tooltip anchor trust + clamp — bad rects must never yield a visible
 * tip at ~(MARGIN, MARGIN) (the top-left flash).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampPortalSideMenuPosition,
  clampPortalTooltipPosition,
  isTrustedPortalAnchor,
  PORTAL_BELOW_MENU_GAP,
  PORTAL_SIDE_MENU_GAP,
  PORTAL_TOOLTIP_MARGIN,
  readTrustedTriggerRect,
} from './portal-anchor';

const VIEW = { width: 1200, height: 800 };

function rect(partial: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  const { top, left, width, height } = partial;
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON() {
      return this;
    },
  };
}

test('isTrustedPortalAnchor rejects null / zero-size / off-viewport', () => {
  assert.equal(isTrustedPortalAnchor(null, VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: 100, left: 100, width: 0, height: 20 }), VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: 100, left: 100, width: 1, height: 1 }), VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: -40, left: 100, width: 20, height: 20 }), VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: 900, left: 100, width: 20, height: 20 }), VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: 100, left: -40, width: 20, height: 20 }), VIEW), false);
  assert.equal(isTrustedPortalAnchor(rect({ top: 100, left: 1300, width: 20, height: 20 }), VIEW), false);
});

test('isTrustedPortalAnchor accepts on-screen triggers including top-left chrome', () => {
  assert.equal(isTrustedPortalAnchor(rect({ top: 4, left: 4, width: 28, height: 28 }), VIEW), true);
  assert.equal(isTrustedPortalAnchor(rect({ top: 200, left: 400, width: 80, height: 24 }), VIEW), true);
  // Partially clipped but still overlapping the viewport.
  assert.equal(isTrustedPortalAnchor(rect({ top: -10, left: 100, width: 40, height: 40 }), VIEW), true);
});

test('clampPortalTooltipPosition returns null for untrusted / undersized bubble', () => {
  assert.equal(
    clampPortalTooltipPosition({
      anchor: rect({ top: 100, left: 100, width: 0, height: 20 }),
      bubble: { width: 80, height: 28 },
      viewport: VIEW,
    }),
    null,
  );
  assert.equal(
    clampPortalTooltipPosition({
      anchor: rect({ top: 200, left: 400, width: 80, height: 24 }),
      bubble: { width: 0, height: 28 },
      viewport: VIEW,
    }),
    null,
  );
});

test('clampPortalTooltipPosition places a mid-viewport tip above the trigger', () => {
  const anchor = rect({ top: 300, left: 500, width: 60, height: 24 });
  const bubble = { width: 120, height: 28 };
  const pos = clampPortalTooltipPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'auto',
  });
  assert.ok(pos);
  assert.equal(pos!.top, anchor.top - bubble.height - PORTAL_TOOLTIP_MARGIN);
  assert.equal(pos!.left, anchor.left + anchor.width / 2 - bubble.width / 2);
  // Must not be the top-left flash corner.
  assert.ok(!(pos!.top <= PORTAL_TOOLTIP_MARGIN && pos!.left <= PORTAL_TOOLTIP_MARGIN));
});

test('clampPortalTooltipPosition places a tip to the right of the trigger', () => {
  const anchor = rect({ top: 300, left: 500, width: 60, height: 24 });
  const bubble = { width: 140, height: 28 };
  const pos = clampPortalTooltipPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'right',
  });
  assert.ok(pos);
  assert.equal(pos!.left, anchor.right + PORTAL_TOOLTIP_MARGIN);
  assert.equal(
    pos!.top,
    anchor.top + anchor.height / 2 - bubble.height / 2,
  );
});

test('clampPortalTooltipPosition flips right tip to the left near the trailing edge', () => {
  const anchor = rect({ top: 300, left: 1100, width: 60, height: 24 });
  const bubble = { width: 140, height: 28 };
  const pos = clampPortalTooltipPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'right',
  });
  assert.ok(pos);
  assert.equal(pos!.left, anchor.left - bubble.width - PORTAL_TOOLTIP_MARGIN);
});

test('bad mid-screen clamp path cannot paint a visible tip at ~(MARGIN,MARGIN)', () => {
  // Trusted mid-screen anchor + oversized bubble → both axes clamp to MARGIN.
  // Without the corner-belonging guard that would flash a stray top-left tip.
  const anchor = rect({ top: 400, left: 600, width: 40, height: 20 });
  const bubble = { width: 2000, height: 500 };
  const pos = clampPortalTooltipPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'above',
  });
  assert.equal(
    pos,
    null,
    `mid-screen trigger must not yield a top-left-pinned tip, got ${JSON.stringify(pos)}`,
  );
});

test('legitimate top-left chrome still gets a corner-clamped tip', () => {
  const anchor = rect({ top: 4, left: 4, width: 28, height: 28 });
  const bubble = { width: 160, height: 28 };
  const pos = clampPortalTooltipPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'below',
  });
  assert.ok(pos);
  assert.equal(pos!.left, PORTAL_TOOLTIP_MARGIN);
  assert.ok(pos!.top > anchor.bottom);
});

test('clampPortalSideMenuPosition prefers trailing (right) mid-viewport', () => {
  const anchor = rect({ top: 300, left: 400, width: 80, height: 24 });
  const bubble = { width: 120, height: 64 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'auto',
    align: 'start',
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'end');
  assert.equal(pos!.left, anchor.right + PORTAL_SIDE_MENU_GAP);
  assert.equal(pos!.top, anchor.top);
  // Must clear the vertical strip under the chip (next table row).
  assert.ok(pos!.left >= anchor.right);
  assert.ok(!(pos!.top >= anchor.bottom && pos!.left < anchor.right));
});

test('clampPortalSideMenuPosition flips to leading near the right edge', () => {
  const anchor = rect({ top: 300, left: 1100, width: 80, height: 24 });
  const bubble = { width: 140, height: 64 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'auto',
    align: 'start',
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'start');
  assert.equal(pos!.left, anchor.left - bubble.width - PORTAL_SIDE_MENU_GAP);
});

test('clampPortalSideMenuPosition rejects mid-screen top-left flash path', () => {
  const anchor = rect({ top: 400, left: 600, width: 40, height: 20 });
  const bubble = { width: 2000, height: 500 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'auto',
  });
  assert.equal(
    pos,
    null,
    `mid-screen trigger must not yield a top-left-pinned side menu, got ${JSON.stringify(pos)}`,
  );
});

test('clampPortalSideMenuPosition bottom + start sits under the trigger left edge', () => {
  const anchor = rect({ top: 80, left: 900, width: 48, height: 28 });
  const bubble = { width: 180, height: 120 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'bottom',
    align: 'start',
    avoidCollisions: false,
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'bottom');
  assert.equal(pos!.left, anchor.left);
  assert.equal(pos!.top, anchor.bottom + PORTAL_BELOW_MENU_GAP);
  // Must not hang to the leading side of the chip (Claim lives there on the carton bar).
  assert.ok(pos!.left >= anchor.left - 0.5);
  assert.ok(pos!.top >= anchor.bottom);
});

test('clampPortalSideMenuPosition top + center sits above a non-table trigger', () => {
  const anchor = rect({ top: 300, left: 500, width: 80, height: 28 });
  const bubble = { width: 180, height: 96 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'top',
    align: 'center',
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'top');
  assert.equal(pos!.left, anchor.left + anchor.width / 2 - bubble.width / 2);
  assert.equal(pos!.top, anchor.top - bubble.height - PORTAL_BELOW_MENU_GAP);
});

test('clampPortalSideMenuPosition bottom + end aligns to the trigger right edge', () => {
  const anchor = rect({ top: 80, left: 1000, width: 36, height: 28 });
  const bubble = { width: 160, height: 80 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'bottom',
    align: 'end',
    avoidCollisions: false,
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'bottom');
  assert.equal(pos!.left, anchor.right - bubble.width);
  assert.equal(pos!.top, anchor.bottom + PORTAL_BELOW_MENU_GAP);
});

test('clampPortalSideMenuPosition bottom does not flip to a side when collisions are off', () => {
  const anchor = rect({ top: 80, left: 1100, width: 48, height: 28 });
  const bubble = { width: 200, height: 120 };
  const pos = clampPortalSideMenuPosition({
    anchor,
    bubble,
    viewport: VIEW,
    placement: 'bottom',
    align: 'start',
    avoidCollisions: false,
  });
  assert.ok(pos);
  assert.equal(pos!.side, 'bottom');
  assert.equal(pos!.left, anchor.left);
  assert.ok(pos!.left + bubble.width > VIEW.width);
});

test('readTrustedTriggerRect rejects disconnected / display:none', () => {
  assert.equal(readTrustedTriggerRect(null, VIEW), null);

  const disconnected = {
    isConnected: false,
    getBoundingClientRect: () => rect({ top: 10, left: 10, width: 20, height: 20 }),
  } as unknown as HTMLElement;
  assert.equal(readTrustedTriggerRect(disconnected, VIEW, () => ({ display: 'block', visibility: 'visible' }) as CSSStyleDeclaration), null);

  const hidden = {
    isConnected: true,
    getBoundingClientRect: () => rect({ top: 10, left: 10, width: 20, height: 20 }),
  } as unknown as HTMLElement;
  assert.equal(
    readTrustedTriggerRect(hidden, VIEW, () => ({ display: 'none', visibility: 'visible' }) as CSSStyleDeclaration),
    null,
  );

  const visible = {
    isConnected: true,
    getBoundingClientRect: () => rect({ top: 10, left: 10, width: 20, height: 20 }),
  } as unknown as HTMLElement;
  const trusted = readTrustedTriggerRect(
    visible,
    VIEW,
    () => ({ display: 'block', visibility: 'visible' }) as CSSStyleDeclaration,
  );
  assert.ok(trusted);
  assert.equal(trusted!.top, 10);
});
