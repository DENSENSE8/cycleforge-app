/**
 * Per-provider Zod schemas for vault credential payloads.
 * Used by the upsert route (server validation) and connect forms (client preview).
 */
import { z } from 'zod';
import type { IntegrationProvider } from './credentials';

const nonEmpty = z.string().min(1);
const optionalNonEmpty = z.string().min(1).optional();

export const ZendeskCredentialSchema = z.object({
  subdomain: nonEmpty,
  email: z.string().email(),
  apiToken: nonEmpty,
});

export const EcwidCredentialSchema = z.object({
  storeId: nonEmpty,
  apiToken: nonEmpty,
});

export const ShipStationCredentialSchema = z.object({
  apiKey: nonEmpty,
  v1ApiKey: optionalNonEmpty,
  v1ApiSecret: optionalNonEmpty,
  webhookToken: optionalNonEmpty,
  webhookSecret: optionalNonEmpty,
});

export const UpsCredentialSchema = z.object({
  clientId: nonEmpty,
  clientSecret: nonEmpty,
  webhookSecret: optionalNonEmpty,
});

export const FedexCredentialSchema = z.object({
  clientId: nonEmpty,
  clientSecret: nonEmpty,
  env: z.enum(['production', 'sandbox']),
});

export const UspsCredentialSchema = z.object({
  consumerKey: nonEmpty,
  consumerSecret: nonEmpty,
});

export const GoogleSheetsCredentialSchema = z.object({
  clientEmail: nonEmpty,
  privateKey: nonEmpty,
  defaultSpreadsheetId: optionalNonEmpty,
});

export const NextivaCredentialSchema = z.object({
  apiKey: optionalNonEmpty,
  refreshToken: optionalNonEmpty,
  accessToken: optionalNonEmpty,
  expiresAt: z.number().optional(),
  accountId: optionalNonEmpty,
  locationId: optionalNonEmpty,
  defaultExtension: optionalNonEmpty,
  webhookToken: optionalNonEmpty,
  webhookSigningSecret: optionalNonEmpty,
}).refine((v) => Boolean(v.apiKey?.trim() || v.refreshToken?.trim()), {
  message: 'Provide an API key or OAuth refresh token',
});

export const OllamaCredentialSchema = z.object({
  baseUrl: z.string().url(),
  tunnelUrl: z.string().url().optional(),
  model: nonEmpty,
  embedModel: optionalNonEmpty,
  apiKey: optionalNonEmpty,
});

export const AiGatewayCredentialSchema = z.object({
  apiKey: nonEmpty,
  chatModel: optionalNonEmpty,
  embedModel: optionalNonEmpty,
});

export const OpenAiCredentialSchema = z.object({
  apiKey: nonEmpty,
  chatModel: optionalNonEmpty,
  embedModel: optionalNonEmpty,
});

export const AnthropicCredentialSchema = z.object({
  apiKey: nonEmpty,
  chatModel: optionalNonEmpty,
});

export const StripeCredentialSchema = z.object({
  secretKey: nonEmpty,
  publishableKey: nonEmpty,
  webhookSecret: nonEmpty,
});

export const AblyCredentialSchema = z.object({
  apiKey: nonEmpty,
});

export const NangoMarkerSchema = z.object({
  __nango: z.literal(true),
  connectionId: nonEmpty,
  providerConfigKey: nonEmpty,
});

/** Vault providers accepted by POST /api/admin/integrations/upsert */
export const VAULT_UPSERT_PROVIDERS = [
  'ecwid',
  'ups',
  'fedex',
  'usps',
  'zendesk',
  'google_sheets',
  'ably',
  'ollama',
  'stripe',
  'shipstation',
  'nextiva',
  'ai_gateway',
  'openai',
  'anthropic',
  'square',
] as const satisfies readonly IntegrationProvider[];

export type VaultUpsertProvider = (typeof VAULT_UPSERT_PROVIDERS)[number];

export const INTEGRATION_PAYLOAD_SCHEMAS = {
  zendesk: ZendeskCredentialSchema,
  ecwid: EcwidCredentialSchema,
  shipstation: ShipStationCredentialSchema,
  ups: UpsCredentialSchema,
  fedex: FedexCredentialSchema,
  usps: UspsCredentialSchema,
  google_sheets: GoogleSheetsCredentialSchema,
  nextiva: NextivaCredentialSchema,
  ollama: OllamaCredentialSchema,
  ai_gateway: AiGatewayCredentialSchema,
  openai: OpenAiCredentialSchema,
  anthropic: AnthropicCredentialSchema,
  stripe: StripeCredentialSchema,
  ably: AblyCredentialSchema,
  square: NangoMarkerSchema,
} as const satisfies Partial<Record<IntegrationProvider, z.ZodType>>;

/** Fields treated as secrets — blank on update means "keep existing". */
export const CREDENTIAL_SECRET_KEYS: Partial<Record<IntegrationProvider, readonly string[]>> = {
  zendesk: ['apiToken'],
  ecwid: ['apiToken'],
  shipstation: ['apiKey', 'v1ApiKey', 'v1ApiSecret', 'webhookSecret'],
  ups: ['clientSecret', 'webhookSecret'],
  fedex: ['clientSecret'],
  usps: ['consumerSecret'],
  google_sheets: ['privateKey'],
  nextiva: ['apiKey', 'refreshToken', 'accessToken', 'webhookSigningSecret'],
  ollama: ['apiKey'],
  ai_gateway: ['apiKey'],
  openai: ['apiKey'],
  anthropic: ['apiKey'],
  stripe: ['secretKey', 'webhookSecret'],
  ably: ['apiKey'],
};

export function getCredentialSchema(provider: IntegrationProvider): z.ZodType | undefined {
  return INTEGRATION_PAYLOAD_SCHEMAS[provider as keyof typeof INTEGRATION_PAYLOAD_SCHEMAS];
}

export function secretKeysForProvider(provider: IntegrationProvider): readonly string[] {
  return CREDENTIAL_SECRET_KEYS[provider] ?? [];
}

export function isVaultUpsertProvider(provider: string): provider is VaultUpsertProvider {
  return (VAULT_UPSERT_PROVIDERS as readonly string[]).includes(provider);
}

export interface ParsePayloadResult {
  ok: true;
  payload: Record<string, unknown>;
}

export interface ParsePayloadError {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Validate a credential payload. When `partial` is true, secret fields are
 * optional (blank secrets are stripped before merge on the server).
 */
export function parseIntegrationPayloadInput(
  provider: IntegrationProvider,
  raw: unknown,
  options: { partial?: boolean } = {},
): ParsePayloadResult | ParsePayloadError {
  const schema = getCredentialSchema(provider);
  if (!schema) {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      return { ok: true, payload: raw as Record<string, unknown> };
    }
    return { ok: false, error: `No schema for provider "${provider}"` };
  }

  let input = raw;
  if (options.partial && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const cleaned: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    for (const key of secretKeysForProvider(provider)) {
      const v = cleaned[key];
      if (v === '' || v === null || v === undefined) delete cleaned[key];
    }
    input = cleaned;
  }

  const activeSchema = options.partial ? makePartialSchema(provider, schema) : schema;
  const result = activeSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root';
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? 'Invalid credentials',
      fieldErrors,
    };
  }

  return { ok: true, payload: result.data as Record<string, unknown> };
}

function makePartialSchema(provider: IntegrationProvider, schema: z.ZodType): z.ZodType {
  if (!(schema instanceof z.ZodObject)) return schema;
  const secretKeys = new Set(secretKeysForProvider(provider));
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const partialShape: Record<string, z.ZodTypeAny> = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    partialShape[key] = secretKeys.has(key) ? fieldSchema.optional() : fieldSchema;
  }
  return z.object(partialShape);
}
