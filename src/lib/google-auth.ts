import { JWT } from 'google-auth-library';
import { normalizeEnvValue, normalizeMultilineEnvValue } from '@/lib/env-utils';

export interface GoogleServiceAccountCredentials {
    clientEmail: string;
    privateKey: string;
}

export function getGoogleAuth(credentials: GoogleServiceAccountCredentials) {
    if (!credentials.clientEmail || !credentials.privateKey) {
        throw new Error('Missing Google service-account credentials');
    }

    const clientEmail = normalizeEnvValue(credentials.clientEmail);
    const normalizedPrivateKey = normalizeMultilineEnvValue(credentials.privateKey);

    return new JWT({
        email: clientEmail,
        key: normalizedPrivateKey,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly',
        ],
    });
}
