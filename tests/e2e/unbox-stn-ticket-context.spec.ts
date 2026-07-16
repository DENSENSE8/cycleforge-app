import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

/**
 * STN-linked ticket → unbox context.
 *
 * The operator flow this encodes: a ticket is linked to a shipping tracking
 * number; the carton carrying that STN is scanned open at unbox; the unbox
 * recent rail must show the claim number + ticket flag on the row, and the
 * workspace's Ticket tab must resolve that ticket's history — WITHOUT the ticket
 * ever having been linked to the carton itself.
 *
 * Why that matters: the ticket is filed against the SHIPMENT (entity_type=
 * 'SHIPMENT', entity_id = shipping_tracking_numbers.id) — usually before any
 * carton exists. Every reader resolves it through `receiving_carton.shipment_id`
 * independently:
 *   • rail (lined)    → sqlLinkedSupportTicketLateralJoin      (sql-receiving-ticket.ts:31)
 *   • rail (lineless) → sqlCartonLinkedSupportTicketLateralJoin (sql-receiving-ticket.ts:78)
 *   • Ticket tab      → ticketFromShipmentLink                  (support/tickets.ts:289)
 * so `promoteShipmentTicketToReceiving` is belt-and-braces (it copies the link to
 * RECEIVING + backfills the denormalized column), NOT a precondition. The real
 * join key is carton.shipment_id — which is why the negative control below is the
 * one that actually protects us.
 *
 * FIXTURE SAFETY: this seeds against the same DATABASE_URL as `pnpm dev`, so it
 * uses a synthetic ticket id far outside real Zendesk ids, reuses an existing
 * carton+STN rather than inventing one, and deletes ONLY its own ticket_links
 * rows in afterAll. It never calls the helpdesk (it writes ticket_links directly
 * rather than going through the link route, which would create a real ticket).
 */

const SYNTHETIC_TICKET = 999900042;

let pool: Pool;
let orgId: string;
let fixture: { cartonId: number; shipmentId: number; tracking: string } | null = null;

test.beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // A carton that has ALREADY adopted an STN — the join key every reader needs.
  const row = await pool.query<{
    carton_id: string;
    shipment_id: string;
    tracking: string;
    organization_id: string;
  }>(
    `SELECT r.id AS carton_id, r.shipment_id, stn.tracking_number_raw AS tracking,
            r.organization_id
       FROM receiving_carton r
       JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
      WHERE r.shipment_id IS NOT NULL
      ORDER BY r.id DESC
      LIMIT 1`,
  );
  if (!row.rows[0]) return;

  orgId = row.rows[0].organization_id;
  fixture = {
    cartonId: Number(row.rows[0].carton_id),
    shipmentId: Number(row.rows[0].shipment_id),
    tracking: row.rows[0].tracking,
  };

  // Link the synthetic ticket to the STN only — deliberately NOT to the carton.
  await pool.query(
    `INSERT INTO ticket_links
       (organization_id, zendesk_ticket_id, entity_type, entity_id, link_role)
     VALUES ($1, $2, 'SHIPMENT', $3, 'anchor')
     ON CONFLICT (organization_id, zendesk_ticket_id, entity_type, entity_id) DO NOTHING`,
    [orgId, SYNTHETIC_TICKET, fixture.shipmentId],
  );
});

test.afterAll(async () => {
  if (pool) {
    // Only ever our own synthetic rows.
    await pool.query(`DELETE FROM ticket_links WHERE zendesk_ticket_id = $1`, [SYNTHETIC_TICKET]);
    await pool.end();
  }
});

test.describe('unbox — STN-linked ticket context', () => {
  test('a ticket linked to the STN resolves on the carton, with no RECEIVING link', async ({
    request,
  }) => {
    test.skip(!fixture, 'No carton with an adopted STN in this database.');

    // The Ticket tab's data source: /api/support/context resolves the carton's
    // ticket via ticketFromShipmentLink → carton.shipment_id → ticket_links.
    const res = await request.get(
      `/api/support/context?receivingId=${fixture!.cartonId}&ensureThread=false`,
    );
    expect(res.status()).toBe(200);
    const bundle = await res.json();

    // This is the assertion that proves promotion is NOT required: there is no
    // ticket_links row for ('RECEIVING', cartonId) — only ('SHIPMENT', stnId).
    expect(bundle.ticket?.providerTicketId).toBe(SYNTHETIC_TICKET);
  });

  test('the unbox rail payload carries the claim number for the carton', async ({ request }) => {
    test.skip(!fixture, 'No carton with an adopted STN in this database.');

    // `zendesk_ticket` is what RecentActivityRailBase's railTicketNumber() reads
    // to render the title-row Ticket flag (tooltip: "Claim ticket #N filed").
    const res = await request.get(
      '/api/receiving-lines?view=unbox_opened&segment=unbox-opened&limit=50',
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rows: Array<{ receiving_id?: number; zendesk_ticket?: string | null }> =
      body.receiving_lines ?? body.rows ?? [];

    const mine = rows.filter((r) => r.receiving_id === fixture!.cartonId);
    if (mine.length === 0) {
      // Rail membership needs the carton to have been SCANNED OPEN at unbox
      // (receiving_unbox.opened_at / UNBOX_SCAN_OPENED). Seeding that would fake
      // an operator action, so assert the resolver instead of faking the scan.
      test.skip(true, 'Fixture carton is not in the unbox-opened feed (never scanned open).');
    }
    for (const r of mine) {
      expect(r.zendesk_ticket).toBe(`#${SYNTHETIC_TICKET}`);
    }
  });

  test('NEGATIVE: a carton that has not adopted the STN shows no ticket', async ({ request }) => {
    test.skip(!fixture, 'No carton with an adopted STN in this database.');

    // The one true failure mode. carton.shipment_id is the join key for every
    // reader, so a carton that never adopted the STN must NOT inherit its ticket
    // — otherwise the rail would flag unrelated cartons with someone else's claim.
    const other = await pool.query<{ id: string }>(
      `SELECT id FROM receiving_carton
        WHERE organization_id = $1 AND shipment_id IS DISTINCT FROM $2
        ORDER BY id DESC LIMIT 1`,
      [orgId, fixture!.shipmentId],
    );
    test.skip(!other.rows[0], 'No unrelated carton available.');

    const res = await request.get(
      `/api/support/context?receivingId=${Number(other.rows[0].id)}&ensureThread=false`,
    );
    expect(res.status()).toBe(200);
    const bundle = await res.json();
    expect(bundle.ticket?.providerTicketId).not.toBe(SYNTHETIC_TICKET);
  });
});
