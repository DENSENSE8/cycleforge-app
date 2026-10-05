// Exam job: a new operator verb is completable on the phone (/m) first.
// Outcome: the floor can mark one unit as damaged, and it is written to that unit.
// Law: docs/mobile-first/SURFACE_LAW.md §1 — every operator verb must be completable on
// /m/*; mobile code lives in src/components/mobile/** or src/app/m/** and desktop never
// imports it. Domain: a damaged unit is held per serial (POST /api/serial-units/[id]/hold),
// never a SKU-quantity decrement or a damaged flag on stock / catalog rows.

import { addedCode, addedLines, at, userText, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'mobile-first-verb',
  title: 'Mark a unit as damaged',
  base: '0ff1acb44',
  task: 'Let the floor mark a unit as damaged.',
  domainFact:
    'Mobile-first surface law (operator 2026-09-10): every operator verb must be completable on the mobile web app (/m/*) first — a verb with no /m path is incomplete, desktop only adds density after. Mobile code lives in src/components/mobile/** or src/app/m/**; desktop never imports it. A unit is one serial: damage takes THAT unit out of sellable stock (ON_HOLD via /api/serial-units/[id]/hold with the reason), not a SKU count.',
  trap:
    'A "Mark damaged" button on the desktop unit record (src/components/labels/unit-detail) only — or a damaged flag / quantity decrement on sku_stock.',
  lease: ['src/components/**', 'src/app/**', 'src/lib/**', 'src/hooks/**'],
  weight: 1,
}

const MOBILE = /^src\/(components\/mobile|app\/m)\//
const DAMAGE = /damag/i
/** A write addressed to one serial unit. */
const UNIT_WRITE = /['"`]\/api\/serial-units\/\$\{[^}]+\}\/\w+/

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff)
  const textOf = (f) => String(ctx.read(f) ?? '')

  // ── Outcome ────────────────────────────────────────────────────────────────
  const copy = code.filter((l) => /\.(tsx|ts)$/.test(l.file) && DAMAGE.test(userText(l.text)))
  if (copy.length === 0) reasons.push('outcome: no surface offers "mark damaged" to an operator')
  const writers = ctx.changed.filter((f) => /^src\//.test(f) && UNIT_WRITE.test(textOf(f)) && DAMAGE.test(textOf(f)))
  const newUnitRoute = ctx.changed.some((f) => /^src\/app\/api\/serial-units\/\[id\]\/[^/]+\/route\.ts$/.test(f) && DAMAGE.test(textOf(f)))
  if (writers.length === 0 && !newUnitRoute) reasons.push('outcome: nothing writes the damage to the unit (/api/serial-units/[id]/…)')

  // ── Law: completable on /m ────────────────────────────────────────────────
  const mobileCopy = copy.filter((l) => MOBILE.test(l.file))
  if (mobileCopy.length === 0) {
    reasons.push('law: the verb has no /m surface (src/components/mobile/** or src/app/m/**) — mobile-first surface law §1')
  } else {
    // The phone surface reaches the write: it holds it, or imports a changed module that does.
    const mobileFiles = [...new Set(mobileCopy.map((l) => l.file))]
    const reach = mobileFiles.some((f) => {
      if (writers.includes(f)) return true
      const imports = [...textOf(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      return writers.some((w) =>
        imports.some((spec) => {
          const tail = spec.replace(/^@\//, 'src/').replace(/^\.\//, '')
          return w.replace(/\.(tsx?|m?js)$/, '').endsWith(tail.replace(/^\.\.?\//, ''))
        }),
      )
    })
    if (!reach && !newUnitRoute) reasons.push('law: the /m surface that offers the verb never reaches the unit write')
  }
  for (const l of addedLines(ctx.diff, /^src\/.+\.(tsx?|m?js)$/)) {
    if (MOBILE.test(l.file)) continue
    if (/from\s+['"]@\/(components\/mobile|app\/m)\//.test(l.text)) reasons.push(`law: desktop imports mobile code — ${at(l)}`)
  }

  // ── Trap: damage as a SKU quantity ────────────────────────────────────────
  const around = (l) => textOf(l.file).split('\n').slice(Math.max(0, l.line - 3), l.line + 3).join(' ')
  for (const l of [...code, ...addedLines(ctx.diff, /\.sql$/)]) {
    const win = around(l)
    if (/\b(UPDATE|ALTER\s+TABLE)\s+(sku_stock|sku_catalog|receiving_line|items|products)\b/i.test(l.text) && DAMAGE.test(win)) {
      reasons.push(`trap: damage recorded on a SKU / stock row, not the unit — ${at(l)}`)
    }
    if (/\b(qty|quantity|on_hand|available)\w*\s*=\s*\w*\.?(qty|quantity|on_hand|available)\w*\s*-/i.test(l.text) && DAMAGE.test(win)) {
      reasons.push(`trap: damage as a quantity decrement — ${at(l)}`)
    }
  }

  return verdict(reasons, 'mark damaged is a /m verb that holds the one unit')
}
