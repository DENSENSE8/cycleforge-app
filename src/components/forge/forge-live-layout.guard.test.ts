/**
 * Plans Live layout guard — the forge console must not grow a local
 * `lg:w-[400px]` twin "right rail". Live MDX HTML + run history register on
 * {@link DetailStackRailRegistrar} (house RightRailHost). Plan Agent SEND
 * stays in the center floor with OmnichannelComposerDock.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(process.cwd(), 'src/components/forge');

function src(name: string): string {
  return readFileSync(join(ROOT, name), 'utf8');
}

test('AgenticLoopLiveConsole: no local 400px right-rail twin; registers DetailStackRailRegistrar', () => {
  const consoleSrc = src('AgenticLoopLiveConsole.tsx');
  assert.doesNotMatch(
    consoleSrc,
    /lg:w-\[400px\]/,
    'Plans Live must not hardcode a local 400px right column — use RightRailHost',
  );
  assert.match(
    consoleSrc,
    /ForgePlanRail/,
    'Plans Live must mount ForgePlanRail (DetailStackRailRegistrar wrapper)',
  );
  assert.match(
    consoleSrc,
    /PlanAgentChat/,
    'Plan Agent must remain in the console center floor',
  );
  assert.match(
    consoleSrc,
    /MasterPlanOutline/,
    'Left TOC (MasterPlanOutline) is required for D6 parent-visible selection',
  );
});

test('ForgePlanRail registers DetailStackRailRegistrar as non-modal push', () => {
  const rail = src('ForgePlanRail.tsx');
  assert.match(rail, /DetailStackRailRegistrar/);
  assert.match(rail, /modal=\{false\}/);
  assert.match(rail, /DeskRailChromeRow/);
  assert.match(rail, /MasterPlanView/);
  assert.match(rail, /Advanced · Run history/);
});

test('PlanAgentChat uses OmnichannelComposerDock (centered Send SoT)', () => {
  const chat = src('PlanAgentChat.tsx');
  assert.match(chat, /OmnichannelComposerDock/);
  assert.match(chat, /max-w-2xl/);
  assert.doesNotMatch(
    chat,
    /focus:ring-2 focus:ring-blue/,
    'Raw focus:ring-blue on the plan agent input is banned — use OmnichannelComposerDock',
  );
});
