#!/usr/bin/env node
/**
 * Verify the tooltip / hint work in one command.
 *
 *   node scripts/verify-tooltips.mjs
 *
 * Runs only the guards that cover this work, prints the change set, and lists
 * the routes where each visual change is reachable. Throwaway-friendly: it
 * asserts nothing new, it just shows you where to look and proves the guards
 * are live. Delete it once the work is committed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
};

const line = (label) => console.log(`\n${'─'.repeat(72)}\n${label}\n${'─'.repeat(72)}`);

line('1 · GUARDS (each one fails if the work regresses)');
const suites = [
  'src/design-system/motion/cursor-label.test.ts',
  'src/design-system/motion/morph-cursor.test.ts',
  'src/components/ui/native-title.test.ts',
  'src/components/ui/HoverTooltip.test.tsx',
  'src/components/composer/composer-mode-row.test.tsx',
];
const out = run('npx', ['tsx', '--test', ...suites]);
for (const key of ['tests ', 'pass ', 'fail ']) {
  const m = out.match(new RegExp(`ℹ ${key}(\\d+)`));
  if (m) console.log(`  ${key.trim().padEnd(6)} ${m[1]}`);
}
const named = [
  'a hover vocabulary rides as ONE',
  'one skin, one content order',
  'a hotkey hint is one component',
  'the layer never carries text at a fractional device-pixel offset',
  'native `title` tooltips do not grow',
];
console.log('\n  named guards:');
for (const t of named) {
  console.log(`    ${out.includes(t) ? '✓' : '✗ MISSING'}  ${t}`);
}

line('2 · SOURCES OF TRUTH (new files — read these first)');
for (const f of [
  'src/design-system/primitives/TooltipChip.tsx',
  'src/design-system/primitives/KeyboardKey.tsx',
  'src/components/ui/HotkeyTooltip.tsx',
  'src/components/ui/native-title.test.ts',
  'src/components/barcode/ZoneLetterTile.tsx',
]) {
  console.log(`  ${existsSync(f) ? '✓' : '✗'}  ${f}`);
}
console.log(`  ${existsSync('src/components/ui/tooltip.tsx') ? '✗ STILL THERE' : '✓ deleted'}  src/components/ui/tooltip.tsx (dead Radix skin)`);

line('3 · MEASURABLE CLAIMS');
const chip = readFileSync('src/design-system/primitives/TooltipChip.tsx', 'utf8');
const cursor = readFileSync('src/design-system/motion/cursor-label.ts', 'utf8');
const layer = readFileSync('src/design-system/motion/MorphCursorLayer.tsx', 'utf8');
const checks = [
  ['hint type is 13px sans (role-nav), not condensed', /text-role-nav font-medium/.test(chip)],
  ['one row by default (nowrap unless a host opts in)', /: 'whitespace-nowrap'/.test(chip)],
  ['ride cap raised to 72 chars', /CURSOR_LABEL_MAX_CHARS = 72/.test(cursor)],
  ['chip transforms snapped to device pixels', /snapToDevicePixel/.test(layer)],
  ['keycaps have an inverse (blended) tone', /inverse: cn\(/.test(readFileSync('src/design-system/primitives/KeyboardKey.tsx', 'utf8'))],
];
for (const [label, ok] of checks) console.log(`  ${ok ? '✓' : '✗'}  ${label}`);

line('4 · WHERE TO LOOK (dev server on :3050)');
console.log(`
  Anywhere (the chip is app-wide):
    http://localhost:3050/dashboard
      · hover ANY control with a hint  -> dark chip follows the pointer, one row, crisp text
      · hover a truncated cell         -> native title lifted onto the same chip

  Condition pills — the bug you reported:
    http://localhost:3050/receiving
      · open a carton line, hover Like new / Refurbished / Used A / Used B
      · all four now FOLLOW the pointer (they used to snap to a static bubble)

  Composer mode switcher — hotkey in the tooltip:
    http://localhost:3050/receiving/lines/<id>      (or any station composer)
      · hover Unbox / Ticket / Ask -> "Switch mode" + [Shift] [Tab] keycaps
      · the standing "Shift + Tab" text under the composer is GONE
      · hovering an unselected mode no longer echoes its own name

  Copy tooltip — anchored on purpose, now rounded:
    http://localhost:3050/shipping/orders
      · hover a tracking number -> rounded bubble, holds still so you can click it

  Fullscreen toggle (ported off a native title):
    http://localhost:3050/shipping/exceptions
      · hover the expand glyph at the far right of the table's find row

  Zone tile (3 copies -> 1):
    http://localhost:3050/bin/<barcode>
      · hover an amber "?" tile -> one shared sentence, all three surfaces
`);
