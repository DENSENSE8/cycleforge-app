/**
 * Platform-aware order / PO identity is one codebase-wide contract:
 * ops UI channel face = colored PlatformMark (or order `#` tone), never typed
 * platform prose; resolved paint + label; last-8 face; bare copy payload.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('source-platform identity SoT', () => {
  it('SoT law: ops UI channel face is mark, not typed platform name', () => {
    const sot = read('.claude/rules/source-of-truth.md');
    assert.match(
      sot,
      /Ops UI channel face = colored mark, never typed platform name/,
      'source-of-truth must pin mark-not-prose channel face',
    );
    assert.match(sot, /PlatformMark/);
    const agents = read('AGENTS.md');
    assert.match(
      agents,
      /Ops UI channel face = colored mark, never typed platform name/,
      'AGENTS.md must pin mark-not-prose channel face',
    );
  });

  it('CopyChip behavior formats id tooltips through source-platform', () => {
    const hook = read('src/hooks/useCopyChip.ts');
    assert.match(hook, /historyKind === 'id'[\s\S]{0,100}formatPlatformTooltipLabel/);

    const chip = read('src/components/ui/CopyChip.tsx');
    assert.match(
      chip,
      /export const OrderIdChip[\s\S]{0,1600}platformLabel=\{platformLabel\}/,
      'OrderIdChip must forward platformLabel to CopyChip',
    );
    assert.match(
      chip,
      /export const OrderIdChip[\s\S]{0,1600}iconClass=\{plain \? undefined : iconClass\}/,
      'OrderIdChip must forward platform icon paint to CopyChip',
    );
    assert.match(
      chip,
      /export const PoChip[\s\S]{0,1800}platformLabel=\{platformLabel\}/,
      'PoChip must forward platformLabel to CopyChip',
    );
    assert.match(
      chip,
      /export const PoChip[\s\S]{0,1800}iconClass=\{iconClass\}/,
      'PoChip must forward platform icon paint to CopyChip',
    );
  });

  it('shared platform-aware surfaces pass their resolved label', () => {
    const surfaces = [
      ['src/components/station/entity-context/CartonContextCard.tsx', /platformLabel=\{platformValue \? platformMeta\.label : null\}/],
      ['src/components/ui/OrderIdentityChips.tsx', /<OrderIdChip[\s\S]{0,180}platformLabel=\{platformLabel\}/],
      ['src/components/station/incoming-grid/cells/index.tsx', /platformLabel=\{platformMeta\.value \? platformMeta\.label : null\}/],
      ['src/components/station/receiving-grid/cells/ReceivingOrderCell.tsx', /platformLabel=\{platformLabel \|\| null\}/],
      ['src/components/search/order-feedback/SearchOrderDispositionBar.tsx', /<OrderIdChip[\s\S]{0,220}platformLabel=\{platformLabel\}/],
      ['src/components/search/order-feedback/SearchOrderFactsColumn.tsx', /<OrderIdChip[\s\S]{0,220}platformLabel=\{platformLabel\}/],
      ['src/components/search/SearchResultRow.tsx', /<OrderIdChip[\s\S]{0,220}platformLabel=\{platformLabel\}/],
      // Recent-rail peeks resolve label + `#` tone from platformValue inside the SoT.
      ['src/components/sidebar/rail-shell/RailPeekIdentityFacts.tsx', /platformLabel=\{platformLabel\}/],
      ['src/components/sidebar/rail-shell/RailPeekIdentityFacts.tsx', /platformMetaIconTone/],
      // Empty keepEmpty order paints catalog platform label (hover-prefix parity).
      ['src/components/sidebar/rail-shell/RailPeekIdentityFacts.tsx', /platformFace/],
      ['src/components/sidebar/rail-shell/RailPeekIdentityFacts.tsx', /UNKNOWN_PLATFORM/],
    ] as const;

    for (const [file, pattern] of surfaces) {
      assert.match(read(file), pattern, `${file} must use the shared platform identity tooltip`);
    }
  });

  it('channel faces use PlatformMark / GridPlatformMarkValue — not typed platform prose', () => {
    const sync = read('src/components/sidebar/OrderSyncDialog.tsx');
    assert.match(sync, /PlatformMark/, 'Order sync trailing channel must be PlatformMark');
    assert.doesNotMatch(
      sync,
      /uppercase tracking-wide text-text-soft[\s\S]{0,80}\{row\.platform/,
      'Order sync must not paint uppercase {row.platform} prose',
    );

    const csv = read('src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx');
    assert.match(
      csv,
      /GridPlatformMarkValue/,
      'CSV staging platform cell must use GridPlatformMarkValue',
    );
    assert.doesNotMatch(
      csv,
      /case 'platform':[\s\S]{0,120}<span className="truncate">\{row\.platform\}/,
      'CSV staging must not paint raw platform text',
    );

    const peek = read('src/components/order-record/CompactOrderPeek.tsx');
    assert.match(peek, /PlatformMark/, 'CompactOrderPeek channel face must be PlatformMark');
    assert.doesNotMatch(peek, /getAccountSourceLabel/);
    assert.doesNotMatch(
      peek,
      /PaneHeaderStatusPill tone="yellow">\{platformLabel\}/,
      'CompactOrderPeek must not use a yellow platform status pill',
    );

    const shipping = read('src/components/shipped/details-panel/ShippingInformationSection.tsx');
    assert.match(shipping, /PlatformMark/, 'Shipping info channel face must be PlatformMark');
    assert.doesNotMatch(shipping, /getAccountSourceLabel/);

    for (const file of [
      'src/components/inventory/SkuIdentity.tsx',
      'src/components/shipped/details-panel/ProductDetailsSection.tsx',
      'src/components/products/pairing/PairingQueueList.tsx',
      'src/components/products/pairing/product-hub/ChannelSection.tsx',
      'src/components/outbound/labels/LabelsOrderWorkspace.tsx',
      'src/components/mobile/feed/rows/PendingOrderRow.tsx',
    ]) {
      const src = read(file);
      assert.match(src, /PlatformMark/, `${file} must paint PlatformMark`);
      assert.doesNotMatch(
        src,
        /function\s+platformStyle|function\s+styleFor|PLATFORM_CHIP_CLASSES|PLATFORM_STYLE\s*=/,
        `${file} must not keep a page-local platform color map`,
      );
    }
  });

  it('Product Hub platform-style twin is retired', () => {
    assert.equal(
      existsSync(join(ROOT, 'src/components/products/pairing/platform-style.ts')),
      false,
      'platform-style.ts must be deleted — use source-platform + PlatformMark',
    );
    const hubList = read('src/components/products/pairing/product-hub-platforms.ts');
    assert.match(hubList, /PRODUCT_HUB_PLATFORMS/);
    assert.doesNotMatch(hubList, /chip:|ring:|platformStyle/);
  });

  it('views do not own platform tooltip formatting or color maps', () => {
    for (const file of [
      'src/components/station/entity-context/CartonContextCard.tsx',
      'src/components/ui/OrderIdentityChips.tsx',
      'src/components/search/order-feedback/SearchOrderDispositionBar.tsx',
      'src/components/search/order-feedback/SearchOrderFactsColumn.tsx',
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /function\s+formatPlatformTooltip|PLATFORM_COLOR|platformColorMap/);
      assert.doesNotMatch(src, /getAccountSourceLabel/);
    }
  });
});
