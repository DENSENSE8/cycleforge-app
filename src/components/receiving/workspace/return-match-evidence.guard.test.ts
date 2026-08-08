/**
 * Return match evidence (Option B) — packer/tech thumbs stay on the centre
 * match band; full genealogy stays Displays Timeline. Never a dossier centre,
 * SearchOrderFeedback mount, or ShippedDetailsPanel import on the match path.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('return match evidence (Option B)', () => {
  const match = read('src/components/receiving/workspace/SerialMatchResult.tsx');
  const strip = read('src/components/receiving/workspace/ReturnOutboundEvidenceStrip.tsx');
  const panel = read('src/components/receiving/workspace/LineEditPanel.tsx');
  const tabs = read('src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx');
  const lookup = read('src/app/api/serial-units/lookup/route.ts');

  it('lookup exposes serial_units.id for the photo spine', () => {
    assert.match(lookup, /id:\s*row\.id/);
    assert.match(lookup, /id:\s*null/);
    assert.match(match, /id\?:/);
  });

  it('match band mounts ReturnOutboundEvidenceStrip + unitTimelinePhotosQuery', () => {
    assert.match(match, /ReturnOutboundEvidenceStrip/);
    assert.match(strip, /unitTimelinePhotosQuery/);
    assert.match(strip, /['"]testing['"]/);
    assert.match(strip, /['"]packing['"]/);
  });

  it('Full history wires openDisplays timeline — not a second history surface', () => {
    assert.match(match, /onOpenHistory/);
    assert.match(match, /Full history/);
    assert.match(panel, /openDisplays\('timeline'\)/);
  });

  it('match path never imports SearchOrderFeedback or ShippedDetailsPanel', () => {
    assert.doesNotMatch(match, /SearchOrderFeedback|ShippedDetailsPanel/);
    assert.doesNotMatch(strip, /SearchOrderFeedback|ShippedDetailsPanel/);
  });

  it('return intake promotes Timeline to strip priority', () => {
    assert.match(tabs, /isReturnIntake/);
    assert.match(tabs, /timelineOnStrip/);
    assert.match(tabs, /priority:\s*timelineOnStrip\s*\?\s*'primary'\s*:\s*'overflow'/);
  });
});
