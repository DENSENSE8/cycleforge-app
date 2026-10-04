/**
 * Starting text for a task document and the editor toolbar's inserts. Every
 * live part is a REFERENCE the renderer reads at view time (P6): owners are
 * `@Name`, task lists are ```tasks``` blocks, and the status chart is the
 * block's `chart: pie` — derived from the tasks, never typed numbers.
 */

import type { TaskDeskPerson } from './task-desk-row';

/** The person as a `@Token` the reference scanner reads (first name; letters only). */
function mention(person: TaskDeskPerson): string {
  return `@${person.name.trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '')}`;
}

/**
 * "Master plan": Goal · Definition of done per owner · Deliverables table ·
 * a live tasks block · a status pie derived from the same tasks.
 */
export function masterPlanTemplate({
  title,
  owners,
  projectName,
}: {
  title: string;
  /** Ordered, lead first (the task's assignees). */
  owners: readonly TaskDeskPerson[];
  projectName: string | null;
}): string {
  const first = (person: TaskDeskPerson) => person.name.trim().split(/\s+/)[0];
  const scope = projectName?.trim()
    ? `project: ${projectName.trim()}`
    : owners.length
      ? `owner: ${owners.map(first).join(', ')}`
      : 'owner: ';
  const dodSections = owners.length
    ? owners.flatMap((person) => [
        `### ${mention(person)}`,
        '- [ ] First deliverable',
        '',
        '```tasks',
        `owner: ${first(person)}`,
        '```',
        '',
      ])
    : ['### Owner', '- [ ] First deliverable', ''];
  return [
    `# ${title.trim() || 'Master plan'}`,
    '',
    '## Goal',
    'One sentence: what is true when this is finished?',
    '',
    '## Definition of done per owner',
    ...dodSections,
    '## Deliverables',
    '| Deliverable | Owner | Due | Task |',
    '| --- | --- | --- | --- |',
    `| | ${owners[0] ? mention(owners[0]) : ''} | | |`,
    '',
    '## Tasks',
    '```tasks',
    scope,
    'status: all',
    '```',
    '',
    '## Status',
    '```tasks',
    scope,
    'status: all',
    'chart: pie',
    '```',
    '',
  ].join('\n');
}

/** Toolbar inserts. `block` inserts on its own lines; `line` prefixes the current line. */
export interface DocInsert {
  id: string;
  label: string;
  kind: 'line' | 'inline' | 'block';
  text: string;
}

export const DOC_TOOLBAR_INSERTS: readonly DocInsert[] = [
  { id: 'h2', label: 'Heading', kind: 'line', text: '## ' },
  { id: 'bullet', label: 'List', kind: 'line', text: '- ' },
  { id: 'check', label: 'Checklist', kind: 'line', text: '- [ ] ' },
  { id: 'ref', label: 'Task reference', kind: 'inline', text: '#T' },
  { id: 'tasks', label: 'Tasks block', kind: 'block', text: '```tasks\nowner: \nstatus: open\n```' },
  {
    id: 'pie',
    label: 'Pie chart',
    kind: 'block',
    text: '```mermaid\npie showData title Share\n  "First" : 3\n  "Second" : 2\n```',
  },
  {
    id: 'bar',
    label: 'Bar chart',
    kind: 'block',
    text: '```mermaid\nxychart-beta\n  title "By week"\n  x-axis [W1, W2, W3]\n  y-axis "Count" 0 --> 10\n  bar [3, 6, 4]\n```',
  },
  {
    id: 'flow',
    label: 'Diagram',
    kind: 'block',
    text: '```mermaid\nflowchart LR\n  A[Start] --> B[Do the work] --> C[Done]\n```',
  },
];

/**
 * Apply one toolbar insert to a textarea's text at its selection; returns the
 * next text and where the caret lands. Pure, so the editor stays a thin shell.
 */
export function applyDocInsert(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insert: DocInsert,
): { text: string; caret: number } {
  if (insert.kind === 'line') {
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
    return {
      text: text.slice(0, lineStart) + insert.text + text.slice(lineStart),
      caret: selectionEnd + insert.text.length,
    };
  }
  if (insert.kind === 'inline') {
    return {
      text: text.slice(0, selectionStart) + insert.text + text.slice(selectionEnd),
      caret: selectionStart + insert.text.length,
    };
  }
  const before = text.slice(0, selectionStart);
  const lead = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const block = `${lead}${insert.text}\n`;
  return { text: before + block + text.slice(selectionEnd), caret: before.length + block.length };
}
