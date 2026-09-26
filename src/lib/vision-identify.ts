/** Client helpers for camera-based product identify in the receiving flow. */

// Runtime base URL of the vision box, seeded from GET /api/vision-config (mirrors
// setNasBaseUrl). No trailing slash.
let runtimeBase = (process.env.NEXT_PUBLIC_VISION_BASE_URL || '').replace(/\/+$/, '');

function getVisionBaseUrl(): string {
  return runtimeBase;
}

export function visionConfigured(): boolean {
  return getVisionBaseUrl().length > 0;
}

/** Raw candidate from the vision box. */
interface VisionCandidate {
  sku: string;
  score: number;
}

/** A candidate enriched against sku_catalog by /api/receiving/visual-identify. */
export interface EnrichedCandidate extends VisionCandidate {
  sku_catalog_id: number | null;
  product_title: string | null;
  image_url: string | null;
  /** True when the vision SKU resolved to a real sku_catalog row. */
  resolved: boolean;
}

// ─── Label OCR identify (the reliable "photograph the bottom label" path) ──────

/** Raw OCR result from the vision box. `model` null = no confident label read. */
interface LabelIdentifyResult {
  ok: boolean;
  model: string | null;
  loose_model: string | null;
  raw_text: string;
  error?: string;
}

/** A model resolved to a catalog product by /api/receiving/identify-label. */
export interface LabelCandidate {
  model: string;
  zoho_item_id: string | null;
  sku: string | null;
  item_name: string | null;
  sku_catalog_id: number | null;
  product_title: string | null;
  image_url: string | null;
  resolved: boolean;
  via: 'words' | 'code' | null;
}

/**
 * OCR a captured label frame on the vision box. `strict` (default true) only returns
 * a model when a real product label is seen (anchor present, no paperwork), so the UI
 * can trust it for auto-fill. credentials:'include' carries the Cloudflare cookie.
 */
export async function identifyLabelFromVisionBox(
  blob: Blob,
  strict = true,
  signal?: AbortSignal,
): Promise<LabelIdentifyResult> {
  const base = getVisionBaseUrl();
  const blank = { ok: false as const, model: null, loose_model: null, raw_text: '' };
  if (!base) return { ...blank, error: 'Vision service is not configured.' };

  const form = new FormData();
  form.append('file', blob, 'label.jpg');
  let res: Response;
  try {
    res = await fetch(`${base}/identify-label?strict=${strict}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
  } catch (e) {
    // A caller-driven abort (live scan dropping a stale read) is not an error — let
    // the loop swallow it rather than flashing the "can't reach" message.
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ...blank, error: 'aborted' };
    }
    return {
      ...blank,
      error:
        "Can't reach the vision service. Check you're on the office network and the " +
        'box is running (and served over HTTPS on the live site).',
    };
  }
  if (!res.ok) return { ...blank, error: `Vision identify failed (HTTP ${res.status}).` };
  const data = (await res.json().catch(() => null)) as Partial<LabelIdentifyResult> | null;
  return {
    ok: true,
    model: data?.model ?? null,
    loose_model: data?.loose_model ?? null,
    raw_text: data?.raw_text ?? '',
  };
}

/** Resolve OCR model string(s) to catalog products (server-side, auth-guarded). */
async function resolveLabelModels(
  models: string[],
  signal?: AbortSignal,
): Promise<LabelCandidate[]> {
  const clean = models.filter(Boolean);
  if (clean.length === 0) return [];
  const res = await fetch('/api/receiving/identify-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models: clean }),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { candidates?: LabelCandidate[] } | null;
  return Array.isArray(data?.candidates) ? data!.candidates : [];
}

/** One-shot: label frame → vision box OCR → resolved catalog candidate(s). */
export async function identifyLabelAndResolve(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ ok: boolean; candidates: LabelCandidate[]; raw_text: string; error?: string }> {
  const r = await identifyLabelFromVisionBox(blob, true, signal);
  if (!r.ok) return { ok: false, candidates: [], raw_text: '', error: r.error };
  const models = [r.model, r.loose_model].filter((m): m is string => Boolean(m));
  if (models.length === 0) return { ok: true, candidates: [], raw_text: r.raw_text };
  const candidates = await resolveLabelModels(models, signal);
  return { ok: true, candidates, raw_text: r.raw_text };
}
