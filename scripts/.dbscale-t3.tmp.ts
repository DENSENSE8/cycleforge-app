import pool from '@/lib/db';
(async () => {
  try { await pool.query(`SET LOCAL statement_timeout = '1s'; SELECT pg_sleep(2)`); console.log('override NOT applied'); }
  catch (e) { console.log('SET LOCAL in one message applies:', (e as {code?:string}).code, (e as Error).message); }
  const r = await pool.query(`SET LOCAL statement_timeout = '280s'; SELECT current_setting('statement_timeout') st`) as unknown as Array<{rows: Array<{st:string}>}>;
  console.log('override value inside message:', r[1].rows[0].st);
  console.log('after message (same pool):', (await pool.query(`SELECT current_setting('statement_timeout') st, current_user u`)).rows[0]);
  process.exit(0);
})();
