/**
 * Apply a QA failure injection at the integration adapter boundary.
 * Throws an InjectedProviderFailure the adapter should surface as the
 * provider error class — never used to corrupt database rows.
 */

import { consumeFailureInjection, type ConsumedInjection } from './failure-injection';
import type { OrgId } from '@/lib/tenancy/constants';

export class InjectedProviderFailure extends Error {
  readonly injection: ConsumedInjection;
  constructor(injection: ConsumedInjection) {
    super(injection.message);
    this.name = injection.errorClass;
    this.injection = injection;
  }
}

export async function applyAdapterInjection(
  orgId: OrgId,
  provider: string,
  scope?: string | null,
): Promise<void> {
  try {
    const hit = await consumeFailureInjection(orgId, provider, scope);
    if (hit) throw new InjectedProviderFailure(hit);
  } catch (err) {
    if (err instanceof InjectedProviderFailure) throw err;
    // Table not applied yet — injections are inert.
  }
}
