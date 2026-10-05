// Exam job: assigning a tech from the repair list uses the house staff-assign combo.
// Outcome: the Repair service list can assign a technician to repairs and writes it.
// Law: src/components/staff-assign/StageStaffAssignPopover.tsx (the staff adapter over
// AssigneeCombobox, technician lane) — never a raw <select>, a hand-fetched roster or
// a hand-rolled picker; the assignment lands on work_assignments (REPAIR work).

import { addedCode, addedLines, at, jsxTags, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'assign-tech-picker',
  title: 'Assign a tech to repairs from the Repair service list',
  base: '0ff1acb44',
  task:
    'On the Repair service list, let a manager assign a tech to repairs straight from the list — check one or more repairs and pick the technician — without opening each repair.',
  domainFact:
    'Staff are assigned with the house combo: StageStaffAssignPopover (src/components/staff-assign) — the adapter over AssigneeCombobox with the lane roster (technician / packer) and the full-roster switch. A repair’s tech is REPAIR work on work_assignments, written through PATCH /api/work-orders (saveWorkOrder / useWorkOrderAssignment).',
  trap:
    'A native <select> (or a Command / DropdownMenu list) filled from a hand-fetched staff roster, or a new assigned_tech_id column on repair_service.',
  lease: ['src/components/repair/**', 'src/lib/repair/**', 'src/hooks/**', 'src/lib/work-orders/**'],
  weight: 1,
}

const LIST_UI = /^src\/components\/repair\/(?!record\/).+\.tsx$/
const PICKER = ['StageStaffAssignPopover', 'InlineStageAssign']
const HAND_ROLLED = [
  [/<\s*(select|option|datalist)\b/, 'a native select'],
  [/<\s*(Command|CommandList|CommandItem|DropdownMenu|DropdownMenuItem|Combobox|Listbox)\b/, 'a hand-rolled list picker'],
  [/<\s*AssigneeCombobox\b/, 'AssigneeCombobox mounted raw (the staff adapter is StageStaffAssignPopover)'],
  [/\b(getActiveStaff|getPresentStaffForToday|peekActiveStaff)\s*\(|['"`]\/api\/staff\b/, 'a hand-fetched staff roster'],
]

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff)
  const uiFiles = ctx.changed.filter((f) => LIST_UI.test(f))
  const uiCode = code.filter((l) => LIST_UI.test(l.file))

  // ── Outcome ────────────────────────────────────────────────────────────────
  if (uiCode.length === 0) reasons.push('outcome: the Repair service list (src/components/repair) is unchanged')
  const all = code.map((l) => l.text).join('\n')
  if (!/\bassignedTechId\b|\bassigned_tech_id\b|\bassigneeStaffId\b|\btechId\b/.test(all)) {
    reasons.push('outcome: nothing added writes a technician to a repair')
  } else if (!/['"]REPAIR['"]|\/api\/work-orders|saveWorkOrder|useWorkOrderAssignment|confirmAssignment/.test(all)) {
    reasons.push('outcome: the tech write does not land as REPAIR work (work_assignments via /api/work-orders)')
  }

  // ── Law: the house picker ─────────────────────────────────────────────────
  const tags = uiFiles.flatMap((f) => {
    const added = new Set(addedLines(ctx.diff).filter((l) => l.file === f).map((l) => l.line))
    return jsxTags(ctx.read(f), PICKER).filter((t) => added.has(t.line)).map((t) => ({ ...t, file: f }))
  })
  if (tags.length === 0) {
    reasons.push('law: the assign control is not StageStaffAssignPopover (src/components/staff-assign)')
  } else if (!tags.some((t) => /\brole\s*=\s*(?:"technician"|\{\s*'technician'\s*\})/.test(t.text))) {
    reasons.push('law: the staff combo is not on the technician lane (role="technician")')
  }

  // ── Trap: hand-rolled pickers / a second writer ───────────────────────────
  // A SQL statement may wrap: judge the added line plus the next three of its file.
  const around = (l) => String(ctx.read(l.file) ?? '').split('\n').slice(l.line - 1, l.line + 3).join(' ')
  for (const l of code) {
    if (/^src\/(design-system|components\/ui|components\/staff-assign)\//.test(l.file)) continue
    for (const [re, why] of HAND_ROLLED) if (re.test(l.text)) reasons.push(`trap: ${why} — ${at(l)}`)
    if (/\bUPDATE\s+repair_service\b/i.test(l.text) && /tech|assign/i.test(around(l))) reasons.push(`trap: a second tech writer on repair_service — ${at(l)}`)
  }
  for (const l of addedLines(ctx.diff, /\.sql$/)) {
    if (/\brepair_service\b/i.test(l.text) && /tech|assign/i.test(around(l))) reasons.push(`trap: a repair_service assignee column — ${at(l)}`)
  }

  return verdict(reasons, 'assigns via StageStaffAssignPopover (technician) and writes REPAIR work')
}
