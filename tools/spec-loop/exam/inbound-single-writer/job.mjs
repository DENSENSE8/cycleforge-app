// Exam job: a supplier spreadsheet row becomes an inbound PO through the ONE writer.
// Outcome: a new API route accepts one row and creates a PO.
// Law: src/lib/inbound/inbound-order-draft.ts + ingest-inbound-order.ts (and
// inbound-writer-law.test.ts) — every order parses into an InboundOrderDraft and lands
// through ingestInboundOrder; nothing else inserts inbound_order / receiving_line rows.

import { addedCode, addedLines, at, parseDiff, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'inbound-single-writer',
  title: 'Supplier spreadsheet row → inbound PO endpoint',
  base: '0ff1acb44',
  task:
    'Our supplier keeps a spreadsheet of what they are sending us. Add an API endpoint that takes ONE row of it (PO number, vendor, SKU, title, quantity, unit cost, optional order / expected dates) and creates the inbound purchase order for it.',
  domainFact:
    'Every inbound order — form, CSV, chat, sync, a sheet row — is parsed into the one contract (InboundOrderDraft, src/lib/inbound/inbound-order-draft.ts) and landed by the one writer (ingestInboundOrder): order identity, line keys, the ingest ledger and idempotency live there. Only the known writers may insert a receiving_line (inbound-writer-law.test.ts).',
  trap:
    'A new route that INSERTs straight into inbound_order / receiving_line (or a new purchase_orders table) inside its own transaction, bypassing the draft, the identity and the ledger.',
  lease: ['src/app/api/**', 'src/lib/inbound/**'],
  weight: 1,
}

const ONE_WRITER = /\b(ingestInboundOrder|ingestInboundOrderInTx|runInboundDraftBatch|runPoCsvImport)\s*\(/
const DRAFT_CONTRACT = /\b(InboundOrderDraft|emptyInboundOrderDraft|inboundOrderDraftSchema|runInboundDraftBatch|runPoCsvImport)\b/
const INBOUND_TABLES =
  'inbound_order|inbound_order_line|inbound_ingest_event|receiving_line|receiving_lines|receiving|receiving_carton|purchase_orders?|purchase_order_lines?|po_lines?|suppliers'
const DIRECT_WRITE = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE)\\s+(?:${INBOUND_TABLES})\\b`, 'i')
const NEW_PO_TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\w*(?:purchase|po_|inbound)\w*/i

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []

  // ── Outcome ────────────────────────────────────────────────────────────────
  const routes = parseDiff(ctx.diff).filter(
    (f) => f.isNew && /^src\/app\/api\/.+\/route\.(ts|js)$/.test(f.file),
  )
  const posting = routes.filter((f) => /export\s+(?:const\s+POST\b|async\s+function\s+POST\b|\{[^}]*\bPOST\b)/.test(ctx.read(f.file) ?? ''))
  if (posting.length === 0) reasons.push('outcome: no new API route with a POST handler')
  const route = posting[0]?.file
  const routeText = route ? String(ctx.read(route) ?? '') : ''
  const code = addedCode(ctx.diff)
  // The route may do the work itself or through a helper it added under src/lib.
  const anywhere = (re) => re.test(routeText) || code.some((l) => re.test(l.text))
  if (route && !anywhere(/['"]PO['"]|runPoCsvImport/)) {
    reasons.push(`outcome: ${route} never makes the order a purchase order (type 'PO')`)
  }

  // ── Law ────────────────────────────────────────────────────────────────────
  if (route && !anywhere(ONE_WRITER)) {
    reasons.push(`law: ${route} does not land the order through ingestInboundOrder (the one inbound writer)`)
  }
  if (route && !anywhere(DRAFT_CONTRACT)) {
    reasons.push(`law: ${route} never builds the InboundOrderDraft contract`)
  }
  for (const l of code) {
    if (DIRECT_WRITE.test(l.text)) reasons.push(`trap: writes an inbound table directly — ${at(l)}`)
    if (/\bingestPurchase\s*\(/.test(l.text)) reasons.push(`trap: calls the per-line ingestPurchase directly — ${at(l)}`)
    if (/\.insert\(\s*(receivingLines|receiving|inboundOrder\w*)\b/.test(l.text)) reasons.push(`trap: drizzle insert into an inbound table — ${at(l)}`)
  }
  for (const l of addedLines(ctx.diff, /\.sql$/)) {
    if (NEW_PO_TABLE.test(l.text)) reasons.push(`trap: a second purchase-order table — ${at(l)}`)
    if (DIRECT_WRITE.test(l.text)) reasons.push(`trap: a migration writes inbound rows — ${at(l)}`)
  }

  return verdict(reasons, `${route} builds an InboundOrderDraft (type PO) and lands it via the one writer`)
}
