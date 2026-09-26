/** Command alias resolution — a tenant's custom scan strings, mapped to the built-in command they mean. */

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

/** The built-in code this raw scan means, or null when it is not an alias. */
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
