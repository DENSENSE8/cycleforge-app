/**
 * CartonContextCard has ONE face — the two-row Unbox SoT.
 *
 * Former `density="bar"` / `density="card"` / `density="bar-stacked"` props are
 * deleted. Every adapter mounts the stacked layout; hosts pair with
 * `reserveIdentityClearance="stacked"`. Reintroducing a density prop or a
 * one-row assembly is a fork of the station entity-context SoT.
 *
 * @see src/components/station/entity-context/CartonContextCard.tsx
 * @see .claude/rules/source-of-truth.md → Station entity-context header
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const BANNED = [
  /density\s*=\s*["']bar["']/,
  /density\s*=\s*["']bar-stacked["']/,
  /density\s*=\s*["']card["']/,
  /density\s*\?:\s*['"]bar['"]/,
  /density:\s*['"]bar['"]\s*\|\s*['"]bar-stacked['"]/,
] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|mdc?)$/.test(entry.name) && !entry.name.endsWith('.guard.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('carton-context-density', () => {
  it('CartonContextCard has no density prop', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.ok(
      !/\bdensity\s*[?:]/.test(src) && !/\bdensity\s*=/.test(src),
      'CartonContextCard must not reintroduce a density prop — one two-row face only',
    );
  });

  it('two-row commerce order: status · order# · tracking; under Photos price · listing · Claim', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(src, /photosClaimColumn/);
    // Scan-station Displays ←| · carton ↑↓ live on ScanStationUtilityRail —
    // CartonContextCard must not own that chrome. (Pack may still compose
    // sibling trailing chrome outside this card.)

    assert.match(src, /commerceUnderPhotos/);
    assert.match(
      src,
      /claimUnderPhotos = filedTicketChip \?\? claimCta/,
      'Claim CTA or filed ticket# share the under-Photos slot',
    );
    assert.match(
      src,
      /justify-end gap-1\.5[\s\S]{0,120}PoTotalChip[\s\S]{0,80}\{listingChip\}[\s\S]{0,40}\{claimUnderPhotos\}/,
      'under Photos must be end-aligned price · listing · Claim with gap-1.5',
    );
    // Row 2 left strip: order → tracking (no listing/price there).
    assert.match(
      src,
      /\{orderChip\}[\s\S]{0,200}\{trackingSlot\}/,
      'row 2 left must keep order# · tracking',
    );
    assert.doesNotMatch(
      src,
      /\{trackingSlot\}[\s\S]{0,300}\{listingChip\}/,
      'listing must not sit in the left identity strip',
    );
  });

  it('CartonContextCard tracking chip opts into carrier-colored MapPin', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(
      src,
      /showCarrierBrand/,
      'CartonContextCard tracking must pass showCarrierBrand for carrier-tinted MapPin',
    );
    assert.match(
      src,
      /carrierHint=\{carrierHint\}/,
      'CartonContextCard tracking must forward carrierHint to IdentityLinkChip',
    );
    assert.doesNotMatch(
      src,
      /preferCarrierTile|carrierTileSeparate/,
      'CartonContextCard must not keep the abandoned carrier SVG tile mode',
    );
  });

  it('carton-context faces stay flush (zero radius + zero inter-chip pad)', () => {
    const identity = readFileSync(
      join(SRC, 'components/station/entity-context/station-identity-chrome.ts'),
      'utf8',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_ROW_CLASS = 'flex items-center gap-0'/,
      'identity row chips must abut (gap-0)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_GROUP_CLASS = 'flex items-center gap-1\.5'/,
      'classify group chips are spaced pills (gap-1.5), not abutting segmented seams',
    );
    assert.doesNotMatch(
      identity,
      /STATION_IDENTITY_(?:ROW|GROUP)_CLASS = 'row-(?:gap|tight)'/,
      'identity chrome must not reintroduce row-gap / row-tight air',
    );

    const actionPill = readFileSync(
      join(SRC, 'components/station/entity-context/station-context-action-pill.ts'),
      'utf8',
    );
    const actionPillCode = actionPill
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.match(
      actionPillCode,
      /cornerClass\('flush'\)/,
      'Claim/Photos must use flush (zero) corner — never pill',
    );
    assert.doesNotMatch(
      actionPillCode,
      /cornerClass\('pill'\)|rounded-full/,
      'Claim/Photos must not reintroduce stadium pills',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_EXIT_PILL_CLASS\s*=\s*`[^`]*h-8 w-8/,
      'Exit / back must be an h-8 boxed flush face (not a bare chevron)',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_EXIT_PILL_CLASS\s*=\s*`[^`]*border border-border-soft/,
      'Exit box must paint a border so it matches Claim · Photos · classify',
    );
    assert.match(
      actionPillCode,
      /justify-between[\s\S]*?px-1\.5|px-1\.5[\s\S]*?justify-between/,
      'Photos pill must keep justify-between + inset pad (camera · count/+ off the border)',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_CLAIM_PILL_CLASS[\s\S]*?px-1\.5/,
      'Claim keeps px-1.5 inset (same as View All / Photos) so CLAIM stays off the border',
    );
    assert.doesNotMatch(
      actionPillCode,
      /STATION_CONTEXT_CLAIM_PILL_CLASS[\s\S]*?px-0/,
      'Claim must not edge-flush the label inside its locked width',
    );

    const pills = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/InlinePillPicker.tsx'),
      'utf8',
    );
    const pillsCode = pills
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(
      pillsCode,
      /rounded-full/,
      'InlinePillPicker (carton classify SoT) must stay square',
    );
    assert.match(
      pillsCode,
      /rounded-none/,
      'InlinePillPicker must cite rounded-none / flush faces',
    );
    assert.match(
      pillsCode,
      /PILL_BASE\s*=\s*['"][^'"]*px-1\.5/,
      'Classify label pills share px-1.5 inset with Claim · Photos · View All',
    );

    const card = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(
      card,
      /STATION_CONTEXT_EXIT_PILL_CLASS/,
      'CartonContextCard back control must use the boxed exit face',
    );
    const leadChrome = readFileSync(
      join(SRC, 'components/station/entity-context/station-identity-chrome.ts'),
      'utf8',
    );
    assert.match(
      leadChrome,
      /STATION_IDENTITY_LEAD_COL_CLASS\s*=\s*['"][^'"]*h-8 w-8/,
      'Lead column must match the boxed exit hit box (h-8 w-8)',
    );
  });

  it('CartonContextCard locks the order identity face to last-8 width', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(
      src,
      /tone="id"[\s\S]{0,80}lockLast8Width/,
      'CartonContextCard order chip must keep a fixed eight-character footprint',
    );

    const copyChipSrc = readFileSync(
      join(SRC, 'components/ui/CopyChip.tsx'),
      'utf8',
    );
    assert.match(
      copyChipSrc,
      /displayWidth === 'last8' \? 'w-\[8ch\]'/,
      'CopyChip last-8 display width must remain exactly 8ch',
    );
  });

  it('CartonContextCard order # icon reads platformMetaIconTone (no local color map)', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(
      src,
      /platformMetaIconTone\(platformMeta\)/,
      'Order/listing icon paint must resolve via platformMetaIconTone(platformMeta)',
    );
    assert.match(
      src,
      /tone="id"[\s\S]{0,120}iconClass=\{platformIconTone\?\.className\}/,
      'Order chip must tint # from platformIconTone.className',
    );
    assert.match(
      src,
      /iconStyle=\{platformIconTone\?\.style\}/,
      'Order chip must forward platformIconTone.style for catalog accentHex',
    );
    assert.match(
      src,
      /platformLabel=\{platformValue \? platformMeta\.label : null\}/,
      'Order chip tooltip must prefix the catalog-resolved platform label',
    );
    assert.doesNotMatch(
      src,
      /amazon\s*:\s*['"`]|ebay\s*:\s*['"`]#|PLATFORM_COLOR|platformColorMap/,
      'CartonContextCard must not invent a local platform→color map',
    );

    const chipSrc = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/IdentityLinkChip.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      chipSrc,
      /amazon\s*:\s*['"`]|ebay\s*:\s*['"`]#|PLATFORM_COLOR|platformColorMap/,
      'IdentityLinkChip must not invent a local platform→color map',
    );
  });

  it('IdentityLinkChip uses CarrierMark as leading icon when showCarrierBrand', () => {
    const src = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/IdentityLinkChip.tsx'),
      'utf8',
    );
    assert.match(
      src,
      /showCarrierBrand/,
      'IdentityLinkChip must expose showCarrierBrand for carton tracking',
    );
    assert.match(
      src,
      /<CarrierMark meta=\{carrierBrand\} \/>/,
      'Known carriers must tint the CopyChip leading MapPin via CarrierMark',
    );
    assert.doesNotMatch(
      src,
      /carrierTileSeparate|preferBrandTile/,
      'IdentityLinkChip must not keep sibling SVG tile / preferBrandTile mode',
    );
  });

  it('no call site passes density=bar / bar-stacked / card', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      // Ignore comments that only mention the retired names historically.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const pattern of BANNED) {
        if (pattern.test(code)) {
          offenders.push(`${relative(ROOT, file)} (~${pattern})`);
          break;
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Retired CartonContextCard density props still referenced:\n${offenders.join('\n')}`,
    );
  });
});
