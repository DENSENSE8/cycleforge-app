/**
 * The take-payment goldens' order — the one eval fixture that WRITES.
 *
 * `request_payment` creates a real Square payment link, so the golden cannot
 * point at a live order: it gets a TEMP $1.00 order made for the run, and the
 * run always tears it down (finally): every open payment request for it is
 * cancelled through `/api/orders/payments/cancel` — which deletes the Square
 * payment link (and its Square order) — then its `order_payments` rows and the
 * order row are deleted. Nothing is ever charged: nobody opens the link.
 */

import { Pool } from 'pg';

function pool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (run through `pnpm ai:eval`, which loads .env)');
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
}

export interface PaymentFixture {
  orderNumber: string;
}

export async function createPaymentFixture(orgId: string, runId: string): Promise<PaymentFixture> {
  const orderNumber = `PH-EVAL-${runId}`.toUpperCase().slice(0, 40);
  const db = pool();
  try {
    await db.query(
      `INSERT INTO orders (organization_id, order_id, product_title, sku, quantity, sale_amount, currency, notes)
       VALUES ($1, $2, 'AI eval payment test item', 'CF-EVAL-PAY', '1', 1.00, 'USD', 'TEMP: ai-eval take-payment fixture — deleted after the run')`,
      [orgId, orderNumber],
    );
  } finally {
    await db.end();
  }
  return { orderNumber };
}

/** Cancel (in Square) and delete everything the take-payment goldens created. Returns what it cleaned. */
export async function cleanupPaymentFixture(
  base: string,
  cookie: string,
  tenant: string,
  orgId: string,
  fixture: PaymentFixture,
): Promise<string[]> {
  const db = pool();
  const cleaned: string[] = [];
  try {
    const { rows } = await db.query<{ id: string; status: string; square_payment_link_id: string | null; square_invoice_id: string | null }>(
      `SELECT id, status, square_payment_link_id, square_invoice_id FROM order_payments
        WHERE organization_id = $1 AND order_number = $2`,
      [orgId, fixture.orderNumber],
    );
    for (const row of rows) {
      if (row.status === 'pending' || row.status === 'sent') {
        const res = await fetch(`${base}/api/orders/payments/cancel`, {
          method: 'POST',
          headers: { cookie, 'x-tenant-slug': tenant, 'content-type': 'application/json' },
          body: JSON.stringify({ id: Number(row.id) }),
        });
        if (!res.ok) throw new Error(`ai-eval: could not cancel payment ${row.id} (${res.status}) — cancel it in Square by hand`);
      }
      cleaned.push(`payment ${row.id}${row.square_payment_link_id ? ` link ${row.square_payment_link_id}` : ''}${row.square_invoice_id ? ` invoice ${row.square_invoice_id}` : ''}`);
    }
    await db.query(`DELETE FROM order_payments WHERE organization_id = $1 AND order_number = $2`, [orgId, fixture.orderNumber]);
    await db.query(`DELETE FROM orders WHERE organization_id = $1 AND order_id = $2`, [orgId, fixture.orderNumber]);
    cleaned.push(`order ${fixture.orderNumber}`);
  } finally {
    await db.end();
  }
  return cleaned;
}

/**
 * Chat rows in this org, written since `since`, that still hold the test card
 * number in any spacing — must be none after the PAN golden.
 */
export async function countStoredCardNumbers(orgId: string, since: Date, pan: string): Promise<number> {
  const digits = pan.replace(/\D/g, '');
  const db = pool();
  try {
    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ai_chat_messages
        WHERE organization_id = $1 AND created_at >= $2
          AND regexp_replace(content, '[^0-9]', '', 'g') LIKE '%' || $3 || '%'`,
      [orgId, since, digits],
    );
    return Number(rows[0]?.n ?? 0);
  } finally {
    await db.end();
  }
}
