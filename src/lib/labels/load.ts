/** Label layer — per-org override loader (Phase 2). */
import type { LabelKind, LabelOverride, LabelResolveContext, LabelTone } from './types';
import { TONE_CLASSES } from './registry';

const LABEL_KINDS: readonly LabelKind[] = ['unshipped', 'outbound'];

/** LabelKind ↔ reason_codes.flow_context. Mirrors the migration's CHECK list. */
export function labelKindToFlowContext(kind: LabelKind): string {
  return `lifecycle_${kind}`;
}
function flowContextToLabelKind(flowContext: string): LabelKind | null {
  const kind = flowContext.replace(/^lifecycle_/, '');
  return (LABEL_KINDS as readonly string[]).includes(kind) ? (kind as LabelKind) : null;
}

const VALID_TONES = new Set(Object.keys(TONE_CLASSES));
function asTone(v: unknown): LabelTone | undefined {
  return typeof v === 'string' && VALID_TONES.has(v) ? (v as LabelTone) : undefined;
}

type Row = { flow_context: string; code: string; label: string | null; tone: string | null };
interface LabelLoaderDeps {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Row[] }>;
}

type Overrides = NonNullable<LabelResolveContext['overrides']>;

/**
 * Load a tenant's lifecycle-label overrides → `resolveLabel` overrides bag.
 * `db` is a tenant-scoped client/connection (e.g. from `withTenantTransaction`).
 */
export async function loadLabelOverrides(
  orgId: string,
  db: LabelLoaderDeps,
): Promise<Overrides> {
  const out: Overrides = {};
  try {
    const { rows } = await db.query(
      `SELECT flow_context, code, label, tone
         FROM reason_codes
        WHERE organization_id = $1
          AND is_active = true
          AND flow_context = ANY($2::text[])`,
      [orgId, LABEL_KINDS.map(labelKindToFlowContext)],
    );
    for (const row of rows) {
      const kind = flowContextToLabelKind(String(row.flow_context));
      if (!kind) continue;
      const override: LabelOverride = {};
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      if (label) override.label = label;
      const tone = asTone(row.tone);
      if (tone) override.tone = tone;
      if (Object.keys(override).length === 0) continue; // nothing to override
      (out[kind] ??= {})[String(row.code)] = override;
    }
  } catch {
    // Degrade: missing columns / unreachable DB → pure code defaults.
    return {};
  }
  return out;
}
