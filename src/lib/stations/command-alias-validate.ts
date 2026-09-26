/** Shared validation for a tenant-authored command alias. */

import { NAV_COMMAND_CODES, parseNavCommand, squashCommandCode } from './nav-command-codes';
import { ACTION_COMMAND_CODES, parseActionCommand } from './action-command-codes';
import { STATION_COMMAND_CODES, parseStationCommand } from './station-command-codes';

/** The `CMD-` namespace shape the DB also enforces. */
export const ALIAS_CODE_RE = /^CMD-[A-Z0-9][A-Z0-9-]*$/;

export interface AliasInput {
  code: string;
  targetCode: string;
  label: string;
}

export type AliasValidation =
  | { ok: true; value: { code: string; targetCode: string; label: string } }
  | { ok: false; error: string };

/** Every built-in code an alias may point at. */
export function listAliasTargets(): Array<{ code: string; label: string }> {
  return [
    ...NAV_COMMAND_CODES.map((c) => ({ code: c.code, label: c.label })),
    ...ACTION_COMMAND_CODES.map((c) => ({ code: c.code, label: c.label })),
    ...STATION_COMMAND_CODES.map((c) => ({ code: c.code, label: c.label })),
  ];
}

function isBuiltInCode(code: string): boolean {
  return (
    parseNavCommand(code) != null ||
    parseActionCommand(code) != null ||
    parseStationCommand(code) != null
  );
}

export function validateAlias(input: AliasInput): AliasValidation {
  const code = String(input.code ?? '').trim().toUpperCase();
  const targetCode = String(input.targetCode ?? '').trim().toUpperCase();
  const label = String(input.label ?? '').trim();

  if (!ALIAS_CODE_RE.test(code)) {
    // Not a style rule. The classifier claims `CMD-` wholesale so a command can
    // never be read as a serial; an alias outside it would classify as a serial
    // fragment and be looked up against tech_serial_numbers.
    return {
      ok: false,
      error: 'Code must start with CMD- and use only A–Z, 0–9 and hyphens.',
    };
  }

  if (!label) return { ok: false, error: 'A label is required.' };

  if (!isBuiltInCode(targetCode)) {
    return {
      ok: false,
      error: `${targetCode || 'The target'} is not a built-in command. An alias renames an existing command; it cannot create a new one.`,
    };
  }

  if (isBuiltInCode(code)) {
    // Shadowing would make the built-in unreachable by its own printed sticker,
    // and every book and sheet already in the building would be wrong.
    return {
      ok: false,
      error: `${code} is a built-in command. Choose a different code, or relabel the built-in instead.`,
    };
  }

  if (squashCommandCode(code) === squashCommandCode(targetCode)) {
    return { ok: false, error: 'An alias cannot point at itself.' };
  }

  return { ok: true, value: { code, targetCode, label } };
}
