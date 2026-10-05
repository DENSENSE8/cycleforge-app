# PROMPT — FBM Labels & docs: order loop, three saved views (2026-10-04)

Paste this whole file as the first message of a fresh session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Do not re-plan the
product. The operator decided the actions below. Reuse the writers named
here. Do not add a second upload pipeline, a second storage bucket, or a
new page path.

Dev origin `http://localhost:3050` only. Lane unit `cycleforge-lane@prod`.
Another session may be editing the tree — re-read before every edit, never
revert what you did not write, never `git stash`, never commit.

## End goal — definition of done

An operator standing on FBM › Labels & docs can take an order that is already
on Allocate, see it on the left, see every document linked to it on the right,
and finish every paperwork and shipping-label action on this page: create,
read, replace, delete, pair a row that is already in the tables, remove
unlinked, print. The same actions work on a testing order that is itself on
Allocate. Bulk upload and bulk print work with no order identity. The operator
never leaves `/shipping/label-intake` to do any of this, and never opens a
second app to attach a file.

Done is not a route that returns 200, a unit test that mocks the writer, or a
control that is painted but unwired. Done is each action below, driven in a
browser at `http://localhost:3050`, against the two orders in **Browser proof**,
with the document visible on the right, the row in the table, the bytes in the
existing store, and the same document still on that order after a reload.

If a root the action needs does not exist, build it from first principles in
the domain layer the sibling writer already lives in. Do not stub the button,
do not skip the action, do not leave a TODO. A missing writer is in scope.
A second pipeline is not.

## Operator rulings (binding)

1. The page is FBM › **Labels & docs**, `/shipping/label-intake`. Do not
   rename it, do not invent a path, do not add a sibling destination.
2. Two columns. **Left:** the orders (channel, order number, what it ships).
   **Right:** the document. Selecting an order lists **every document already
   linked to that order**, then shows the active one.
3. Full CRUD on those documents, on this page, inside FBM. Create, read,
   replace, delete. Tray-only "Remove" before confirm is not delete.
4. **Remove unlinked** is its own verb: stored rows with no order link.
5. A new file is written to the **existing table** and the **existing byte
   store** in one action. An already-stored object is **paired**, not
   uploaded again.
6. Three saved views, no fourth:
   - **Packing slips** — letter stock, tied to an order.
   - **Shipping labels** — 4×6, tied to an order. Label upload lives on
     this view.
   - **Bulk** — upload and bulk-print with **no** order number, **no**
     order id, **no** marketplace id, **no** item number.
7. Close the loop on this page: upload paperwork onto a specific order
   identification, and pair a row that is **already in the tables** onto
   that same order.

## What already exists (do not rebuild)

Page and views: `src/features/labels-docs/LabelsDocsDesk.tsx`,
`src/lib/triage/views/label-intake.ts`. Today: `uploads` (bare, one card per
PDF batch, lone list), `labels` (unprinted 4×6), `paperwork` (unprinted
slips **and** manuals), `printed` (history). Print views already use the
left rail + `DocumentStage`. Uploads does not.

Order document write (packing slip **and** shipping label onto a known
order):

- Client: `uploadOrderDocument` in `src/lib/orders/order-paperwork-client.ts`.
- Route: `POST /api/orders/:id/documents/upload`,
  `documentType` = `packing_slip` | `shipping_label`. Permission
  `orders.create`. Idempotent on file sha256.
- Writer: `storeOutboundDocumentFromBytes` in
  `src/lib/documents/outbound-documents.ts`. Inserts `documents`, wires
  `document_entity_links`, stores bytes in **GCS**
  (`document_data.storageProvider = 'gcs'`).
- Read: `listDocumentsForOrder`. Replace without dropping links:
  `replaceOutboundDocument`. Delete (unlink + delete, FK cascade):
  `deleteOutboundDocument`.
- Slip review tray (filename / PDF text → desk order, then the same write):
  `src/features/labels-docs/upload/use-slip-uploads.ts`. Keep the review.
  Do not file a slip onto an order the operator did not pick.
- Channel fetch already exists (`fetchOutboundDocuments` /
  `fetchFromPlatform`). Do not build a second marketplace fetcher.

Label ledger (a PDF that may or may not name an order):

- `createLabelIngestion` → `label_ingestions` + GCS object
  `label-ingestions/{org}/{hash}.pdf` (`staged_storage_provider = 'gcs'`).
  PDF only. Same bytes = same row.
- Multi-page upload: `src/lib/label-batches/batches.ts` splits, then
  `createLabelIngestion` per page. Original PDF is not stored.
- Quarantine pair: `confirmLabelIngestionOrder` via
  `POST /api/v1/label-ingestions/{id}/confirm-order`. Candidates:
  `listLabelPairingCandidates`. Client: `confirmLabelOrderHttp`.
- Apply (the missing close): `applyStoredLabelIngestion` writes
  `matched_order_id`, `shipment_id`, `document_id`, state `APPLIED`.
  Until apply, a MATCHED / LINKED ingestion prints from the staged PDF and
  has **no** `documents` row (`src/lib/documents/print-bundle.ts`).
- Reference-label pair is a **different** writer:
  `POST /api/shipping/label-intake/pair` `{ ref, orderId }` →
  `pairReferenceLabels`. It attaches unpaired **reference purchases** under
  that order number. Do not overload it for arbitrary ingestions or slips.
- Buy a label stays `?buy=1` on the labels view. Do not move it.

Storage fact, so you do not "fix" it: packing slips and shipping labels do
**not** use `@vercel/blob`. Vercel blob is manuals, inventory photos, and
attract media. `/api/documents/:id/content` already streams a Vercel blob
URL when a row has one. "Pair the existing blob" means bind the row that
already holds the bytes (GCS object key **or** an existing Vercel blob URL).
Do not add `put()` from `@vercel/blob` for labels or slips. Do not migrate
GCS → Vercel blob.

## Identification

The operator's identification is the **order**. Resolve it with the lookup
this desk already uses (`findOrderByRef` and the slip candidate list). Accept
the order number as typed (marketplace order id or CycleForge order number).
A bare positive integer may be `orders.id` only when that id exists in the
org; otherwise it is an order number. Never invent a new identity column.
Item number / SKU is how **manuals** are already paired. It is not the pair
target for a packing slip or a shipping label.

## Three saved views

Keep `/shipping/label-intake`. Sidebar owns the switch (`?view=`,
`NAV_PAGE_DECLS`, `src/lib/nav/context/pages.ts`, parity in
`src/lib/nav/context/parity.ts`). Run `ds_contract` before any new control
and obey its placement. Filters stay in the left sidebar. The page body is
the rail + the document.

| Saved view | URL | Left | Right | Tied to an order? |
| --- | --- | --- | --- | --- |
| Packing slips | `?view=paperwork` (keep the key; the job is slips) | Orders that have, or can take, a packing slip | Letter document. Strip lists every linked doc; the slip is the face | Yes |
| Shipping labels | `?view=labels` | Orders that have, or can take, a shipping label | 4×6 document. Strip lists every linked doc; the label is the face | Yes |
| Bulk | bare route (today's `uploads`) | Uploaded files / pages. **No order number on the card** | The open file, at its stock | **No.** Upload, preview, print, delete. Pairing is not on this view |

Retire `printed` as a fourth sidebar view. Print state stays the chip already
on uploads (`?printing=to-print|printed`) and the print log
(`label_print_events`). Migrate parity, go-keys, and nav decls in the same
change. Do not leave a fourth view "for later".

Manuals stay readable in the selected order's linked-document strip (item
number / SKU association, as today). They are not the packing-slip view's
upload stock and not a fourth view.

## Exact actions — packing slip

All of these happen on the packing-slip view, against the **selected order**.
Permission stays `orders.create` for writes, `packing.review` to open the page.

1. **Read.** Select the order. Right strip = every linked packing slip
   (`documents.document_type = 'packing_slip'` via `listDocumentsForOrder`),
   plus any shipping label and manual already linked, so the operator sees
   the whole file. Active document renders in `DocumentStage` at letter size.
2. **Create — new file.** Pick a PDF, PNG, or JPEG. Review tray still matches
   filename / PDF text and proposes the order. Confirm files **only** onto
   the selected order through `uploadOrderDocument` →
   `POST /api/orders/:id/documents/upload` `documentType=packing_slip` →
   `storeOutboundDocumentFromBytes`. One action writes the `documents` row,
   the order link, and the GCS object. Same bytes on the same order are the
   same row (existing sha256 dedupe). The new slip appears in the strip
   without a reload dance.
3. **Create — from the channel.** "Fetch packing slip from the channel" stays
   the existing `fetchOutboundDocuments` path. If the channel has no slip,
   say so. Do not upload a blank.
4. **Pair — already stored.** A `documents` row of type `packing_slip` with
   **no** order `document_entity_links` (and a legacy
   `entity_type='SHIPPING_LABEL'` row the dual-read still surfaces, if it is
   a slip) can be paired onto the selected order. Preview the stored object
   through `/api/documents/:id/content`. Pair calls `attachOutboundDocument`
   to **re-link**. Do not download and re-upload the bytes. Do not create a
   second `documents` row for the same sha256.
5. **Update.** Replace the file on the open slip via `replaceOutboundDocument`.
   The order link does not drop. Re-pair (move the link to a different order)
   is the same attach writer: unlink from the old order, link to the selected
   one, bytes stay. Audit both.
6. **Delete.** Delete the open slip via `deleteOutboundDocument`. It leaves
   the strip. This deletes a **linked** slip the operator pointed at.
7. **Remove unlinked.** Separate verb, on this view and on Bulk. Deletes
   every `packing_slip` document in the org with no order link, and its
   stored object, through `deleteOutboundDocument`. Confirm once, with the
   count. Never deletes a linked slip. Never deletes a manual.
8. **Print.** Letter station, existing paperwork press. ⌘P prints this view's
   slip stock only.

## Exact actions — shipping label

All of these happen on the shipping-label view, against the **selected
order**, except Buy which already needs no order.

1. **Read.** Select the order. Strip = every linked shipping label: `documents`
   rows of type `shipping_label` **and** `label_ingestions` with
   `matched_order_id` = that order (including MATCHED / LINKED that have no
   `document_id` yet — show them, marked not yet applied). Active document
   renders at 4×6.
2. **Create — new file onto this order.** Pick a PDF. Single page, or a PDF
   whose parsed order id / tracking is this order: `createLabelIngestion`
   (batch splitter if multi-page). When the resolver matches this order,
   finish with `applyStoredLabelIngestion` so the row gains `document_id`
   and shows up in `listDocumentsForOrder`. A direct
   `documentType=shipping_label` upload through
   `POST /api/orders/:id/documents/upload` is allowed when the operator
   says this file **is** the order's label and should not go through the
   parser. One of those two writers, never a third. Same bytes = same
   ingestion (sha256 unique).
3. **Create — buy.** Keep Buy label (`?buy=1`, `shipping_label_purchases`).
   It does not require an order. Pairing it later is action 5.
4. **Pair — quarantined ingestion already in `label_ingestions`.** Operator
   picks the row (no order, state `QUARANTINED`) and the selected order.
   `confirmLabelIngestionOrder` (`POST /api/v1/label-ingestions/{id}/confirm-order`,
   expected row version). Then `applyStoredLabelIngestion` so
   `document_id` is set. The label appears on the order's strip. Tracking
   attaches the way ingestion already does (primary if the order has none,
   additional package if it has one). Do not call `pairReferenceLabels` for
   this row.
5. **Pair — reference purchase already in `shipping_label_purchases`.**
   `POST /api/shipping/label-intake/pair` `{ ref: <order number>, orderId }`.
   Only this writer. Only unpaired reference rows under that ref.
6. **Pair — applied-shaped row that already has bytes.** A `label_ingestions`
   row with `staged_object_key` and `matched_order_id` null, or a
   `documents` row of type `shipping_label` with no order link: preview the
   stored object, then link it. Ingestion path: confirm (if quarantined) or
   the apply writer once it is matched. Document path: `attachOutboundDocument`
   re-link. **No second `put` of the bytes.** A Vercel blob URL already on a
   document row is paired the same way — link the row, do not copy it to GCS.
7. **Update.** Replace bytes on a `documents` label via
   `replaceOutboundDocument` (link stays). An ingestion is immutable bytes
   (sha256 identity). Replacing an ingestion means a new ingestion paired
   onto the order and the old unlinked one removed only if it has no other
   order. Re-pair moves `matched_order_id` / the document link to the
   selected order. Audit it.
8. **Delete.** Delete the open **linked** label the operator pointed at:
   `deleteOutboundDocument` for a `documents` row. An ingestion that is
   APPLIED is deleted only by deleting its `documents` row; do not leave an
   APPLIED ingestion pointing at a dead `document_id`.
9. **Remove unlinked.** Deletes ingestions with `matched_order_id IS NULL`
   and not `APPLIED`, plus `shipping_label` documents with no order link,
   and their stored objects. Confirm once, with the count. There is no
   ingestion-delete writer today — add one next to `createLabelIngestion`,
   org-scoped, refused when `matched_order_id` is set or state is `APPLIED`.
   Do not delete through a raw SQL shortcut in the route.
10. **Print.** 4×6 label station, existing label press. ⌘P prints this view's
    label stock only. A paired-but-not-applied ingestion still prints from
    `readLabelIngestionPdf` until apply finishes; after apply it prints as
    the order document.

## Exact actions — bulk (no identification)

On the bare route. A file here has no order number and must not gain one
from filename matching.

1. **Create.** Drop a PDF. Labels go through the batch splitter +
   `createLabelIngestion` and stay unmatched (`matched_order_id` null is
   success, not an error). Packing slips dropped here are stored as
   `documents` rows of type `packing_slip` with **no** order link (same GCS
   writer, no `document_entity_links` order row). Do not run `matchSlipFile`
   on this view.
2. **Read.** Left card is the file name and page count. Right is the open
   page. No order ref on the card, the stage, or the empty state.
3. **Update.** Not on this view. Replacing or pairing is done after the
   operator opens the packing-slip or shipping-label view and pairs the row.
4. **Delete / Remove unlinked.** Same unlinked delete as above. A bulk file
   is unlinked by definition.
5. **Print.** "Print all labels" (4×6) and "Print all paperwork" (letter)
   print this view's stock with no order filter. Existing header intents
   (`labels-docs.print-labels`, `labels-docs.print-paperwork`). A label and
   a slip never share a station.

## Layout

Order-tied views use the rail already specified for this desk (`record.rail`
in the label-intake view decl): fixed-width order cards on the left, document
on the right, first order open on arrival, no ✕. The strip above the frame
is the linked-document list (kind, file name, paired / not applied). Bulk
stays a file list + the open file, not an order list.

Before adding a control, `node tools/design-mcp/ds.mjs contract '<the job>'`
and paste its placement into the work. Do not put upload, pair, or
remove-unlinked in the page body if the contract says sidebar / header.
Vocabulary: order, packing slip, shipping label, Labels & docs. No new synonym
for order. No "Zone". Run `ds_critique` on every touched UI file; it is not
a merge gate.

## Roots from first principles

Reuse a writer when it exists. When the action has no writer, build the root
next to the sibling that already owns that table. Same invariants, no fork.

A root is done only when all of these hold:

1. **One identity.** Order identity is the order number as typed, resolved to
   `orders.id` the way this desk already resolves it. File identity is sha256.
   The same bytes are the same row. A bulk file has no order identity and must
   not gain one.
2. **One write.** The action inserts or updates the table row and the stored
   object in the same action, or pairs an object that is already stored. It
   never writes the row without the bytes, and never copies bytes that are
   already stored.
3. **Org scope.** Every read and write is the signed-in org. A row from another
   org is not found.
4. **Audit.** Pair, re-pair, replace, and delete write an audit row naming the
   order id, the document or ingestion id, and the actor.
5. **Refuse the illegal state.** Delete of an ingestion refuses when
   `matched_order_id` is set or state is `APPLIED`. Remove-unlinked never
   touches a linked row. Bulk never calls `matchSlipFile`.
6. **No second store.** Slips and labels stay on the GCS writers named above.
   A Vercel blob URL already on a row is linked, not copied.

Known missing root: there is no ingestion-delete writer. Add it beside
`createLabelIngestion`, org-scoped, with the refusal in (5). Do not delete
through raw SQL in a route. If pair-without-reupload cannot be expressed by
`attachOutboundDocument` or `confirmLabelIngestionOrder` + `applyStoredLabelIngestion`,
extend that writer. Do not add a parallel attach function.

A new column is the last resort. If the invariant cannot be stored on the
columns that exist, stop and name the column. Do not invent one "to be safe".

## Out of scope

- No new page path. No phone surface (`mobileHref` stays null).
- No `@vercel/blob` writer for slips or labels. No GCS → Vercel migration.
- No second marketplace document fetcher.
- No use of `pairReferenceLabels` for ingestions or slips.
- No filing a bulk upload onto an order because the filename contained a number.
- No org-rules, no ShipStation history backfill, no change to how an order
  gets onto Allocate.
- No writes onto a live customer order. The existing Allocate order is read-only
  proof. Every create, replace, delete, and pair runs on the testing order.

## Browser proof — this is the gate

`pnpm verify:fast` is necessary and not sufficient. Each action is driven in
headless Chromium against `http://localhost:3050` with
`storageState: tests/.auth/admin.json`. Never call `/api/auth/signin`. Never
bind another port. Delete the throwaway script after. Screenshots in `/tmp`.

Two orders. Both must be on Allocate (`/shipping/orders`, the unshipped
To-ship queue) before any Labels & docs step.

**A. Existing Allocate order — read only.** Pick one order already on
`http://localhost:3050/shipping/orders` that you did not create in this session.
Record its order number and `orders.id`. Do not upload, replace, delete, pair,
or fetch onto it. It exists to prove the left rail is Allocate's orders, not a
private list.

**B. Testing order — every write.** Create it the way the product already
creates a test order: `/orders/new?test=1`, Test mode on, Fill, Release. The
number must be `CF-TEST-…` (never a bare `PH-` or a channel number). It must
appear on `/shipping/orders` before you open Labels & docs. If Fill/Release
does not land it on Allocate, that path is broken — fix only that landing.
Do not insert an order by SQL.

Open `http://localhost:3050/shipping/label-intake`. For each row, do the action
in the browser, reload, and record what you saw. A curl that succeeds while the
page does not show it is a fail.

| # | Action | Order | Pass when |
| --- | --- | --- | --- |
| 1 | Open packing slips | A and B | Both order numbers are on the left. Selecting A lists only A's already-linked documents. Selecting B lists B's. The active document renders on the right. |
| 2 | Upload a packing slip | B | PDF chosen in the page. After confirm, the slip is in the strip, renders at letter size, and a reload still shows it. `documents` row has an order link and a GCS object key. A's documents are unchanged. |
| 3 | Replace that slip | B | New file renders. Same document id, same order link, new object key. |
| 4 | Pair a stored slip | B | A `packing_slip` row that already has bytes and no order link is previewed from `/api/documents/:id/content`, then paired from this page. Same object key before and after. Strip shows it after reload. |
| 5 | Delete the open slip | B | It leaves the strip and stays gone after reload. The other slip on B remains. |
| 6 | Open shipping labels | A and B | Both on the left. A's labels are whatever it already had. No new row for A. |
| 7 | Upload a label PDF | B | Ingestion row + GCS object, then `document_id` set. Strip shows it at 4×6 after reload. |
| 8 | Pair a stored label | B | An existing `label_ingestions` row with `staged_object_key` and `matched_order_id` null is confirmed and applied from this page. Same object key. Strip shows it. Tracking attaches only on B. |
| 9 | Pair a reference purchase | B | Only if an unpaired reference purchase exists for B's number. `pairReferenceLabels` only. If none exists, say so — do not buy a live label to invent one. |
| 10 | Remove unlinked | B's linked rows must survive | Confirm shows a count. Only null-order rows go. B's remaining slip and label are still on B after reload. A's documents are unchanged. |
| 11 | Bulk upload | none | Bare route. Drop a PDF whose name contains B's order number. Card and stage show no order number. No `matched_order_id`, no order link. |
| 12 | Bulk print | none | Print all labels sends only label stock. Print all paperwork sends only letter stock. |

Channel fetch runs on B only. If the channel has no slip, the page says so.
That is a pass. A blank file is a fail.

Cleanup, last, and report it: `DELETE /api/orders/<B's id>`. That route leaves
orphan `work_assignments` — delete those too, plus any `customers` row this
session created, fake `shipping_tracking_numbers`, the `documents` rows, and
the `label_ingestions` rows from the table above. A must be byte-identical to
the read you took in step 1.

`pnpm verify:fast` after the browser proof. If it is red on a file you did not
touch, name the file and do not call the feature done on that red. The feature
is not done if any row in the table above was not driven in the browser.

Report: A's order number and id, B's `CF-TEST-…` number and id, each document
id and ingestion id, the object keys before and after each pair, the three
view URLs, and the screenshot paths.
