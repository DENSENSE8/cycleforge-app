/**
 * Reversibility — the one ledger, its vocabulary, and its readers.
 *
 * Barrel for CONSUMERS. Anything inside this module imports its siblings by
 * path, and `apply-agent-mutation.ts` must too: it is imported BY
 * `./apply-session-action`, so reaching for the barrel from there would close a
 * cycle.
 *
 * `./session-writes` and `./session-dispatch` are deliberately not re-exported.
 * They run domain writes on a caller-owned transaction and are the chokepoint's
 * internals; a caller that reaches for them directly is bypassing the ledger,
 * which is the entire thing this module exists to prevent.
 *
 * ⚠ SERVER-ONLY BARREL. `./ledger` reaches `@/lib/tenancy/db` and
 * `./apply-session-action` reaches the chokepoint, so importing this from a
 * client component pulls the whole server graph into the bundle. The browser
 * side imports the pure files by path — `./types`, `./action-kinds`,
 * `./client` — and that is what `src/components/workspace/process` does.
 */

export * from './types';
export * from './action-kinds';
export * from './apply-session-action';
export * from './ledger';
export * from './client';
