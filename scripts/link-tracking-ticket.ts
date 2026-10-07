/**
 * Link one carrier tracking number to one support ticket, dogfood org only.
 *
 * Scouts the shipment (`shipping_tracking_numbers`), the dogfood
 * `support_tickets` row for the ticket number (internal id or Zendesk
 * external id), and every `ticket_links` row already on either side.
 * Writes only with `--apply`, and only inside
 * `00000000-0000-0000-0000-000000000001`. A shipment owned by another org
 * is refused. The insert matches `addTicketShipmentReference`: a SHIPMENT
 * reference that becomes the anchor only when the ticket has none yet.
 *
 *   node --env-file=.env --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     scripts/link-tracking-ticket.ts --apply
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { withTenantConnection } from '@/lib/tenancy/db';
import { detectCarrier } from '@/lib/shipping/normalize';
import { extractCanonicalTracking } from '@/lib/tracking-format';

const ORG: OrgId = DOGFOOD_ORG_ID;
const TRACKING_RAW = '9434650206217296701060';
const TICKET_NUMBER = 10075;
const APPLY = process.argv.includes('--apply');

type StnRow = {
  id: string;
  organization_id: string | null;
  tracking_number_raw: string;
  tracking_number_normalized: string;
  carrier: string;
  source_system: string | null;
};

type TicketRow = {
  id: string;
  organization_id: string;
  provider: string;
  external_ticket_id: string | null;
  subject_cache: string | null;
  status_cache: string | null;
};

type LinkRow = {
  id: string;
  support_ticket_id: string;
  zendesk_ticket_id: string | null;
  entity_type: string;
  entity_id: string;
  is_primary: boolean;
  link_role: string;
};

function zendeskIdOf(ticket: TicketRow): number | null {
  const external = ticket.external_ticket_id?.trim() ?? '';
  if (!/^[0-9]{1,18}$/.test(external)) return null;
  const n = Number(external);
  return Number.isSafeInteger(n) ? n : null;
}

async function main(): Promise<void> {
  const normalized = extractCanonicalTracking(TRACKING_RAW);
  if (!normalized || normalized.length < 8) {
    throw new Error(`Tracking did not normalize: ${TRACKING_RAW}`);
  }
  const carrier = detectCarrier(normalized) ?? 'UNKNOWN';

  const summary = await withTenantConnection(ORG, async (client) => {
    const stnRes = await client.query<StnRow>(
      `SELECT id::text, organization_id::text, tracking_number_raw,
              tracking_number_normalized, carrier, source_system
         FROM shipping_tracking_numbers
        WHERE tracking_number_normalized = $1
           OR tracking_number_raw = $2`,
      [normalized, TRACKING_RAW],
    );

    const dogfoodTickets = await client.query<TicketRow>(
      `SELECT id::text, organization_id::text, provider, external_ticket_id,
              subject_cache, status_cache
         FROM support_tickets
        WHERE organization_id = $1::uuid
          AND (id = $2 OR external_ticket_id = $3)`,
      [ORG, TICKET_NUMBER, String(TICKET_NUMBER)],
    );

    const otherOrgTickets = await client.query<TicketRow>(
      `SELECT id::text, organization_id::text, provider, external_ticket_id,
              subject_cache, status_cache
         FROM support_tickets
        WHERE organization_id <> $1::uuid
          AND (id = $2 OR external_ticket_id = $3)`,
      [ORG, TICKET_NUMBER, String(TICKET_NUMBER)],
    );

    const stn = stnRes.rows[0] ?? null;
    if (stnRes.rows.length > 1) {
      throw new Error(`Multiple STN rows for ${normalized}: ${stnRes.rows.map((r) => r.id).join(', ')}`);
    }
    if (stn?.organization_id && stn.organization_id !== ORG) {
      throw new Error(
        `Shipment ${stn.id} is owned by org ${stn.organization_id}, not dogfood. Not linking.`,
      );
    }

    if (dogfoodTickets.rows.length > 1) {
      console.log('SCOUT dogfood tickets (ambiguous, not writing)', dogfoodTickets.rows);
      throw new Error(
        `Ticket ${TICKET_NUMBER} matches ${dogfoodTickets.rows.length} dogfood rows. Not linking.`,
      );
    }

    const ticketLinks = dogfoodTickets.rows[0]
      ? (
          await client.query<LinkRow>(
            `SELECT id::text, support_ticket_id::text, zendesk_ticket_id::text,
                    entity_type, entity_id::text, is_primary, link_role
               FROM ticket_links
              WHERE organization_id = $1::uuid
                AND support_ticket_id = $2`,
            [ORG, dogfoodTickets.rows[0].id],
          )
        ).rows
      : [];

    const shipmentLinks = stn
      ? (
          await client.query<LinkRow>(
            `SELECT id::text, support_ticket_id::text, zendesk_ticket_id::text,
                    entity_type, entity_id::text, is_primary, link_role
               FROM ticket_links
              WHERE organization_id = $1::uuid
                AND entity_type = 'SHIPMENT'
                AND entity_id = $2`,
            [ORG, stn.id],
          )
        ).rows
      : [];

    const cartons = stn
      ? (
          await client.query<{ id: string; zendesk_ticket: string | null }>(
            `SELECT id::text, zendesk_ticket
               FROM receiving_carton
              WHERE organization_id = $1::uuid
                AND shipment_id = $2`,
            [ORG, stn.id],
          )
        ).rows
      : [];

    const orders = stn
      ? (
          await client.query<{ id: string; order_id: string | null }>(
            `SELECT id::text, order_id
               FROM orders
              WHERE organization_id = $1::uuid
                AND shipment_id = $2`,
            [ORG, stn.id],
          )
        ).rows
      : [];

    console.log('SCOUT', {
      org: ORG,
      trackingRaw: TRACKING_RAW,
      normalized,
      carrier,
      shipment: stn,
      dogfoodTicket: dogfoodTickets.rows[0] ?? null,
      otherOrgTickets: otherOrgTickets.rows,
      ticketLinks,
      shipmentLinks,
      cartons,
      orders,
      apply: APPLY,
    });

    if (!APPLY) return { wrote: false as const };

    let ticket = dogfoodTickets.rows[0] ?? null;
    if (!ticket) {
      const created = await client.query<TicketRow>(
        `INSERT INTO support_tickets
           (organization_id, provider, external_ticket_id)
         VALUES ($1::uuid, 'zendesk', $2)
         RETURNING id::text, organization_id::text, provider, external_ticket_id,
                   subject_cache, status_cache`,
        [ORG, String(TICKET_NUMBER)],
      );
      ticket = created.rows[0] ?? null;
      if (!ticket) throw new Error('support_tickets insert returned no row');
      console.log('CREATED support_tickets', ticket);
    }
    if (ticket.organization_id !== ORG) {
      throw new Error(`Resolved ticket org ${ticket.organization_id} is not dogfood`);
    }

    let shipmentId = stn?.id ?? null;
    if (!shipmentId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO shipping_tracking_numbers
           (tracking_number_raw, tracking_number_normalized, carrier, source_system,
            next_check_at, organization_id)
         VALUES ($1, $2, $3, 'support_ticket_link', now(), $4::uuid)
         ON CONFLICT (tracking_number_normalized) DO UPDATE
           SET organization_id = COALESCE(shipping_tracking_numbers.organization_id, EXCLUDED.organization_id),
               updated_at = now()
         RETURNING id::text`,
        [TRACKING_RAW, normalized, carrier, ORG],
      );
      shipmentId = inserted.rows[0]?.id ?? null;
      if (!shipmentId) throw new Error('STN insert returned no row');
      console.log('REGISTERED shipment', shipmentId);
    } else if (!stn?.organization_id) {
      const healed = await client.query<{ id: string; organization_id: string }>(
        `UPDATE shipping_tracking_numbers
            SET organization_id = $2::uuid, updated_at = now()
          WHERE id = $1
            AND organization_id IS NULL
          RETURNING id::text, organization_id::text`,
        [shipmentId, ORG],
      );
      console.log('HEALED shipment org', healed.rows[0] ?? { id: shipmentId, note: 'org already set' });
    }

    const owned = await client.query<{ organization_id: string | null }>(
      `SELECT organization_id::text
         FROM shipping_tracking_numbers
        WHERE id = $1`,
      [shipmentId],
    );
    const owner = owned.rows[0]?.organization_id ?? null;
    if (owner !== ORG) {
      throw new Error(`Shipment ${shipmentId} org is ${owner ?? 'null'} after write. Not linking.`);
    }

    const zendeskTicketId = zendeskIdOf(ticket);
    const linked = await client.query<{ id: string; is_primary: boolean; link_role: string }>(
      `INSERT INTO ticket_links
         (organization_id, support_ticket_id, zendesk_ticket_id, entity_type, entity_id,
          is_primary)
       SELECT $1::uuid, $2::bigint, $3::bigint, 'SHIPMENT', $4::bigint,
              NOT EXISTS (
                SELECT 1 FROM ticket_links
                 WHERE organization_id = $1::uuid
                   AND support_ticket_id = $2::bigint
                   AND is_primary
              )
       ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id) DO NOTHING
       RETURNING id::text, is_primary, link_role`,
      [ORG, ticket.id, zendeskTicketId, shipmentId],
    );

    const row = linked.rows[0];
    if (row) {
      await client.query(
        `INSERT INTO ops_events (
           organization_id, occurred_at, event_type,
           entity_type, entity_id, payload
         ) VALUES (
           $1::uuid, NOW(), 'TICKET_LINKED',
           'shipment', $2::bigint, $3::jsonb
         )`,
        [
          ORG,
          shipmentId,
          JSON.stringify({
            zendeskTicketId,
            supportTicketId: Number(ticket.id),
          }),
        ],
      );
    }

    const finalLink = await client.query<LinkRow>(
      `SELECT id::text, support_ticket_id::text, zendesk_ticket_id::text,
              entity_type, entity_id::text, is_primary, link_role
         FROM ticket_links
        WHERE organization_id = $1::uuid
          AND support_ticket_id = $2::bigint
          AND entity_type = 'SHIPMENT'
          AND entity_id = $3::bigint`,
      [ORG, ticket.id, shipmentId],
    );

    return {
      wrote: true as const,
      added: Boolean(row),
      supportTicketId: ticket.id,
      shipmentId,
      link: finalLink.rows[0] ?? null,
    };
  }, pool);

  console.log(APPLY ? 'RESULT' : 'DRY RUN (pass --apply to write)', summary);
}

function explain(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'error') {
    return 'Neon connection failed before any query ran. The database host did not accept a WebSocket.';
  }
  return String(err);
}

main()
  .catch((err) => {
    console.error(explain(err));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
