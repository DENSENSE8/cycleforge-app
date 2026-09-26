/** Connections gap adoption helpers (Phase 2). */

import {
  CONN_ADOPT_TASK_KEY_PREFIX,
  CONNECTIONS_ADOPTION_OPS_TITLE,
  MASTER_PLAN_TASK_KEY_PREFIX,
} from '@/lib/master-plan/ops-plans-bridge-constants';
import { isForgePlanOrg } from '@/lib/master-plan/server-doc';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  CONNECTIONS_GAP_ADOPTION_KEY,
  getPlanTemplate,
  normalizeTemplateTask,
} from './templates';

export {
  CONN_ADOPT_TASK_KEY_PREFIX,
  CONNECTIONS_ADOPTION_OPS_TITLE,
  CONNECTIONS_GAP_ADOPTION_KEY,
};

/** Build adoption client_event_id from a product CONN ticket id. */
export function connAdoptClientEventId(ticketId: string): string {
  const id = ticketId.startsWith('CONN-') ? ticketId : `CONN-${ticketId}`;
  return `${CONN_ADOPT_TASK_KEY_PREFIX}${id}`;
}

/** True if this client_event_id is an adoption row (not product master-plan). */
export function isConnAdoptClientEventId(clientEventId: string | null | undefined): boolean {
  return Boolean(clientEventId?.startsWith(CONN_ADOPT_TASK_KEY_PREFIX));
}

/**
 * Guard: adoption rows must never use the master-plan product prefix.
 * Throws if a caller tries to mix the two namespaces.
 */
export function assertAdoptionKeySafe(clientEventId: string): void {
  if (clientEventId.startsWith(MASTER_PLAN_TASK_KEY_PREFIX)) {
    throw new Error(
      `Adoption client_event_id must not use ${MASTER_PLAN_TASK_KEY_PREFIX} prefix: ${clientEventId}`,
    );
  }
  if (!clientEventId.startsWith(CONN_ADOPT_TASK_KEY_PREFIX)) {
    throw new Error(
      `Adoption client_event_id must start with ${CONN_ADOPT_TASK_KEY_PREFIX}: ${clientEventId}`,
    );
  }
}

/** Should this org receive adoption plan seeding (not the forge product CRDT org)? */
export function shouldSeedConnectionsAdoption(
  orgId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isForgePlanOrg(orgId, env);
}

/** All client_event_ids declared on the connections_gap_adoption template. */
export function listConnectionsAdoptionTemplateEventIds(): string[] {
  const tpl = getPlanTemplate(CONNECTIONS_GAP_ADOPTION_KEY);
  if (!tpl) return [];
  const ids: string[] = [];
  for (const phase of tpl.phases) {
    for (const task of phase.tasks) {
      const { clientEventId } = normalizeTemplateTask(task);
      if (clientEventId) ids.push(clientEventId);
    }
  }
  return ids;
}

interface ConnAdoptUpsertArgs {
  /** Product ticket ids that just became deployed (e.g. CONN-loc-current). */
  deployedConnTicketIds: string[];
  /** Non-forge org to upsert into. */
  orgId: OrgId;
  /** Optional staff who triggered the seed. */
  createdByStaffId?: number | null;
}

/** Pure mapping: */
export function adoptionTasksForDeployedConnTickets(
  deployedConnTicketIds: string[],
): Array<{ clientEventId: string; title: string }> {
  return deployedConnTicketIds
    .filter((id) => id.startsWith('CONN-') || id.startsWith('conn-'))
    .map((id) => {
      const ticketId = id.startsWith('CONN-') ? id : `CONN-${id}`;
      const clientEventId = connAdoptClientEventId(ticketId);
      assertAdoptionKeySafe(clientEventId);
      return {
        clientEventId,
        title: `Verify org adoption for shipped product ticket ${ticketId}`,
      };
    });
}
