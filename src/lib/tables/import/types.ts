/** Table import — the per-family DESCRIPTOR. */

/** One canonical field a family's file must (or may) bind a source column to. */
export interface TableImportFieldSpec<TField extends string> {
  key: TField;
  label: string;
  /** Blocks commit when unbound / blank. */
  required: boolean;
}

export interface TableImportClassification<TField extends string> {
  /** Triage state — two states, and `action_required` means "a human". */
  status: 'ready' | 'action_required';
  /** Canonical fields whose absence is the reason Confirm would skip this row. */
  missing: TField[];
}

/** Everything the shared staging mechanism needs to serve one `entityFamily`. */
interface TableImportCommitSuccess {
  ok: true;
  /** Stable ids of rows newly created by this commit, when the writer has them. */
  insertedEntityIds?: readonly number[];
}

export type TableImportCommitResult =
  | TableImportCommitSuccess
  | { ok: false; error: string };

export interface TableImportDescriptor<TField extends string, TRowView> {
  /**
   * Stable surface id — the staging store key and the fan-out allowlist entry.
   * Matches the table definition's `entityFamily` (e.g. `orders-import`).
   */
  surfaceId: string;
  /** Operator noun for the batch, lower case: "orders", "cartons". */
  entityNoun: string;
  /**
   * Route the `?import=` soft-replace writes back to. The staging surface
   * swaps the desk's middle, so it must land on the desk that hosts it.
   */
  deskPath: string;
  /** Canonical fields, in mapping-panel order. */
  fields: readonly TableImportFieldSpec<TField>[];
  /** Best-effort header → canonical binding on load. */
  autoMap(headers: string[]): Record<string, string>;
  /** Ready vs Action required, and why. */
  classify(
    row: Record<string, string>,
    mapping: Record<string, string>,
  ): TableImportClassification<TField>;
  /** Raw record → canonical values (rail editor + confirm payload). */
  project(
    row: Record<string, string>,
    mapping: Record<string, string>,
  ): Record<TField, string>;
  /** Canonical edits → raw record, through the current mapping. */
  applyEdits(
    row: Record<string, string>,
    mapping: Record<string, string>,
    edits: Partial<Record<TField, string>>,
  ): Record<string, string>;
  /** Raw record → the grid's row shape. */
  toRowView(
    row: Record<string, string>,
    mapping: Record<string, string>,
    index: number,
  ): TRowView;
  /**
   * Values the Band-3 find matches against — the PROJECTED faces, never the
   * unmapped source columns, or a hit would be invisible in every visible cell.
   */
  searchValues(view: TRowView): readonly string[];
  /** Write the confirmed rows. Resolves `{ ok: false }` rather than throwing. */
  commit(input: {
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  }): Promise<TableImportCommitResult>;
}
