import { addedCode, at, jsxTags, readBase, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'station-verb-button',
  title: 'Testing station: Resend on the photo-request line',
  base: '0ff1acb44',
  task: 'On the testing station, after a scan sends a photo request to the phone ("Photo request sent → phone"), add a Resend button on that line for when the phone missed it.',
  domainFact:
    'A verb on any surface composes the design-system primitive — `Button` / `IconButton` from @/design-system/primitives — never a raw <button>, a clickable <span>/<div> or role="button" (.omp/rules/ds-raw-elements.md); the verb reuses the station\'s existing publisher (useUnitPhotoRequestPublisher), not a second channel.',
  trap: 'A hand-rolled `<button className="text-xs text-blue-600 hover:underline">Resend</button>` (or a clickable span) beside the line.',
  weight: 1,
}

const SURFACE = /^src\/components\/(station|sidebar)\/.*\.tsx$/
const PUBLISH = /\b(publishUnitPhotoRequest|requestUnitPhotos|useUnitPhotoRequestPublisher)\b/
const RAW = ['button', 'div', 'span', 'a', 'p', 'li', 'img', 'svg']

export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff, SURFACE)
  const files = ctx.changed.filter((f) => SURFACE.test(f))

  // (a) A new verb is wired to the existing photo-request publisher.
  if (!code.some((l) => PUBLISH.test(l.text))) reasons.push('nothing new calls the station photo-request publisher (publishUnitPhotoRequest)')

  // (b) Law: the verb is a DS Button / IconButton; no raw or hand-rolled clickable.
  let dsVerbs = 0
  for (const file of files) {
    const now = ctx.read(file) ?? ''
    const before = readBase(ctx, file) ?? ''
    const ds = (src) => jsxTags(src, ['Button', 'IconButton']).filter((t) => /\bon(Click|Press|Select)=/.test(t.text))
    dsVerbs += Math.max(0, ds(now).length - ds(before).length)
    const seen = new Set(jsxTags(before, RAW).map((t) => t.text))
    for (const tag of jsxTags(now, RAW)) {
      if (seen.has(tag.text)) continue
      if (tag.name === 'button') reasons.push(`${file}:${tag.line} raw <button> (compose Button / IconButton)`)
      else if (/\bonClick=|role=["']button["']/.test(tag.text)) reasons.push(`${file}:${tag.line} hand-rolled clickable <${tag.name}> (compose Button / IconButton)`)
    }
  }
  for (const l of code) {
    if (/ds-raw-button:/.test(l.text)) reasons.push(`raw-button escape hatch used for an ordinary verb: ${at(l)}`)
  }
  if (dsVerbs === 0) reasons.push('no new Button / IconButton verb on the station')

  return verdict(reasons, 'Resend is a DS Button wired to the existing publisher')
}
