/** Tenant-scoped Drizzle — the GUC-carrying counterpart to `src/lib/drizzle/db.ts`. */
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { PoolClient } from 'pg';
import * as schema from './schema';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

type TenantDrizzle = NeonDatabase<typeof schema>;

/** Drizzle over a client already inside a tenant transaction (e.g. `withTenantTransaction`). */
export function drizzleOnClient(client: PoolClient): TenantDrizzle {
  // The WS pool client is a @neondatabase/serverless client cast to pg's
  // PoolClient at the pool boundary; neon-serverless drizzle accepts it.
  return drizzle(client as never, { schema }) as TenantDrizzle;
}

export async function withTenantDrizzle<T>(
  orgId: OrgId,
  fn: (tx: TenantDrizzle) => Promise<T>,
): Promise<T> {
  return withTenantConnection(orgId, (client: PoolClient) => fn(drizzleOnClient(client)));
}
