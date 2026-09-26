/** Workflow engine — node runtime. */

import type { NodeDefinition, NodeContext, NodeResult, RunRecord } from './contract';

export const ERROR_OUTPUT = 'error';

interface RunOutcome {
  result: NodeResult;
  run: RunRecord;
}

export async function runNode(
  def: NodeDefinition,
  ctx: NodeContext,
  workflowDefinitionId: number | null,
): Promise<RunOutcome> {
  const startedAt = Date.now();
  try {
    const result = await def.run(ctx);
    return {
      result,
      run: {
        serialUnitId: ctx.serialUnitId,
        workflowDefinitionId,
        nodeType: def.type,
        output: result.output,
        durationMs: Date.now() - startedAt,
        error: null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { output: ERROR_OUTPUT, data: { error: message }, await: true },
      run: {
        serialUnitId: ctx.serialUnitId,
        workflowDefinitionId,
        nodeType: def.type,
        output: ERROR_OUTPUT,
        durationMs: Date.now() - startedAt,
        error: message,
      },
    };
  }
}
