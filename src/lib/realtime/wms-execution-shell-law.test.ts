import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  evaluateWmsExecutionShell,
  WMS_EXECUTION_ACTION_FILES,
  WMS_EXECUTION_ROUTING_FILES,
} from './wms-execution-shell-law';

const files = [...new Set([...WMS_EXECUTION_ROUTING_FILES, ...WMS_EXECUTION_ACTION_FILES])];
const sources = Object.fromEntries(
  files.map((file) => [file, readFileSync(path.resolve(process.cwd(), file), 'utf8')]),
);

test('Pick, Pack, and Putaway use canonical action and routing contracts', () => {
  const verdict = evaluateWmsExecutionShell(sources);
  assert.equal(verdict.ok, true, JSON.stringify(verdict.violations, null, 2));
  assert.ok(verdict.actionCount >= 20, `expected at least 20 execution actions, saw ${verdict.actionCount}`);
});

test('AST law catches legacy routing and non-canonical execution actions', () => {
  const broken = { ...sources };
  broken[WMS_EXECUTION_ROUTING_FILES[0]] = `import Link from 'next/link'; router.push('/next');`;
  broken[WMS_EXECUTION_ACTION_FILES[0]] = `export const X = () => <Button onClick={() => {}}>Go</Button>;`;
  const verdict = evaluateWmsExecutionShell(broken);
  assert.equal(verdict.ok, false);
  assert.deepEqual(new Set(verdict.violations.map((item) => item.rule)), new Set([
    'legacy-routing',
    'motion-press-depth',
  ]));
});
