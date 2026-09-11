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

  it('accepts bare 4-char pairing codes', () => {
    assert.equal(resolveSignInQrPayload('7K4M', ORIGIN), '/m/claim?code=7K4M');
    assert.equal(resolveSignInQrPayload('7k4m', ORIGIN), '/m/claim?code=7K4M');
  });

  it('still accepts legacy CF- prefixed pastes', () => {
    assert.equal(resolveSignInQrPayload('CF-7K4M', ORIGIN), '/m/claim?code=7K4M');
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
  it('display is bare uppercase — no CF- prefix', () => {
    assert.equal(formatHandoffDisplayCode('7k4m'), '7K4M');
  });

  it('input formatter never injects CF-', () => {
    assert.equal(formatHandoffCodeInput(''), '');
    assert.equal(formatHandoffCodeInput('7'), '7');
    assert.equal(formatHandoffCodeInput('7k4m'), '7K4M');
    assert.equal(formatHandoffCodeInput('cf-7k4m'), '7K4M');
    assert.equal(formatHandoffCodeInput('7K4MEXTRA'), '7K4M');
  });

  it('parse accepts bare and legacy CF- forms', () => {
    assert.equal(parseHandoffDisplayCode('7K4M'), '7K4M');
    assert.equal(parseHandoffDisplayCode('CF-7K4M'), '7K4M');
    assert.equal(parseHandoffDisplayCode('cf 7k4m'), '7K4M');
    assert.equal(parseHandoffDisplayCode('ABC'), null);
  });
});
