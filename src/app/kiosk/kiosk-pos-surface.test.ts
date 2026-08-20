/**
 * Kiosk POS flush surface + two-state command rail contract (cart-root shift).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  KIOSK_CART_COL,
  KIOSK_CART_COL_PX,
  KIOSK_MODE_SPINE_COLLAPSED_W,
  KIOSK_MODE_SPINE_COLLAPSED_W_PX,
  KIOSK_MODE_SPINE_EXPANDED_W,
  KIOSK_MODE_SPINE_EXPANDED_W_PX,
  KIOSK_MODE_SPINE_ICON,
  KIOSK_MODE_SPINE_LABEL,
  KIOSK_MODE_SPINE_ROW,
  KIOSK_MODE_SPINE_ROW_COLLAPSED,
  KIOSK_MODE_SPINE_ROW_EXPANDED,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
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
  KIOSK_POS_IMAGE_WELL,
  KIOSK_POS_CARD_SELECTED,
  KIOSK_POS_CARD_SELECTED_FRAME,
  KIOSK_POS_CATEGORY,
  KIOSK_POS_CATEGORY_ACTIVE,
  KIOSK_POS_CATEGORY_IDLE,
  KIOSK_POS_CATEGORY_LABEL,
  KIOSK_POS_CATEGORY_STACK,
  KIOSK_POS_GRID,
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

describe('kiosk-chrome two-state command rail', () => {
  it('exports collapsed icon rail and expanded named rail widths', () => {
    assert.equal(KIOSK_MODE_SPINE_COLLAPSED_W, 'w-14');
    assert.equal(KIOSK_MODE_SPINE_COLLAPSED_W_PX, 56);
    assert.equal(KIOSK_MODE_SPINE_EXPANDED_W, 'w-64');
    assert.equal(KIOSK_MODE_SPINE_EXPANDED_W_PX, 256);
    assert.notEqual(KIOSK_MODE_SPINE_COLLAPSED_W_PX, 0);
    assert.notEqual(KIOSK_MODE_SPINE_COLLAPSED_W, 'w-24');
    assert.ok(KIOSK_MODE_SPINE_EXPANDED_W_PX > KIOSK_MODE_SPINE_COLLAPSED_W_PX);
    // Flush — no rounded-xl POS exception on command rows.
    assert.doesNotMatch(KIOSK_MODE_SPINE_ROW, /\brounded-xl\b/);
    assert.match(KIOSK_MODE_SPINE_ROW_COLLAPSED, /\bflex-col\b/);
    assert.match(KIOSK_MODE_SPINE_ROW_EXPANDED, /\bflex-row\b/);
    assert.match(KIOSK_MODE_SPINE_ICON, /\bh-5\b/);
    assert.match(KIOSK_MODE_SPINE_LABEL, /\bfont-semibold\b/);
  });

  it('maps live services to sentence-case command names', () => {
    assert.equal(kioskSpineShortLabel('repair'), 'Repair');
    assert.equal(kioskSpineShortLabel('sales'), 'Retail');
    assert.equal(kioskSpineShortLabel('buyback'), 'Buyback');
    assert.equal(kioskSpineShortLabel('pickup'), 'Pickup');
    for (const tab of KIOSK_SERVICES) {
      assert.ok(typeof tab.commandLabel === 'string' && tab.commandLabel.length > 0);
    }
  });

  it('exports a persistent right cart column token', () => {
    assert.equal(KIOSK_CART_COL, 'w-80');
    assert.equal(KIOSK_CART_COL_PX, 320);
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
  });

  it('defaults collapsed, mounts right ledger, never clears cart on command switch', () => {
    assert.match(shell, /spineExpanded/);
    assert.match(shell, /useState\(false\)/);
    assert.match(shell, /KioskCartLedger/);
    assert.match(shell, /hideCartTray/);
    assert.match(shell, /useWedgeScanner/);
    assert.doesNotMatch(shell, /Switching modes will clear/);
    assert.doesNotMatch(shell, /confirm\(/);
    assert.match(spine, /KioskSpineToggle/);
    assert.match(spine, /kiosk-spine-search/);
  });

  it('keeps repair catalog browse after a SKU pick so more services can be added', () => {
    assert.match(shell, /onContinue=\{openRepairDetails\}/);
    assert.match(shell, /onBack=\{returnToRepairCatalog\}/);
    assert.match(
      shell,
      /const onSelectProduct = useCallback\(\(product: ProductSelection \| null\) => \{\s*setSelectedProduct\(product\);\s*\}, \[\]\)/,
    );
    const selector = readFileSync(
      join(process.cwd(), 'src/components/repair/ProductSelector.tsx'),
      'utf8',
    );
    assert.match(selector, /hideCartTray && selectedItems\.length > 0 && onContinue/);
    assert.match(selector, /data-kiosk-continue/);
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
    assert.match(runtime, /cartIsEmpty/);
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

describe('kiosk-pos-surface flush plane', () => {
  it('uses one card plane (no canvas island)', () => {
    assert.match(KIOSK_POS_CANVAS, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_SIDEBAR_BODY, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_CATEGORY_ACTIVE, /\bbg-surface-accent\b/);
    assert.doesNotMatch(KIOSK_POS_CANVAS, /\bbg-surface-canvas\b/);
    assert.doesNotMatch(KIOSK_POS_CANVAS, /\bbg-gray-/);
  });

  it('strips floating rounded cards — flush cells + hairline grid', () => {
    assert.doesNotMatch(KIOSK_POS_CARD, /\brounded-2xl\b/);
    assert.doesNotMatch(KIOSK_POS_CARD, /\brounded-xl\b/);
    assert.doesNotMatch(KIOSK_POS_CARD, /\bshadow-elev/);
    assert.match(KIOSK_POS_CARD, /\bbg-surface-card\b/);
    // The grid host stays white — an unfilled trailing row must not reveal a
    // colored gutter plane; seams ride the cells.
    assert.match(KIOSK_POS_GRID, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_GRID, /\bw-full\b/);
    assert.match(KIOSK_POS_GRID, /\bgap-0\b/);
    assert.doesNotMatch(KIOSK_POS_GRID, /\bbg-border-hairline\b/);
    assert.match(KIOSK_POS_CARD, /\bborder-border-hairline\b/);
    // Selection wash on the cell; squared frame is a last-child overlay so the
    // photo cannot cover the blue perimeter (inset rings only showed on caption).
    assert.match(KIOSK_POS_CARD_SELECTED, /\bbg-surface-accent\b/);
    assert.doesNotMatch(KIOSK_POS_CARD_SELECTED, /\bring-inset\b/);
    assert.doesNotMatch(KIOSK_POS_CARD_SELECTED, /\bring-2\b/);
    assert.match(KIOSK_POS_CARD_SELECTED_FRAME, /\bborder-2\b/);
    assert.match(KIOSK_POS_CARD_SELECTED_FRAME, /\binset-0\b/);
    assert.match(KIOSK_POS_CARD_SELECTED_FRAME, /\bborder-blue-500\b/);
    assert.match(KIOSK_POS_CARD_CAPTION, /\bbg-transparent\b/);
    assert.match(KIOSK_POS_IMAGE_WELL, /\bbg-transparent\b/);
    assert.match(KIOSK_POS_CARD_CAPTION, /\bpx-3\b/);
  });

  it('pane headers are full-bleed; title owns in-band inset only', () => {
    assert.match(KIOSK_PANE_HEADER_BAND, /\bpl-0\b/);
    assert.match(KIOSK_PANE_HEADER_BAND, /\bpr-0\b/);
    assert.doesNotMatch(KIOSK_PANE_HEADER_BAND, /\bpr-4\b/);
    assert.match(KIOSK_PANE_HEADER_TITLE, /\bpx-3\b/);
    assert.doesNotMatch(KIOSK_PANE_HEADER_TITLE, /first:pl-4/);
  });

  it('catalog browse stays flush — Band 3 height SoT; frame overlays the cell', () => {
    const selectorSrc = readFileSync(
      join(process.cwd(), 'src/components/repair/ProductSelector.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      selectorSrc,
      /pos \? 'space-y-4'/,
      'kiosk browse must not stack vertical gutters above the grid',
    );
    assert.match(selectorSrc, /KIOSK_POS_CARD_SELECTED_FRAME/);
    // Same WorkbenchTriageBand height as To Ship / Unbox (PRIMARY_CHROME_ROW_FACE) —
    // never fork a taller kiosk-only band.
    assert.doesNotMatch(selectorSrc, /WorkbenchTriageBand[\s\S]*?className="h-14/);
    assert.match(selectorSrc, /className="pr-0"/);
    // Search filters the product stage only — left accordion siblings stay mounted.
    assert.match(
      selectorSrc,
      /if \(kioskSplit \|\| !search\.trim\(\)\) return rows/,
    );
  });

  it('caps the category column with flush divide-y rows', () => {
    assert.match(KIOSK_POS_SIDEBAR, /\bmd:w-64\b/);
    assert.match(KIOSK_POS_SIDEBAR, /\bmd:shrink-0\b/);
    assert.match(KIOSK_POS_SIDEBAR_BODY, /\bp-0\b/);
    assert.doesNotMatch(KIOSK_POS_CATEGORY, /\brounded-xl\b/);
    assert.doesNotMatch(KIOSK_POS_CATEGORY, /\brounded-full\b/);
    assert.equal(KIOSK_POS_CATEGORY_ACTIVE, KIOSK_PILL_ACTIVE);
    assert.match(KIOSK_POS_CATEGORY_IDLE, /\bbg-surface-card\b/);
    assert.match(KIOSK_POS_CATEGORY_LABEL, /\bleading-snug\b/);
    assert.match(KIOSK_POS_CATEGORY_STACK, /\bdivide-y\b/);
  });

  it('the right utility spine owns cart + paperwork (one toggle each)', () => {
    const shellSrc = readFileSync(SHELL, 'utf8');
    const railSrc = readFileSync(
      join(process.cwd(), 'src/app/kiosk/KioskUtilitySpine.tsx'),
      'utf8',
    );
    // Cart is the first slot — top-right glyph.
    assert.match(railSrc, /id: 'cart'[\s\S]*?id: 'paperwork'/);
    assert.match(shellSrc, /KioskUtilitySpine/);
    assert.match(shellSrc, /KioskPaperworkPanel/);
    // ONE closer: the ledger must not re-mount its own collapse control.
    const ledgerSrc = readFileSync(
      join(process.cwd(), 'src/app/kiosk/v2/KioskCartLedger.tsx'),
      'utf8',
    );
    assert.doesNotMatch(ledgerSrc, /kiosk-cart-toggle/);
  });

  it('search is the house find bar, not a kiosk-local input token', () => {
    const posSurfaceSrc = readFileSync(
      join(process.cwd(), 'src/app/kiosk/kiosk-pos-surface.ts'),
      'utf8',
    );
    const spineSrc = readFileSync(SPINE, 'utf8');
    const selectorSrc = readFileSync(
      join(process.cwd(), 'src/components/repair/ProductSelector.tsx'),
      'utf8',
    );
    // One search face across the app: MasterNav / Band-3 / To Ship / kiosk all
    // mount TechRailSearchBar. A kiosk-local input recipe is the fork this bans.
    assert.doesNotMatch(posSurfaceSrc, /KIOSK_POS_SEARCH_INPUT/);
    assert.match(spineSrc, /TechRailSearchBar/);
    assert.match(spineSrc, /variant="chrome"/);
    assert.doesNotMatch(spineSrc, /plane=/);
    assert.match(selectorSrc, /TechRailSearchBar/);
    assert.match(selectorSrc, /variant="chrome"/);
    assert.match(selectorSrc, /WorkbenchTriageBand/);
    assert.doesNotMatch(selectorSrc, /plane=/);
  });
});
