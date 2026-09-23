/**
 * GateGuard: unit tests for resolveSignInQrPayload + handoff code formatting.
 * No API. Called by node:test.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSignInQrPayload } from '@/components/auth/SignInQrScanDialog';
import {
  formatHandoffCodeInput,
  formatHandoffDisplayCode,
  parseHandoffDisplayCode,
} from '@/lib/auth/qr-handoff-code';

const ORIGIN = 'https://app.cycleforge.ai';

describe('resolveSignInQrPayload', () => {
  it('accepts desk→phone claim URLs', () => {
    assert.equal(
      resolveSignInQrPayload(`${ORIGIN}/m/claim?token=abc_DEF-1234567890`, ORIGIN),
      '/m/claim?token=abc_DEF-1234567890',
    );
  });

  it('accepts bare pairing codes', () => {
    assert.equal(resolveSignInQrPayload('481902', ORIGIN), '/m/claim?code=481902');
  });

  it('still accepts legacy CF- prefixed pastes', () => {
    assert.equal(resolveSignInQrPayload('CF-481902', ORIGIN), '/m/claim?code=481902');
  });

  it('accepts desk pairing URLs', () => {
    assert.equal(
      resolveSignInQrPayload(`${ORIGIN}/m/qr-auth?token=abc_DEF-1234567890`, ORIGIN),
      '/m/qr-auth?token=abc_DEF-1234567890',
    );
  });

  it('accepts bare pairing tokens', () => {
    assert.equal(
      resolveSignInQrPayload('abcDEF1234567890xyz', ORIGIN),
      '/m/qr-auth?token=abcDEF1234567890xyz',
    );
  });

  it('rejects open-on-phone signin URLs and foreign origins', () => {
    assert.equal(resolveSignInQrPayload(`${ORIGIN}/m/signin`, ORIGIN), null);
    assert.equal(resolveSignInQrPayload('https://evil.example/m/qr-auth?token=x', ORIGIN), null);
  });
});

describe('handoff code formatting', () => {
  it('display is the bare code — no CF- prefix', () => {
    assert.equal(formatHandoffDisplayCode('481902'), '481902');
  });

  it('the field takes digits only, so the phone keeps its number pad', () => {
    assert.equal(formatHandoffCodeInput(''), '');
    assert.equal(formatHandoffCodeInput('4'), '4');
    assert.equal(formatHandoffCodeInput('cf-481902'), '481902');
    assert.equal(formatHandoffCodeInput('4a8b1c9d0e2f'), '481902');
    assert.equal(formatHandoffCodeInput('4819021234'), '481902');
  });

  it('parse accepts spaced, dashed and legacy CF- forms', () => {
    assert.equal(parseHandoffDisplayCode('481902'), '481902');
    assert.equal(parseHandoffDisplayCode('CF-481902'), '481902');
    assert.equal(parseHandoffDisplayCode('481 902'), '481902');
    assert.equal(parseHandoffDisplayCode('48190'), null, 'short code is not a code');
    assert.equal(parseHandoffDisplayCode('7K4M'), null, 'the old base32 shape is gone');
  });
});
