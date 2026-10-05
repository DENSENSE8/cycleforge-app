import { addedCode, at, jsxTags, readBase, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'orders-tracking-face',
  title: 'To-ship cards: tracking number on each card',
  base: '0ff1acb44',
  task: 'Show the tracking number on each order card in the To ship list (/shipping/orders) once the order has a label, next to the order number.',
  domainFact:
    'Identifiers in lists paint their LAST 8 through the id-chip family (TrackingChip / CopyChip displayWidth="last8", getLast8 in src/lib/copy-chip-format.ts) and a click copies the FULL value; nobody hand-cuts slice(-8) or prints the whole number as text.',
  trap: 'Plain text `{tracking}` or `…{tracking.slice(-8)}` in a span — no copy, no carrier, a second abbreviation rule.',
  weight: 1,
}

/** The order card face (the quick look already lists the full number). */
const CARD = /^src\/components\/outbound\/orders\/cards\/(?!OrderCardPeek\.tsx$)[^/]+\.tsx$/
const CHIPS = ['TrackingChip', 'TrackingOrSkuScanChip', 'CopyChip']

/** A chip tag paints tracking the house way: full value in, last 8 on the face. */
function chipProblems(tag) {
  const problems = []
  const value = /\bvalue=\{([^}]*)\}/.exec(tag.text)?.[1] ?? ''
  if (/\.(slice|substr|substring)\(/.test(value)) problems.push('value is pre-cut (copy must get the full number)')
  const display = /\bdisplay=\{([^}]*)\}/.exec(tag.text)?.[1]
  if (display != null && !/getLast8\(/.test(display)) problems.push(`display overridden without getLast8 (${display.trim()})`)
  if (/displayWidth=["']content["']/.test(tag.text)) problems.push('displayWidth="content" paints the whole number')
  if (tag.name === 'CopyChip' && !/displayWidth=["']last8["']/.test(tag.text) && !/getLast8\(/.test(tag.text)) {
    problems.push('CopyChip without displayWidth="last8"')
  }
  return problems
}

export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff, CARD)

  // (a) The card face now carries the order's tracking.
  if (!code.some((l) => /tracking/i.test(l.text))) reasons.push('the order card face does not read the tracking number')

  // (b) Law: an id chip paints it — new tracking chip on the card, full value, last-8 face.
  const cards = ctx.changed.filter((f) => CARD.test(f))
  let added = 0
  for (const file of cards) {
    const now = jsxTags(ctx.read(file) ?? '', CHIPS).filter((t) => t.name !== 'CopyChip' || /tracking/i.test(t.text))
    const before = jsxTags(readBase(ctx, file) ?? '', CHIPS).filter((t) => t.name !== 'CopyChip' || /tracking/i.test(t.text))
    added += Math.max(0, now.length - before.length)
    const seen = new Set(before.map((t) => t.text))
    for (const tag of now.filter((t) => !seen.has(t.text))) {
      for (const p of chipProblems(tag)) reasons.push(`${file}:${tag.line} ${tag.name}: ${p}`)
    }
  }
  if (added === 0) reasons.push('no new TrackingChip (or last-8 CopyChip) on the card face')

  // (c) Trap shapes: hand-cut windows and raw tracking text.
  for (const l of addedCode(ctx.diff)) {
    if (/\.slice\(\s*-\s*(8|CHIP_DISPLAY_LEN)\s*\)|\.substr(ing)?\([^)]*-\s*8\b/.test(l.text)) reasons.push(`hand-cut last-8 window: ${at(l)}`)
  }
  for (const l of code) {
    if (/(^|[^=])\{\s*[\w.?]*tracking[\w.?]*\s*\}/i.test(l.text) && !/\b(key|title|aria-label)=\{/.test(l.text)) {
      reasons.push(`tracking printed as raw text: ${at(l)}`)
    }
  }

  return verdict(reasons, 'card face paints tracking through a last-8 id chip with the full value on copy')
}
