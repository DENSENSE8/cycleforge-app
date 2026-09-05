/**
 * Tripwire: global Ask is a Layer-hosted circle + StationComposerHost in the
 * dock body — not a RightRailHost occupant and not a raw textarea mouth.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('AssistantFabHost is a Layer circle, not RightRailHost', () => {
  const src = readFileSync(path.join(HERE, 'AssistantFabHost.tsx'), 'utf8');
  assert.match(src, /<Layer\b/);
  assert.match(src, /level=\{open \? 'panel' : 'fab'\}/);
  assert.match(src, /data-testid="assistant-fab"/);
  assert.match(src, /radius="pill"/);
  assert.match(src, /size="touch"/);
  assert.doesNotMatch(src, /useRegisterRightPanel/);
  assert.doesNotMatch(src, /OmnichannelComposerDock/);
});

test('AssistantProvider mounts AssistantFabHost and does not register the rail occupant', () => {
  const src = readFileSync(path.join(HERE, 'AssistantProvider.tsx'), 'utf8');
  assert.match(src, /AssistantFabHost/);
  assert.doesNotMatch(src, /AssistantRailRegistrant/);
  assert.doesNotMatch(src, /id: 'assistant'/);
});

test('AssistantDockBody Ask mouth is StationComposerHost', () => {
  const src = readFileSync(path.join(HERE, 'AssistantDock.tsx'), 'utf8');
  assert.match(src, /StationComposerHost/);
  assert.match(src, /showModeFaces=\{false\}/);
  assert.match(src, /chrome="raised"/);
  assert.doesNotMatch(src, /<textarea\b/);
  assert.doesNotMatch(src, /<OmnichannelComposerDock\b/);
});
