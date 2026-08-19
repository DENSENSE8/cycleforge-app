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

  it('one-row three-zone bar: status · order# · tracking left; price · listing · claim/ticket · photos trailing', () => {
    const src = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    );
    // The two-row face was retired by `da4736740 feat(station): one-row
    // three-zone carton context bar`. This guard tracked the old assembly for
    // months after, asserting `photosClaimColumn` / `carton-context-two-row`
    // against a card that renders neither — so it failed on every run and
    // guarded nothing. It now pins the shipped one-row SoT.
    assert.match(src, /carton-context-one-row/);
    assert.doesNotMatch(
      src,
      /carton-context-two-row|photosClaimColumn|commerceUnderPhotos/,
      'the two-row assembly is retired — never reintroduce a second identity band',
    );
    // Scan-station Displays ←| · carton ↑↓ live on ScanStationUtilityRail —
    // CartonContextCard must not own that chrome. (Pack may still compose
    // sibling trailing chrome outside this card.)

    assert.match(
      src,
      /carton-context-lifecycle-dot/,
      'the one-row bar leads identity with the lifecycle DOT — the locked h-6 pill went with the second band',
    );
    assert.doesNotMatch(
      src,
      /flex shrink-0 flex-col items-end/,
      'must not stack Photos + commerce in a flex-col (that is the retired second band)',
    );
    // Left zone reads STATE → WHICH CARTON: dot, then order #, then tracking.
    assert.match(
      src,
      /\{statusDot\}[\s\S]{0,700}\{orderChip\}[\s\S]{0,200}\{trackingSlot\}/,
      'left identity zone must keep dot · order# · tracking in that order',
    );
    // Trailing zone is quiet price, then the action cells, ⋯ last.
    assert.match(
      src,
      /\{priceFace\}[\s\S]{0,200}\{listingIconButton\}[\s\S]{0,200}\{ticketInline \?\? claimIconButton\}[\s\S]{0,200}\{photosCell\}[\s\S]{0,200}\{overflowMenu\}/,
      'trailing zone must be price · listing · (ticket ?? claim) · photos · overflow',
    );
    assert.doesNotMatch(
      src,
      /\{trackingSlot\}[\s\S]{0,300}\{listingIconButton\}/,
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
    // `STATION_IDENTITY_ROW_CLASS` / `STATION_IDENTITY_COMMERCE_ROW_FACE` were
    // the second band's tokens and went with it. The one-row bar composes the
    // face + seam directly on the strip, so those are what this pins.
    assert.doesNotMatch(
      identity,
      /STATION_IDENTITY_(?:ROW_CLASS|COMMERCE_ROW_FACE|COMMERCE_ROW_CLASS)/,
      'the retired second-band tokens must not come back — one strip, one face',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-7'/,
      'one-row clearance must match primary chrome h-7 (28px)',
    );
    assert.match(
      identity,
      /STATION_IDENTITY_GROUP_CLASS =\s*\n?\s*'flex h-full min-h-0 items-stretch gap-0'/,
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
    // Exit stopped deriving from the boxed cube when the bar became one
    // continuous strip: it fills the lead column BORDERLESS so no cell draws
    // edges at rest. Height still comes from PRIMARY_CHROME_ROW_FACE.
    const exitFace =
      /export const STATION_CONTEXT_EXIT_PILL_CLASS = \[[\s\S]*?\]\.join/.exec(
        actionPillCode,
      );
    assert.ok(exitFace, 'Exit face not found — update this guard alongside it.');
    assert.match(
      exitFace[0],
      /h-full w-full/,
      'Exit / back fills the lead column flush — height owned by PRIMARY_CHROME_ROW_FACE',
    );
    assert.match(
      exitFace[0],
      /border-0/,
      'Exit stays borderless so the strip has no rest-state cell edges',
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
    // `STATION_CONTEXT_CLAIM_PILL_CLASS` / `STATION_CONTEXT_STATUS_PILL_CLASS`
    // were h-6 faces for the retired secondary band. On the one-row strip Claim
    // is a full-height chrome cell and status is a bare dot, so those are the
    // shapes pinned here.
    assert.doesNotMatch(
      actionPillCode,
      /STATION_CONTEXT_(?:CLAIM|STATUS)_PILL_CLASS/,
      'the h-6 secondary-band faces are retired — Claim is a full-height cell, status is a dot',
    );
    const claimFace =
      /export const STATION_CONTEXT_CLAIM_CHROME_CLASS = \[[\s\S]*?\]\.join/.exec(
        actionPillCode,
      );
    assert.ok(claimFace, 'Claim face not found — update this guard alongside it.');
    assert.match(
      claimFace[0],
      /h-full/,
      'Claim fills the primary chrome row — never a fixed h-6 band height',
    );
    assert.match(
      claimFace[0],
      /px-1\.5/,
      'Claim keeps px-1.5 inset (same as View All / Photos) so CLAIM stays off the border',
    );
    assert.doesNotMatch(
      claimFace[0],
      /px-0/,
      'Claim must not edge-flush the label',
    );
    assert.match(
      actionPillCode,
      /justify-between[\s\S]*?px-1\.5|px-1\.5[\s\S]*?justify-between/,
      'Photos pill must keep justify-between + inset pad (camera · count/+ off the border)',
    );

    const pills = readFileSync(
      join(SRC, 'components/receiving/workspace/line-edit/InlinePillPicker.tsx'),
      'utf8',
    );
    const pillsCode = pills
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // `rounded-full` is banned on the pill FACES, not on the 2x2 status dot —
    // the house keeps the round dot (`kinetic-ledger.md`: rounded-full survives
    // for status dots, avatars and Switch tracks). A blanket ban here failed on
    // the dot and taught nothing.
    const pillFaces = pillsCode.replace(/'h-2 w-2 shrink-0 rounded-full'/g, '');
    assert.doesNotMatch(
      pillFaces,
      /rounded-full/,
      'InlinePillPicker (carton classify SoT) faces must stay square — only the status dot is round',
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

    // Comment-stripped: the card's own docblock explains why it uses `Button`
    // and NOT `IconButton`, which tripped the ban below on the prose rather
    // than on a mount.
    const card = readFileSync(
      join(SRC, 'components/station/entity-context/CartonContextCard.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
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
      /STATION_CHROME_ROW_FACE[\s\S]{0,200}STATION_CHROME_SEAM_HAIRLINE/,
      'the one-row bar composes the primary chrome face + the seam hairline directly',
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
      /galleryPlacement\s*=\s*["']below["']/,
      'Arrival hover strip (when not suppressed) opens below the pill',
    );
    // "below" must resolve to bottom-CENTER. The carton strip is a row of
    // narrow abutting cells, so a start-aligned panel sits under a neighbour
    // and reads as that cell's menu.
    assert.match(
      readFileSync(
        join(SRC, 'components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx'),
        'utf8',
      ),
      /return 'bottom-center';/,
      'the Photos gallery opens centered under the pill, not left-aligned to it',
    );

    const panel = readFileSync(
      join(SRC, 'components/receiving/workspace/LineEditPanel.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Unbox now wires `onOpenPhotosDisplay` — for DOUBLE-click, which opens the
    // Photos Actions leaf. The guard used to ban the prop outright as a proxy
    // for "click must not open Displays"; that proxy went stale the moment the
    // double-click route landed, and the real invariant is asserted on the pill
    // itself below (click always calls handleRequestOnPhone).
    assert.match(
      panel,
      /onOpenPhotosDisplay=\{openPhotosDisplay\}/,
      'Unbox threads the Photos Displays leaf for the double-click route',
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
    // The pill DOES know about Displays — on double-click. Banning the prop
    // name asserted the mechanism, not the behaviour, and went stale when the
    // double-click route landed. Pin the split instead: single click defers to
    // the phone, double-click cancels that timer and opens the leaf.
    assert.match(
      pill,
      /handlePillClick[\s\S]{0,400}handleRequestOnPhone\(\)/,
      'single click still routes to send-to-phone',
    );
    assert.match(
      pill,
      /handlePillDoubleClick[\s\S]{0,300}onOpenPhotosDisplay\(\)/,
      'only the DOUBLE-click opens the Photos Displays leaf',
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
