/** Bin-sheet import planner — turns an owner's paper bin sheet (ITEM / SKU / QTY / NOTE per location) plus the owner's decisions into a… */

export interface BinSheetRow {
  location: string;
  item?: string;
  sku_raw?: string;
  sku_kind: 'zoho' | 'numeric' | 'legacy' | 'wrong' | 'none' | 'empty';
  raw_qty?: string;
  units?: number | null;
  parts?: number;
  other?: number;
  variants?: Record<string, number>;
  note?: string;
  flags?: string[];
}

export interface BinSheetRowOverride {
  sku?: string;
  temp?: string;
  variants?: Record<string, string>;
  partsTemp?: string;
  hint?: string;
}

export interface BinSheetOverrides {
  importKey: string;
  ledgerNote: string;
  titleFixes?: Array<[pattern: string, replacement: string]>;
  products?: Record<string, { title?: string; description?: string }>;
  rows: Record<string, BinSheetRowOverride>;
}

type BinSheetTarget = { kind: 'real'; sku: string } | { kind: 'temp'; key: string };

export interface BinSheetLine {
  location: string;
  target: BinSheetTarget;
  /** Units the bin should hold after the import; `null` = the sheet has no count. */
  qty: number | null;
  /** What this count is on the sheet: `units`, `parts`, or a variant name. */
  what: string;
}

export interface BinSheetProduct {
  key: string;
  /** Idempotency key handed to `createProvisionalSku`. */
  sourceRef: string;
  title: string;
  description: string;
  countNeeded: boolean;
  locations: string[];
}

export interface BinSheetPlan {
  products: BinSheetProduct[];
  lines: BinSheetLine[];
  /** Sheet cells marked empty — nothing is written for them. */
  empty: string[];
}

const DESCRIPTION_MAX = 2000;

function isBad(row: BinSheetRow): boolean {
  return /\bbad\b/i.test(row.raw_qty ?? '');
}

function fixTitle(raw: string, fixes: BinSheetOverrides['titleFixes']): string {
  let title = raw.trim();
  for (const [pattern, replacement] of fixes ?? []) {
    title = title.replace(new RegExp(pattern, 'g'), replacement);
  }
  return title;
}

function stripPartsWord(title: string): string {
  return title.replace(/\s+parts?\s*$/i, '').trim();
}

function quoteCell(row: BinSheetRow): string {
  const cell = (label: string, value: string | undefined) => `${label} "${(value ?? '').trim()}"`;
  return [
    cell('ITEM', row.item),
    cell('SKU', row.sku_raw),
    cell('QTY', row.raw_qty),
    ...(row.note?.trim() ? [cell('NOTE', row.note)] : []),
  ].join(' · ');
}

interface ProductDraft {
  key: string;
  titles: string[];
  cells: string[];
  hints: string[];
  notes: string[];
  countNeeded: boolean;
  locations: string[];
}

/** Build the import plan. Throws on any row the overrides do not account for. */
export function planBinSheet(rows: readonly BinSheetRow[], overrides: BinSheetOverrides): BinSheetPlan {
  const drafts = new Map<string, ProductDraft>();
  const lines: BinSheetLine[] = [];
  const empty: string[] = [];
  const seen = new Set<string>();

  const draft = (key: string): ProductDraft => {
    let d = drafts.get(key);
    if (!d) {
      d = { key, titles: [], cells: [], hints: [], notes: [], countNeeded: false, locations: [] };
      drafts.set(key, d);
    }
    return d;
  };

  const addTemp = (
    key: string,
    row: BinSheetRow,
    title: string,
    qty: number | null,
    what: string,
    hint: string | undefined,
  ) => {
    const d = draft(key);
    d.titles.push(title);
    d.cells.push(`${row.location} (${qty == null ? 'no count' : `${qty} ${what}`}) — ${quoteCell(row)}`);
    if (hint && !d.hints.includes(hint)) d.hints.push(hint);
    if (!d.locations.includes(row.location)) d.locations.push(row.location);
    if (qty == null) d.countNeeded = true;
    lines.push({ location: row.location, target: { kind: 'temp', key }, qty, what });
    return d;
  };

  for (const row of rows) {
    if (seen.has(row.location)) throw new Error(`${row.location}: listed twice on the sheet`);
    seen.add(row.location);
    const ov = overrides.rows[row.location];

    if (row.sku_kind === 'empty') {
      if (ov) throw new Error(`${row.location}: sheet cell is empty but has an override`);
      empty.push(row.location);
      continue;
    }
    if (!ov) throw new Error(`${row.location}: no override decides this cell`);

    const units = row.units ?? null;
    const bad = isBad(row) ? (row.other ?? 0) : 0;
    const parts = (row.parts ?? 0) + (bad ? 0 : (row.other ?? 0));
    const title = fixTitle(row.item ?? '', overrides.titleFixes);
    if (!title) throw new Error(`${row.location}: no ITEM text to title a product`);

    const targets = [ov.sku, ov.temp, ov.variants].filter((t) => t !== undefined).length;
    if (targets > 1) throw new Error(`${row.location}: choose one of sku / temp / variants`);
    if (targets === 0 && (units ?? 0) > 0) {
      throw new Error(`${row.location}: ${units} units but no sku / temp / variants`);
    }

    let unitsDraft: ProductDraft | null = null;
    if (ov.sku) {
      if (units == null) throw new Error(`${row.location}: real SKU ${ov.sku} needs a sheet count`);
      lines.push({ location: row.location, target: { kind: 'real', sku: ov.sku }, qty: units, what: 'units' });
    } else if (ov.temp) {
      unitsDraft = addTemp(ov.temp, row, title, units, 'units', ov.hint);
    } else if (ov.variants) {
      const counts = row.variants ?? {};
      const names = Object.keys(ov.variants);
      const sum = names.reduce((acc, name) => acc + (counts[name] ?? NaN), 0);
      if (!Number.isFinite(sum) || names.length !== Object.keys(counts).length) {
        throw new Error(`${row.location}: variant overrides do not match the sheet's variants`);
      }
      if (units != null && sum !== units) throw new Error(`${row.location}: variants sum ${sum} ≠ units ${units}`);
      for (const name of names) {
        unitsDraft = addTemp(ov.variants[name], row, `${title} (${name})`, counts[name], 'units', ov.hint);
      }
    }

    if (parts > 0) {
      if (!ov.partsTemp) throw new Error(`${row.location}: ${parts} parts but no partsTemp`);
      addTemp(ov.partsTemp, row, `${stripPartsWord(title)} — parts`, parts, 'parts', ov.hint);
    } else if (ov.partsTemp) {
      throw new Error(`${row.location}: partsTemp set but the sheet has no parts`);
    }

    if (bad > 0) {
      const note = `${bad} bad unit${bad === 1 ? '' : 's'} at ${row.location} not stocked.`;
      if (unitsDraft) unitsDraft.notes.push(note);
      else throw new Error(`${row.location}: bad units need a temp product to note them on`);
    }
  }

  for (const location of Object.keys(overrides.rows)) {
    if (!seen.has(location)) throw new Error(`${location}: override for a cell not on the sheet`);
  }

  const products: BinSheetProduct[] = [...drafts.values()].map((d) => {
    const fixed = overrides.products?.[d.key];
    const distinct = [...new Set(d.titles)];
    if (!fixed?.title && distinct.length > 1) {
      throw new Error(`temp ${d.key}: cells disagree on the title (${distinct.join(' / ')}) — set products.${d.key}.title`);
    }
    const description = [
      `Bin sheet import ${overrides.importKey} · key ${d.key}`,
      ...(fixed?.description ? [fixed.description] : []),
      ...d.hints,
      ...(d.countNeeded ? ['COUNT NEEDED — the sheet has no quantity.'] : []),
      ...d.notes,
      ...d.cells,
    ].join('\n');
    if (description.length > DESCRIPTION_MAX) {
      throw new Error(`temp ${d.key}: description is ${description.length} chars (max ${DESCRIPTION_MAX})`);
    }
    return {
      key: d.key,
      sourceRef: `${overrides.importKey}:${d.key}`,
      title: fixed?.title ?? distinct[0],
      description,
      countNeeded: d.countNeeded,
      locations: d.locations,
    };
  });

  return { products, lines, empty };
}
