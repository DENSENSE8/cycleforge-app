/**
 * Displays nested verbs: Photos · Linkage · Units are armed rows only (no
 * parent underline strip). Ticket is presence-exclusive. Child tool modes use
 * TabDisplay `appearance="segment"` (Claim New·Link · Move · Prebox) — never
 * soft TabSwitch pills / inverse fill.
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

/** Armed-row leaf hosts — no parent TabDisplay underline. */
const ARMED_VERB_HOSTS = [
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
] as const;

/**
 * Units is a body-only Assets leaf (explosion host). Prebox is a peer leaf
 * (`PreboxDisplayHost`) — not nested under Units via StationArmedVerbList.
 * SoT: units-explosion.guard.test.ts.
 */
const UNITS_BODY_HOST =
  'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx';

const FLUSH_STACK_HOSTS = [
  ...ARMED_VERB_HOSTS,
  UNITS_BODY_HOST,
  'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
] as const;

const TAB_DISPLAY = 'src/design-system/components/TabDisplay.tsx';
const CLAIM_NAV = 'src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx';

describe('Displays nested verbs — armed rows + child segment', () => {
  for (const host of ARMED_VERB_HOSTS) {
    it(`${host} is armed rows only — no nested TabDisplay strip`, () => {
      const src = read(host);
      assert.match(
        src,
        /StationArmedVerbList|PhotosActionsArmedList/,
        `${host} must compose an armed verb list`,
      );
      assert.doesNotMatch(
        src,
        /\bTabDisplay\b/,
        `${host} dropped parent underline tabs`,
      );
      assert.doesNotMatch(
        src,
        /\bTabSwitch\b/,
        `${host} must not import soft TabSwitch pills`,
      );
      assert.doesNotMatch(
        src,
        /appearance="underline"/,
        `${host}: parent underline debt is retired`,
      );
    });
  }

  it('PhotosDisplayHost keeps Actions launcher contract', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
    );
    assert.match(src, /PhotosActionsArmedList/);
    assert.doesNotMatch(
      src,
      /launcherLayout="toolbar"|CopyChipHoverMenuPanel/,
      'Actions is keyboard-armed — not hover-toolbar chrome',
    );
    assert.doesNotMatch(
      src,
      /PhotosGalleryBody|mode="view"/,
      'no legacy PhotosGalleryBody under Photos Displays',
    );
  });

  it('UnitsDisplayHost is body-only — Prebox is a peer Assets leaf', () => {
    const src = read(UNITS_BODY_HOST);
    assert.match(src, /<UnitsExplosionDisplay/);
    assert.doesNotMatch(
      src,
      /StationArmedVerbList|PhotosActionsArmedList|PreboxWizard/,
      'Units dropped nested armed verbs; Prebox lives on PreboxDisplayHost',
    );
    assert.doesNotMatch(src, /\bTabDisplay\b/, 'no nested TabDisplay strip');
    assert.doesNotMatch(src, /\bTabSwitch\b/, 'no soft TabSwitch pills');
  });

  it('TicketDisplayHost is presence-exclusive — no Chat · Claim TabDisplay', () => {
    const src = read('src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx');
    assert.doesNotMatch(src, /\bTabDisplay\b/, 'no nested Chat · Claim switcher');
    assert.doesNotMatch(src, /\bTabSwitch\b/, 'no soft TabSwitch either');
    assert.doesNotMatch(src, /TICKET_TABS/, 'no Chat · Claim tab catalog');
  });

  it('TabDisplay is flush / zero-radius (no rounded-full pills)', () => {
    const src = read(TAB_DISPLAY);
    assert.match(src, /cornerClass\('flush'\)/, 'active face + rail use flush corners');
    assert.doesNotMatch(src, /rounded-full/, 'industrial SoT forbids capsule rails');
    assert.doesNotMatch(src, /shadow-sm/, 'no soft drop shadow under the rail');
    assert.match(
      src,
      /type TabDisplayAppearance = 'fill' \| 'underline' \| 'segment'/,
      'parent underline + child segment appearances are part of the SoT API',
    );
  });

  it('SectionTabsSlider icon strip is SpaceX primary plate (flush, ⋮ peer)', () => {
    const src = read('src/design-system/components/SectionTabsSlider.tsx');
    assert.match(src, /from '\.\/TabDisplay'/, 'inline density composes TabDisplay');
    assert.doesNotMatch(
      src,
      /from '\.\/TabSwitch'/,
      'SectionTabsSlider must not import soft TabSwitch',
    );
    assert.doesNotMatch(
      src,
      /rounded-(?:lg|md|full)/,
      'icon / overflow cells must stay flush — no soft radius',
    );
    assert.match(
      src,
      /ICON_CELL_ACTIVE_CLASS[\s\S]*border-b-2/,
      'active topic cell uses underline, not sunken pill wash',
    );
    assert.match(
      src,
      /ICON_CELL_CLASS[\s\S]*PRIMARY_CHROME_ROW_FACE/,
      'topic plate cells are PRIMARY_CHROME_ROW_FACE SpaceX face',
    );
    assert.match(
      src,
      /flex-1 items-center justify-center/,
      'topic cells share the rail equally — icons centered in each share',
    );
    assert.doesNotMatch(
      src,
      /w-10 shrink-0 grow-0 basis-10/,
      'idle cells must not stay fixed w-10 (left-clustered) — they share flex-1',
    );
    assert.match(
      src,
      /motionRole\.push\.rail/,
      'topic-plate expand uses push.rail layout tween (never a spring)',
    );
    assert.match(
      src,
      /AnimatePresence/,
      'selected label mounts with enter/exit presence',
    );
    assert.match(
      src,
      /width: 'auto'/,
      'selected label click-expands width',
    );
    assert.doesNotMatch(
      src,
      /ICON_CELL_CLASS[\s\S]*h-6/,
      'h-6 face inverted hierarchy under nested verb rows',
    );
    assert.match(src, /MoreVertical/, 'overflow ⋮ stays on the topic plate row');
    assert.match(
      src,
      /ICON_OVERFLOW_CELL_CLASS[\s\S]*PRIMARY_CHROME_ROW_FACE/,
      '⋮ peer shares the PRIMARY_CHROME_ROW_FACE plate height',
    );
    assert.match(
      src,
      /divide-x divide-border-default/,
      'Cybertruck plate cells use vertical dividers matching the outer frame',
    );
    assert.match(
      src,
      /iconRail && 'border border-border-default bg-surface-card'/,
      'topic plate is a four-edge readable chrome frame (not bottom-rule-only)',
    );
    assert.doesNotMatch(
      src,
      /iconRail && 'border border-border-hairline/,
      'outer plate must not use near-invisible border-hairline (internal dividers only)',
    );
    assert.doesNotMatch(
      src,
      /iconRail && 'border-b border-border-default/,
      'icon plate must not use bottom-only border',
    );
    assert.match(
      src,
      /border-b-text-default/,
      'active underline colors bottom only — must not fight divide-x seams',
    );
    assert.match(
      src,
      /bodyGapClass = iconRail \? 'space-y-0'/,
      'icon plate → body is gap-0 (no vertical air under the topic strip)',
    );
  });

  it('Unbox Displays drill-down uses DisplaysIndexLeafStage (no icon plate)', () => {
    const src = read('src/components/station/displays/StationDisplaysPushStack.tsx');
    const stage = read('src/components/station/displays/DisplaysIndexLeafStage.tsx');
    assert.match(
      src,
      /DisplaysIndexLeafStage/,
      'PushStack composes the shared index→leaf stage waist',
    );
    assert.match(
      stage,
      /DISPLAYS_FLUSH_HOST/,
      'stage body uses flush host SoT (px-0)',
    );
    assert.match(
      stage,
      /StationDisplayIndexList/,
      'Root Index list lives in the shared stage',
    );
    assert.doesNotMatch(
      src,
      /UnboxSectionTabs|density=["']icon["']/,
      'horizontal icon topic plate is retired as Displays primary nav',
    );
    assert.doesNotMatch(
      src,
      /DISPLAYS_STRIP_HEADER_CLASS\s*=\s*'-mx-4'/,
      'no -mx-4 cancel — flush host owns edge-to-edge',
    );
  });

  it('Displays nested verb hosts sit gap-0 flush under the topic plate', () => {
    for (const file of FLUSH_STACK_HOSTS) {
      const src = read(file);
      assert.match(
        src,
        /flex-col gap-0/,
        `${file}: Cybertruck stack — no vertical gap between topic plate and body`,
      );
      assert.doesNotMatch(
        src,
        /flex-col gap-3/,
        `${file}: gap-3 between tab rows is banned`,
      );
      assert.doesNotMatch(
        src,
        /WorkspaceCard/,
        `${file}: flushed Displays body — no glass card island (industrial flush)`,
      );
    }
  });

  it('ArrivalStagingDockControl is flush — no glass WorkspaceCard island', () => {
    const src = read('src/components/receiving/triage/ArrivalStagingDockControl.tsx');
    assert.doesNotMatch(
      src,
      /WorkspaceCard/,
      'ArrivalStagingDockControl mounts as a flush dock ACTION — no glass card',
    );
    // Flush dock: host is px-0; content rows own inset-cozy (see
    // arrival-displays-push.guard — not DISPLAYS_BODY_INSET on the host).
    assert.doesNotMatch(src, /DISPLAYS_BODY_INSET/);
    assert.match(src, /inset-cozy/);
  });

  it('ClaimWizardNav child mode uses TabDisplay segment, not PaneHeaderTabs', () => {
    const src = read(CLAIM_NAV);
    assert.match(src, /TabDisplay/, 'claim mode switcher is TabDisplay');
    assert.match(
      src,
      /appearance="segment"/,
      'New · Link is the child segment layer',
    );
    assert.match(src, /hint:/, 'Claim segment paints always-visible chord hints');
    assert.doesNotMatch(
      src,
      /\bPaneHeaderTabs\b/,
      'must not reintroduce inverse PaneHeaderTabs on Claim New·Link',
    );
    assert.doesNotMatch(src, /\bTabSwitch\b/, 'no soft TabSwitch in claim nav');
    assert.doesNotMatch(
      src,
      /ScrollSpyNav/,
      'no ScrollSpy strip under New/Link — sections are the stacked scroll body',
    );
    assert.match(
      src,
      /flex-col gap-0/,
      'Cybertruck strip stack — no vertical air on the modal mode row',
    );
    assert.match(
      src,
      /leaf-header/,
      'Displays placement compresses New·Link into the leaf-header trailing slot',
    );
    assert.doesNotMatch(
      src,
      /\b(?:pt|pb|py|space-y)-\d+\b/,
      'ClaimWizardNav must not pad vertically between tab rows',
    );
  });

  it('SupportContextSegments is TabDisplay segment — no soft rounded-full pills', () => {
    const src = read('src/components/support/context/SupportContextSegments.tsx');
    assert.match(src, /TabDisplay/);
    assert.match(src, /appearance="segment"/);
    assert.doesNotMatch(src, /rounded-full/);
    assert.doesNotMatch(src, /\bTabSwitch\b/);
  });

  it('PreboxWizard mode is child segment under Units·Prebox', () => {
    const src = read('src/components/receiving/PreboxWizard.tsx');
    assert.match(src, /appearance="segment"/);
    assert.doesNotMatch(src, /appearance="underline"/);
  });
});
