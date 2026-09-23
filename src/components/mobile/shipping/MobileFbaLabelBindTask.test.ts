import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('mobile FBA label binding uses the canonical packed-line write without a scanner fork', () => { const source = readFileSync('src/components/mobile/shipping/MobileFbaLabelBindTask.tsx', 'utf8'); assert.match(source, /\/api\/fba\/labels\/bind/); assert.match(source, /line.status === 'PACKED'/); assert.match(source, /radius="flush"/); assert.doesNotMatch(source, /<motion\.|whileTap|<MobileScanCta/); });
