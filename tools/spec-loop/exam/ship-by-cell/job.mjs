import { addedCode, addedLines, at, countMatches, jsxTags, readBase, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'ship-by-cell',
  title: 'To-ship card: edit ship-by from the quick look',
  base: '0ff1acb44',
  task: "On the To ship cards (/shipping/orders), the quick look (Space on a card) shows the order's Ship by date. Let staff change the ship-by date right there without opening the order.",
  domainFact:
    'A ship-by / due day in a cell is `DateRangePickerField variant="compact"` (the house LedgerShipBy wraps it) — month grid, click commits, no native `<input type="date">`; the commit goes through the queue\'s one ship-by writer (`handleCommitShipBy`).',
  trap: 'A native `<input type="date">` in the quick look (and often a bespoke fetch to save it).',
  weight: 1,
}

const CARDS = /^src\/components\/outbound\/orders\/cards\/.*\.tsx$/
const WRITER = /\bhandleCommitShipBy\b/

export async function check(ctx) {
  const reasons = []
  const files = ctx.changed.filter((f) => CARDS.test(f))

  // (a) The card's quick look gains a ship-by editor that commits through the queue's writer.
  let editors = 0
  let writerUses = 0
  for (const file of files) {
    const now = ctx.read(file) ?? ''
    const before = readBase(ctx, file) ?? ''
    const pickers = (src) =>
      jsxTags(src, ['LedgerShipBy', 'DateRangePickerField']).filter((t) => t.name === 'LedgerShipBy' || /variant=["']compact["']/.test(t.text))
    editors += Math.max(0, pickers(now).length - pickers(before).length)
    writerUses += Math.max(0, countMatches(now, WRITER) - countMatches(before, WRITER))
    for (const t of jsxTags(now, ['DateRangePickerField'])) {
      if (!/variant=["']compact["']/.test(t.text) && !jsxTags(before, ['DateRangePickerField']).some((b) => b.text === t.text)) {
        reasons.push(`${file}:${t.line} DateRangePickerField without variant="compact" (a due day is one day)`)
      }
    }
  }
  if (editors === 0) reasons.push('no compact ship-by picker (LedgerShipBy / DateRangePickerField variant="compact") added to the order cards')
  if (writerUses === 0) reasons.push("the edit is not wired to the queue's ship-by writer (handleCommitShipBy)")

  // (b) Law: never a native date input.
  for (const l of addedLines(ctx.diff, /^src\/.*\.tsx?$/)) {
    if (/type\s*[=:]\s*\{?\s*["'`](date|datetime-local)["'`]/.test(l.text)) reasons.push(`native date input: ${at(l)}`)
  }
  for (const l of addedCode(ctx.diff, CARDS)) {
    if (/<input\b/.test(l.text)) reasons.push(`raw <input> on the card: ${at(l)}`)
  }

  return verdict(reasons, 'quick look edits ship-by with the compact picker through handleCommitShipBy')
}
