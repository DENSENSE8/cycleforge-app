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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

  it('two-row commerce order: status · order# · tracking; price · listing · Claim on same bottom row', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    assert.match(src, /photosClaimColumn/);
    assert.match(src, /carton-context-two-row/);
    // Scan-station Displays ←| · carton ↑↓ live on ScanStationUtilityRail —
    // CartonContextCard must not own that chrome. (Pack may still compose
    // sibling trailing chrome outside this card.)

    assert.match(src, /commerceUnderPhotos/);
    assert.match(
      src,
      /claimUnderPhotos = filedTicketChip \?\? claimCta/,
      'Claim CTA or filed ticket# share the row-2 trailing slot',
    );
    assert.match(
      src,
      /STATION_IDENTITY_COMMERCE_ROW_CLASS, 'justify-end'\)[\s\S]{0,120}PoTotalChip[\s\S]{0,80}\{listingChip\}[\s\S]{0,40}\{claimUnderPhotos\}/,
      'row 2 trailing must be end-aligned price · listing · Claim (gap-0 via STATION_IDENTITY_COMMERCE_ROW_CLASS)',
    );
    assert.match(
      src,
      /carton-context-lifecycle-pill/,
      'row 2 leading status must be a locked pill, not a bare status dot',
    );
    assert.doesNotMatch(
      src,
      /carton-context-lifecycle-dot/,
      'bare lifecycle status dot is retired on carton identity',
    );
    assert.doesNotMatch(
      src,
      /justify-end gap-1\.5[\s\S]{0,120}PoTotalChip/,
      'commerce must not reintroduce gap-1.5 between price · listing · Claim',
    );
    assert.doesNotMatch(
      src,
      /flex shrink-0 flex-col items-end/,
      'must not stack Photos + commerce in a flex-col (that drops a third band)',
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
      /PRIMARY_CHROME_ROW_FACE/,
      'station chrome must import PRIMARY_CHROME_ROW_FACE',
    );
    assert.match(
      identity,
      /STATION_CHROME_ROW_FACE = PRIMARY_CHROME_ROW_FACE/,
      'station chrome seam aliases PRIMARY_CHROME_ROW_FACE (scan · identity · Displays)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_ROW_CLASS = `flex \$\{STATION_CHROME_ROW_FACE\} items-stretch gap-0 \$\{STATION_CHROME_SEAM_HAIRLINE\}`/,
      'identity row chips must abut (gap-0) and stretch flush to the primary chrome face',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_COMMERCE_ROW_FACE = STATION_SECONDARY_BAND_FACE/,
      'commerce row 2 must share STATION_SECONDARY_BAND_FACE with left eyebrow / VERIFICATION',
    );
    assert.match(
      readFileSync(join(process.cwd(), 'src/components/layout/header-shell.ts'), 'utf8'),
      /STATION_SECONDARY_BAND_FACE = 'h-6 shrink-0'/,
      'secondary band SoT stays h-6 (left eyebrow · commerce · VERIFICATION)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-\[52px\]'/,
      'stacked clearance must be chrome h-7 + secondary h-6 (52px)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-7'/,
      'one-row clearance must match primary chrome h-7 (28px)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_GROUP_CLASS = 'flex h-full min-h-0 items-stretch gap-0'/,
      'classify group chips abut (gap-0) and fill the chrome row height',
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
      /STATION_CONTEXT_BOXED_CUBE_CLASS[\s\S]*?border border-border-soft/,
      'Boxed cube (Exit · Unbox pin-list) paints border + card',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_EXIT_PILL_CLASS = `\$\{STATION_CONTEXT_BOXED_CUBE_CLASS\} h-full w-full`/,
      'Exit / back fills the lead column flush — height owned by PRIMARY_CHROME_ROW_FACE',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_PHOTO_TONE =/,
      'Photos blue tone is one SoT — chrome + dock phone thirds compose it',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_PHOTO_PILL_CLASS = `h-full /,
      'Photos face fills chrome row 1 (h-full — never Button size height)',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_PHOTO_PILL_CLASS[\s\S]*?\$\{STATION_CONTEXT_PHOTO_TONE\}/,
      'Photos pill composes PHOTO_TONE — never a forked blue recipe',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_PHOTO_PILL_CLASS[\s\S]*?border-b-0 border-r-0/,
      'Photos drops bottom+trailing borders — row hairline + Displays border-l own the seam',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_PHOTO_FLUSH_CLASS[\s\S]*?\$\{STATION_CONTEXT_PHOTO_TONE\}/,
      'Photos flush cell composes PHOTO_TONE',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_CLAIM_PILL_CLASS = `h-6 /,
      'Claim face fills secondary band row 2 (h-6)',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_CLAIM_PILL_CLASS[\s\S]*?border-t-0 border-r-0/,
      'Claim drops top+trailing borders — pairs with Photos; Displays owns the vertical rule',
    );
    assert.match(
      actionPillCode,
      /STATION_CONTEXT_STATUS_PILL_CLASS = `[^`]*h-6 w-14/,
      'Status pill is locked w-14 on the h-6 secondary band',
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
    assert.match(
      pillsCode,
      /h-full shrink-0 self-stretch items-stretch/,
      'Collapsed urgency · platform · type hosts stretch to the chrome row (not content height)',
    );
    assert.match(
      pillsCode,
      /leading-none/,
      'Classify faces use leading-none so tone copy cannot change pill height',
    );
    assert.match(
      pillsCode,
      /DEFAULT_ACTIVE\s*=\s*['"][^'"]*shadow-none/,
      'Classify default active face must stay flat (shadow-none), matching Photos · Claim',
    );
    assert.doesNotMatch(
      pillsCode,
      /DEFAULT_ACTIVE\s*=\s*['"][^'"]*shadow-sm/,
      'Classify default active must not reintroduce soft drop shadows',
    );
    assert.match(
      pillsCode,
      /collapsedClassName = cn\([\s\S]*?'shadow-none'/,
      'Collapsed classify face must force shadow-none even if a tone SoT regresses',
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
    assert.doesNotMatch(
      card,
      /\bIconButton\b/,
      'Exit must be a ds-raw-button boxed cube, not IconButton',
    );
    assert.doesNotMatch(
      card,
      /STATION_SCAN_BAR_MODE_/,
      'Exit must not import scan-bar mode chrome (carton-context owns the boxed face)',
    );
    assert.match(
      actionPillCode,
      /ds-raw-button/,
      'Exit face is ds-raw-button (boxed lead cube)',
    );
    assert.doesNotMatch(
      actionPillCode,
      /STATION_SCAN_BAR_MODE_/,
      'Exit pill must not compose scan-bar mode tokens',
    );
    assert.match(
      card,
      /STATION_IDENTITY_ROW_CLASS,\s*'justify-end'\)/,
      'Photos cell shares STATION_IDENTITY_ROW_CLASS with classify · Exit (same PRIMARY face)',
    );
    assert.match(
      card,
      /STATION_IDENTITY_COMMERCE_ROW_CLASS/,
      'Row 2 commerce stays on STATION_IDENTITY_COMMERCE_ROW_CLASS (h-6) — not PRIMARY',
    );
    const leadChrome = readFileSync(
      join(SRC, 'components/station/entity-context/station-identity-chrome.ts'),
      'utf8',
    );
    assert.match(
      leadChrome,
      /STATION_IDENTITY_LEAD_COL_CLASS\s*=\s*['"][^'"]*h-full aspect-square[^'"]*items-stretch/,
      'Lead column is a square track; exit child stretches flush',
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
      /<CarrierMark meta=\{carrierBrand\} footprint="chip" \/>/,
      'Known carriers must tint the CopyChip leading MapPin via chip-sized CarrierMark',
    );
    assert.doesNotMatch(
      src,
      /carrierTileSeparate|preferBrandTile/,
      'IdentityLinkChip must not keep sibling SVG tile / preferBrandTile mode',
    );
  });

  it('Unbox Photos suppresses hover strip; pill click stays send-to-phone', () => {
    const card = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.match(
      card,
      /suppressHoverGallery=\{suppressPhotoHoverGallery\}/,
      'Carton context threads hover-strip suppress for Unbox',
    );
    assert.match(
      card,
      /galleryPlacement\s*=\s*["']left["']/,
      'Arrival hover strip (when not suppressed) opens left of the pill',
    );

    const panel = readFileSync(
      join(SRC, 'components/receiving/workspace/LineEditPanel.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.match(
      panel,
      /suppressPhotoHoverGallery/,
      'Unbox identity suppresses Photos hover strip',
    );
    assert.doesNotMatch(
      panel,
      /onOpenPhotosDisplay/,
      'pill click must not open Displays — send-to-phone stays the click action',
    );

    const pill = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.match(pill, /suppressHoverGallery/, 'pill can suppress hover strip');
    assert.match(
      pill,
      /void handleRequestOnPhone\(\)/,
      'pill click always send-to-phone',
    );
    assert.doesNotMatch(
      pill,
      /onOpenPhotosDisplay/,
      'pill must not route click to Displays',
    );
    assert.match(pill, /AnchoredLayer/, 'non-suppressed paths still portal via AnchoredLayer');
    assert.match(
      pill,
      /level\s*=\s*["']panelPopover["']/,
      'panelPopover beats utility rail + Displays (incl. overlay z-panel)',
    );
    assert.doesNotMatch(
      pill,
      /z-30/,
      'must not trap the strip at raw z-30 inside the overflow-hidden center',
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

  it('identity never reintroduces a middle Show-details / Level-1 strip', () => {
    const card = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    assert.doesNotMatch(
      card,
      /CartonContextLevel1|carton-context-level1|Show details/i,
      'secondary triage detail belongs in Displays — see carton-context-details-in-displays.guard.test.ts',
    );
    assert.equal(
      existsSync(
        join(SRC, 'components/station/entity-context/CartonContextLevel1.tsx'),
      ),
      false,
      'CartonContextLevel1 must stay deleted',
    );
  });
});
