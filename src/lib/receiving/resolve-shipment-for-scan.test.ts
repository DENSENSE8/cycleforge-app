import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveShipmentForScan,
  type ResolveShipmentDeps,
} from './resolve-shipment-for-scan';

// ─── Deps fakes ───────────────────────────────────────────────────────────────
 // Ladder: EXACT → LAST-8 → DIGIT-PREFIX. Fake routes by SQL shape.

interface Captured {
  exactParams: unknown[] | null;
  last8Params: unknown[] | null;
  digitPrefixParams: unknown[] | null;
  warnings: Array<{ msg: string; meta?: Record<string, unknown> }>;
}

function fakes(rows: {
  exact?: unknown[];
  last8?: unknown[];
  digitPrefix?: unknown[];
}): {
  deps: ResolveShipmentDeps;
  captured: Captured;
} {
  const captured: Captured = {
    exactParams: null,
    last8Params: null,
    digitPrefixParams: null,
    warnings: [],
  };
  const deps: ResolveShipmentDeps = {
    query: async <T>(_orgId: string | undefined, sql: string, params: unknown[]) => {
      if (sql.includes('WHERE stn.tracking_number_normalized = $1')) {
        captured.exactParams = params;
        return { rows: (rows.exact ?? []) as T[] };
      }
      if (sql.includes('RIGHT(regexp_replace')) {
        captured.last8Params = params;
        return { rows: (rows.last8 ?? []) as T[] };
      }
      if (sql.includes("LIKE $1 || '%'")) {
        captured.digitPrefixParams = params;
        return { rows: (rows.digitPrefix ?? []) as T[] };
      }
      throw new Error(`unexpected resolver SQL: ${sql.slice(0, 120)}`);
    },
    warn: (msg, meta) => captured.warnings.push({ msg, meta }),
  };
  return { deps, captured };
}

const ORG = 'org-123';

// ─── EXACT normalized join is preferred ───────────────────────────────────────

test('exact normalized hit → matchKind "exact", no last-8 query, no warning', async () => {
  const { deps, captured } = fakes({
    exact: [{ shipment_id: 7, receiving_id: 42, receiving_source: 'zoho_po' }],
  });
  const res = await resolveShipmentForScan('382141152045', ORG, deps);
  assert.deepEqual(res, {
    shipmentId: 7,
    receivingId: 42,
    receivingSource: 'zoho_po',
    matchKind: 'exact',
  });
  // Exact won — later rungs must NOT have run.
  assert.equal(captured.last8Params, null);
  assert.equal(captured.digitPrefixParams, null);
  assert.equal(captured.warnings.length, 0);
});

test('a scanned GS1/"96" barcode is canonicalized before the exact match', async () => {
  const { deps, captured } = fakes({
    exact: [{ shipment_id: 1, receiving_id: 2, receiving_source: 'unmatched' }],
  });
  await resolveShipmentForScan('9632001960200651497200382141152045', ORG, deps);
  // The exact join keys on the human number embedded in the GS1 barcode, NOT
  // the raw 34-digit gun read — that is the whole reconciliation invariant.
  assert.deepEqual(captured.exactParams, ['382141152045', ORG]);
});

test('exact match on a shipment with no linked carton → shipmentId set, receivingId null', async () => {
  const { deps } = fakes({
    exact: [{ shipment_id: 9, receiving_id: null, receiving_source: null }],
  });
  const res = await resolveShipmentForScan('382141152045', ORG, deps);
  assert.equal(res.shipmentId, 9);
  assert.equal(res.receivingId, null);
  assert.equal(res.matchKind, 'exact');
});

// ─── LAST-8 fallback only on exact miss, and it logs ──────────────────────────

test('exact miss + single last-8 carton → matchKind "last8" and a logged fallback', async () => {
  const { deps, captured } = fakes({
    exact: [],
    last8: [{ shipment_id: 5, receiving_id: 50, receiving_source: 'zoho_po' }],
  });
  const res = await resolveShipmentForScan('382141152045', ORG, deps);
  assert.equal(res.matchKind, 'last8');
  assert.equal(res.receivingId, 50);
  // The fallback MUST be logged — last-8 is ambiguous (live collision groups).
  assert.equal(captured.warnings.length, 1);
  assert.match(captured.warnings[0]!.msg, /last-8 fallback/);
  assert.equal(captured.digitPrefixParams, null);
});

test('exact miss + ambiguous last-8 (≥2) + digit-prefix miss → matchKind "none"', async () => {
  const { deps, captured } = fakes({
    exact: [],
    last8: [
      { shipment_id: 5, receiving_id: 50, receiving_source: 'zoho_po' },
      { shipment_id: 6, receiving_id: 60, receiving_source: 'zoho_po' },
    ],
    digitPrefix: [],
  });
  const res = await resolveShipmentForScan('382141152045', ORG, deps);
  assert.equal(res.matchKind, 'none');
  assert.equal(res.receivingId, null);
  assert.equal(res.shipmentId, null);
  assert.ok(captured.digitPrefixParams);
});

test('a typed last 8 reaches the last-8 tier as its own key and lands on the one carton', async () => {
  // Operator 2026-10-04: tracking identity is its last 8 digits.
  const { deps, captured } = fakes({
    exact: [],
    last8: [{ shipment_id: 182432, receiving_id: 53615, receiving_source: 'zoho_po' }],
  });
  const res = await resolveShipmentForScan('98732822', ORG, deps);
  assert.deepEqual(captured.exactParams, ['98732822', ORG]);
  assert.deepEqual(captured.last8Params, ['98732822', ORG]);
  assert.equal(res.matchKind, 'last8');
  assert.equal(res.receivingId, 53615);
});

test('the last-8 query counts each shipment as its newest carton, then distinct cartons', async () => {
  // One shipment re-minted into two cartons is ONE last-8 hit — the carton the
  // exact tier picks for the full number (`ORDER BY r.id DESC`).
  let last8Sql = '';
  const { deps } = fakes({ exact: [], last8: [], digitPrefix: [] });
  const query = deps.query;
  deps.query = async <T>(orgId: Parameters<typeof query>[0], sql: string, params: unknown[]) => {
    if (sql.includes('RIGHT(regexp_replace')) last8Sql = sql;
    return query<T>(orgId, sql, params);
  };
  await resolveShipmentForScan('98732822', ORG, deps);
  assert.match(last8Sql, /SELECT DISTINCT ON \(receiving_id\)[\s\S]*SELECT DISTINCT ON \(stn\.id\)/);
  assert.match(last8Sql, /ORDER BY stn\.id, r\.id DESC\s*\) newest\s*ORDER BY receiving_id DESC\s*LIMIT 2/);
});

test('exact miss + last-8 miss → matchKind "none"', async () => {
  const { deps } = fakes({ exact: [], last8: [], digitPrefix: [] });
  const res = await resolveShipmentForScan('382141152045', ORG, deps);
  assert.equal(res.matchKind, 'none');
});

test('exact + last-8 miss + single digit-prefix → matchKind "digit_prefix"', async () => {
  const { deps, captured } = fakes({
    exact: [],
    last8: [],
    digitPrefix: [{ shipment_id: 43164, receiving_id: 49932, receiving_source: 'zoho_po' }],
  });
  const res = await resolveShipmentForScan('LX088692799IL', ORG, deps);
  assert.equal(res.matchKind, 'digit_prefix');
  assert.equal(res.receivingId, 49932);
  assert.equal(res.shipmentId, 43164);
  assert.equal(captured.warnings.length, 1);
  assert.match(captured.warnings[0]!.msg, /digit-prefix/);
  // Digits of LX088692799IL
  assert.deepEqual(captured.digitPrefixParams, ['088692799', ORG]);
});

test('digit-prefix ambiguous (≥2) → matchKind "none"', async () => {
  const { deps } = fakes({
    exact: [],
    last8: [],
    digitPrefix: [
      { shipment_id: 1, receiving_id: 10, receiving_source: 'zoho_po' },
      { shipment_id: 2, receiving_id: 20, receiving_source: 'zoho_po' },
    ],
  });
  const res = await resolveShipmentForScan('LX088692799IL', ORG, deps);
  assert.equal(res.matchKind, 'none');
});

// ─── Guards ───────────────────────────────────────────────────────────────────

test('empty / unnormalizable input short-circuits with no DB calls', async () => {
  const { deps, captured } = fakes({});
  const res = await resolveShipmentForScan('   ', ORG, deps);
  assert.equal(res.matchKind, 'none');
  assert.equal(captured.exactParams, null);
  assert.equal(captured.last8Params, null);
  assert.equal(captured.digitPrefixParams, null);
});

test('without an orgId the queries carry no org param (un-scoped legacy callers)', async () => {
  const { deps, captured } = fakes({
    exact: [{ shipment_id: 3, receiving_id: 30, receiving_source: 'zoho_po' }],
  });
  await resolveShipmentForScan('382141152045', undefined, deps);
  assert.deepEqual(captured.exactParams, ['382141152045']);
});
