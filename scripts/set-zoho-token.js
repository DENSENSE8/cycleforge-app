#!/usr/bin/env node
/**
 * DEPRECATED — Zoho tokens no longer live on ebay_accounts.
 *
 * Use one of:
 *   - Reconnect: /api/zoho/oauth/authorize (writes organization_integrations)
 *   - Break-glass backfill: npx tsx scripts/migrate-zoho-to-vault.ts --apply
 *   - Env transitional: ZOHO_REFRESH_TOKEN (dogfood only)
 */
console.error(
  'set-zoho-token.js is retired (eBay vault migration / INT-002).\n' +
    'Use /api/zoho/oauth/authorize or: npx tsx scripts/migrate-zoho-to-vault.ts --apply',
);
process.exit(1);
