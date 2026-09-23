/**
 * GET /api/cron/zoho/po-sync?mode=delta|full
 *
 * Vercel-cron-triggered sync of Zoho purchase orders into the
 * zoho_po_mirror table. The mirror feeds the PO email reconciler and the
 * Incoming/triage zoho_status reads. The sync also runs one follow-up
 * workflow write (inside syncZohoPoMirror): door-scanned receiving_lines
 * whose PO Zoho now reports received/billed/closed are marked received
 * locally, so they drop off the triage Prioritize queue without an
 * operator manually receiving each one.
 *
 * Modes:
 *   - delta: passes last_modified_time so Zoho returns only changed POs
 *   - full:  no filter; brings everything (nightly safety net)
 *
 * Auth: requires Authorization: Bearer ${CRON_SECRET}. Vercel injects
 * this header automatically when CRON_SECRET env var is set in the
 * project. We hard-require the secret in every environment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncZohoPoMirror } from '@/lib/zoho/po-mirror-sync';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { formatApiOffsetTimestamp } from '@/utils/date';
import { withCronRun } from '@/lib/cron/run-log';
import { withCronLock } from '@/lib/cron/lock';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { forEachOrgWithProvider } from '@/lib/cron/for-each-org';
import { tenantQuery } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CURSOR_KEY = 'zoho_po_mirror';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  const startedAt = Date.now();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'delta';

  // Delta window is resolved PER ORG inside the sweep (below). A single shared
  // cursor advanced only when EVERY org succeeded is what let one failing org
  // freeze the watermark for everyone: prod sat on the 2026-07-11 cursor for
  // two months and replayed it every 15 minutes.

  // Distributed lock so an overlapping tick / manual trigger / Vercel retry
  // can't double-run. Fan out per Zoho-connected org (plus USAV while it still
  // uses env creds): each org mirrors under its own credential + tenant GUC, and
  // resolves its OWN email worklist against its OWN mirror rows.
  const locked = await withCronLock('zoho.po_sync', () =>
    withCronRun('zoho.po_sync', async () => {
      const perOrg = await forEachOrgWithProvider(
        'zoho',
        async (orgId) => {
          // Per-org delta cursor. First run bootstraps from 7 days back to
          // keep the initial pull bounded.
          let lastModified: string | undefined = undefined;
          if (mode === 'delta') {
            const cursor = await getSyncCursor(CURSOR_KEY, orgId);
            const start = cursor ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            lastModified = formatApiOffsetTimestamp(start);
          }

          const report = await syncZohoPoMirror(
            { mode, lastModifiedTime: lastModified, maxPages: 200, maxItems: 20000 },
            orgId,
          );

          // Auto-resolve THIS org's worklist rows whose PO landed in THIS org's
          // mirror (email#→mirror# or operator-entered Zoho PO#). org-scoped so
          // one tenant's mirror never resolves another's worklist.
          const resolved = await tenantQuery(
            orgId,
            `UPDATE email_missing_purchase_orders e
                SET pile = 'done'
              WHERE e.pile IN ('inbox', 'upload')
                AND e.organization_id = $1
                AND EXISTS (
                  SELECT 1 FROM zoho_po_mirror m
                   WHERE m.organization_id = $1
                     AND (m.zoho_purchaseorder_number_norm = ANY(e.po_numbers_norm)
                          OR (e.zoho_uploaded_po_number IS NOT NULL
                              AND m.zoho_purchaseorder_number_norm =
                                NULLIF(upper(regexp_replace(e.zoho_uploaded_po_number, '[^A-Za-z0-9]', '', 'g')), '')))
                )`,
            [orgId],
          );

          // Advance THIS org's watermark when THIS org's pull was clean.
          if (report.errors.length === 0) {
            await updateSyncCursor(CURSOR_KEY, new Date(), orgId);
          }
          return { report, autoResolved: resolved.rowCount ?? 0, lastModified };
        },
      );

      // Aggregate.
      const totals = { pages: 0, fetched: 0, upserted: 0, reconciled: 0, autoResolved: 0 };
      const errors: string[] = [];
      for (const r of perOrg) {
        if (r.ok && r.result) {
          totals.pages += r.result.report.pages;
          totals.fetched += r.result.report.fetched;
          totals.upserted += r.result.report.upserted;
          totals.reconciled += r.result.report.reconciled;
          totals.autoResolved += r.result.autoResolved;
          if (errors.length < 25) errors.push(...r.result.report.errors);
        } else if (errors.length < 25) {
          errors.push(`org ${r.orgId}: ${r.error instanceof Error ? r.error.message : String(r.error)}`);
        }
      }

      // Cursors advance per org above; nothing global to advance here.

      return {
        ...totals,
        errors: errors.slice(0, 25),
        orgs_swept: perOrg.length,
        orgs_failed: perOrg.filter((r) => !r.ok).length,
      };
    }),
  );

  if (!locked.ran) {
    return NextResponse.json({ ok: true, skipped: 'locked', mode, elapsedMs: Date.now() - startedAt });
  }
  const summary = locked.result!;

  return NextResponse.json({
    ok: summary.errors.length === 0,
    mode,
    cursor: { resource: CURSOR_KEY, per_org: true },
    orgs_swept: summary.orgs_swept,
    orgs_failed: summary.orgs_failed,
    totals: {
      pages: summary.pages,
      fetched: summary.fetched,
      upserted: summary.upserted,
      lines_marked_received: summary.reconciled,
    },
    autoResolved: summary.autoResolved,
    errors: summary.errors.slice(0, 25),
    elapsedMs: Date.now() - startedAt,
  });
}
