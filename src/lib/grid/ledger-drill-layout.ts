/**
 * LedgerGrid parent→child drill — URL-as-SoT helpers (WMS-wide).
 *
 * **Drill** = linked dual panes (left parents drive right children).
 * Orthogonal to **fold** (in-grid expand) and **compare** (independent panes).
 *
 * Domains pass their own param names (`hlayout`/`drillPo`, …) via
 * {@link LedgerDrillUrlContract} — never fork a second layout parser.
 */

export type LedgerDrillLayout = 'drill' | 'list';

const LAYOUT_SET = new Set<LedgerDrillLayout>(['drill', 'list']);

export type LedgerDrillUrlContract = {
  /** e.g. `hlayout` — omit from clean URLs when layout === defaultLayout */
  layoutParam: string;
  /** e.g. `drillPo` — durable selected parent key */
  parentParam: string;
  /** Default when param omitted / unknown. History uses `'list'`. */
  defaultLayout: LedgerDrillLayout;
};

/**
 * Parse layout. Unknown / empty → {@link LedgerDrillUrlContract.defaultLayout}.
 */
export function parseLedgerDrillLayout(
  raw: string | null | undefined,
  contract: Pick<LedgerDrillUrlContract, 'defaultLayout'>,
): LedgerDrillLayout {
  const v = String(raw || '').trim().toLowerCase();
  if (LAYOUT_SET.has(v as LedgerDrillLayout)) return v as LedgerDrillLayout;
  return contract.defaultLayout;
}

/** Trimmed parent key, or null when empty. */
export function parseLedgerDrillParentKey(
  raw: string | null | undefined,
): string | null {
  const v = String(raw || '').trim();
  return v || null;
}

/**
 * Mutate URLSearchParams for drill chrome.
 * When `layout === defaultLayout`, delete the layout param (clean URLs).
 */
export function writeLedgerDrillParams(
  params: URLSearchParams,
  contract: LedgerDrillUrlContract,
  layout: LedgerDrillLayout,
  parentKey: string | null,
): void {
  if (layout === contract.defaultLayout) {
    params.delete(contract.layoutParam);
  } else {
    params.set(contract.layoutParam, layout);
  }
  if (parentKey) params.set(contract.parentParam, parentKey);
  else params.delete(contract.parentParam);
}

/**
 * Flatten day-banded (or section-banded) parent groups newest-section-first.
 * Generic over group shape — only requires a stable `key`.
 */
export function flattenSectionedParents<TGroup extends { key: string }>(
  sectioned: Record<string, TGroup[]>,
  options?: { sectionSort?: 'desc' | 'asc' },
): Array<{ section: string; group: TGroup }> {
  const dir = options?.sectionSort ?? 'desc';
  const sections = Object.keys(sectioned).sort((a, b) =>
    dir === 'desc' ? b.localeCompare(a) : a.localeCompare(b),
  );
  const out: Array<{ section: string; group: TGroup }> = [];
  for (const section of sections) {
    for (const group of sectioned[section] ?? []) {
      out.push({ section, group });
    }
  }
  return out;
}
