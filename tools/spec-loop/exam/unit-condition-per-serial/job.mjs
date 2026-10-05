// Exam job: cosmetic condition belongs to the serial UNIT, not the line / SKU.
// Outcome: the testing station captures a cosmetic note and writes it.
// Law: one serial = one unit. Condition lives on serial_units (condition_grade) and its
// history (serial_unit_condition_history.cosmetic_notes, written by
// POST /api/serial-units/[id]/grade) — never on a receiving line (a quantity bucket),
// a SKU / catalog row or stock.

import { addedCode, addedLines, at, parseDiff, userText, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'unit-condition-per-serial',
  title: "Testers record each item's cosmetic condition",
  base: '0ff1acb44',
  task:
    'At the testing station, when testers grade each item, let them also write down its cosmetic condition (scratches, dents, scuffs) so it is kept with that item.',
  domainFact:
    'Used / refurbished, one serial = one unit: two units of the same SKU on the same PO line have different cosmetics. A unit’s condition is serial_units.condition_grade with its history row (serial_unit_condition_history.cosmetic_notes), written per unit by POST /api/serial-units/[id]/grade; a receiving line is a quantity bucket and a SKU is a catalog row — neither carries a unit’s condition.',
  trap:
    'Add a cosmetic_condition column to receiving_line (or sku_catalog / sku_stock) and save one note per line or SKU through PATCH /api/receiving-lines.',
  lease: ['src/components/tech/**', 'src/components/receiving/**', 'src/app/api/serial-units/**', 'src/lib/**'],
  weight: 1,
}

const COSMETIC = /cosmetic/i
const UNIT_TABLES = /^(serial_units|serial_unit_condition_history)$/
/** A per-unit URL: `/api/serial-units/${id}/…` or a line's `/units/${unitId}/…`. */
const PER_UNIT_URL = /\/api\/serial-units\/\$\{|\/units\/\$\{/
const URL_LITERAL = /['"`](\/api\/[^'"`]*)['"`]/

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff)
  const lines = (f) => String(ctx.read(f) ?? '').split('\n')

  // ── Outcome ────────────────────────────────────────────────────────────────
  const ui = code.filter((l) => /^src\/(components|app)\/.+\.tsx$/.test(l.file) && COSMETIC.test(userText(l.text)))
  if (ui.length === 0) reasons.push('outcome: the testing UI shows no cosmetic-condition field')
  // A request-body key (`cosmetic_notes: note`), not a type annotation (`cosmeticNotes: string | null`).
  const BODY_KEY = /\bcosmetic\w*['"]?\s*:(?!\s*(?:string|number|boolean|null|undefined)\b|\s*\()/i
  const sends = code.filter(
    (l) => /^src\/(components|hooks|lib|app\/(?!api\/))/.test(l.file) && !/^src\/lib\/drizzle\//.test(l.file) && BODY_KEY.test(l.text),
  )
  if (sends.length === 0) reasons.push('outcome: no request carries the cosmetic condition')

  // ── Law: the write is per unit ─────────────────────────────────────────────
  for (const l of sends) {
    // The request this body belongs to: the nearest URL above it in the same file.
    const post = lines(l.file)
    let url = null
    for (let i = l.line - 1; i >= Math.max(0, l.line - 20) && !url; i--) url = URL_LITERAL.exec(post[i] ?? '')?.[0] ?? null
    if (!url) reasons.push(`law: cannot tie the cosmetic write to a per-unit request — ${at(l)}`)
    else if (!PER_UNIT_URL.test(url)) reasons.push(`law: the cosmetic condition is sent to ${url}, not to one unit — ${at(l)}`)
  }

  // ── Trap: condition stored off the unit ───────────────────────────────────
  for (const l of addedLines(ctx.diff, /\.sql$/)) {
    if (!/cosmetic|condition/i.test(l.text)) continue
    const stmt = lines(l.file).slice(Math.max(0, l.line - 4), l.line).join(' ')
    const table = /\b(?:ALTER\s+TABLE|UPDATE|INSERT\s+INTO|CREATE\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:ONLY\s+)?(\w+)/gi
    const named = [...stmt.matchAll(table)].map((m) => m[1]).pop()
    if (named && !UNIT_TABLES.test(named)) reasons.push(`trap: condition stored on ${named}, not the unit — ${at(l)}`)
  }
  for (const f of parseDiff(ctx.diff).filter((d) => d.file === 'src/lib/drizzle/schema.ts')) {
    const post = lines(f.file)
    for (const a of f.added) {
      if (!COSMETIC.test(a.text) && !/condition/i.test(a.text)) continue
      const head = post.slice(0, a.line).reverse().find((t) => /pgTable\(\s*'/.test(t))
      const table = head ? /pgTable\(\s*'(\w+)'/.exec(head)[1] : null
      if (table && !UNIT_TABLES.test(table)) reasons.push(`trap: schema puts condition on ${table} — ${f.file}:${a.line}`)
    }
  }
  for (const l of code) {
    if (!COSMETIC.test(l.text)) continue
    if (/^src\/app\/api\//.test(l.file) && !/^src\/app\/api\/serial-units\/|\/units\//.test(l.file)) {
      reasons.push(`trap: a line / SKU endpoint accepts the cosmetic condition — ${at(l)}`)
    }
    if (/\b(UPDATE|INSERT\s+INTO)\s+(receiving_line|receiving|sku_catalog|sku_stock|items|products|inbound_order)\b/i.test(l.text)) {
      reasons.push(`trap: cosmetic condition written to a non-unit table — ${at(l)}`)
    }
    if (/\b(setNotes|setItemNote|notes\s*:|label_note)\b/.test(l.text)) reasons.push(`trap: cosmetic condition folded into the line's notes — ${at(l)}`)
  }

  return verdict(reasons, 'cosmetic notes are captured per unit and written to the serial unit')
}
