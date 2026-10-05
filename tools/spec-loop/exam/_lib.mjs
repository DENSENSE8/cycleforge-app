// Shared pure helpers for exam job checks (tools/spec-loop/exam/<id>/job.mjs).
// Static and deterministic: they read the ExamCheckContext the kernel hands in
// (plus `git show <base>:<file>` for the base side of a comparison).

import { execFileSync } from 'node:child_process'

/** Strip the diff side prefix (`a/`, `b/`, `i/`, `w/`, …); `null` for /dev/null. */
function diffPath(raw) {
  const path = raw.replace(/\t.*$/, '').trim()
  if (path === '/dev/null') return null
  const slash = path.indexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

/**
 * Parse a unified `git diff` into files of added / removed lines. Works with
 * any side prefix (`diff.mnemonicPrefix` gives `i/` `w/`).
 * → [{ file, added: [{ line, text }], removed: [{ text }], isNew, isDeleted }]
 */
export function parseDiff(diff) {
  const files = []
  let cur = null
  let newLine = 0
  let inHunk = false
  for (const raw of String(diff ?? '').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = /^diff --git \S+?\/(.+?) \S+?\/(.+)$/.exec(raw)
      cur = { file: m ? m[2] : raw.slice(11), added: [], removed: [], isNew: false, isDeleted: false }
      files.push(cur)
      inHunk = false
      continue
    }
    if (!cur) continue
    if (!inHunk) {
      if (raw.startsWith('new file mode')) cur.isNew = true
      else if (raw.startsWith('deleted file mode')) cur.isDeleted = true
      else if (raw.startsWith('+++ ')) {
        const path = diffPath(raw.slice(4))
        if (path) cur.file = path
      } else if (raw.startsWith('--- ')) {
        const path = diffPath(raw.slice(4))
        if (path && cur.isDeleted) cur.file = path
      }
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw)
      newLine = m ? Number(m[1]) : 0
      inHunk = true
    } else if (!inHunk) continue
    else if (raw.startsWith('+')) cur.added.push({ line: newLine++, text: raw.slice(1) })
    else if (raw.startsWith('-')) cur.removed.push({ text: raw.slice(1) })
    else if (raw.startsWith(' ')) newLine++
  }
  return files
}

/** Added lines across the diff, optionally limited to files matching `fileRe`. → [{ file, line, text }] */
export function addedLines(diff, fileRe) {
  const out = []
  for (const f of parseDiff(diff)) {
    if (fileRe && !fileRe.test(f.file)) continue
    for (const a of f.added) out.push({ file: f.file, line: a.line, text: a.text })
  }
  return out
}

/** Removed lines across the diff, optionally limited to files matching `fileRe`. → [{ file, text }] */
export function removedLines(diff, fileRe) {
  const out = []
  for (const f of parseDiff(diff)) {
    if (fileRe && !fileRe.test(f.file)) continue
    for (const r of f.removed) out.push({ file: f.file, text: r.text })
  }
  return out
}

/** Blank out line and block comments (keeps line count). Strings are left intact. */
export function stripComments(src) {
  return String(src ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

/** True for a line that is only a comment (added comment lines never count as implementation). */
export function isCommentLine(text) {
  const t = String(text).trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')
}

/** Source files a worker ships (ts/tsx/js/mjs under `src/`, tests excluded). */
export const SRC_CODE = /^src\/(?!.*\.test\.).*\.(tsx?|m?js)$/

/** Added, non-blank, non-comment lines in `fileRe` files (default {@link SRC_CODE}). */
export function addedCode(diff, fileRe = SRC_CODE) {
  return addedLines(diff, fileRe)
    .map((l) => ({ ...l, text: stripComments(l.text) }))
    .filter((l) => l.text.trim() && !isCommentLine(l.text))
}

/** Changed files matching `re`. */
export function changedMatching(ctx, re) {
  return ctx.changed.filter((f) => re.test(f))
}

/** A file's content at `ctx.base` (`null` when it did not exist there). */
export function readBase(ctx, rel) {
  try {
    return execFileSync('git', ['-C', ctx.repo, 'show', `${ctx.base}:${rel}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/** Occurrences of `re` (made global) in `text`. */
export function countMatches(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  return (String(text ?? '').match(new RegExp(re.source, flags)) ?? []).length
}

/**
 * Every opening JSX tag `<Name …>` / `<Name … />` for `names` in `src`, spanning
 * lines; braces are balanced so `onClick={() => …}` does not end the tag.
 * → [{ name, text, line }]
 */
export function jsxTags(src, names) {
  const text = String(src ?? '')
  const out = []
  const re = new RegExp(`<(${names.join('|')})(?=[\\s/>])`, 'g')
  let m
  while ((m = re.exec(text))) {
    let depth = 0
    let quote = null
    let i = m.index + m[0].length
    for (; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === quote && text[i - 1] !== '\\') quote = null
        continue
      }
      if (depth > 0 && (c === '"' || c === "'" || c === '`')) quote = c
      else if (depth === 0 && c === '"') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push({ name: m[1], text: text.slice(m.index, i + 1), line: text.slice(0, m.index).split('\n').length })
  }
  return out
}

/**
 * The words a person reads in one line of TSX/TS: string literals, template
 * text and JSX text — with class names, test ids, keys, imports and URL/param
 * literals removed. Used to judge vocabulary, never to judge code shape.
 */
export function userText(line) {
  let t = String(line)
  if (/^\s*(import|export\s+\*|export\s+\{)/.test(t)) return ''
  t = t
    .replace(/\b(className|class|data-[\w-]+|testId|testid|key|id|href|src|type|variant|size|tone|radius|role|name)\s*=\s*("[^"]*"|'[^']*'|\{`[^`]*`\}|\{[^{}]*\})/g, ' ')
    .replace(/\b(cn|clsx|twMerge)\([^)]*\)/g, ' ')
  const parts = []
  for (const m of t.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    // A route, a param, a token or a module path is not copy.
    if (/^[\w./@:?&=#-]*$/.test(s) && !/\s/.test(s) && !/^[A-Z][a-z]/.test(s)) continue
    parts.push(s)
  }
  const jsx = t.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ' ')
  for (const m of jsx.matchAll(/>([^<>{}]+)</g)) parts.push(m[1])
  // A line that is pure JSX text (no code punctuation) between tags.
  if (!/[{}();=<>[\]]/.test(jsx) && /[A-Za-z]{2,}\s+[A-Za-z]/.test(jsx)) parts.push(jsx)
  // JSX text that opens or closes the line next to a tag (`<p>Text` / `Text</p>`).
  for (const m of jsx.matchAll(/^\s*([A-Za-z][^<>{}]*)</g)) parts.push(m[1])
  for (const m of jsx.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)$/g)) parts.push(m[1])
  return parts.join(' · ').replace(/\s+/g, ' ').trim()
}

/** `{ pass, reasons }` from a list of failure reasons (empty → pass). */
export function verdict(reasons, okReason = 'all checks hold') {
  return reasons.length ? { pass: false, reasons } : { pass: true, reasons: [okReason] }
}

/** Format a finding as `file:line text`. */
export function at(l) {
  return `${l.file}${l.line ? `:${l.line}` : ''} ${String(l.text).trim().slice(0, 140)}`
}
