import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * CF-03 ratchet: tech_serial_numbers must not join orders on naked shipment_id.
 *
 * Allowed patterns keep an order_id prefer branch (or join via tsn.id / SAL FK).
 * Shrink-only — do not raise the baseline; migrate offenders to sqlTsnMatchesOrder
 * / dual-read sole-shipment predicate.
 */

const SRC_ROOT = join(process.cwd(), 'src');

/** Known residual count of *naked* TSN↔order shipment joins (must only shrink). */
const NAKED_SHIPMENT_JOIN_BASELINE = 0;

const ESCAPE = 'ds-allow-tsn-shipment-join';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function isDualReadBlock(snippet: string): boolean {
  // Prefer-order dual-read: order_id = … OR (order_id IS NULL AND shipment…)
  return /order_id\s*=/.test(snippet) && /order_id\s+IS\s+NULL/i.test(snippet);
}

test('naked tech_serial_numbers↔orders shipment joins do not grow', () => {
  const offenders: string[] = [];
  let count = 0;

  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel.endsWith('.guard.test.ts') || rel.endsWith('.test.ts')) continue;
    // SoT helpers define the dual-read predicate — not offenders.
    if (rel === 'lib/orders/order-grain-sql.ts') continue;

    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/JOIN\s+tech_serial_numbers/i.test(line) && !/JOIN\s+tech_serial_numbers/i.test(lines[i + 1] ?? '')) {
        continue;
      }
      // Capture a window for the ON clause (multiline JOINs).
      const window = lines.slice(i, Math.min(lines.length, i + 18)).join('\n');
      if (!/shipment_id\s*=/.test(window)) continue;
      if (!/JOIN\s+tech_serial_numbers/i.test(window)) continue;

      const prev = i > 0 ? lines[i - 1] : '';
      if (line.includes(ESCAPE) || prev.includes(ESCAPE) || window.includes(ESCAPE)) continue;
      if (isDualReadBlock(window)) continue;

      // FK joins by tsn.id / context, not order smear.
      if (/tsn\.id\s*=/.test(window) || /tech_serial_number_id/.test(window)) continue;

      count += 1;
      offenders.push(`${rel}:${i + 1}`);
    }
  }

  assert.ok(
    count <= NAKED_SHIPMENT_JOIN_BASELINE,
    `naked TSN shipment joins grew (${count} > ${NAKED_SHIPMENT_JOIN_BASELINE}):\n${offenders.join('\n')}`,
  );
  assert.equal(
    count,
    NAKED_SHIPMENT_JOIN_BASELINE,
    `baseline drifted — lower NAKED_SHIPMENT_JOIN_BASELINE to ${count} if you fixed joins:\n${offenders.join('\n')}`,
  );
});
