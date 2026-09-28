import pool, { tenantPool } from '@/lib/db';
import { tenantQueryOneTrip, withTenantConnection, assistantPool } from '@/lib/tenancy/db';
const org = '00000000-0000-0000-0000-000000000001';
const s = Number(process.argv[2] ?? 20);
async function time(name: string, run: () => Promise<unknown>) {
  const t = Date.now();
  try { await run(); console.log(name, 'completed', Date.now() - t, 'ms'); }
  catch (e) { const err = e as { code?: string; message: string }; console.log(name, 'ERR', err.code, err.message, Date.now() - t, 'ms'); }
}
(async () => {
  await time('SHOW via tenant tx', async () => console.log(' ', (await withTenantConnection(org, c => c.query(`SELECT current_user u, current_setting('statement_timeout') st, current_setting('lock_timeout') lt, current_setting('idle_in_transaction_session_timeout') it`))).rows[0]));
  await time('oneTrip pg_sleep', () => tenantQueryOneTrip(org, `SELECT pg_sleep(${s}) AS x`));
  await time('withTenantConnection pg_sleep', () => withTenantConnection(org, c => c.query(`SELECT pg_sleep(${s})`)));
  await time('assistantPool pg_sleep', () => withTenantConnection(org, c => c.query(`SELECT pg_sleep(${s})`), assistantPool));
// idle in transaction: open tx, go idle 35s, next query must fail (server killed the session).
  await time('idle-in-tx 35s', () => withTenantConnection(org, async c => { await new Promise(r => setTimeout(r, 35_000)); return c.query('SELECT 1'); }));
// raw tenantPool (role default only, no SET LOCAL)
  await time('raw tenantPool pg_sleep', () => tenantPool.query(`SELECT pg_sleep(${s})`));
  await time('refresh-reports style SET LOCAL override (owner, 3s sleep ok)', () => pool.query(`SET LOCAL statement_timeout = '280s'; SELECT pg_sleep(3)`));
  process.exit(0);
})();
