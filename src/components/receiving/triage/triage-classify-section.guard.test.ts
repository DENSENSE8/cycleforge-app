/**
 * Classify Displays body — flush plane (no WorkspaceCard glass island).
 * Dimensions compose {@link SearchableSelectField} `appearance="flush"`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SECTION = join(
  process.cwd(),
  'src/components/receiving/triage/TriageClassifySection.tsx',
);
const ARRIVAL_PANEL = join(
  process.cwd(),
  'src/components/receiving/triage/TriagePanel.tsx',
);
const UNBOX_TABS = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx',
);

/** Strip block + line comments so doc mentions of WorkspaceCard don't trip bans. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('TriageClassifySection flush Displays', () => {
  const src = code(readFileSync(SECTION, 'utf8'));

  it('mounts a flush host - no WorkspaceCard glass island', () => {
    assert.match(src, /CLASSIFY_FLUSH_HOST_CLASS/);
    assert.match(src, /cornerClass\('flush'\)/);
    assert.match(src, /className=\{CLASSIFY_FLUSH_HOST_CLASS\}/);
    assert.match(src, /SearchableSelectField/);
    assert.match(src, /appearance="flush"/);
    assert.doesNotMatch(src, /<WorkspaceCard/);
    assert.doesNotMatch(src, /variant="glass"/);
    assert.doesNotMatch(src, /rounded-(?:3xl|2xl|xl|lg|md)\b/);
  });

  it('dimensions are flush SearchableSelectField + repair identify well', () => {
    assert.match(src, /<SearchableSelectField/);
    assert.match(src, /appearance="flush"/);
    assert.match(src, /ariaLabel="Urgency"/);
    assert.match(src, /ariaLabel="Platform"/);
    assert.match(src, /ariaLabel="Type"/);
    // Repair identify icon well stays flush.
    assert.match(
      src,
      /grid h-5 w-5 shrink-0 place-items-center[\s\S]{0,80}?cornerClass\('flush'\)/,
    );
  });

  it('Arrival centre + Unbox Displays mount TriageClassifySection', () => {
    const arrival = readFileSync(ARRIVAL_PANEL, 'utf8');
    const unbox = readFileSync(UNBOX_TABS, 'utf8');
    // Arrival: Classify stacks under items in the centre (not a Displays tab).
    assert.match(arrival, /<TriageClassifySection/);
    assert.doesNotMatch(arrival, /openDisplays\(\s*['"]classify['"]/);
    // Unbox: Classify remains a Displays strip tab.
    assert.match(unbox, /id: 'classify'/);
    assert.match(unbox, /<TriageClassifySection/);
  });

  it('Unbox classify editor is Displays-only — dock never remounts TriageClassifySection', () => {
    const unbox = readFileSync(UNBOX_TABS, 'utf8');
    const dock = code(
      readFileSync(
        join(
          process.cwd(),
          'src/components/receiving/workspace/line-edit/steps/dock/ClassifyDockControl.tsx',
        ),
        'utf8',
      ),
    );
    // Displays strip still mounts the shared section.
    assert.match(unbox, /id: 'classify'/);
    assert.match(unbox, /<TriageClassifySection/);
    // Dock is one-row Continue — never a second classifySlot / top-stretch stack.
    assert.doesNotMatch(unbox, /classifySlot=/);
    assert.doesNotMatch(dock, /import[\s\S]*TriageClassifySection|<TriageClassifySection/);
    assert.doesNotMatch(dock, /max-h-\[min\(50vh/);
    assert.match(dock, /data-unbox-classify-dock/);
    assert.match(dock, /h-11/);
  });
});
