/**
 * shipping-resync.ts — re-poll OPEN (non-terminal) shipments NOW, ignoring
 * next_check_at and the error backoff, through the cron sweep's own writer
 * (`syncShipment` via `resyncOpenShipments`, src/lib/shipping/resync.ts), each
 * row under its own org. A successful poll resets consecutive_error_count and
 * sets next_check_at via computeNextCheckAt, exactly as the sweep does.
 *
 *   node --env-file=.env --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/shipping-resync.ts [--carriers=UPS,FEDEX] [--only-failing] [--tracking=<number>] \
 *     [--limit=500] [--concurrency=5]
 *
 * Writes for real (there is no dry run: a poll IS the write). Carriers whose
 * credentials are missing in this env are reported and skipped, rows untouched.
 * Exit 1 when a carrier had a config fault or every selected poll failed.
 */
import { getShipmentEvents } from '@/lib/shipping/repository';
import { resyncOpenShipments } from '@/lib/shipping/resync';
import type { OrgId } from '@/lib/tenancy/constants';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const CARRIERS = (arg('carriers') ?? 'UPS,FEDEX').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY_FAILING = process.argv.includes('--only-failing');
const TRACKING = arg('tracking')?.trim() || null;
const LIMIT = Math.max(1, Number(arg('limit') ?? 500));
const CONCURRENCY = Math.min(10, Math.max(1, Number(arg('concurrency') ?? 5)));

async function main(): Promise<number> {
  console.log(
    `[resync] carriers=${CARRIERS.join(',')} onlyFailing=${ONLY_FAILING} tracking=${TRACKING ?? '-'} limit=${LIMIT} concurrency=${CONCURRENCY}`,
  );
  const verbose = TRACKING !== null;
  const polled: Array<{ id: number; orgId: OrgId | undefined }> = [];
  const summary = await resyncOpenShipments(
    { carriers: CARRIERS, onlyFailing: ONLY_FAILING, tracking: TRACKING, limit: LIMIT, concurrency: CONCURRENCY },
    undefined,
    ({ candidate, result }) => {
      if (verbose && result.ok) polled.push({ id: candidate.id, orgId: candidate.organizationId ?? undefined });
      if (!verbose && result.ok) return;
      const head = `${candidate.carrier} ${candidate.trackingNumber} #${candidate.id}`;
      console.log(
        result.ok
          ? `  ok    ${head}: ${candidate.previousStatus ?? 'NONE'} → ${result.status} (+${result.eventsInserted ?? 0} events)`
          : `  error ${head}: ${(result.error ?? result.errorCode ?? 'sync failed').split('\n')[0].slice(0, 200)}`,
      );
    },
  );

  // One number asked for: show the newest carrier event it now carries.
  for (const { id, orgId } of polled) {
    const [latest] = await getShipmentEvents(id, orgId);
    if (!latest) continue;
    const at = latest.event_occurred_at ? new Date(latest.event_occurred_at).toISOString() : '?';
    const place = [latest.event_city, latest.event_state].filter(Boolean).join(', ') || '-';
    console.log(`  newest event #${id}: ${latest.normalized_status_category} "${latest.external_status_label ?? ''}" @ ${place} ${at}`);
  }

  for (const fault of summary.configFaults) {
    console.error(`[resync] CONFIG FAULT ${fault.carrier}: ${fault.reason} (${fault.missing.join(', ')}) — not polled, no row touched`);
  }
  if (summary.disabled.length > 0) console.log(`[resync] not polled (sync disabled): ${summary.disabled.join(', ')}`);
  console.log(`[resync] selected=${summary.selected} ok=${summary.ok} errors=${summary.errors} eventsInserted=${summary.eventsInserted}`);
  for (const [transition, n] of Object.entries(summary.transitions).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${transition}`);
  }
  for (const [message, n] of Object.entries(summary.errorsByMessage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ERROR ${message}`);
  }
  return summary.configFaults.length > 0 || (summary.selected > 0 && summary.ok === 0) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('[resync] fatal', error);
    process.exit(1);
  },
);
