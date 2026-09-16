const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const max = await c.query(
    `SELECT max(external_ticket_id::int) AS max_ticket, count(*)::int AS total
       FROM support_tickets WHERE organization_id = $1 AND external_ticket_id ~ '^[0-9]+$'`,
    ['00000000-0000-0000-0000-000000000001'],
  );
  console.log('max ticket:', JSON.stringify(max.rows[0]));
  const recent = await c.query(
    `SELECT external_ticket_id AS ticket, created_at::date::text AS day, status_cache
       FROM support_tickets
      WHERE organization_id = $1 AND external_ticket_id::int >= 9900
      ORDER BY 1::int LIMIT 40`,
    ['00000000-0000-0000-0000-000000000001'],
  );
  for (const x of recent.rows) console.log(`#${x.ticket} ${x.day} ${x.status_cache || ''}`);
  await c.end();
})();
