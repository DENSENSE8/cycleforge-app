/** Packer-log completion contract. */
export const PACKER_LOG_COMPLETION_STATES = ['CAPTURING', 'COMPLETED', 'CANCELLED'] as const;

export type PackerLogCompletionState = (typeof PACKER_LOG_COMPLETION_STATES)[number];

export const PACKER_LOG_CAPTURING = 'CAPTURING' as const;
export const PACKER_LOG_COMPLETED = 'COMPLETED' as const;
const PACKER_LOG_CANCELLED = 'CANCELLED' as const;

export function isPackerLogCompletionState(value: unknown): value is PackerLogCompletionState {
  return typeof value === 'string' && (PACKER_LOG_COMPLETION_STATES as readonly string[]).includes(value);
}

/** A read-side predicate name for domain code; never infer completion from row existence. */
export function isCompletedPackerLog(value: unknown): boolean {
  return value === PACKER_LOG_COMPLETED;
}
