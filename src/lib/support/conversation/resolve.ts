import 'server-only';

/** Resolve a Support item, bound to Postgres (rules: ./resolve-core). */
import {
  resolveSupportItemCore,
  type ResolveSupportItemDeps,
  type ResolveSupportItemInput,
  type ResolveSupportItemResult,
} from './resolve-core';
import { supportTransaction } from './store-db';

export type { ResolveSupportItemInput, ResolveSupportItemResult } from './resolve-core';

export function resolveSupportItem(
  input: ResolveSupportItemInput,
  deps: ResolveSupportItemDeps = { transaction: supportTransaction, now: Date.now },
): Promise<ResolveSupportItemResult> {
  return resolveSupportItemCore(input, deps);
}
