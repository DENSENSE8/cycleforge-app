/**
 * Import every open repair as a task on the Tasks board (owner 2026-09-30:
 * "View and import all of the repair services. They are support tickets.").
 * Runs the same reconcile the `tasks.repair_sync` cron and the per-write hooks
 * run (`syncRepairTasks`): house task writer + REPAIR link, audited as the
 * system actor. Idempotent — a rerun changes nothing.
 *
 * Dry-run by default (prints the plan, writes nothing):
 *   set -a; . ./.env; set +a
 *   tsx --conditions=react-server scripts/backfill-repair-tasks.ts [--org=<uuid>]
 *   tsx --conditions=react-server scripts/backfill-repair-tasks.ts --apply [--org=<uuid>]
 */
import pool, { lockPool } from '@/lib/db';
import { syncRepairTasks } from '@/lib/tasks/repair-tasks-db';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

async function main() {
  const apply = process.argv.includes('--apply');
  const orgId = process.argv.find((arg) => arg.startsWith('--org='))?.slice('--org='.length) ?? DEFAULT_ORG;

  const result = await syncRepairTasks(orgId, { dryRun: !apply });
  if (!result) {
    console.log(`org ${orgId} has no repair-task owners configured (REPAIR_TASK_OWNER_IDS) — nothing to do.`);
    return;
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · org ${orgId}`);
  for (const action of result.actions) {
    const target = action.kind === 'create' ? `owners ${action.assigneeStaffIds.join(',')}` : `task ${action.taskId}`;
    const headline =
      action.kind === 'create' || 'note' in action
        ? ` · "${(action.note ?? '').split('\n')[0]}"`
        : action.kind === 'linkTicket'
          ? ` · Ticket ${action.ticketNumber}`
          : action.kind === 'findTicket'
            ? ` · ask the helpdesk (${action.paperworkNumber != null ? `slip #${action.paperworkNumber}` : `subject "RS ${action.repairId}"`})`
            : '';
    console.log(`  ${action.kind.padEnd(7)} RS-${action.repairId} · ${target}${headline}`);
  }
  console.log(JSON.stringify(result.summary));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
    if (lockPool !== pool) await lockPool.end().catch(() => {});
    // The tenant pools stay open otherwise; nothing else is pending.
    setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
  });
