import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionIsPhoneExecution, userAgentIsPhone } from './phone-execution';

test('phone user agents are phone execution even when the session kind is personal', () => {
  assert.equal(userAgentIsPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'), true);
  assert.equal(userAgentIsPhone('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36'), true);
  assert.equal(
    sessionIsPhoneExecution({
      deviceKind: 'personal',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
    }),
    true,
  );
});

test('desktop and station sessions are not phone execution', () => {
  assert.equal(userAgentIsPhone('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0'), false);
  assert.equal(userAgentIsPhone('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)'), false);
  assert.equal(userAgentIsPhone(null), false);
  assert.equal(sessionIsPhoneExecution({ deviceKind: 'station', userAgent: null }), false);
  assert.equal(sessionIsPhoneExecution({ deviceKind: 'phone', userAgent: null }), true);
});
