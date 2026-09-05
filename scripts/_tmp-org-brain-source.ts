import { resolveOrgAnthropicBrain } from '@/lib/ai/org-provider';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
(async () => {
  const ORG = '00000000-0000-0000-0000-000000000001' as never;
  const brain = await resolveOrgAnthropicBrain(ORG);
  console.log('brain source:', brain?.source ?? null, 'model:', brain?.model ?? null, 'keyTail:', brain?.apiKey.slice(-6));
  const grok = await getIntegrationCredentials(ORG, 'grok' as never).catch((e) => `err ${e}`);
  console.log('grok creds present:', !!grok && typeof grok === 'object');
  process.exit(0);
})();
