import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareTechAllTriageRows,
  mergeTechAllTriageRows,
  triageRowFromOrder,
  triageRowFromRepair,
} from '@/lib/tech/tech-all-triage';
import { TECH_ALL_TRIAGE_TYPE_LABEL } from '@/lib/tech/tech-all-triage-type';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { ShippedOrder } from '@/types/orders';

describe('tech-all-triage', () => {
  it('labels every type for the Type column', () => {
    assert.equal(TECH_ALL_TRIAGE_TYPE_LABEL.order, 'Order');
    assert.equal(TECH_ALL_TRIAGE_TYPE_LABEL.repair, 'Repair service');
    assert.equal(TECH_ALL_TRIAGE_TYPE_LABEL.pickup, 'Local pickup');
    assert.equal(TECH_ALL_TRIAGE_TYPE_LABEL.return, 'Return');
    assert.equal(TECH_ALL_TRIAGE_TYPE_LABEL.purchase_order, 'Purchase order');
  });

  it('sorts lower urgencyRank first', () => {
    const a = triageRowFromOrder({
      id: 1,
      order_id: 'A',
      product_title: 'A',
      condition: '',
      serial_number: '',
      sku: '',
      tester_id: null,
      tested_by: null,
      test_date_time: null,
      packer_id: null,
      packed_by: null,
      packed_at: null,
      is_urgent: true,
    } as ShippedOrder & { is_urgent: boolean });
    const b = triageRowFromRepair({
      id: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ticket_number: 'RS-1',
      contact_info: '',
      product_title: 'Amp',
      price: '',
      issue: '',
      serial_number: '',
      status: 'Pending Repair',
    } as RSRecord);
    assert.ok(compareTechAllTriageRows(a, b) < 0);
  });

  it('merges shipping scope with orders + repairs + pickup', () => {
    const rows = mergeTechAllTriageRows({
      scope: 'shipping',
      orders: [
        {
          id: 9,
          order_id: 'ORD-9',
          product_title: 'Speaker',
          condition: '',
          serial_number: '',
          sku: 'SKU-9',
          tester_id: null,
          tested_by: null,
          test_date_time: null,
          packer_id: null,
          packed_by: null,
          packed_at: null,
        } as ShippedOrder,
      ],
      repairs: [
        {
          id: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ticket_number: 'RS-3',
          contact_info: '',
          product_title: 'Pedal',
          price: '',
          issue: '',
          serial_number: '',
          status: 'Awaiting Parts',
        } as RSRecord,
      ],
      pickupLines: [
        {
          id: 1,
          order_id: 40,
          sku: null,
          product_title: 'Cable',
          image_url: null,
          quantity: 1,
          condition_grade: '',
          parts_status: '',
          missing_parts_note: null,
          condition_note: null,
          total_price: '0',
          po_number: 'LCPU-40',
          reference_number: null,
          customer_name: 'Ada',
          order_status: 'DRAFT',
          receiving_id: null,
          pickup_date: null,
          zoho_po_id: null,
          zoho_status: null,
          zoho_total: null,
          zoho_po_date: null,
          zoho_vendor_name: null,
        },
      ],
    });
    const types = rows.map((r) => r.type).sort();
    assert.deepEqual(types, ['order', 'pickup', 'repair']);
  });

  it('merges testing scope with lines + repairs + pickup + urgent orders only', () => {
    const rows = mergeTechAllTriageRows({
      scope: 'testing',
      receivingLines: [
        {
          id: 11,
          sku: 'RET-1',
          zoho_item_title: 'Return amp',
          is_return: true,
          workflow_status: 'AWAITING_TEST',
          is_priority: true,
        } as never,
        {
          id: 12,
          sku: 'PO-1',
          zoho_item_title: 'PO pedal',
          workflow_status: 'UNBOXED',
          zoho_purchaseorder_number: 'PO-99',
        } as never,
      ],
      orders: [
        {
          id: 1,
          order_id: 'URG-1',
          product_title: 'Urgent ship',
          condition: '',
          serial_number: '',
          sku: '',
          tester_id: null,
          tested_by: null,
          test_date_time: null,
          packer_id: null,
          packed_by: null,
          packed_at: null,
          is_urgent: true,
        } as ShippedOrder & { is_urgent: boolean },
        {
          id: 2,
          order_id: 'CALM-2',
          product_title: 'Normal ship',
          condition: '',
          serial_number: '',
          sku: '',
          tester_id: null,
          tested_by: null,
          test_date_time: null,
          packer_id: null,
          packed_by: null,
          packed_at: null,
          is_urgent: false,
        } as ShippedOrder & { is_urgent: boolean },
      ],
      repairs: [
        {
          id: 7,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ticket_number: 'RS-7',
          contact_info: '',
          product_title: 'Head',
          price: '',
          issue: '',
          serial_number: '',
          status: 'Pending Repair',
        } as RSRecord,
      ],
      pickupLines: [
        {
          id: 2,
          order_id: 50,
          sku: null,
          product_title: 'Cable',
          image_url: null,
          quantity: 1,
          condition_grade: '',
          parts_status: '',
          missing_parts_note: null,
          condition_note: null,
          total_price: '0',
          po_number: 'LCPU-50',
          reference_number: null,
          customer_name: 'Bo',
          order_status: 'PROCESS',
          receiving_id: null,
          pickup_date: null,
          zoho_po_id: null,
          zoho_status: null,
          zoho_total: null,
          zoho_po_date: null,
          zoho_vendor_name: null,
        },
      ],
    });
    const types = rows.map((r) => r.type).sort();
    assert.deepEqual(types, ['order', 'pickup', 'purchase_order', 'repair', 'return']);
    assert.equal(rows.filter((r) => r.type === 'order').length, 1);
    assert.equal(rows.find((r) => r.type === 'order')?.title, 'URG-1');
  });

  it('merges unbox scope with scanned lines + repairs + pickup (no orders)', () => {
    const rows = mergeTechAllTriageRows({
      scope: 'unbox',
      receivingLines: [
        {
          id: 21,
          sku: 'SCAN-1',
          zoho_item_title: 'Door scan',
          receiving_listing_url: 'https://www.ebay.com/itm/SCAN-1',
          workflow_status: 'MATCHED',
        } as never,
      ],
      orders: [
        {
          id: 99,
          order_id: 'SHOULD-NOT',
          product_title: 'Nope',
          condition: '',
          serial_number: '',
          sku: '',
          tester_id: null,
          tested_by: null,
          test_date_time: null,
          packer_id: null,
          packed_by: null,
          packed_at: null,
          is_urgent: true,
        } as ShippedOrder & { is_urgent: boolean },
      ],
      repairs: [
        {
          id: 8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ticket_number: 'RS-8',
          contact_info: '',
          product_title: 'Cab',
          price: '',
          issue: '',
          serial_number: '',
          status: 'Pending Repair',
        } as RSRecord,
      ],
      pickupLines: [],
    });
    const types = rows.map((r) => r.type).sort();
    assert.deepEqual(types, ['purchase_order', 'repair']);
    assert.equal(
      rows.find((r) => r.type === 'purchase_order')?.titleHref,
      'https://www.ebay.com/itm/SCAN-1',
    );
  });
});
