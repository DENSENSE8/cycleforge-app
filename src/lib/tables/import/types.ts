/**
 * Table import — the per-family DESCRIPTOR.
 *
 * Import is a capability of the table definition registry, not a To-Ship
 * feature: any Workbench spreadsheet may take a file, stage it in its own grid
 * with a triage state, correct it inline, and commit. What is shared is the
 * MECHANISM (parse · map · classify · stage · select · commit); what stays per
 * family is the VOCABULARY — its canonical fields, their aliases, the rule that
 * decides Ready vs Action required, and where a confirmed batch is written.
 *
 * There is deliberately **no universal canonical-field vocabulary**. An orders
 * row and a receiving row do not share fields, and pretending they do would put
 * one family's columns in another family's mapping panel.
 *
 * Mounting this per family is a FAN-OUT and is governed golden-first — see
 * `registry.ts` (`TABLE_IMPORT_LIVE_SURFACES`) and
 * `source-of-truth.md` → Table engine fan-out (History first).
 */

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

/**
 * WHERE a staging draft's records came from.
 *
 * `file` is an operator-chosen CSV/TSV: it exists only in this session, so the
 * batch commit IS the write. `google_sheets` is a human-maintained sheet the
 * sync job already read, so every row is a TRIAGE DECISION (approve / reject)
 * rather than a parse the operator is about to accept wholesale. The origin is
 * what tells the shared host which of those two boards it is drawing.
 */
export type TableImportOrigin = 'file' | 'google_sheets';

/**
 * A per-row operator decision on a human-authored source.
 *
 * Deliberately NOT a third triage status: `classify` still owns Ready vs
 * Action-required (what the DATA says), while this owns what the OPERATOR
 * said about the row. `undefined` — absent from the map — is undecided, which
 * is what makes unapprove a real state rather than a silent re-reject.
 */
export type TableImportRowDecision = 'approved' | 'rejected';

/**
 * Everything the shared staging mechanism needs to serve one `entityFamily`.
 *
 * `TRowView` is the family's grid row shape — the staging table definition's
 * row type. The store keeps raw `Record<string, string>` records; the view is
 * derived on read, which is what makes an edit re-classify in place with no
 * extra plumbing.
 */
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
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}
