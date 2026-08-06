/**
 * Displays nested verb switchers must use industrial TabDisplay — never soft
 * TabSwitch pills (Browse·Move·Send, Chat·Claim, Link·Note).
 *
 * Parent verbs use `appearance="underline"`; claim child mode (New·Link) uses
 * `appearance="segment"` in ClaimWizardNav — never a second inverse fill.
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

const HOSTS = [
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
] as const;

const TAB_DISPLAY = 'src/design-system/components/TabDisplay.tsx';
const CLAIM_NAV = 'src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx';

describe('Displays nested verbs use TabDisplay', () => {
  for (const host of HOSTS) {
    it(`${host} imports TabDisplay and not TabSwitch`, () => {
      const src = read(host);
      assert.match(
        src,
        /TabDisplay/,
        `${host} must compose TabDisplay for nested verbs`,
      );
      assert.doesNotMatch(
        src,
        /\bTabSwitch\b/,
        `${host} must not import soft TabSwitch pills`,
      );
      assert.match(
        src,
        /appearance="underline"/,
        `${host} parent verbs must use underline appearance (not inverse fill)`,
      );
    });
  }

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

  it('SectionTabsSlider icon strip is SpaceX h-10 plate (flush, ⋮ peer)', () => {
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
      /ICON_CELL_CLASS[\s\S]*h-10/,
      'topic plate cells are h-10 SpaceX face',
    );
    assert.match(
      src,
      /ICON_CELL_COMPACT_CLASS[\s\S]*h-10/,
      'compact only tightens padding — never shortens the plate',
    );
    assert.doesNotMatch(
      src,
      /ICON_CELL_COMPACT_CLASS[\s\S]*h-6/,
      'h-6 compact face inverted hierarchy under Chat·Claim',
    );
    assert.match(src, /MoreVertical/, 'overflow ⋮ stays on the topic plate row');
    assert.match(
      src,
      /ICON_OVERFLOW_CELL_CLASS[\s\S]*h-10/,
      '⋮ peer shares the h-10 plate height',
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

  it('Unbox Displays strip sits edge-to-edge on DISPLAYS_FLUSH_HOST', () => {
    const src = read('src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx');
    assert.match(
      src,
      /DISPLAYS_FLUSH_HOST/,
      'Displays body uses flush host SoT (px-0)',
    );
    assert.doesNotMatch(
      src,
      /DISPLAYS_STRIP_HEADER_CLASS\s*=\s*'-mx-4'/,
      'no -mx-4 cancel — flush host makes the topic plate edge-to-edge',
    );
  });

  it('Displays nested verb hosts sit gap-0 flush under the topic plate', () => {
    for (const file of [
      'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
      'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
      'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
      'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
    ]) {
      const src = read(file);
      assert.match(
        src,
        /flex-col gap-0/,
        `${file}: Cybertruck stack — no vertical gap between topic plate and nested verbs`,
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

  it('StagingSection Displays body is flush — no glass WorkspaceCard island', () => {
    const src = read('src/components/receiving/triage/StagingSection.tsx');
    assert.doesNotMatch(
      src,
      /WorkspaceCard/,
      'StagingSection mounts as a Displays body — flush, no glass card',
    );
    assert.match(
      src,
      /DISPLAYS_BODY_INSET/,
      'flush body re-owns its readable gutter via DISPLAYS_BODY_INSET',
    );
  });

  it('ClaimWizardNav child mode uses TabDisplay segment, not PaneHeaderTabs', () => {
    const src = read(CLAIM_NAV);
    assert.match(src, /TabDisplay/, 'claim mode switcher is TabDisplay');
    assert.match(
      src,
      /appearance="segment"/,
      'New ticket · Link existing is the child segment layer',
    );
    assert.doesNotMatch(
      src,
      /\bPaneHeaderTabs\b/,
      'must not reintroduce inverse PaneHeaderTabs under Chat·Claim',
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
      'Cybertruck stack — no vertical air on the mode row',
    );
    assert.doesNotMatch(
      src,
      /\b(?:pt|pb|py|space-y)-\d+\b/,
      'ClaimWizardNav must not pad vertically between tab rows',
    );
  });
});
