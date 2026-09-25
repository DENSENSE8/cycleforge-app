#!/usr/bin/env tsx
/** Import the operator's tab-delimited bin-sheet paste without losing raw text. */
import { readFileSync } from 'node:fs';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { createProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { adjustBinQty } from '@/lib/neon/location-queries';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

const ORG = '00000000-0000-0000-0000-000000000001';
const SOURCE = 'pasted-bin-sheet-import';
const INPUT = '/home/michaelgarisek/.codex/attachments/f099b569-75c1-4173-bd49-b1511c9a53a6/Pasted text.txt';

type Cell = { location: string; item: string; sku: string; qtyRaw: string; note: string; qty: number | null };
const clean = (value: string | undefined) => (value ?? '').trim();
const quantity = (raw: string): number | null => {
  if (!raw || /\bOOS\b/i.test(raw)) return raw ? 0 : null;
  const values = raw.match(/\d+/g)?.map(Number) ?? [];
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

function parseGrid(): Cell[] {
  const lines = readFileSync(INPUT, 'utf8').trim().split(/\r?\n/);
  const cells: Cell[] = [];
  for (let offset = 0; offset + 4 < lines.length; offset += 5) {
    const header = lines[offset].split('\t');
    const items = lines[offset + 1].split('\t');
    const skus = lines[offset + 2].split('\t');
    const quantities = lines[offset + 3].split('\t');
    const notes = lines[offset + 4].split('\t');
    for (let index = 0; index < header.length; index += 2) {
      const location = clean(header[index]);
      const item = clean(items[index + 1]);
      if (!location || !item || item.toLowerCase() === 'empty') continue;
      const qtyRaw = clean(quantities[index + 1]);
      cells.push({ location, item, sku: clean(skus[index + 1]), qtyRaw, note: clean(notes[index + 1]), qty: quantity(qtyRaw) });
    }
  }
  return cells;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const cells = parseGrid();
  const names = [...new Set(cells.map((cell) => cell.location))];
  const normalized = names.map((name) => name.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  const locations = await tenantQuery<{ id: number; name: string; barcode: string }>(ORG, `
    SELECT id, name, barcode FROM locations WHERE organization_id = $1 AND is_active = true
      AND (name = ANY($2::text[]) OR name LIKE ANY($3::text[]) OR UPPER(regexp_replace(barcode, '[^A-Za-z0-9]', '', 'g')) LIKE ANY($4::text[]))`,
    [ORG, names, names.map((name) => `${name}-%`), normalized.map((code) => `${code}%`)],
  );
  let created = 0, written = 0, missing = 0;
  for (const cell of cells) {
    const code = cell.location.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const exact = locations.rows.filter((location) => location.name === cell.location || location.barcode.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === `${code}00`);
    const matches = exact.length === 1 ? exact : locations.rows.filter((location) => location.name.startsWith(`${cell.location}-`) || location.barcode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().startsWith(code));
    const bin = matches.length === 1 ? matches[0] : null;
    const description = [
      'Imported from pasted bin sheet. Identity and condition require staff review before pairing.',
      `LOCATION "${cell.location}"`, `ITEM "${cell.item}"`, `SKU "${cell.sku}"`, `QTY "${cell.qtyRaw}"`,
      ...(cell.note ? [`NOTE "${cell.note}"`] : []),
      ...(cell.qty == null ? ['COUNT NEEDED — no numeric quantity was supplied.'] : []),
      ...(!bin ? ['LOCATION LOOKUP NEEDED — printed label did not resolve uniquely.'] : []),
    ].join('\n');
    const provisional = await createProvisionalSku({ sourceRef: `c02-pasted-2026-09-24:${cell.location}`, productTitle: cell.item, description }, ORG);
    if (provisional.createdAt && provisional.description === description) created += 1;
    if (!bin || cell.qty == null) { if (!bin) missing += 1; continue; }
    const current = await tenantQuery<{ qty: number }>(ORG, 'SELECT qty FROM bin_contents WHERE organization_id=$1 AND location_id=$2 AND sku=$3', [ORG, bin.id, provisional.sku]);
    const delta = cell.qty - Number(current.rows[0]?.qty ?? 0);
    if (apply && delta) {
      await adjustBinQty({ locationId: bin.id, sku: provisional.sku, delta, reason: 'CYCLE_COUNT', notes: 'Pasted C-02 bin sheet 2026-09-24', source: SOURCE }, ORG);
      await recordAudit(pool, null, null, { source: SOURCE, action: AUDIT_ACTION.SKU_STOCK_ADJUST, entityType: AUDIT_ENTITY.BIN, entityId: bin.id, after: { qty: cell.qty, sku: provisional.sku }, binCode: bin.barcode, locationCode: cell.location, method: 'system', reasonCode: 'CYCLE_COUNT', organizationIdOverride: ORG });
      written += 1;
    }
    console.log(`${cell.location} → ${bin.barcode} · ${provisional.sku} · ${Number(current.rows[0]?.qty ?? 0)} → ${cell.qty}${apply ? '' : ' (dry run)'}`);
  }
  console.log(`${apply ? 'Applied' : 'Planned'} ${cells.length} cells; ${written} count writes; ${missing} location lookup(s).`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
