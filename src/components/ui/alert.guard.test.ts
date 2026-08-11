import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the Station / ops ban on native `alert()` / `window.alert()`.
 *
 * Native alerts steal keyboard-wedge focus on scan benches and are treated as a
 * data-loss vector (see `.claude/rules/display/station.md` §6 and
 * `.claude/rules/source-of-truth.md`). Prefer `@/lib/toast` or a blocking DS
 * modal. This ratchet may only shrink.
 *
 * Genuine one-offs: `ds-allow-alert` on the same line or the line directly above.
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only. LOWER as you migrate; never raise.
// 2026-07-29: armed at live count after Station DS honesty pass (2 ActiveOrder
// sites already migrated to toast).
const ALERT_BASELINE = 0;

const ESCAPE_MARKER = 'ds-allow-alert';
const ALERT_RE = /(?:window\.)?\balert\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

function isFalsePositive(line: string): boolean {
  // Prose / identifiers: "open alert(s)", HoverTooltip labels, etc.
  if (/\balert\(s\)/i.test(line)) return true;
  if (/open\s+alert/i.test(line) && !/\balert\s*\(/.test(line.replace(/open\s+alert/i, ''))) {
    return true;
  }
  // XSS / scheme fixtures in unit tests — not a native browser alert() call.
  if (/javascript:\s*alert\s*\(/i.test(line)) return true;
  return false;
}

test('native alert() count does not grow (ratchet)', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel.startsWith('design-system/') || rel.endsWith('.guard.test.ts')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    let inBlock = false;
    lines.forEach((line, i) => {
      const wasInBlock = inBlock;
      const lastOpen = line.lastIndexOf('/*');
      const lastClose = line.lastIndexOf('*/');
      if (lastOpen > lastClose) inBlock = true;
      else if (lastClose > lastOpen) inBlock = false;

      if (wasInBlock) return;
      const trimmed = line.trimStart();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('{/*')
      ) {
        return;
      }
      if (isFalsePositive(line)) return;

      const matches = line.match(ALERT_RE);
      if (!matches) return;

      const prev = i > 0 ? lines[i - 1] : '';
      if (line.includes(ESCAPE_MARKER) || prev.includes(ESCAPE_MARKER)) return;

      count += matches.length;
      offenders.push(`${rel}:${i + 1}`);
    });
  }

  assert.ok(
    count <= ALERT_BASELINE,
    `native alert() grew: ${count} > baseline ${ALERT_BASELINE}. ` +
      `Migrate to @/lib/toast or mark ds-allow-alert. Offenders:\n${offenders.join('\n')}`,
  );
  assert.equal(
    count,
    ALERT_BASELINE,
    `alert() baseline drifted down to ${count} — lower ALERT_BASELINE in alert.guard.test.ts to ${count}.`,
  );
});
