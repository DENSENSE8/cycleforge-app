import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusStrip } from './StatusStrip';
import type { Milestone } from './milestone-pipeline-types';

const milestones: Milestone[] = [
  {
    key: 'tested',
    label: 'Tested',
    icon: React.createElement('span', { 'data-testid': 'icon-tested' }),
    at: '2026-03-12T21:14:00.000Z',
    readyLabel: 'Ready to test',
    scans: [{ kind: 'note', value: 'Station scan' }],
  },
  {
    key: 'packed',
    label: 'Packed',
    icon: React.createElement('span', { 'data-testid': 'icon-packed' }),
    at: '2026-03-12T23:02:00.000Z',
    readyLabel: 'Ready to pack',
    scans: [],
  },
  {
    key: 'scanned_out',
    label: 'Scanned Out',
    icon: React.createElement('span', { 'data-testid': 'icon-out' }),
    at: '2026-03-13T16:01:00.000Z',
    readyLabel: 'Ready to ship',
    scans: [{ kind: 'tracking', value: '1ZTEST' }],
  },
];

describe('StatusStrip', () => {
  it('paints equal stage names on one hairline and drops station-scan notes', () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusStrip, {
        milestones,
        ariaLabel: 'Order progress',
      }),
    );
    assert.match(html, /Tested/);
    assert.match(html, /Packed/);
    assert.match(html, /Scanned Out/);
    assert.match(html, /h-6 items-center/);
    assert.doesNotMatch(html, /Station scan/);
    assert.doesNotMatch(html, /StaffAvatar/);
    assert.match(html, /1ZTEST/);
  });
});
