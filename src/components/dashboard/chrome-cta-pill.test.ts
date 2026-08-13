/**
 * Chrome-CTA fill guard (Phase 2a).
 *
 * Band-1 pill fills resolve through Button semantic intents (`success` for
 * Add, `execute` for Check, `primary` for Import). Hand-painted
 * `bg-slate-*` / `bg-emerald-*` / `bg-blue-*` on a `WORKBENCH_CHROME_PILL_CLASS`
 * peer is the fork this program closes.
 *
 * Run: node --import tsx --test src/components/dashboard/chrome-cta-pill.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const RAW_HUE_ON_PILL =
  /bg-(?:slate|emerald|blue)-\d{2,3}/;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

function chromeActionFiles(): string[] {
  return walkTsx(SRC).filter((p) => /ChromeActions\.tsx$/.test(p));
}

describe('chrome pill CTAs resolve fills through Button variants', () => {
  it('success and execute exist on the shipped Button variant map', () => {
    assert.ok(BUTTON_VARIANTS.success);
    assert.ok(BUTTON_VARIANTS.execute);
  });

  it('*ChromeActions do not hand-paint bg-slate/emerald/blue on the pill', () => {
    const offenders: string[] = [];
    for (const file of chromeActionFiles()) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('WORKBENCH_CHROME_PILL_CLASS')) continue;
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const t = line.trimStart();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (!RAW_HUE_ON_PILL.test(line)) return;
        // A hue on the same file as the pill is the banned pattern — the fill
        // belongs on BUTTON_VARIANTS, not a className override.
        offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `Hand-painted hue on a chrome-pill peer:\n${offenders.join('\n')}\n` +
        'Route the fill through Button variant="success"|"execute"|"primary".',
    );
  });

  it('Inbound Add / Check fills resolve to success / execute', () => {
    const incoming = readFileSync(
      join(ROOT, 'src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx'),
      'utf8',
    );
    const check = readFileSync(
      join(ROOT, 'src/components/receiving/ChromeCheckButton.tsx'),
      'utf8',
    );
    const box = readFileSync(
      join(ROOT, 'src/components/receiving/ReceivingBoxChromeActions.tsx'),
      'utf8',
    );
    assert.match(incoming, /variant="success"/, 'Inbound Add must use variant="success"');
    assert.match(incoming, /<ChromeCheckButton/, 'Inbound Check composes the shared face');
    assert.match(check, /variant="execute"/, 'Check face must use variant="execute"');
    assert.match(box, /<ChromeCheckButton/, 'box-station Check composes the shared face');
    assert.match(box, /variant="success"/, 'box-station Add must use variant="success"');
  });
});
