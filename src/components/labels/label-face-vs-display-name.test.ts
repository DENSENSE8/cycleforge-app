import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelPlatformTypeMenu } from './LabelPlatformTypeMenu';
import { InlinePillPicker } from '@/components/receiving/workspace/line-edit/InlinePillPicker';
import { typeClassifyOptions } from '@/components/receiving/workspace/line-edit/classify-pill-options';
import { buildCartonLabelPayloadFromDraft } from '@/components/receiving/workspace/line-edit/cartonLabelPayload';
import { buildShortLabelLookup } from '@/lib/platform-display';
import { receivingLabelPlatformDisplay, receivingPayloadToFace } from '@/lib/print/printReceivingLabel';
import { catalogKeys } from '@/lib/queries/catalog-queries';
import type { PlatformRow, TypeRow } from '@/lib/neon/catalog-queries';

/**
 * Operator 2026-10-08: "return is rtr but it should say return when you are
 * viewing the type and the platform." The sticker word (`short_label`) prints
 * on the 2x1 label and its preview; every picker shows the display `label`.
 */

const stamp = { organization_id: 'org', created_at: '', updated_at: '' };

const RETURN: TypeRow = {
  ...stamp,
  id: 1,
  slug: 'return',
  label: 'Return',
  short_label: 'RTR',
  kind: 'receiving',
  color_hex: null,
  platform_account_id: null,
  workflow_node_id: null,
  is_return: true,
  sort_order: 20,
  is_active: true,
  is_system: true,
};

const AMAZON: PlatformRow = {
  ...stamp,
  id: 1,
  slug: 'amazon',
  label: 'Amazon',
  short_label: 'AMZ',
  tone: null,
  color_hex: null,
  provider: null,
  sort_order: 20,
  is_active: true,
  is_system: true,
};

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  client.setQueryData(catalogKeys.types(false), { success: true, types: [RETURN] });
  client.setQueryData(catalogKeys.platforms(false), { success: true, platforms: [AMAZON] });
  client.setQueryData(catalogKeys.platformTypeRules(), { success: true, rules: [] });
  return client;
}

test('label platform/type menu rows read the display name, never the sticker word', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: seededClient() },
      React.createElement(LabelPlatformTypeMenu, {
        platform: 'Amazon',
        receivingType: 'RETURN',
        onPlatformChange: () => {},
        onTypeChange: () => {},
      }),
    ),
  );
  // Visible text only — attributes and markup stripped.
  const shown = html.replace(/<[^>]*>/g, ' ');
  assert.match(shown, /\bReturn\b/);
  assert.match(shown, /\bAmazon\b/);
  assert.doesNotMatch(shown, /\bRTR\b/i);
  assert.doesNotMatch(shown, /\bAMZ\b/i);
});

test('type classify pill (compact bookmark face) reads the display name, never the sticker word', () => {
  const options = typeClassifyOptions({
    catalogOptions: [{ value: RETURN.slug.toUpperCase(), label: RETURN.label, colorHex: RETURN.color_hex }],
  });
  const html = renderToStaticMarkup(
    React.createElement(InlinePillPicker, {
      ariaLabel: 'Type',
      options,
      value: 'RETURN',
      onSelect: () => {},
      open: false,
      onOpenChange: () => {},
      readOnly: true,
      collapsedVariant: 'bookmark',
      presentation: 'menu',
    }),
  );
  const shown = html.replace(/<[^>]*>/g, ' ');
  assert.match(shown, /\bReturn\b/);
  assert.doesNotMatch(shown, /\bRTR\b/i);
  assert.doesNotMatch(shown, /\bRet\b/);
});

test('the 2x1 face prints the sticker words from the same catalog rows', () => {
  assert.equal(
    receivingLabelPlatformDisplay({
      platform: 'Amazon',
      platformShortLabel: 'AMZ',
      receivingType: 'RETURN',
      receivingTypeLabel: 'Return',
      receivingTypeShortLabel: 'RTR',
    }),
    'AMZ - RTR',
  );

  const payload = buildCartonLabelPayloadFromDraft(
    {
      platform: 'Amazon',
      receivingType: 'RETURN',
      notes: '',
      conditionCode: 'USED_A',
      cornerMode: 'order',
      reference: 'PO-1',
      ticket: '',
      tracking: '',
      date: '10/8/26',
    },
    {
      receivingId: 1,
      trackingHint: '',
      resolveTypeLabel: () => 'Return',
      resolvePlatformShortLabel: buildShortLabelLookup([AMAZON]),
      resolveTypeShortLabel: buildShortLabelLookup([RETURN]),
    },
  );
  assert.equal(receivingPayloadToFace(payload).topLeft, 'AMZ - RTR');
});
