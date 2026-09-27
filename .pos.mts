import pg from 'pg';
import { readInventoryPositions } from './src/lib/inventory/inventory-position';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED }); await c.connect();
const ids = (await c.query(`select sc.id from sku_catalog sc where exists (select 1 from serial_units su where su.sku_catalog_id=sc.id and su.current_status='STOCKED') limit 3`)).rows.map(r=>r.id);
const bin = (await c.query(`select sc.id from sku_catalog sc join bin_contents b on b.sku=sc.sku and b.organization_id=sc.organization_id limit 2`)).rows.map(r=>r.id);
const org = (await c.query(`select organization_id from sku_catalog where id=$1`, [ids[0] ?? bin[0]])).rows[0].organization_id;
const m = await readInventoryPositions((t, p) => c.query(t, p as unknown[]), org, [...ids, ...bin]);
console.log([...m.values()]);
await c.end();
