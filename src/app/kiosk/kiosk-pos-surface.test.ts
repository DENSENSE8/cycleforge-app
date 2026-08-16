/**
 * Kiosk POS floating-card surface + two-state mode rail + category nav contract.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  KIOSK_MODE_SPINE_COLLAPSED_W,
  KIOSK_MODE_SPINE_COLLAPSED_W_PX,
  KIOSK_MODE_SPINE_EXPANDED_W,
  KIOSK_MODE_SPINE_EXPANDED_W_PX,
  KIOSK_MODE_SPINE_ICON,
  KIOSK_MODE_SPINE_LABEL,
  KIOSK_MODE_SPINE_ROW,
  KIOSK_MODE_SPINE_ROW_COLLAPSED,
  KIOSK_MODE_SPINE_ROW_EXPANDED,
  KIOSK_PILL,
  KIOSK_PILL_ACTIVE,
  KIOSK_PILL_ACTIVE_ISSUE,
  KIOSK_PILL_IDLE,
  kioskSpineShortLabel,
} from './kiosk-chrome';
import {
  KIOSK_POS_CANVAS,
  KIOSK_POS_CARD,
  KIOSK_POS_CARD_CAPTION,
  KIOSK_POS_CARD_SELECTED,
  KIOSK_POS_CATEGORY,
  KIOSK_POS_CATEGORY_ACTIVE,
  KIOSK_POS_CATEGORY_IDLE,
  KIOSK_POS_CATEGORY_LABEL,
  KIOSK_POS_CATEGORY_STACK,
  KIOSK_POS_GRID,
  KIOSK_POS_SEARCH_INPUT,
  KIOSK_POS_SIDEBAR,
  KIOSK_POS_SIDEBAR_BODY,
} from './kiosk-pos-surface';
import { KIOSK_SERVICES } from '@/lib/kiosk/services';

const SPINE = join(process.cwd(), 'src/app/kiosk/KioskModeSpine.tsx');
const SHELL = join(process.cwd(), 'src/app/kiosk/KioskShell.tsx');

describe('kiosk-chrome pills', () => {
  it('uses cornerClass pill + idle/active semantic washes', () => {
    assert.match(KIOSK_PILL, /rounded-full/);
    assert.match(KIOSK_PILL_ACTIVE, /\bbg-surface-accent\b/);
    assert.match(KIOSK_PILL_IDLE, /\bbg-surface-sunken\b/);
    assert.match(KIOSK_PILL_ACTIVE_ISSUE, /\bbg-amber-50\b/);
  });
});

describe('kiosk-chrome two-state mode rail', () => {
  it('exports collapsed icon rail and expanded named rail widths', () => {
    assert.equal(KIOSK_MODE_SPINE_COLLAPSED_W, 'w-14');
    assert.equal(KIOSK_MODE_SPINE_COLLAPSED_W_PX, 56);
    assert.equal(KIOSK_MODE_SPINE_EXPANDED_W, 'w-64');
    assert.equal(KIOSK_MODE_SPINE_EXPANDED_W_PX, 256);
    assert.notEqual(KIOSK_MODE_SPINE_COLLAPSED_W_PX, 0);
    assert.notEqual(KIOSK_MODE_SPINE_COLLAPSED_W_PX, 240);
    assert.notEqual(KIOSK_MODE_SPINE_COLLAPSED_W, 'w-24');
    assert.ok(KIOSK_MODE_SPINE_EXPANDED_W_PX > KIOSK_MODE_SPINE_COLLAPSED_W_PX);
    assert.match(KIOSK_MODE_SPINE_ROW, /\brounded-xl\b/);
    assert.match(KIOSK_MODE_SPINE_ROW_COLLAPSED, /\bflex-col\b/);
    assert.match(KIOSK_MODE_SPINE_ROW_EXPANDED, /\bflex-row\b/);
    assert.match(KIOSK_MODE_SPINE_ROW_EXPANDED, /\bgap-3\b/);
    assert.match(KIOSK_MODE_SPINE_ICON, /\bh-5\b/);
    assert.match(KIOSK_MODE_SPINE_LABEL, /\bfont-semibold\b/);
    assert.match(KIOSK_MODE_SPINE_LABEL, /\bleading-tight\b/);
  });

  it('maps live services to the short expanded names', () => {
    assert.equal(kioskSpineShortLabel('repair'), 'Repair');
    assert.equal(kioskSpineShortLabel('sales'), 'Buy / Sell');
    assert.equal(kioskSpineShortLabel('pickup'), 'Pickup');
    for (const tab of KIOSK_SERVICES) {
      assert.ok(tab.label.length > kioskSpineShortLabel(tab.id).length || tab.id === 'sales');
    }
  });
});

describe('kiosk-chrome spine source contract', () => {
  const spine = readFileSync(SPINE, 'utf8');
  const shell = readFileSync(SHELL, 'utf8');

  it('tweens width via motionRole.push.rail from the design-system barrel', () => {
    assert.match(spine, /from '@\/design-system\/motion'/);
    assert.match(spine, /motionRole\.push\.rail/);
    assert.match(spine, /useMotionRole/);
    assert.doesNotMatch(spine, /from ['"]motion\/react['"]/);
    assert.doesNotMatch(spine, /from ['"]framer-motion['"]/);
    assert.doesNotMatch(spine, /\bx:\s|translateX/);
  });

  it('defaults collapsed and restores the spine toggle', () => {
    assert.match(shell, /spineExpanded/);
    assert.match(shell, /useState\(false\)/);
    assert.match(spine, /KioskSpineToggle/);
    assert.match(spine, /kiosk-spine-search/);
    assert.match(spine, /role="tab"/);
    assert.doesNotMatch(spine, /bg-zinc-/);
    assert.doesNotMatch(spine, /#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('kiosk v2 idle + attract source contract', () => {
  it('does not reset idle on mousemove and mounts attract media only when active', () => {
    const runtime = readFileSync(
      join(process.cwd(), 'src/app/kiosk/v2/KioskV2Runtime.tsx'),
      'utf8',
    );
    const attract = readFileSync(join(process.cwd(), 'src/app/kiosk/AttractLoop.tsx'), 'utf8');
    assert.doesNotMatch(runtime, /['"]mousemove['"]/);
    assert.match(runtime, /pointerdown/);
    assert.match(runtime, /keydown/);
    assert.match(runtime, /dynamic\(/);
    assert.match(runtime, /AttractLoop/);
    assert.match(runtime, /KioskShell/);
    assert.match(attract, /active = true/);
    assert.match(attract, /active && mediaUrl/);
  });
});

describe('lighthouse kiosk routes', () => {
  it('lists /kiosk and /kiosk/v2 as tier-2 desktop auth routes', () => {
    const audit = readFileSync(join(process.cwd(), 'scripts/lighthouse-audit.mjs'), 'utf8');
    assert.match(audit, /path: '\/kiosk',\s+tier: 2, auth: true, formFactor: 'desktop'/);
    assert.match(
      audit,
      /path: '\/kiosk\/v2',\s+tier: 2, auth: true, formFactor: 'desktop'/,
    );
  });
});

describe('kiosk-pos-surface', () => {
  it('uses theme canvas + accent wash (no raw gray/white)', () => {
    assert.match(KIOSK_POS_CANVAS, /\bbg-surface-canvas\b/);
    assert.match(KIOSK_POS_SIDEBAR_BODY, /\bbg-surface-canvas\b/);
    assert.match(KIOSK_POS_CATEGORY_ACTIVE, /\bbg-surface-accent\b/);
    assert.match(KIOSK_POS_SEARCH_INPUT, /\bbg-surface-sunken\b/);
    assert.doesNotMatch(KIOSK_POS_CANVAS, /\bbg-gray-/);
    assert.doesNotMatch(KIOSK_POS_CARD, /\bbg-white\b/);
  });

  it('uses soft floating cards with stock radius + density gap', () => {
    assert.match(KIOSK_POS_CARD, /\brounded-2xl\b/);
    assert.match(KIOSK_POS_CARD, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_CARD, /\bshadow-elev-soft\b/);
    assert.match(KIOSK_POS_GRID, /\bgap-4\b/);
    assert.match(KIOSK_POS_CARD_CAPTION, /\bp-4\b/);
    assert.match(KIOSK_POS_CARD_SELECTED, /\bring-2\b/);
  });

  it('caps the category column and insets floating rounded-xl items', () => {
    assert.match(KIOSK_POS_SIDEBAR, /\bmd:w-64\b/);
    assert.match(KIOSK_POS_SIDEBAR, /\bmd:shrink-0\b/);
    assert.doesNotMatch(KIOSK_POS_SIDEBAR, /\bmd:w-1\/3\b/);
    assert.doesNotMatch(KIOSK_POS_SIDEBAR, /\bmd:min-w-80\b/);
    assert.match(KIOSK_POS_SIDEBAR_BODY, /\bp-4\b/);
    assert.match(KIOSK_POS_CATEGORY, /\brounded-xl\b/);
    assert.doesNotMatch(KIOSK_POS_CATEGORY, /\brounded-full\b/);
    assert.equal(KIOSK_POS_CATEGORY_ACTIVE, KIOSK_PILL_ACTIVE);
    assert.match(KIOSK_POS_CATEGORY_IDLE, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_CATEGORY_LABEL, /\bleading-snug\b/);
    assert.match(KIOSK_POS_CATEGORY_STACK, /\bgap-1\.5\b/);
    assert.doesNotMatch(KIOSK_POS_CATEGORY_STACK, /\bdivide-y\b/);
  });

  it('search input is a filled rounded field', () => {
    assert.match(KIOSK_POS_SEARCH_INPUT, /\brounded-lg\b/);
    assert.match(KIOSK_POS_SEARCH_INPUT, /\bpy-3\b/);
    assert.match(KIOSK_POS_SEARCH_INPUT, /\bpx-4\b/);
    assert.doesNotMatch(KIOSK_POS_SEARCH_INPUT, /\brounded-none\b/);
  });
});
