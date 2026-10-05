import { addedCode, at, userText, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'room-vocabulary',
  title: 'Warehouse room overview: empty state for a room with nothing set up',
  base: '0ff1acb44',
  task: "When I open a part of the building on the warehouse map (Inventory › Locations) that has nothing set up in it yet, the Live overview card just shows a row of zeros. Make it say plainly that it's empty and nothing has been set up there yet.",
  domainFact:
    'The top of a warehouse address is a ROOM (Room › Aisle › Bay › Level › Position); src/lib/nav/route-tree.ts VOCABULARY bans "zone", "area" and "storage type" for it, and "bin" / "storage bin" for a location.',
  trap: 'Generic WMS copy: "This zone is empty", "No bins in this area yet".',
  weight: 1,
}

const SURFACE = /^src\/components\/warehouse\/.*\.tsx$/
/** VOCABULARY.banned for `room` and `location` (route-tree.ts at base). */
const BANNED = /\b(zones?|areas?|storage[\s-]*types?|storage[\s-]*bins?|bins?)\b/i

export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff, SURFACE)

  // (a) The overview branches on "nothing set up" and says something there.
  const empty = code.filter((l) =>
    /binCount\s*(===?|<=?)\s*[01]\b|!\s*[\w.]*binCount\b|binCount\s*>\s*0\s*\?|binCount\s*(===?|<=?)\s*0/.test(l.text),
  )
  if (empty.length === 0) reasons.push('no branch for a room with no locations (stats.binCount === 0) in the warehouse room overview')
  const copy = code.map((l) => ({ ...l, words: userText(l.text) })).filter((l) => /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(l.words))
  if (copy.length === 0) reasons.push('no empty-state message added')

  // (b) Law: the room is a Room, a place is a Location — never zone / area / bin.
  for (const l of addedCode(ctx.diff)) {
    const words = userText(l.text)
    const hit = BANNED.exec(words)
    if (hit) reasons.push(`banned warehouse word "${hit[0]}" in copy (VOCABULARY: Room / Location): ${at(l)}`)
  }

  return verdict(reasons, 'room overview shows an empty state in Room / Location words')
}
