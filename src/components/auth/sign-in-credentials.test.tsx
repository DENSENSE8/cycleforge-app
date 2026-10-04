import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInAuthStepPanels } from './SignInAuthStepPanels';

function renderCredentials() {
  return renderToStaticMarkup(
    <SignInAuthStepPanels
      email=""
      password=""
      onEmailChange={() => undefined}
      onPasswordChange={() => undefined}
    />,
  );
}

test('sign-in exposes the standard password-manager username and password pair', () => {
  const html = renderCredentials();
  const emailInput = html.match(/<input[^>]*id="email"[^>]*>/)?.[0] ?? '';
  const passwordInput = html.match(/<input[^>]*id="password"[^>]*>/)?.[0] ?? '';

  assert.match(emailInput, /name="username"/);
  assert.match(emailInput, /type="email"/);
  assert.match(emailInput, /autoComplete="username webauthn"/);
  assert.match(passwordInput, /name="password"/);
  assert.match(passwordInput, /type="password"/);
  assert.match(passwordInput, /autoComplete="current-password"/);
});

test('sign-in uses the auth hairline-label and blue focus treatment', () => {
  const html = renderCredentials();

  assert.match(html, /focus:border-blue-600/);
  assert.match(html, /peer-focus:text-blue-600/);
  assert.match(html, /-top-2/);
});
