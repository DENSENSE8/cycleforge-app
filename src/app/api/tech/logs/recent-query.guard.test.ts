import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SOURCE = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');

describe('tech logs query shape', () => {
  it('limits the tenant-scoped TECH activity stream before enrichment', () => {
    const cteStart = SOURCE.indexOf('WITH recent_logs AS MATERIALIZED');
    const cteLimit = SOURCE.indexOf('LIMIT $${limitIdx} OFFSET $${offsetIdx}', cteStart);
    const enrichmentStart = SOURCE.indexOf('FROM recent_logs sal', cteStart);

    assert.ok(cteStart >= 0, 'expected a materialized recent_logs CTE');
    assert.ok(cteLimit > cteStart, 'expected LIMIT/OFFSET inside recent_logs');
    assert.ok(enrichmentStart > cteLimit, 'expected enrichment after the bounded SAL read');
    assert.match(
      SOURCE.slice(cteStart, cteLimit),
      /sal\.station = 'TECH'[\s\S]*sal\.activity_type IN \('TRACKING_SCANNED', 'FNSKU_SCANNED'\)/,
    );
  });

  it('does not reapply pagination after enrichment', () => {
    assert.equal(
      SOURCE.match(/LIMIT \$\$\{limitIdx\} OFFSET \$\$\{offsetIdx\}/g)?.length,
      1,
    );
  });

  it('aggregates TECH serial facts in one lateral pass', () => {
    assert.equal(SOURCE.match(/FROM tech_serial_numbers/g)?.length, 1);
    assert.match(SOURCE, /COUNT\(\*\) > 0 AS has_serials/);
    assert.match(SOURCE, /BOOL_OR\(tsn\.source_sku_id IS NOT NULL\)/);
  });
});
