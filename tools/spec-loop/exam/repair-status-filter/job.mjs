import { addedCode, at, countMatches, readBase, stripComments, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'repair-status-filter',
  title: 'Repair list: show only repairs waiting on parts',
  base: '0ff1acb44',
  task: 'Add a filter so I can see only the repairs that are waiting on parts in the Repair list (/repair).',
  domainFact:
    'Every control that changes which records show — filters, status facets, sort, views — lives in the left contextual sidebar, declared in NAV_PAGE_DECLS (src/lib/nav/context/pages.ts, REPAIR_CONTROLS); the page body shows records only and reads the URL param. "Waiting on parts" is the stored status `Awaiting Parts`, which the body chips lump into "Still needs work".',
  trap: 'A toggle button, chip or dropdown painted in the repair list body (beside the status chips) holding the filter in component state or writing the URL from the body.',
  weight: 1,
}

const PAGES = 'src/lib/nav/context/pages.ts'
/** Where the param is merely declared — declaring is not reading. */
const DECLARATION = /^src\/lib\/(nav\/context\/pages|routing\/[^/]+|station\/table-url-params)\.ts$/
/** The page body: everything that paints, minus the sidebar and the primitive homes. */
const BODY = /^src\/(components\/(?!sidebar\/|ui\/)|features\/|app\/).*\.tsx$/
/** Selection controls and URL writers; a body file may not gain any (moved lines don't count). */
const BODY_CONTROLS = [
  /<(StatusChipRail|QueueStatusChips|IncomingStatusChips|BulkStatusChips)\b/,
  /<(DropdownMenu|FilterMenu|FilterDropdownSelect|DataTableFilterMenu|DataTableSortMenu)\b/,
  /<(SegmentedGlyphSwitch|Segmented\w*|ToggleGroup|Switch|Checkbox|select|Chip)\b/,
  /<(Button|IconButton|button)\b/,
  /aria-pressed/,
  /role=["'](switch|checkbox|radio|tab)["']/,
]
const BODY_URL_WRITER = /\b(router\.(replace|push)|useReplaceSearchParams|setSearchParams|(params|searchParams|next|query)\.(set|append|delete)\()/
const NOISE = new Set(['page', 'id', 'label', 'value', 'param', 'options', 'clearParams', 'choices', 'all', 'true', 'false'])

/** Identifiers and string values a pages.ts change introduces. */
function introducedTokens(lines) {
  const tokens = new Set()
  for (const { text } of lines) {
    for (const m of text.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) tokens.add(m[1])
    for (const m of text.matchAll(/\b(?:param|value)\s*:\s*['"]([\w-]+)['"]/g)) tokens.add(m[1])
  }
  for (const t of NOISE) tokens.delete(t)
  return [...tokens]
}

export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff)

  // (a) The filter exists as a sidebar control on the repair decls.
  const src = ctx.read(PAGES) ?? ''
  const lines = src.split('\n')
  const start = lines.findIndex((l) => /^const REPAIR_CONTROLS\b/.test(l))
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && /^};/.test(l))
  const inControls = (n) => start >= 0 && n - 1 > start && n - 1 < end
  const sidebar = addedCode(ctx.diff, /^src\/lib\/nav\/context\/pages\.ts$/).filter(
    (l) => inControls(l.line) || /repair/i.test(l.text),
  )
  const control = sidebar.filter((l) => /\b(param|options|value|label)\s*:|REPAIR_[A-Z_]+/.test(l.text))
  if (control.length === 0) reasons.push(`no new sidebar control on the repair decls in ${PAGES} (REPAIR_CONTROLS / NAV_PAGE_DECLS)`)

  // (b) It narrows to the stored status that means "waiting on parts".
  if (!code.some((l) => /awaiting[\s_-]*parts/i.test(l.text))) {
    reasons.push("nothing narrows to the stored status 'Awaiting Parts'")
  }

  // (c) Something other than the declaration reads the control's param / options.
  const tokens = introducedTokens(sidebar)
  const readers = code.filter((l) => !DECLARATION.test(l.file) && tokens.some((t) => new RegExp(`\\b${t}\\b`).test(l.text)))
  if (control.length > 0 && readers.length === 0) {
    reasons.push(`the sidebar control is declared but nothing in the repair list reads it (tokens: ${tokens.join(', ') || 'none'})`)
  }

  // (d) Law: the body shows records only — no selection control, no URL writer.
  for (const file of ctx.changed.filter((f) => BODY.test(f))) {
    const now = stripComments(ctx.read(file) ?? '')
    const before = stripComments(readBase(ctx, file) ?? '')
    for (const re of [...BODY_CONTROLS, BODY_URL_WRITER]) {
      const gained = countMatches(now, re) - countMatches(before, re)
      if (gained <= 0) continue
      const sample = now.split('\n').findIndex((line) => re.test(line) && !before.includes(line.trim()))
      const where = sample < 0 ? file : `${file}:${sample + 1} ${now.split('\n')[sample].trim().slice(0, 120)}`
      reasons.push(
        re === BODY_URL_WRITER
          ? `page body gains a URL writer (the sidebar owns writing): ${where}`
          : `selection control painted in the page body (belongs in NAV_PAGE_DECLS): ${where}`,
      )
    }
  }
  for (const l of addedCode(ctx.diff, /^src\/lib\/repair\/repair-status-chips\.ts$/)) {
    if (/\bid\s*:/.test(l.text)) reasons.push(`new body status chip group (chips sit in the body): ${at(l)}`)
  }

  return verdict(reasons, 'sidebar control declared in REPAIR_CONTROLS, read by the list, narrows to Awaiting Parts; body untouched')
}
