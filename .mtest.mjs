import pg from 'pg';import fs from 'fs';
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
const c=new pg.Client({connectionString:env.DATABASE_URL_UNPOOLED});await c.connect();
await c.query('BEGIN');
try{
for(const f of process.argv.slice(2)){ await c.query(fs.readFileSync('src/lib/migrations/'+f,'utf8')); console.log('ok',f); }
const v=await c.query(`select (select count(*) from inbound_order) orders,(select count(*) from inbound_order where source_type='zoho') zoho,(select count(*) from receiving_line where inbound_order_id is not null) lines,
(select count(*) from receiving_line rl where inbound_order_id is null and (inbound_source_type is not null or exists(select 1 from receiving_line_zoho rz where rz.receiving_line_id=rl.id and rz.zoho_purchaseorder_id is not null))) orphan,
(select count(*) from receiving_line where line_key like '%#%') dupkeys,(select string_agg(status||':'||n,',') from (select status,count(*) n from inbound_order group by 1) s) st,
(select count(*) from catalog_external_ids) cxi,(select count(*) from order_line_shortages where sku_catalog_id is null) ols_null,(select count(*) from replenishment_requests where sku_catalog_id is null) rr_null`);
console.log(v.rows[0]);
}catch(e){console.error('FAIL',e.message, e.where||'')}
await c.query('ROLLBACK');await c.end();
