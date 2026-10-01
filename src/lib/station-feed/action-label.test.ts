import assert from 'node:assert/strict';
import test from 'node:test';
import { stationHistoryActionLabel, stationHistoryTaskKey } from './action-label';
import { bindPersonalStationFeed } from './personal';
import type { StationFeedItem, StationFeedQuery } from './types';

function item(partial: Partial<StationFeedItem> & Pick<StationFeedItem, 'job'>): StationFeedItem {
  return {
    id: 'ops:1',
    source: 'ops_event',
    sourceId: 1,
    occurredAt: '2026-10-01T18:00:00.000Z',
    outcome: 'committed',
    actor: { staffId: 7, name: 'Ada', avatarPhotoId: null },
    context: { origin: 'phone', surface: '/m/scan', station: 'RECEIVING', workflowNodeId: null },
    subject: {
      entityType: 'receiving',
      id: '42',
      title: 'Carton 42',
      identifier: '1Z999',
      imageUrl: null,
      status: null,
      href: '/m/r/42',
    },
    message: 'Scanned arrival: 1Z999',
    ...partial,
  };
}

test('arrival and scan-out nodes use the exact action, not the job name', () => {
  assert.equal(stationHistoryActionLabel(item({ job: 'arrival' })), 'Scanned arrival 1Z999');
  assert.equal(
    stationHistoryActionLabel(item({
      job: 'scan_out',
      id: 'sal:9',
      source: 'station_activity_log',
      subject: {
        entityType: 'order',
        id: '8247',
        title: 'Order 8247',
        identifier: '1Z7721',
        imageUrl: null,
        status: null,
        href: '/shipping/orders?sel=order:8247',
      },
    })),
    'Scanned out tracking 1Z7721',
  );
  assert.equal(stationHistoryActionLabel(item({ job: 'arrival' })).includes('Arrival'), false);
});

test('task keys use the subject, and personal binding drops a requested staff id', () => {
  assert.equal(stationHistoryTaskKey(item({ job: 'arrival' })), 'arrival:receiving:42');
  assert.equal(stationHistoryTaskKey(item({ job: 'scan_out', subject: { ...item({ job: 'scan_out' }).subject, id: '' } })), 'ops:1');
  const query = { staffIds: [99], jobs: [], outcomes: [], from: null, to: null, sort: 'newest', limit: 40, before: null, afterSalId: null, afterOpsEventId: null, afterMobileScanId: null } as StationFeedQuery;
  assert.deepEqual(bindPersonalStationFeed(query, 7).staffIds, [7]);
});
