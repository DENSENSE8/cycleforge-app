/**
 * Declarative field metadata for vault integration connect forms.
 * Display SoT for typed credential entry — consumed by VaultConnectSheet.
 */
import type { IntegrationProvider } from './credentials';
import { isVaultUpsertProvider } from './credential-schemas';

export type CredentialFieldType = 'text' | 'password' | 'email' | 'url' | 'select' | 'textarea';

export interface CredentialFieldDef {
  key: string;
  label: string;
  type: CredentialFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  secret?: boolean;
  section?: string;
}

export interface CredentialFormDef {
  provider: IntegrationProvider;
  title: string;
  description: string;
  fields: CredentialFieldDef[];
}

const ZENDESK_FORM: CredentialFormDef = {
  provider: 'zendesk',
  title: 'Zendesk',
  description: 'Connect your Zendesk subdomain and API token. Create a token under Admin → Apps and integrations → APIs → Zendesk API.',
  fields: [
    { key: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'yourcompany', help: 'The part before .zendesk.com' },
    { key: 'email', label: 'Agent email', type: 'email', required: true, placeholder: 'support@yourcompany.com' },
    { key: 'apiToken', label: 'API token', type: 'password', required: true, secret: true, placeholder: 'Paste API token' },
  ],
};

const ECWID_FORM: CredentialFormDef = {
  provider: 'ecwid',
  title: 'Ecwid',
  description: 'Connect your Ecwid store ID and secret API token from Settings → API.',
  fields: [
    { key: 'storeId', label: 'Store ID', type: 'text', required: true, placeholder: '12345678' },
    { key: 'apiToken', label: 'API token', type: 'password', required: true, secret: true },
  ],
};

const SHIPSTATION_FORM: CredentialFormDef = {
  provider: 'shipstation',
  title: 'ShipStation',
  description: 'Connect ShipStation for labels and order import. The v2 API key powers rate-shop and label buy; the legacy v1 pair is optional for pulling orders.',
  fields: [
    { key: 'apiKey', label: 'API key (v2)', type: 'password', required: true, secret: true, section: 'API keys' },
    { key: 'v1ApiKey', label: 'Legacy v1 API key', type: 'password', secret: true, section: 'Order import (optional)' },
    { key: 'v1ApiSecret', label: 'Legacy v1 API secret', type: 'password', secret: true, section: 'Order import (optional)' },
    { key: 'webhookSecret', label: 'Webhook signing secret', type: 'password', secret: true, section: 'Webhooks (optional)' },
  ],
};

const UPS_FORM: CredentialFormDef = {
  provider: 'ups',
  title: 'UPS',
  description: 'Connect UPS for shipment tracking and webhook callbacks.',
  fields: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true },
    { key: 'clientSecret', label: 'Client secret', type: 'password', required: true, secret: true },
    { key: 'webhookSecret', label: 'Webhook secret', type: 'password', secret: true },
  ],
};

const FEDEX_FORM: CredentialFormDef = {
  provider: 'fedex',
  title: 'FedEx',
  description: 'Connect FedEx for shipment tracking.',
  fields: [
    { key: 'clientId', label: 'Client ID', type: 'text', required: true },
    { key: 'clientSecret', label: 'Client secret', type: 'password', required: true, secret: true },
    {
      key: 'env',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox' },
      ],
    },
  ],
};

const USPS_FORM: CredentialFormDef = {
  provider: 'usps',
  title: 'USPS',
  description: 'Connect USPS for OAuth tracking and label events.',
  fields: [
    { key: 'consumerKey', label: 'Consumer key', type: 'text', required: true },
    { key: 'consumerSecret', label: 'Consumer secret', type: 'password', required: true, secret: true },
  ],
};

const GOOGLE_SHEETS_FORM: CredentialFormDef = {
  provider: 'google_sheets',
  title: 'Google Sheets',
  description: 'Connect a Google service account for spreadsheet order import. Paste the service account email and private key from your JSON key file.',
  fields: [
    { key: 'clientEmail', label: 'Service account email', type: 'email', required: true, placeholder: 'sheets-import@project.iam.gserviceaccount.com' },
    { key: 'privateKey', label: 'Private key (PEM)', type: 'textarea', required: true, secret: true, placeholder: '-----BEGIN PRIVATE KEY-----\\n...' },
    { key: 'defaultSpreadsheetId', label: 'Default spreadsheet ID', type: 'text', placeholder: 'Optional — used when no sheet is specified' },
  ],
};

const NEXTIVA_FORM: CredentialFormDef = {
  provider: 'nextiva',
  title: 'Nextiva',
  description: 'Connect Nextiva for call log, voicemail, and click-to-call. Provide an API key or OAuth refresh token from your Nextiva developer settings.',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'password', secret: true },
    { key: 'accountId', label: 'Account ID', type: 'text', help: 'Used to resolve inbound webhooks' },
    { key: 'locationId', label: 'Location ID', type: 'text' },
    { key: 'defaultExtension', label: 'Default extension', type: 'text', help: 'Extension for click-to-call origination' },
    { key: 'webhookSigningSecret', label: 'Webhook signing secret', type: 'password', secret: true, section: 'Webhooks (optional)' },
  ],
};

const OLLAMA_FORM: CredentialFormDef = {
  provider: 'ollama',
  title: 'Self-hosted AI',
  description: 'Connect any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM) for AI search and Ask AI.',
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'http://localhost:11434/v1' },
    { key: 'model', label: 'Chat model', type: 'text', required: true, placeholder: 'llama3.2' },
    { key: 'embedModel', label: 'Embedding model', type: 'text', placeholder: 'nomic-embed-text' },
    { key: 'apiKey', label: 'API key (optional)', type: 'password', secret: true },
  ],
};

const AI_GATEWAY_FORM: CredentialFormDef = {
  provider: 'ai_gateway',
  title: 'Vercel AI Gateway',
  description: 'One key for every model — powers AI search and Ask AI across providers.',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    { key: 'chatModel', label: 'Chat model', type: 'text', placeholder: 'openai/gpt-4o-mini' },
    { key: 'embedModel', label: 'Embedding model', type: 'text', placeholder: 'openai/text-embedding-3-small' },
  ],
};

const OPENAI_FORM: CredentialFormDef = {
  provider: 'openai',
  title: 'OpenAI',
  description: 'Direct OpenAI key for AI search embeddings and Ask AI.',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    { key: 'chatModel', label: 'Chat model', type: 'text', placeholder: 'gpt-4o-mini' },
    { key: 'embedModel', label: 'Embedding model', type: 'text', placeholder: 'text-embedding-3-small' },
  ],
};

const ANTHROPIC_FORM: CredentialFormDef = {
  provider: 'anthropic',
  title: 'Anthropic',
  description: 'Claude for Ask AI (chat only — embeddings need another provider).',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, secret: true },
    { key: 'chatModel', label: 'Chat model', type: 'text', placeholder: 'claude-sonnet-4-20250514' },
  ],
};

export const CREDENTIAL_FORM_DEFS: Partial<Record<IntegrationProvider, CredentialFormDef>> = {
  zendesk: ZENDESK_FORM,
  ecwid: ECWID_FORM,
  shipstation: SHIPSTATION_FORM,
  ups: UPS_FORM,
  fedex: FEDEX_FORM,
  usps: USPS_FORM,
  google_sheets: GOOGLE_SHEETS_FORM,
  nextiva: NEXTIVA_FORM,
  ollama: OLLAMA_FORM,
  ai_gateway: AI_GATEWAY_FORM,
  openai: OPENAI_FORM,
  anthropic: ANTHROPIC_FORM,
};

export function getCredentialFormDef(provider: string): CredentialFormDef | null {
  return CREDENTIAL_FORM_DEFS[provider as IntegrationProvider] ?? null;
}

export function hasTypedCredentialForm(provider: string): boolean {
  return isVaultUpsertProvider(provider) && getCredentialFormDef(provider) != null;
}

export function authKindLabel(authKind: string): string {
  switch (authKind) {
    case 'oauth': return 'OAuth';
    case 'nango': return 'Hosted connect';
    case 'vault': return 'API key';
    default: return authKind;
  }
}
