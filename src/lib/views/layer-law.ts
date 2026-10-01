/**
 * Layer laws that are cheap to read from source:
 *
 * - Law 3 — shared parts never branch on the page: no route or view-key
 *   comparison inside a shared part; the view spec tells it what to show.
 * - Law 5 — one reader per fact: no hand-rolled money / date formatting of
 *   order facts in components; read through the field catalog or the
 *   `src/utils` / `src/lib/*-format` helpers.
 *
 * ONE module, two consumers: `layer-law.test.ts` and `scripts/layer-law-guard.ts`
 * (the `Layer laws` verify gate). The allowlist is the burn-down seeded from
 * the initial census: an entry may only be removed, and an entry whose file no
 * longer violates fails the gate until it is.
 */

export type LayerLaw = 3 | 5;

export interface LayerViolation {
  law: LayerLaw;
  /** Repo-relative, forward slashes. */
  file: string;
  line: number;
  text: string;
}

export const LAYER_LAW_TEXT: Readonly<Record<LayerLaw, string>> = {
  3: 'Shared parts never branch on the page — pass the view spec, never compare a route or a view key.',
  5: 'One reader per fact — format money / dates through the field catalog or src/utils, never by hand.',
};

/** Where each law is read. */
const LAW_ROOTS: Readonly<Record<LayerLaw, readonly string[]>> = {
  3: ['src/design-system/components/', 'src/components/outbound/orders/', 'src/components/station/'],
  5: ['src/components/outbound/', 'src/components/receiving/'],
};

const LAW_PATTERNS: Readonly<Record<LayerLaw, readonly RegExp[]>> = {
  3: [/\bviewKey\s*[!=]==/, /\bpathname\s*[!=]==/, /\bpathname\??\.startsWith\(/, /\buseActiveSidebarChild\(/],
  5: [/\.toFixed\(2\)/, /\bnew Intl\.NumberFormat\(/, /\.toLocaleDateString\(/, /\.getMonth\(\)\s*\+\s*1\b/],
};

/**
 * Known violations, file → why it is still here. Burn down; never add to it to
 * make a new file pass.
 */
export const LAYER_LAW_ALLOWLIST: Readonly<Record<LayerLaw, Readonly<Record<string, string>>>> = {
  3: {
    'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx':
      'the Shipped package record keeps its full strip (`viewKey === shipping.shipped`) — belongs in its view spec',
    'src/components/station/ReceivingLinesTable.tsx':
      '/incoming host hides Find, the week pill and Sort by route — belongs in a receiving view spec',
    'src/components/station/useReceivingModeContext.ts':
      'route → receiving mode adapter read inside the shared station context',
  },
  5: {
    'src/components/outbound/label-intake/LabelIntakeRates.tsx': 'label ETA via toLocaleDateString',
    'src/components/outbound/label-intake/label-intake-client.ts': 'a third label-money formatter (Intl.NumberFormat)',
    'src/components/outbound/labels/BuyLabelSection.tsx': 'local money() + eta() copies of the label formatters',
    'src/components/outbound/orders/OrderLabelEntries.tsx': 'non-USD label cost via toFixed(2)',
    'src/components/outbound/orders/facts/CustomerOrderStats.tsx': 'first-order month via toLocaleDateString',
    'src/components/outbound/orders/intake/OrderIntakeForm.tsx': 'orders.ship_by date key assembled by hand',
    'src/components/receiving/inventory/InventoryPoLineList.tsx': 'PO line rate / total via $…toFixed(2)',
    'src/components/receiving/workspace/note-composer-helpers.ts': 'PO unit cost via $…toFixed(2)',
    'src/components/receiving/workspace/carton-add/WebTab.tsx': 'web search hit price (not an order fact) via toFixed(2)',
  },
};

const LAWS: readonly LayerLaw[] = [3, 5];

function isSource(file: string): boolean {
  return /\.(ts|tsx)$/.test(file) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(file);
}

/** The laws that read `file` (repo-relative, forward slashes). */
export function lawsForFile(file: string): LayerLaw[] {
  if (!isSource(file)) return [];
  return LAWS.filter((law) => LAW_ROOTS[law].some((root) => file.startsWith(root)));
}

/** Every layer-law hit in one file's source, allowlisted or not. */
export function auditLayerSource(file: string, text: string): LayerViolation[] {
  const laws = lawsForFile(file);
  if (laws.length === 0) return [];
  const out: LayerViolation[] = [];
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const law of laws) {
      if (LAW_PATTERNS[law].some((re) => re.test(raw))) out.push({ law, file, line: i + 1, text: trimmed });
    }
  });
  return out;
}

/** Split hits into new violations and allowlisted debt; name allowlist entries that no longer violate. */
export function judgeLayerLaws(hits: readonly LayerViolation[]): {
  violations: LayerViolation[];
  allowed: LayerViolation[];
  stale: { law: LayerLaw; file: string }[];
} {
  const violations = hits.filter((h) => !(h.file in LAYER_LAW_ALLOWLIST[h.law]));
  const allowed = hits.filter((h) => h.file in LAYER_LAW_ALLOWLIST[h.law]);
  const stale = LAWS.flatMap((law) =>
    Object.keys(LAYER_LAW_ALLOWLIST[law])
      .filter((file) => !hits.some((h) => h.law === law && h.file === file))
      .map((file) => ({ law, file })),
  );
  return { violations, allowed, stale };
}

export function formatLayerViolation(v: LayerViolation): string {
  return `Law ${v.law} ${v.file}:${v.line}  ${v.text}`;
}
