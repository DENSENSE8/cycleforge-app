/**
 * Tripwire: Ask is a StationComposerHost mode. No FAB / popover host.
 *   npx tsx --test src/components/assistant/assistant-ask-mode.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('AssistantProvider does not mount a FAB or nested Ask dock', () => {
  const src = readFileSync(path.join(HERE, 'AssistantProvider.tsx'), 'utf8');
  assert.doesNotMatch(src, /AssistantFabHost/);
  assert.doesNotMatch(src, /AssistantDockBody/);
  assert.match(src, /dispatchComposerAskMode/);
});

test('StationComposerHost welds ComposerAskStage instead of a nested host', () => {
  const src = readFileSync(
    path.join(HERE, '../composer/StationComposerHost.tsx'),
    'utf8',
  );
  assert.match(src, /ComposerAskStage/);
  assert.match(src, /presenceKind/);
});
