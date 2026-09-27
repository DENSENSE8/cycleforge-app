import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Desktop chat threads have ONE renderer: the contextual sidebar's recents
 * list (`assistant.sessions` via `NavRecentsList`). The only other thread list
 * is MasterNav's `ChatSessionsNav`, which survives in the phone-width drawer
 * (`DashboardSidebar inDrawer`) until that drawer runs `ContextualSidebar`.
 * A new importer of the thread-list hook or component is a second desktop
 * renderer — route it through the recents contract instead.
 */
const SRC = path.resolve(process.cwd(), 'src');
/** Reading the thread list, or mounting the drawer's renderer of it. */
const THREAD_LIST = /\buseChatSessions\(|<ChatSessionsNav\b/;
const DRAWER_ONLY = new Set([
  'components/sidebar/master-nav/ChatSessionsNav.tsx',
  'components/sidebar/master-nav/SidebarNavList.tsx',
  // The hook's own definition.
  'lib/assistant/use-chat-sessions.ts',
]);

function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
}

test('no component outside the contextual sidebar renders chat thread rows on desktop', () => {
  const offenders = sourceFiles().filter((file) => {
    if (DRAWER_ONLY.has(file)) return false;
    return THREAD_LIST.test(readFileSync(path.join(SRC, file), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''));
  });
  assert.deepEqual(offenders, []);
});

test('the desktop host mounts no drawer thread list', () => {
  const host = readFileSync(path.join(SRC, 'components/sidebar/contextual/ContextualSidebar.tsx'), 'utf8');
  assert.doesNotMatch(host, /master-nav\/(ChatSessionsNav|SidebarNavList|MasterNav)/);
});
