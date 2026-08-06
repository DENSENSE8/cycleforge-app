/**
 * Classify Displays body — flush plane (no WorkspaceCard glass island).
 * Mirrors Package Pairing bare chrome / PAIRING_FLUSH_HOST_CLASS.
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
    assert.doesNotMatch(src, /from ['"]@\/design-system\/components['"]/);
    assert.doesNotMatch(src, /<WorkspaceCard/);
    assert.doesNotMatch(src, /variant="glass"/);
    assert.doesNotMatch(src, /rounded-(?:3xl|2xl|xl|lg|md)\b/);
  });

  it('option rows and dimension icon wells use flush corners', () => {
    // Option radio rows — flush, not rounded-lg.
    assert.match(
      src,
      /flex w-full items-center gap-2\.5 px-2\.5 py-2[\s\S]{0,80}?cornerClass\('flush'\)/,
    );
    // Dimension icon well.
    assert.match(
      src,
      /grid h-5 w-5 shrink-0 place-items-center[\s\S]{0,80}?cornerClass\('flush'\)/,
    );
    // Identity face stays pill (INLINE_PILL_ICON_FACE) — not stripped.
    assert.match(src, /INLINE_PILL_ICON_FACE/);
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
});
