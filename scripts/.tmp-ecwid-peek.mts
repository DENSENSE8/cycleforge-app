import { getIntegrationCredentials, type EcwidCredentials } from '../src/lib/integrations/credentials';
import { fetchEcwidCanonicalOrders } from '../src/lib/orders/sources/ecwid-orders';
const org = '00000000-0000-0000-0000-000000000001' as any;
const v = await getIntegrationCredentials<EcwidCredentials>(org, 'ecwid');
console.log('vault', !!v?.storeId, !!v?.apiToken);
const lines = await fetchEcwidCanonicalOrders(v?.storeId && v?.apiToken ? { storeId: v.storeId, token: v.apiToken } : undefined, { allowEnvFallback: true });
console.log('lines', lines.length, 'orders', new Set(lines.map(l=>l.externalOrderId)).size);
for (const l of lines) if (+l.externalOrderId>=5060) console.log(l.externalOrderId, l.sku, l.quantity, l.saleAmount, JSON.stringify(l.productTitle).slice(0,50), l.trackings, l.orderDate?.toISOString(), l.notes?.slice(0,30), l.buyer?.channelCustomerId);
process.exit(0);
