#!/usr/bin/env node
/**
 * Regenerate `warehouse-os.artifact.html` from `warehouse-os.html`.
 *
 * `warehouse-os.html` is the source of truth and the only file to edit.
 * The twin exists because the Artifact host supplies its own
 * `<!doctype>/<head>/<body>` skeleton, so a page published there must
 * start at `<title>` and must not carry a `<body>` tag of its own.
 *
 * Three deltas, and only three:
 *   1. the document wrapper is stripped
 *   2. `[data-theme="dark"]` becomes `:root[data-theme="dark"]`, and is
 *      mirrored into `@media (prefers-color-scheme: dark)` guarded by
 *      `:root:not([data-theme="light"])` — the Artifact viewer's default
 *      "system" setting stamps no attribute at all, so without the
 *      mirror a dark-mode viewer gets the light palette
 *   3. the theme toggle writes to `documentElement`, not `body`, since
 *      the selectors above are rooted there, and its starting value is
 *      read from `prefers-color-scheme` instead of being hardcoded —
 *      the local file stamps `<body data-theme="light">` and the twin
 *      cannot, so without this a system-dark viewer's first click on
 *      the theme control does nothing visible
 *
 * The Google Fonts <link> tags ride along verbatim. Google Fonts is the
 * one external host the Artifact CSP admits, so the twin gets the same
 * three faces as the local file.
 *
 *   node docs/warehouse-os/prototype/build-artifact-twin.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'warehouse-os.html'), 'utf8');

const title = src.match(/<title>([\s\S]*?)<\/title>/)?.[1];
if (!title) throw new Error('no <title> in warehouse-os.html');

const links = [...src.matchAll(/^<link\b[^>]*>$/gm)].map(m => m[0]).join('\n');
if (!links) throw new Error('no <link> tags — the font faces would fall back silently');

const styleStart = src.indexOf('<style>');
const styleEnd = src.indexOf('</style>');
if (styleStart < 0 || styleEnd < 0) throw new Error('no <style> block');
let css = src.slice(styleStart + '<style>'.length, styleEnd);

const bodyStart = src.indexOf('<!-- SVG ICON SPRITE -->');
const bodyEnd = src.lastIndexOf('</script>');
if (bodyStart < 0 || bodyEnd < 0) throw new Error('no body content');
let body = src.slice(bodyStart, bodyEnd + '</script>'.length);

// 2 — root the dark palette and mirror it into the system-preference branch
const DARK_OPEN = '  [data-theme="dark"] {';
const darkAt = css.indexOf(DARK_OPEN);
if (darkAt < 0) throw new Error('no [data-theme="dark"] block');
const darkClose = css.indexOf('\n  }\n', darkAt);
if (darkClose < 0) throw new Error('unterminated [data-theme="dark"] block');

const darkVars = css.slice(darkAt + DARK_OPEN.length, darkClose);
const blockEnd = darkClose + '\n  }\n'.length;
const mirrored =
  '\n  /* Default "system" state stamps nothing — only the media query separates them. */\n' +
  '  @media (prefers-color-scheme: dark) {\n' +
  '    :root:not([data-theme="light"]) {' +
  darkVars.replace(/\n/g, '\n  ') +
  '\n    }\n  }\n';

css =
  css.slice(0, darkAt) +
  '  :root[data-theme="dark"] {' + darkVars + '\n  }\n' +
  mirrored +
  css.slice(blockEnd);

// 3 — the toggle writes where the selectors read, and starts where the viewer is
body = body.replace(
  "document.body.setAttribute('data-theme'",
  "document.documentElement.setAttribute('data-theme'"
);
const THEME_SEED = "    theme: 'light',";
if (!body.includes(THEME_SEED)) throw new Error("no `theme: 'light'` seed in state");
body = body.replace(
  THEME_SEED,
  "    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',"
);

const out = `<title>${title}</title>\n${links}\n<style>${css}</style>\n\n${body}\n`;
writeFileSync(join(here, 'warehouse-os.artifact.html'), out);
process.stdout.write(`wrote warehouse-os.artifact.html (${out.split('\n').length} lines)\n`);
