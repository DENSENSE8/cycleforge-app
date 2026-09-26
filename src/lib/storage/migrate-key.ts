/**
 * One-release localStorage / sessionStorage key migration.
 * Reads the new key first; if missing, copies from the legacy key then deletes it.
 */

export function readMigratedItem(
  storage: Storage,
  newKey: string,
  legacyKey: string,
): string | null {
  try {
    const current = storage.getItem(newKey);
    if (current != null) return current;
    const legacy = storage.getItem(legacyKey);
    if (legacy == null) return null;
    storage.setItem(newKey, legacy);
    storage.removeItem(legacyKey);
    return legacy;
  } catch {
    return null;
  }
}

function writeStorageItem(storage: Storage, newKey: string, value: string): void {
  try {
    storage.setItem(newKey, value);
  } catch {
    /* quota / private mode */
  }
}

function removeMigratedItem(
  storage: Storage,
  newKey: string,
  legacyKey: string,
): void {
  try {
    storage.removeItem(newKey);
    storage.removeItem(legacyKey);
  } catch {
    /* ignore */
  }
}
