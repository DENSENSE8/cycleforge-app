/** GET /api/cron/zoho/orders-ingest-drain (Vercel cron, every minute) */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { orderSyncService, type ChannelOrder } from '@/services/OrderSyncService';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH = 25;
const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: number;
  channel_order_id: string;
  organization_id: string | null;
  payload: ChannelOrder;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();
  try {
    const locked = await withCronLock('zoho.orders_ingest_drain', () =>
      withCronRun('zoho.orders_ingest_drain', async () => {
      // Atomically claim a batch so concurrent runs never grab the same rows.
      const { rows } = await pool.query<QueueRow>(
        `UPDATE order_ingest_queue
            SET status = 'processing'
          WHERE id IN (
            SELECT id FROM order_ingest_queue
             WHERE status = 'pending'
             ORDER BY created_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED
          )
        RETURNING id, channel_order_id, organization_id, payload`,
        [BATCH],
      );

      let done = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (!row.organization_id) {
            throw new Error(`queue row ${row.id} is missing organization_id`);
          }
          await orderSyncService.ingestExternalOrder(row.organization_id, row.payload);
          await pool.query(
            `UPDATE order_ingest_queue
                SET status = 'done', processed_at = NOW(), last_error = NULL
              WHERE id = $1`,
            [row.id],
          );
          done++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'ingest failed';
          // Exhausted attempts stay 'failed'; otherwise back to 'pending' for retry.
          await pool.query(
            `UPDATE order_ingest_queue
                SET attempts = attempts + 1,
                    last_error = $2,
                    status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END,
                    processed_at = NOW()
              WHERE id = $1`,
            [row.id, message.slice(0, 1000), MAX_ATTEMPTS],
          );
          failed++;
        }
      }

      return { claimed: rows.length, done, failed };
    }),
    );
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
    const summary = locked.result!;

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'drain failed';
    console.error('[cron.zoho.orders-ingest-drain] fatal', { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
