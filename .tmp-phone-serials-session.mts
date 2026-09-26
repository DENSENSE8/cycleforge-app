import { createSession, revokeSession } from '@/lib/auth/session';

const [cmd, sid] = process.argv.slice(2);
if (cmd === 'revoke' && sid) {
  await revokeSession(sid);
  console.log('revoked', sid);
} else {
  const s = await createSession({ staffId: 19576, deviceKind: 'phone', deviceLabel: 'PhoneSerials smoke' });
  console.log(JSON.stringify({ sid: s.sid, org: s.organizationId }));
}
process.exit(0);
