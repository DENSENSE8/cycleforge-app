import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verify a Zoho webhook delivery by comparing the HMAC SHA-256 of the raw request body against the signature header. */

type VerifyOk = { ok: true };
type VerifyFail = { ok: false; reason: string };
type VerifyResult = VerifyOk | VerifyFail;

const FALLBACK_HEADERS = [
  'x-zoho-webhook-signature',
  'x-zoh-hmac',
  'x-zoho-signature',
] as const;

function readSignature(headers: Headers, primary: string): string | null {
  const tried = new Set<string>();
  const candidates = [primary, ...FALLBACK_HEADERS]
    .map((h) => h.toLowerCase().trim())
    .filter((h) => {
      if (!h || tried.has(h)) return false;
      tried.add(h);
      return true;
    });
  for (const header of candidates) {
    const value = headers.get(header);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function decodeSignature(raw: string, encoding: 'hex' | 'base64'): Buffer | null {
  try {
    if (encoding === 'base64') return Buffer.from(raw, 'base64');
    return Buffer.from(raw.replace(/^sha256=/i, ''), 'hex');
  } catch {
    return null;
  }
}

interface VerifyOptions {
  /** Per-tenant signing secret loaded from the integration vault. */
  secret: string;
}

export function verifyZohoWebhookSignature(
  rawBody: string | Buffer,
  headers: Headers,
  options: VerifyOptions,
): VerifyResult {
  const secret = options.secret.trim();
  if (!secret) return { ok: false, reason: 'no per-org signing secret available' };

  const headerName = (process.env.ZOHO_WEBHOOK_SIGNATURE_HEADER || 'x-zoho-webhook-signature').trim();
  const encoding: 'hex' | 'base64' =
    (process.env.ZOHO_WEBHOOK_SIGNATURE_ENCODING || 'hex').toLowerCase() === 'base64'
      ? 'base64'
      : 'hex';

  const sigRaw = readSignature(headers, headerName);
  if (!sigRaw) return { ok: false, reason: 'missing signature header' };

  const sigBuf = decodeSignature(sigRaw, encoding);
  if (!sigBuf || sigBuf.length === 0) {
    return { ok: false, reason: 'malformed signature header' };
  }

  const bodyBuf =
    typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;

  const expected = createHmac('sha256', secret).update(bodyBuf).digest();
  if (expected.length !== sigBuf.length) {
    return { ok: false, reason: 'signature length mismatch' };
  }

  return timingSafeEqual(expected, sigBuf)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}
