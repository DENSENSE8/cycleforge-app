/**
 * Command alias resolution — a tenant's custom scan strings, mapped to the
 * built-in command they mean.
 *
 * Two halves, deliberately separate:
 *
 *   {@link resolveCommandAlias} is PURE over whatever has been hydrated. It is
 *   what the scan path calls, and it must stay synchronous — a bench scan that
 *   waited on the network to learn whether `CMD-GO-BENCH-3` is a command is a
 *   scan the operator out-runs.
 *
 *   {@link setCommandAliases} is the hydration, called once per session from
 *   the app root. An alias list is tens of rows; it rides along with the
 *   session like the permission set does, and for the same reason.
 *
 * An alias NEVER invents behaviour. It resolves to a code that already exists
 * in `nav-command-codes` / `action-command-codes` / `station-command-codes`,
 * and those registries are PR-reviewed because a scan that moves an operator or
 * writes a verdict must not be creatable from an admin form. Everything
 * downstream — permission gate, destination, verdict — is decided by the TARGET,
 * so an alias can rename a jump and can never widen one.
 */

import { squashCommandCode } from './nav-command-codes';

export interface CommandAlias {
  code: string;
  targetCode: string;
  label: string;
  sortOrder: number;
}

let bySquashed = new Map<string, CommandAlias>();
let hydrated = false;

/** Replace the hydrated alias set. Called once per session from the app root. */
export function setCommandAliases(aliases: readonly CommandAlias[]): void {
  bySquashed = new Map(aliases.map((a) => [squashCommandCode(a.code), a] as const));
  hydrated = true;
}

/**
 * The built-in code this raw scan means, or null when it is not an alias.
 *
 * Returns the TARGET, not the alias — every caller downstream then behaves
 * exactly as if the built-in sticker had been scanned, which is what keeps an
 * alias from becoming a second code path with its own bugs.
 */
export function resolveCommandAlias(raw: string | null | undefined): string | null {
  return bySquashed.get(squashCommandCode(raw))?.targetCode ?? null;
}

/** The alias row itself — for the book, which shows the custom name. */
export function getCommandAlias(raw: string | null | undefined): CommandAlias | null {
  return bySquashed.get(squashCommandCode(raw)) ?? null;
}

/** Every hydrated alias, in book order. */
export function listCommandAliases(): CommandAlias[] {
  return [...bySquashed.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** False before the first hydration — lets a caller avoid nacking too early. */
export function areCommandAliasesHydrated(): boolean {
  return hydrated;
}

/** Test seam — node:test only. */
export function __resetCommandAliasesForTests(): void {
  bySquashed = new Map();
  hydrated = false;
}
