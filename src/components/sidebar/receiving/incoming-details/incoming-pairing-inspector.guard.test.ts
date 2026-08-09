/**
 * Incoming desk Pairing inspector — 1-check opens `detail:incoming` with a
 * Pairing topic composing Arrival's CartonMatchHub (not a second pairing twin,
 * not Station Displays push).
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { tabsForData, type DetailsResponse } from './incoming-details-shared';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), 'utf8');
}

describe('Incoming Pairing inspector', () => {
  it('unpaired details expose a leading Pairing tab', () => {
    const tabs = tabsForData({
      success: true,
      po: null,
      receiving: { id: 1, shipment_id: null, received_at: null },
      line_items: [],
      shipment: null,
      receive_events: [],
      gmail: [],
      delivered_emails: [],
      zoho_activity: [],
      po_notes: null,
      notes: null,
    } satisfies DetailsResponse);
    assert.equal(tabs[0]?.value, 'pairing');
    assert.ok(!tabs.some((t) => t.value === 'po'));
  });

  it('paired details keep the PO tab set (no Pairing)', () => {
    const tabs = tabsForData({
      success: true,
      po: {
        zoho_purchaseorder_id: 'p1',
        zoho_purchaseorder_number: '6001',
        vendor_id: null,
        vendor_name: null,
        status: null,
        po_date: null,
        expected_delivery_date: null,
        reference_number: null,
        total: null,
        currency: null,
        last_modified_zoho: null,
        last_synced_at: '',
      },
      receiving: { id: 1, shipment_id: null, received_at: null },
      line_items: [],
      shipment: null,
      receive_events: [],
      gmail: [],
      delivered_emails: [],
      zoho_activity: [],
      po_notes: null,
      notes: null,
    } satisfies DetailsResponse);
    assert.equal(tabs[0]?.value, 'po');
    assert.ok(!tabs.some((t) => t.value === 'pairing'));
  });

  it('PairingTab composes CartonMatchHub arrival/bare', () => {
    const src = read('PairingTab.tsx');
    assert.match(src, /CartonMatchHub/);
    assert.match(src, /tabSet="arrival"/);
    assert.match(src, /chrome="bare"/);
  });

  it('IncomingDetailsPanel mounts PairingTab', () => {
    const src = read('../IncomingDetailsPanel.tsx');
    assert.match(src, /PairingTab/);
    assert.match(src, /DeskInspectorIndexShell/);
    assert.match(src, /buildIncomingInspectorLeaves/);
    assert.match(src, /pairing:/);
  });

  it('ReceivingDashboard opens inspect from Incoming 1-check', () => {
    const src = readFileSync(
      join(here, '../../../ReceivingDashboard.tsx'),
      'utf8',
    );
    assert.match(src, /incomingDetailsTargetFromRow/);
    assert.match(src, /selectedRows\.length === 0/);
    assert.match(src, /selectedRows\.length >= 2/);
  });

  it('ReceivingLineRailShell does not claim Incoming 1-check', () => {
    const src = readFileSync(
      join(here, '../../../receiving/rail/ReceivingLineRailShell.tsx'),
      'utf8',
    );
    assert.match(src, /isReceivingRailBatchActive\(occupancy\)/);
    assert.doesNotMatch(
      src,
      /surface === 'incoming' && occupancy\.kind === 'inspect'/,
    );
  });
});
