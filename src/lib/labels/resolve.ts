/** Label layer — the effective-value resolver. */
import type {
  LabelKind,
  LabelResolveContext,
  ResolvedLabel,
} from './types';
import { LABEL_DEFAULTS, TONE_CLASSES, TONE_SVG_HEX } from './registry';

/** Resolve one (kind, code) to its effective, render-ready label. */
export function resolveLabel(
  kind: LabelKind,
  code: string,
  ctx?: LabelResolveContext,
): ResolvedLabel {
  const base = LABEL_DEFAULTS[kind]?.[code];
  const override = ctx?.overrides?.[kind]?.[code];

  // A code with no seeded default is a programming error in this layer, but we
  // degrade rather than crash (mirrors get-title-by-sku's degrade-not-fail): an
  // unknown code renders as a neutral slate chip titled by its raw code.
  if (!base) {
    const tone = override?.tone ?? 'slate';
    return {
      code,
      label: override?.label ?? code,
      description: override?.description ?? '',
      tone,
      source: override ? 'org' : 'default',
      pill: TONE_CLASSES[tone].pill,
      dot: TONE_CLASSES[tone].dot,
    };
  }

  const tone = override?.tone ?? base.tone;
  const overridden = Boolean(
    override && (override.label !== undefined || override.tone !== undefined || override.description !== undefined),
  );

  return {
    code,
    label: override?.label ?? base.label,
    description: override?.description ?? base.description,
    tone,
    source: overridden ? 'org' : 'default',
    pill: TONE_CLASSES[tone].pill,
    dot: TONE_CLASSES[tone].dot,
  };
}

/** Resolve every code in a kind, in seed (pipeline) order. The legend feed. */
export function resolveKind(kind: LabelKind, ctx?: LabelResolveContext): ResolvedLabel[] {
  return Object.keys(LABEL_DEFAULTS[kind]).map((code) => resolveLabel(kind, code, ctx));
}

/** Raw hex for a state's chart arc/segment (KPI donut, sparkline), resolved from the SAME seeded tone that drives its board dot — so the… */
export function stateChartHex(kind: LabelKind, code: string, ctx?: LabelResolveContext): string {
  return TONE_SVG_HEX[resolveLabel(kind, code, ctx).tone];
}

/** Presentation shape the legacy `*_STATE_META` maps expose. */
interface StateMetaEntry {
  label: string;
  description: string;
  pill: string;
  dot: string;
}

/** Build the `{ code → { label, description, pill, dot } }` map a `*_STATE_META` consumer expects, from the resolved labels of a kind. */
export function buildStateMeta(
  kind: LabelKind,
  ctx?: LabelResolveContext,
): Record<string, StateMetaEntry> {
  const out: Record<string, StateMetaEntry> = {};
  for (const code of Object.keys(LABEL_DEFAULTS[kind])) {
    const r = resolveLabel(kind, code, ctx);
    out[code] = { label: r.label, description: r.description, pill: r.pill, dot: r.dot };
  }
  return out;
}
