/**
 * Backfill: rewrite recent repair helpdesk tickets to the current ticket text
 * (operator 2026-10-09) — a subject with the customer's name, phone and the
 * product, a full internal note (customer, phone, email, ship-to, every product
 * on the visit, serial, issue, quote, notes, due date), and NO internal ids:
 * every "RS-1234" / "RS 1234" / "ID 1234" already in the ticket's comments is
 * redacted.
 *
 * Only tickets WE generated are touched: the current subject must carry an RS
 * reference. A customer's own ticket that a repair was attached to never does,
 * so it is skipped.
 *
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/backfill-repair-ticket-text.ts            # dry run
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/backfill-repair-ticket-text.ts --apply    # write
 *   … --days 60      look back further (default 30)
 */

import process from 'node:process';
import pool from '@/lib/db';
import { postalLines } from '@/lib/customers/customer-display';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { buildRepairTicket } from '@/lib/repair/repair-ticket-text';
import type { OrgId } from '@/lib/tenancy/constants';
import { redactTicketCommentText } from '@/lib/zendesk';

const APPLY = process.argv.includes('--apply');
const daysAt = process.argv.indexOf('--days');
const DAYS = daysAt === -1 ? 30 : Number(process.argv[daysAt + 1]);

interface RepairRow {
  id: number;
  organization_id: string;
  ticket_number: string;
  product_title: string | null;
  serial_number: string | null;
  issue: string | null;
  price: string | null;
  notes: string | null;
  due_at: string | null;
  counter_transaction_id: number | null;
  prior_order_ref: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  shipping_address_1: string | null;
  shipping_address_2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
}

const SELECT = `
  SELECT rs.id, rs.organization_id, rs.ticket_number, rs.product_title, rs.serial_number,
         rs.issue, rs.price, rs.notes, rs.due_at::text, rs.counter_transaction_id,
         ct.prior_order_ref,
         COALESCE(NULLIF(c.display_name, ''), NULLIF(c.customer_name, ''),
                  NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')) AS name,
         COALESCE(c.phone, c.mobile) AS phone, c.email,
         c.shipping_address_1, c.shipping_address_2, c.shipping_city,
         c.shipping_state, c.shipping_postal_code, c.shipping_country
    FROM repair_service rs
    LEFT JOIN customers c ON c.id = rs.customer_id AND c.organization_id = rs.organization_id
    LEFT JOIN counter_transactions ct ON ct.id = rs.counter_transaction_id AND ct.organization_id = rs.organization_id`;

const text = (value: string | null | undefined) => String(value ?? '').trim();

function dueDate(iso: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '';
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS <= 0) throw new Error('--days must be a positive number');
  const { rows } = await pool.query<RepairRow>(
    `${SELECT}
      WHERE rs.ticket_number ~ '^#?[0-9]+$'
        AND rs.created_at >= NOW() - ($1 || ' days')::interval
      ORDER BY rs.id`,
    [String(DAYS)],
  );
  console.log(`${rows.length} repair(s) with a helpdesk ticket in the last ${DAYS} days. ${APPLY ? 'APPLYING.' : 'Dry run — pass --apply to write.'}\n`);

  let rewritten = 0;
  const closedTickets: number[] = [];
  for (const row of rows) {
    const orgId = row.organization_id as OrgId;
    const ticketId = Number(row.ticket_number.replace('#', ''));
    const helpdesk = await getHelpdeskProvider(orgId);
    if (!helpdesk) {
      console.log(`· ticket ${ticketId}: helpdesk not connected for this org — skipped`);
      continue;
    }
    const ticket = await helpdesk.getTicket(ticketId);
    if (!ticket) {
      console.log(`· ticket ${ticketId}: not found — skipped`);
      continue;
    }
    const currentSubject = text(ticket.subject);
    if (!/\bRS[- ]?\d+/i.test(currentSubject)) {
      console.log(`· ticket ${ticketId}: "${currentSubject}" — not a generated repair ticket (or already rewritten), skipped`);
      continue;
    }

    // Every device on the same visit, in drop-off order.
    const siblings = row.counter_transaction_id
      ? (await pool.query<RepairRow>(
          `${SELECT} WHERE rs.counter_transaction_id = $1 AND rs.organization_id = $2 ORDER BY rs.id`,
          [row.counter_transaction_id, row.organization_id],
        )).rows
      : [row];
    const shipTo = postalLines({
      line1: row.shipping_address_1,
      line2: row.shipping_address_2,
      city: row.shipping_city,
      state: row.shipping_state,
      postal: row.shipping_postal_code,
      country: row.shipping_country,
    }).join(', ');

    const { subject, body } = buildRepairTicket({
      channel: row.counter_transaction_id ? 'counter' : 'desk',
      customer: {
        name: text(row.name),
        phone: text(row.phone),
        email: text(row.email),
        // The counter asks for an address; the desk never did, so an empty one there means "not asked".
        shipTo: row.counter_transaction_id ? shipTo : shipTo || null,
      },
      devices: siblings.map((s) => ({
        product: text(s.product_title),
        serial: text(s.serial_number),
        issue: text(s.issue),
        quote: text(s.price),
        notes: text(s.notes),
      })),
      deviceIndex: Math.max(0, siblings.findIndex((s) => s.id === row.id)),
      visitNotes: '',
      dueDate: dueDate(row.due_at),
      priorOrderRef: row.prior_order_ref,
    });

    const { comments } = await helpdesk.listComments(ticketId, { perPage: 100 });
    const redactions = comments.flatMap((comment) => {
      const source = String(comment.body ?? '');
      // Any RS number is ours; "ID n" only when n is THIS repair's database id
      // (the old desk body's "(ID 4790)") — a customer's "Order ID 1234" stays.
      const ownId = new RegExp(`\\bRS[- ]?\\d+\\b|\\bID ${row.id}\\b`, 'g');
      return [...new Set(source.match(ownId) ?? [])].map((match) => ({ commentId: Number(comment.id), match }));
    });

    console.log(`• ticket ${ticketId}`);
    console.log(`    subject:  ${currentSubject}`);
    console.log(`         →   ${subject}`);
    console.log(`    redact:   ${redactions.map((r) => `"${r.match}"`).join(', ') || 'nothing'}`);
    console.log(`    note:\n${body.replace(/^/gm, '      | ')}\n`);

    if (!APPLY) continue;
    // Zendesk refuses ANY update to a closed ticket (422 "closed prevents ticket
    // update"); its comments can still be redacted.
    const closed = ticket.status === 'closed';
    if (closed) {
      console.log(`    closed in Zendesk — subject and note cannot change; redacting only`);
    } else {
      await helpdesk.updateTicket(ticketId, {
        subject,
        comment: { body: `Ticket details (updated)\n\n${body}`, public: false },
      });
    }
    for (const redaction of redactions) {
      try {
        await redactTicketCommentText(ticketId, redaction.commentId, redaction.match, orgId);
      } catch (error) {
        console.log(`    could not redact "${redaction.match}": ${error instanceof Error ? error.message : error}`);
      }
    }
    if (closed) closedTickets.push(ticketId);
    else rewritten += 1;
  }

  console.log(APPLY ? `Rewrote ${rewritten} ticket(s).` : 'Dry run complete — nothing was written.');
  if (closedTickets.length) console.log(`Closed (redacted only, subject unchanged): ${closedTickets.join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
