/**
 * Displays nested verb switchers must use industrial TabDisplay — never soft
 * TabSwitch pills (Photos Move·Send, Link·Note, Units·Prebox). Ticket is
 * presence-exclusive (no Chat·Claim nested underline).
 *
 * Parent verbs use `appearance="underline"` (Photos · Linkage · Units). Claim
 * child mode (New·Link) uses `appearance="segment"` in ClaimWizardNav — never
 * a second inverse fill.
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

/** Hosts that nest underline parent verbs (Photos · Linkage · Units). */
const UNDERLINE_VERB_HOSTS = [
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx',
] as const;

/** Hosts that still nest verb switchers (Ticket does not). */
const NESTED_VERB_HOSTS = [...UNDERLINE_VERB_HOSTS] as const;

const FLUSH_STACK_HOSTS = [
  ...NESTED_VERB_HOSTS,
  'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
] as const;

const TAB_DISPLAY = 'src/design-system/components/TabDisplay.tsx';
const CLAIM_NAV = 'src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx';

describe('Displays nested verbs use TabDisplay', () => {
  for (const host of NESTED_VERB_HOSTS) {
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
    });
  }

  for (const host of UNDERLINE_VERB_HOSTS) {
    it(`${host} parent verbs use underline appearance`, () => {
      const src = read(host);
      assert.match(
        src,
        /appearance="underline"/,
        `${host} parent verbs must use underline appearance (not inverse fill)`,
      );
    });
  }

  it('PhotosDisplayHost is Move · Send only — gallery default, no Browse tab', () => {
    const src = read(
      'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
    );
    assert.match(src, /icon:\s*ArrowLeftRight/);
    assert.match(src, /icon:\s*Send/);
    assert.doesNotMatch(
      src,
      /id:\s*'browse'|label:\s*'Browse'/,
      'gallery is default body — no Browse tab',
    );
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
      'Cybertruck stack — no vertical air on the mode row',
    );
    assert.doesNotMatch(
      src,
      /\b(?:pt|pb|py|space-y)-\d+\b/,
      'ClaimWizardNav must not pad vertically between tab rows',
    );
  });
});
