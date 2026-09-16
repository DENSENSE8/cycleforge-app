const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const t = await c.query(
    `SELECT st.external_ticket_id AS ticket, st.provider, st.created_at::date::text AS day,
            (SELECT string_agg(DISTINCT tl.entity_type || ':' || tl.entity_id::text, ', ')
               FROM ticket_links tl WHERE tl.support_ticket_id = st.id) AS links
       FROM support_tickets st
      WHERE st.organization_id = $1 AND st.external_ticket_id ~ $2
      ORDER BY 1::int LIMIT 40`,
    ['00000000-0000-0000-0000-000000000001', '^99(2[2-9]|[3-4][0-9]|5[0-4])$'],
  );
  console.log('tickets found:', t.rows.length);
  for (const x of t.rows) console.log(`#${x.ticket} (${x.provider}, ${x.day}) links: ${x.links || 'none'}`);
  const pl = await c.query(
    `SELECT pel.entity_id::text AS ticket_ref, count(*)::int AS photos
       FROM photo_entity_links pel
      WHERE pel.organization_id = $1 AND pel.entity_type = $2
        AND pel.entity_id::text ~ $3
      GROUP BY 1 ORDER BY 1`,
    ['00000000-0000-0000-0000-000000000001', 'ZENDESK_TICKET', '^99(2[2-9]|[3-4][0-9]|5[0-4])$'],
  );
  console.log('direct ZENDESK_TICKET photo links:');
  for (const x of pl.rows) console.log(`  #${x.ticket_ref}: ${x.photos} photos`);
  await c.end();
})();
