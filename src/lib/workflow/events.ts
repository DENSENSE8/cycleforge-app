/** Workflow engine — event emitter. */

import { publishDbEvent } from '@/lib/realtime/db-events';
import type { WorkflowEvent } from './contract';

export async function emitWorkflowEvent(orgId: string, event: WorkflowEvent): Promise<void> {
  await publishDbEvent({
    orgId,
    id: `wf-${event.serialUnitId}-${event.at}`,
    schema: 'public',
    table: 'item_workflow_state',
    pk: { id: event.serialUnitId, serial_unit_id: event.serialUnitId },
    op: 'UPDATE',
    payload: {
      nodeType: event.nodeType,
      output: event.output,
      workflowDefinitionId: event.workflowDefinitionId,
      // Source node instance id — lets the Live lens pulse the exact edge.
      nodeId: event.nodeId ?? null,
    },
    needsRefetch: true,
    createdAt: event.at,
  });
}
