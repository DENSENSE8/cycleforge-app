import { addedCode, at, readBase, userText, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'tote-vs-lpn',
  title: 'Tote screen: say what a unit sits in and where that is parked',
  base: '0ff1acb44',
  task: "On my phone, when I tap a unit on a tote's screen (/m/h/<id>), the sheet that opens should also tell me what it's sitting in and where that is parked right now, so I can walk to it.",
  domainFact:
    'An H-#### handling unit is a TOTE (VOCABULARY `container`, label "Tote"): it holds units and is parked AT a location, never itself a location. "LPN" is Receiving\'s R-#### carton plate and never names a tote (route-tree node `container`: "UI copy says Tote, never LPN") — even though the code calls it lpnRef / moveLpn.',
  trap: 'Copy lifted from the identifiers: "LPN: H-1042 · Location: A-01" — the tote called an LPN, or labelled as a location.',
  weight: 1,
}

const FILE = 'src/components/mobile/handling-units/HandlingUnitV2Record.tsx'
const BANNED = /\b(LPNs?|licen[cs]e[\s-]*plates?|licen[cs]e[\s-]*plated|handling[\s-]*units?|bins?)\b/i

/** The unit sheet: `<Sheet` … `</Sheet>`. */
function sheetOf(src) {
  const start = src.indexOf('<Sheet ')
  const end = src.indexOf('</Sheet>', start)
  return start < 0 || end < 0 ? '' : src.slice(start, end)
}

export async function check(ctx) {
  const reasons = []
  const now = sheetOf(ctx.read(FILE) ?? '')
  const before = sheetOf(readBase(ctx, FILE) ?? '')

  // (a) The sheet now says where the tote is parked.
  const parked = /location_name|locationName|parked/
  if (!now) reasons.push(`${FILE}: unit sheet not found`)
  else if (!parked.test(now) || parked.test(before)) reasons.push('the unit sheet does not show where the tote is parked (box.location_name)')

  // (b) Law: the container is a Tote — never an LPN, a handling unit, a bin or a location.
  const added = addedCode(ctx.diff)
  for (const l of added) {
    const words = userText(l.text)
    const hit = BANNED.exec(words)
    if (hit) reasons.push(`tote named "${hit[0]}" in copy (VOCABULARY: Tote; LPN is Receiving's R-#### plate): ${at(l)}`)
    if (/\b(location|bin)\b\s*:?\s*(<[^>]*>\s*)*\{\s*box\.code\b/i.test(l.text)) reasons.push(`tote code labelled as a location: ${at(l)}`)
  }
  const sheetCopy = added.filter((l) => l.file === FILE).map((l) => userText(l.text)).join(' ')
  if (now && !/\btotes?\b/i.test(sheetCopy)) reasons.push('the new sheet copy never names the container a tote')

  return verdict(reasons, 'unit sheet names the Tote and where it is parked')
}
