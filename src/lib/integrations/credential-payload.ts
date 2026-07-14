/**
 * Vault payload merge + safe field fingerprints for integration connect UX.
 * Secrets are merged server-side only — never returned to the browser.
 */
import type { IntegrationProvider } from './credentials';
import { secretKeysForProvider } from './credential-schemas';

function isBlank(value: unknown): boolean {
  return value === '' || value === null || value === undefined;
}

/** Last-four mask for configured secret fields (display only). */
export function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

export interface ConfiguredFieldHint {
  key: string;
  configured: boolean;
  hint?: string;
  /** Non-secret value safe to return to the client (update form pre-fill). */
  value?: string;
}

/** Build safe configured-field hints from a decrypted payload (server-only). */
export function buildConfiguredFieldHints(
  provider: IntegrationProvider,
  payload: Record<string, unknown> | null,
): ConfiguredFieldHint[] {
  if (!payload) return [];
  const secretKeys = new Set(secretKeysForProvider(provider));
  const hints: ConfiguredFieldHint[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (isBlank(value)) continue;
    const str = typeof value === 'string' ? value : String(value);
    if (secretKeys.has(key)) {
      hints.push({ key, configured: true, hint: maskSecretValue(str) });
    } else if (key !== '__nango') {
      hints.push({ key, configured: true, value: str });
    }
  }

  return hints;
}

/**
 * Merge an incoming partial payload with existing decrypted credentials.
 * Blank secret fields in `incoming` preserve `existing` values.
 */
export function mergeVaultPayload(
  provider: IntegrationProvider,
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const base = { ...(existing ?? {}) };
  const secretKeys = new Set(secretKeysForProvider(provider));

  for (const [key, value] of Object.entries(incoming)) {
    if (secretKeys.has(key) && isBlank(value)) continue;
    if (!isBlank(value)) {
      base[key] = value;
    }
  }

  return base;
}
