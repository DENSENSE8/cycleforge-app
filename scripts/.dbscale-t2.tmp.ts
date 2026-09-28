import pool, { tenantPool } from '@/lib/db';
import { withTenantConnection, tenantQueryOneTrip } from '@/lib/tenancy/db';
const org = '00000000-0000-0000-0000-000000000001';
async function time(name: string, run: () => Promise<unknown>) {
  const t = Date.now();
  try { const r = await run(); console.log(name, 'completed', Date.now() - t, 'ms', r ?? ''); }
  catch (e) { const err = e as { code?: string; message: string }; console.log(name, 'ERR', err.code, err.message, Date.now() - t, 'ms'); }
}
(async () => {
  await time('idle-in-tx 35s then query', () => withTenantConnection(org, async c => { await new Promise(r => setTimeout(r, 35_000)); return c.query('SELECT 1'); }));
  for (let i = 0; i < 6; i++) await time(`follow-up tenant query #${i}`, async () => (await tenantQueryOneTrip(org, 'SELECT 1 AS ok')).rows[0]);
  await time('raw tenantPool pg_sleep(20) (role default only)', () => tenantPool.query('SELECT pg_sleep(20)'));
  await time('owner pool SET LOCAL 280s + pg_sleep(3)', () => pool.query(`SET LOCAL statement_timeout = '280s'; SELECT pg_sleep(3)`));
  process.exit(0);
})();
