import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import { useThrowTask } from './useThrowTask';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
globals.navigator = dom.window.navigator;
globals.IS_REACT_ACT_ENVIRONMENT = true;

test('one shared task keeps the resolved record, project and unique selected team in one POST', async () => {
  const originalFetch = globalThis.fetch;
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/staff-picker') return Response.json({ staff: [
      { id: 11, name: 'Ada', role: '', color_hex: '' },
      { id: 12, name: 'Bo', role: '', color_hex: '' },
    ] });
    if (url === '/api/tasks/ticket-target') return Response.json({ target: { entityType: 'support_ticket', entityId: 48120, label: 'Ticket #48120' } });
    if (url === '/api/tasks') {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ task: { id: 902 }, notified: 'sent' });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;
  const element = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(element);
  const root = createRoot(element);
  let hook!: {
    setRaw: (value: string) => void;
    runResolve: () => Promise<void>;
    picked: { entityId: number } | null;
    setProjectName: (value: string) => void;
    toggleAssignee: (person: StaffRecipient) => void;
    staff: StaffRecipient[] | null;
    canThrow: boolean;
    submit: () => Promise<void>;
    assignees: StaffRecipient[];
  };
  let created: number | null = null;
  function Harness() {
    hook = useThrowTask({ mode: 'ticket', onThrown: (id) => { created = id; } });
    return null;
  }
  try {
    await act(async () => { root.render(h(Harness)); });
    await act(async () => { hook.setRaw('48120'); });
    await act(async () => { await hook.runResolve(); });
    assert.equal(hook.picked?.entityId, 48120);
    await act(async () => {
      hook.setProjectName(' Return and replacement ');
      hook.toggleAssignee(hook.staff![0]);
      hook.toggleAssignee(hook.staff![1]);
    });
    assert.equal(hook.canThrow, true);
    await act(async () => { await hook.submit(); });
    assert.equal(created, 902);
    assert.equal(sent.length, 1, 'both recipients share one assignment');
    assert.deepEqual(sent[0].assigneeStaffIds, [11, 12]);
    assert.equal(sent[0].projectName, 'Return and replacement');
    assert.equal(sent[0].entityType, 'support_ticket');
    assert.equal(sent[0].entityId, 48120);
    await act(async () => { hook.toggleAssignee(hook.staff![0]); });
    assert.deepEqual(hook.assignees.map((person) => person.id), [12], 'removing a lead does not remove another member');
  } finally {
    act(() => root.unmount());
    element.remove();
    globalThis.fetch = originalFetch;
  }
});
