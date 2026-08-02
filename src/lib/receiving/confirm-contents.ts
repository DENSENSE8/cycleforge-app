/**
 * Contents confirmation — the fact that a human read this carton's line list
 * before working it, and the gate for the `contents` procedure step.
 *
 * Nothing in the schema recorded this before 2026-08-01c. The grade did not
 * imply it (the grade has a NOT NULL default), the photos did not imply it, and
 * the org-editable checklist that used to claim it was deleted precisely
 * because it was ticked by hand.
 *
 * ## It composes the street writer — it does not hand-roll the upsert
 *
 * `receiving_unbox` has exactly one write path
 * (`./streets/carton-street-write.ts`), and it owns the `'now'` handling,
 * explicit `organization_id`, `updated_at` bump and conflict arm. A second
 * INSERT … ON CONFLICT against the same table is a fork of that writer: it
 * works right up until the shared semantics change in one place only.
 *
 * ## Confirm and reopen are ONE writer, not two
 *
 * `contents_confirmed_at` is an ASSERTION, not a milestone: the operator can
 * reopen the carton to edit, and that retracts the claim. So this is
 * deliberately NOT the COALESCE-once shape of {@link acknowledgeUnbox} — it
 * writes through the street writer's OVERWRITE arm, and `confirmed: false`
 * writes NULL. A stamp that could not be cleared would keep reporting
 * "contents confirmed" for a carton the operator had explicitly reopened, which
 * makes the receipt's "open again to edit" bar a lie.
 *
 * Retraction is not erasure: `audit_logs` keeps both events, so the trail shows
 * a confirmation followed by a reopen rather than silently losing the first.
 *
 * Must be called with a tenant-scoped client (inside `withTenantTransaction`);
 * `upsertReceivingUnbox` also passes `organization_id` explicitly as a backstop.
 */

import type { PoolClient } from 'pg';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

type UnboxClient = Pick<PoolClient, 'query'>;

export interface ConfirmContentsDeps {
  upsertUnbox: typeof upsertReceivingUnbox;
}

const defaultDeps: ConfirmContentsDeps = { upsertUnbox: upsertReceivingUnbox };

interface ConfirmContentsInput {
  orgId: string;
  receivingId: number;
  staffId: number | null | undefined;
  /**
   * `true` stamps the confirmation, `false` retracts it (reopen).
   *
   * Required, with no default. A writer that decides whether a claim is being
   * MADE or WITHDRAWN must be told which; defaulting it is the "safety
   * classification with a default" this codebase has already paid for twice
   * (`.claude/rules/backend-patterns.md` — `intakeSurface`, `scanKind`).
   */
  confirmed: boolean;
}

/**
 * Stamp or retract the carton's contents confirmation.
 *
 * Attribution rides with the claim: reopening clears `contents_confirmed_by`
 * too, so the column never names someone as the confirmer of a confirmation
 * that no longer stands.
 */
export async function confirmContents(
  client: UnboxClient,
  input: ConfirmContentsInput,
  deps: ConfirmContentsDeps = defaultDeps,
): Promise<void> {
  await deps.upsertUnbox(client, input.orgId, input.receivingId, {
    contentsConfirmedAt: input.confirmed ? 'now' : null,
    contentsConfirmedBy: input.confirmed ? (input.staffId ?? null) : null,
  });
}
