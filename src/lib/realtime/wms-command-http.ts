import { ZodError } from 'zod';
import {
  executeWmsExecutionCommand,
  type WmsExecutionCommandReceipt,
} from '@/lib/realtime/wms-execution-command';

/** HTTP transport for the WMS execution kernel. */
export type WmsCommandHttpIdentity = {
  organizationId: string;
  staffId: number;
  /** Session permission check; putaway motion keeps the REST bin contract. */
  can(permission: 'bin.adjust'): boolean;
};

type WmsCommandHttpResult =
  | { status: 200; body: WmsExecutionCommandReceipt }
  | { status: 400 | 403 | 422; body: { error: string } };

type Deps = {
  execute: (
    raw: unknown,
    identity: { organizationId: string; staffId: number },
  ) => Promise<WmsExecutionCommandReceipt>;
};

const IDENTITY_MISMATCH = /identity does not match/i;

export async function runWmsCommandOverHttp(
  raw: unknown,
  identity: WmsCommandHttpIdentity,
  deps: Deps = { execute: executeWmsExecutionCommand },
): Promise<WmsCommandHttpResult> {
  const name = (raw as { name?: unknown } | null)?.name;
  if (name === 'putaway.adjust' && !identity.can('bin.adjust')) {
    return { status: 403, body: { error: 'Missing permission: bin.adjust' } };
  }
  try {
    const receipt = await deps.execute(raw, {
      organizationId: identity.organizationId,
      staffId: identity.staffId,
    });
    return { status: 200, body: receipt };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        status: 400,
        body: { error: error.issues.map((issue) => issue.message).join('; ') || 'Invalid WMS command.' },
      };
    }
    const message = error instanceof Error ? error.message : 'WMS command failed.';
    if (IDENTITY_MISMATCH.test(message)) return { status: 403, body: { error: message } };
    // Domain rejections (tote mismatch, slot full, not found…) carry the
    // operator-facing message, exactly as the socket gateway forwards them.
    return { status: 422, body: { error: message } };
  }
}
