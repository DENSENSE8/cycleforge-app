import readline from 'node:readline';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { commitWmsReroute } from '@/lib/packing/wms-reroute-adapter';
import { resolveWmsTrustedSlotContext } from '@/lib/packing/wms-slot-context';
import { verifyWmsGatewayTicket } from '@/lib/realtime/wms-ticket';
import { executeWmsExecutionCommand } from '@/lib/realtime/wms-execution-command';
import type { OrgId } from '@/lib/tenancy/constants';

loadEnv({ quiet: true });

const RequestSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('authorize'),
    token: z.string().min(1),
    deviceId: z.string().min(1),
  }).strict(),
  z.object({
    id: z.string().min(1),
    type: z.literal('context.resolve'),
    organizationId: z.string().min(1),
    signal: z.unknown(),
  }).strict(),
  z.object({
    id: z.string().min(1),
    type: z.literal('reroute.commit'),
    organizationId: z.string().min(1),
    intent: z.unknown(),
  }).strict(),
  z.object({
    id: z.string().min(1),
    type: z.literal('command.execute'),
    organizationId: z.string().min(1),
    staffId: z.number().int().positive(),
    command: z.unknown(),
  }).strict(),
]);

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function handle(raw: unknown): Promise<void> {
  const request = RequestSchema.parse(raw);
  if (request.type === 'authorize') {
    const claims = verifyWmsGatewayTicket(request.token);
    if (claims.deviceId !== request.deviceId) throw new Error('Ticket device does not match socket device.');
    write({ id: request.id, ok: true, value: claims });
    return;
  }
  if (request.type === 'context.resolve') {
    const value = await resolveWmsTrustedSlotContext(
      request.organizationId as OrgId,
      request.signal,
    );
    write({ id: request.id, ok: true, value });
    return;
  }
  if (request.type === 'command.execute') {
    const value = await executeWmsExecutionCommand(request.command, {
      organizationId: request.organizationId,
      staffId: request.staffId,
    });
    write({ id: request.id, ok: true, value });
    return;
  }
  const value = await commitWmsReroute(request.organizationId as OrgId, request.intent);
  write({ id: request.id, ok: true, value });
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  void (async () => {
    let id: string | null = null;
    try {
      const raw = JSON.parse(line);
      id = typeof raw?.id === 'string' ? raw.id : null;
      await handle(raw);
    } catch (error) {
      write({
        id,
        ok: false,
        error: error instanceof Error ? error.message : 'CycleForge adapter failed.',
      });
    }
  })();
});
