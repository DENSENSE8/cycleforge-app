import 'server-only';

/** Support item actions bound to Postgres and the draft worker (rules: ./item-actions-core). */
import {
  markSupportMessageNoReplyRequiredCore,
  setSupportLifecycleCore,
  setSupportNextStepCore,
  setSupportPurposeCore,
  type MarkNoReplyRequiredInput,
  type MarkNoReplyRequiredResult,
  type SetSupportLifecycleInput,
  type SetSupportNextStepInput,
  type SetSupportPurposeInput,
  type SetSupportPurposeResult,
  type SupportItemActionDeps,
  type SupportItemStepResult,
} from './item-actions-core';
import { supportPostCommit } from './post-commit';
import { supportTransaction } from './store-db';

export type { MarkNoReplyRequiredResult, SetSupportPurposeResult, SupportItemActionDeps, SupportItemStepResult } from './item-actions-core';

export const supportItemActionDeps: SupportItemActionDeps = {
  transaction: supportTransaction,
  now: Date.now,
  postCommit: supportPostCommit,
};

export function setSupportPurpose(
  input: SetSupportPurposeInput,
  deps: SupportItemActionDeps = supportItemActionDeps,
): Promise<SetSupportPurposeResult> {
  return setSupportPurposeCore(input, deps);
}

export function setSupportNextStep(
  input: SetSupportNextStepInput,
  deps: SupportItemActionDeps = supportItemActionDeps,
): Promise<SupportItemStepResult> {
  return setSupportNextStepCore(input, deps);
}

export function setSupportLifecycle(
  input: SetSupportLifecycleInput,
  deps: SupportItemActionDeps = supportItemActionDeps,
): Promise<SupportItemStepResult> {
  return setSupportLifecycleCore(input, deps);
}

export function markSupportMessageNoReplyRequired(
  input: MarkNoReplyRequiredInput,
  deps: SupportItemActionDeps = supportItemActionDeps,
): Promise<MarkNoReplyRequiredResult> {
  return markSupportMessageNoReplyRequiredCore(input, deps);
}
