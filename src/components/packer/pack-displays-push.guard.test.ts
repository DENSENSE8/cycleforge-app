/**
 * Pack Displays-push SoT — pinned as CODE.
 *
 * `pattern-evolution.md` Always #6: a rules file cannot fail, so the law lands
 * with a guard, not only prose.
 *
 * Pack joins the Unbox-family scan-station Displays grammar:
 *   - CENTRE = checklist (lines) or UNIT photo peek — not a SectionTabsSlider strip
 *   - RIGHT  = StationDisplaysPushStack (Photos · Timeline · Listings — no Ticket · Support)
 *   - Host   = StationScanPaneHost + StationPanelRoot
 *   - Identity flow + bodyGap=none (flat centre, hairline abuts work)
 *
 * Golden: LineEditPanel. Arrival twin: arrival-displays-push.guard.test.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const PACK_PANEL = 'src/components/packer/PackOrderPanel.tsx';

describe('Pack Displays push — Unbox-family scan-station SoT', () => {
  const panel = read(PACK_PANEL);

  it('composes StationScanPaneHost + StationPanelRoot', () => {
    assert.match(panel, /StationScanPaneHost/, 'Pack must mount StationScanPaneHost');
    assert.match(panel, /StationPanelRoot/, 'Pack centre must compose StationPanelRoot (sunken SoT)');
    assert.match(panel, /centerTestId=["']pack-station-center["']/);
  });

  it('mounts StationDisplaysPushStack with Pack storage key / testids', () => {
    assert.match(
      panel,
      /StationDisplaysPushStack/,
      'Pack tools live on the shared Displays push stack, never RightRailHost',
    );
    assert.doesNotMatch(panel, /navMode/, 'navMode was deleted — one Root-to-Leaf grammar');
    assert.match(panel, /indexRows=\{displayIndexRows\}/);
    assert.match(panel, /buildPackDisplayIndexRows/);
    assert.match(panel, /storageKey=["']pack-displays-push-width["']/);
    assert.match(panel, /testId=["']pack-displays-push["']/);
    assert.match(panel, /ariaLabel=["']Pack displays["']/);
    assert.doesNotMatch(
      panel,
      /StationActionDossierShell/,
      'Action densify lives in station/displays leaf hosts — Pack panel must not fork it',
    );
  });

  it('scan/pack Displays only — Photos · Timeline · Listings; no Ticket · Support', () => {
    assert.match(panel, /id:\s*['"]photos['"]/);
    assert.match(panel, /id:\s*['"]timeline['"]/);
    assert.match(panel, /id:\s*['"]listings['"]/);
    assert.match(panel, /ListingLinksTab/);
    assert.match(panel, /packListingIdentity/);
    assert.doesNotMatch(panel, /SupportContextHub/, 'Ticket/Support hubs leave Pack Displays');
    assert.doesNotMatch(
      panel,
      /id:\s*['"]ticket['"]/,
      'Ticket is not a Pack Displays leaf (dumb packer)',
    );
    assert.doesNotMatch(
      panel,
      /id:\s*['"]support['"]/,
      'Support is not a Pack Displays leaf (dumb packer)',
    );
  });

  it('the CENTRE carries no SectionTabsSlider packing-displays strip', () => {
    assert.ok(
      !panel.includes('SectionTabsSlider'),
      'mid-canvas SectionTabsSlider must leave PackOrderPanel — tools live on Displays',
    );
    assert.ok(
      !panel.includes('ariaLabel="Packing displays"'),
      'legacy packing-displays centre strip label must stay deleted',
    );
  });

  it('centre mounts the checklist (or UNIT peek) as the lines display', () => {
    assert.match(
      panel,
      /OrderPackChecklist/,
      'checklist owns the centre for standard pack scans (Pack lines display)',
    );
    assert.match(
      panel,
      /bodyGap=["']none["']/,
      'flat centre floor — zero vertical air between identity and checklist',
    );
    assert.match(panel, /placement=["']flow["']/);
    assert.match(panel, /reserveIdentityClearance=\{false\}/);
  });

  it('ScanStationUtilityRail carries Open displays while Displays are closed', () => {
    assert.match(
      panel,
      /utilityRail=\{/,
      'utility mounts on ScanStationUtilityRail via StationScanPaneHost',
    );
    assert.doesNotMatch(
      panel,
      /trailingUtility=\{/,
      'must not live inside CartonContextCard / PackOrderIdentity',
    );
    assert.match(
      panel,
      /!activeSideTab \?[\s\S]{0,160}StationDisplaysEdgeToggle variant="pane-open"/,
      '←| Open displays mounts only while the Displays column is closed',
    );
  });
});

describe('PackOrderWorkspace overlay — no padded island fighting StationPanelRoot', () => {
  const workspace = read('src/components/packer/PackOrderWorkspace.tsx');

  it('order overlay has no bg-surface-card / p-4 island wrapper', () => {
    assert.doesNotMatch(
      workspace,
      /bg-surface-card[\s\S]{0,80}PackOrderPanel/,
      'overlay must not paint a card fill over StationPanelRoot sunken',
    );
    assert.doesNotMatch(
      workspace,
      /overflow-y-auto bg-surface-canvas p-4/,
      'FBA overlay must not keep padded canvas island',
    );
  });
});
