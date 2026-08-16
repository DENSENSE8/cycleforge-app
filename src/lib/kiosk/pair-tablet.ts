/**
 * Pair a tablet with a one-time setup code — one engine for `/kiosk` and `/kiosk/v2`.
 */

type PairKioskResult = { ok: true } | { ok: false; error: string };

interface PairKioskDeps {
  fetch: typeof fetch;
}

const defaultDeps: PairKioskDeps = { fetch: (...args) => globalThis.fetch(...args) };

export async function pairKioskTablet(
  code: string,
  deps: PairKioskDeps = defaultDeps,
): Promise<PairKioskResult> {
  const trimmed = code.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: 'Enter the full setup code.' };
  }
  try {
    const r = await deps.fetch('/api/kiosk/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: trimmed }),
    });
    if (!r.ok) {
      let apiError: string | undefined;
      try {
        const body = (await r.json()) as { error?: string };
        apiError = body.error;
      } catch {
        /* non-JSON */
      }
      if (apiError === 'KIOSK_HOST_REQUIRED' || r.status === 403) {
        return {
          ok: false,
          error:
            'Open this tablet on your workspace kiosk URL (Settings → Kiosk devices), not the staff app.',
        };
      }
      return {
        ok: false,
        error: 'That setup code is invalid or expired. Generate a new one in Settings.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network issue while pairing. Try again.' };
  }
}
