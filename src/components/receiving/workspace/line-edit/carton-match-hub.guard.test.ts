/**
 * CartonMatchHub unification (Package Pairing P1).
 * One hub for Unbox + Arrival; Auto-match embeds inside when unfound.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HUB = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/CartonMatchHub.tsx',
);
const PO = join(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/POUnboxingSection.tsx',
);
const TRIAGE = join(
  process.cwd(),
  'src/components/receiving/triage/TriageLineMatchingSection.tsx',
);

describe('CartonMatchHub (P1)', () => {
  const hub = readFileSync(HUB, 'utf8');

  it('exposes tabSet and autoFocusSearch', () => {
    assert.match(hub, /tabSet\?: CartonMatchTabSet/);
    assert.match(hub, /autoFocusSearch\?: boolean/);
    assert.match(hub, /chrome="bare"/);
  });

  it('embeds UnfoundMatchStrip when autoMatch is set', () => {
    assert.match(hub, /UnfoundMatchStrip/);
    assert.match(hub, /showQuickMatch/);
  });

  it('POUnboxingSection no longer mounts a sibling UnfoundMatchStrip', () => {
    const src = readFileSync(PO, 'utf8');
    assert.doesNotMatch(src, /<UnfoundMatchStrip/);
    assert.match(src, /CartonMatchHub/);
    assert.match(src, /autoMatch=/);
  });

  it('TriageLineMatchingSection is a thin arrival wrapper', () => {
    const src = readFileSync(TRIAGE, 'utf8');
    assert.match(src, /tabSet="arrival"/);
    assert.match(src, /autoFocusSearch=\{false\}/);
  });
});
