/**
 * Hard law: **an order annotation has exactly one writable home** —
 * `order_notes`, via `POST /api/orders/[id]/notes`. The legacy scalar
 * `orders.notes` is read-only history.
 *
 * `2026-07-28_order_notes.sql`'s SCOPE BOUNDARY says two note homes are only
 * legitimate while they do genuinely different jobs. Between 2026-07-28 and
 * 2026-07-31 they did not: the order inspector carried the append-only trail
 * AND the editor dock's scalar composer, side by side, both answering "write a
 * note about this order". The scalar was simply the worse implementation —
 * the second person to touch a row overwrote the first, with no record of who
 * said either thing. So the writers were migrated and the column was frozen.
 *
 * What `orders.notes` still legitimately does (all reads, none of them a
 * second home):
 *   • renders read-only under the trail (`OrderNotesTrail` → "Legacy note"),
 *   • feeds the queue's search ILIKE predicate,
 *   • lights the row's corner indicator alongside `note_count`.
 *
 * The only remaining writer is `ingestCanonicalOrders`, and what it writes is
 * **the note the SOURCE carried** — a Google Sheet's `Note` cell, an Ecwid
 * buyer's `customerComments`. That IS a genuinely different job from a staff
 * annotation: it is an inbound snapshot, stamped at ingest, never typed by an
 * operator and never editable in the product. (The CSV import used to write
 * `"Customer: <name>"` here too; that was a buyer identity with no column of
 * its own, and it now resolves to a real `customers` row — see
 * `resolveCustomersByName`.)
 *
 * Why a SOURCE guard: "which column does this composer patch" is React and
 * route wiring, and the regression shape is a single identifier reappearing in
 * a payload — invisible to a behavioral test of either store, both of which
 * only ever see the string handed to them. Same reasoning as
 * `label-note-grain.guard.test.ts`.
 *
 * Run: `npx tsx --test src/lib/orders/order-note-grain.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose ABOUT the law can never satisfy the law. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const ORDER_UPDATE_SCHEMA = code(sourceOf('../schemas/orders.ts'));
const ORDERS_QUERIES = code(sourceOf('../neon/orders-queries.ts'));
const ASSIGN_ROUTE = code(sourceOf('../../app/api/orders/assign/route.ts'));
const ASSIGN_HOOK = code(sourceOf('../../hooks/useOrderAssignment.ts'));
const FIELD_SAVE_HOOK = code(sourceOf('../../hooks/useOrderFieldSave.ts'));
const EDITOR_DOCK = code(
  sourceOf('../../components/shipped/details-panel/ShippedPanelEditorDock.tsx'),
);
const QUEUE_ROW = code(
  sourceOf('../../components/dashboard/orders-queue/OrdersQueueTableRow.tsx'),
);
const INGEST = code(sourceOf('./ingest-canonical-orders.ts'));
const IMPORT_CSV = code(sourceOf('../../app/api/orders/import-csv/route.ts'));

test('the order record route cannot write orders.notes', () => {
  // `OrderUpdateBody` is `.strict()`, so absence here is a 400 on `{ notes }`,
  // not a silently ignored key.
  assert.ok(
    !/\bnotes\s*:/.test(ORDER_UPDATE_SCHEMA),
    'OrderUpdateBody re-added a `notes` field — PATCH /api/orders/[id] must not write the legacy scalar',
  );

  // The whitelist `updateOrder()` maps camelCase keys through. No `notes` row
  // means no SET clause can be built for the column.
  assert.ok(
    !/\bnotes\s*:\s*'notes'/.test(ORDERS_QUERIES),
    "updateOrder()'s columnMap re-added `notes: 'notes'` — the scalar is read-only",
  );
});

test('the assign route cannot write orders.notes', () => {
  assert.ok(
    !/\bnotes\s*=\s*\$\$\{/.test(ASSIGN_ROUTE) && !/`notes = \$/.test(ASSIGN_ROUTE),
    'POST /api/orders/assign re-added a `notes = $n` SET clause',
  );
  assert.ok(
    !/\bnotes\?\s*:/.test(ASSIGN_HOOK),
    'OrderAssignPayload re-added `notes` — the assign waist does not carry annotations',
  );
});

test('no order UI writes the legacy scalar', () => {
  // The field-save hook is the panel's PATCH waist; a `saveNotes` here is the
  // exact shape that put a scalar composer back on the inspector.
  assert.ok(
    !/saveNotes|isSavingNotes/.test(FIELD_SAVE_HOOK),
    'useOrderFieldSave re-added a notes writer — notes append via POST /api/orders/[id]/notes',
  );
  assert.ok(
    !/saveNotes|isSavingNotes|ShippedNotesComposer/.test(EDITOR_DOCK),
    'ShippedPanelEditorDock re-added the scalar notes composer — it must mount OrderNotesTrail',
  );
  assert.ok(
    EDITOR_DOCK.includes('OrderNotesTrail'),
    'ShippedPanelEditorDock no longer mounts OrderNotesTrail — the dock context would lose notes entirely',
  );

  // Desk inspector is the durable note plane after `/o` retired.
  const DESK_BODY = code(
    sourceOf('../../components/shipped/details-panel/ShippedDetailsBody.tsx'),
  );
  assert.ok(
    !/showNotes=\{false\}/.test(DESK_BODY),
    'ShippedDetailsBody must not hard-disable notes — desk is the durable note plane',
  );

  // The grid's in-cell editor appends; `commitAssign({ notes })` is the old
  // overwrite it replaced.
  assert.ok(
    !/commitAssign\(\s*\{\s*notes/.test(QUEUE_ROW),
    'OrdersQueueTableRow re-added an in-cell scalar note write — the cell appends via useAppendOrderNote',
  );
  assert.ok(
    QUEUE_ROW.includes('useAppendOrderNote'),
    'OrdersQueueTableRow no longer appends through the note waist',
  );
});

test('ingest is the only writer of the legacy scalar, and it writes source notes', () => {
  // Not a prohibition — a census. If a SECOND machine writer appears, the
  // "one writable home" claim in the docs is no longer true and this fails.
  assert.ok(
    /\bnotes\b/.test(INGEST),
    'ingest-canonical-orders no longer writes orders.notes — if that is deliberate, the column has zero writers and this guard plus the SoT row should say so',
  );
});

test('the CSV import resolves a buyer instead of noting one', () => {
  // The exact regression: a mapped `customer_name` column stuffed into `notes`
  // as prose. It is a buyer, so it resolves to `customers` and lands on
  // `orders.customer_id`.
  assert.ok(
    !/Customer:\s*\$\{/.test(IMPORT_CSV) && !/notes:\s*canonical\.customer_name/.test(IMPORT_CSV),
    'import-csv is writing the buyer name into orders.notes again — pass `customerName` and let the writer resolve a customer',
  );
  assert.ok(
    /customerName:\s*canonical\.customer_name/.test(IMPORT_CSV),
    'import-csv no longer passes the mapped customer_name — the buyer would be dropped entirely',
  );
  assert.ok(
    INGEST.includes('resolveCustomersByName') && /customerIdByName/.test(INGEST),
    'ingest-canonical-orders no longer resolves name-only buyers to a customers row',
  );
});
