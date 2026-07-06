import { existsSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { config } from './config.js';

let cachedAuth = null;

function getAuth() {
  if (!cachedAuth) {
    if (!existsSync(config.googleServiceAccountFile)) {
      throw new Error(
        `Não achei o arquivo de service account em "${config.googleServiceAccountFile}". ` +
        `Crie uma service account no projeto GCP, baixe a chave JSON e salve nesse caminho ` +
        `(ou aponte GOOGLE_APPLICATION_CREDENTIALS no .env pra outro caminho).`
      );
    }
    cachedAuth = new GoogleAuth({
      keyFile: config.googleServiceAccountFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return cachedAuth;
}

/**
 * Retorna um access token OAuth2 válido, obtido a partir da service account.
 * Usado pelas APIs do Google Cloud que não aceitam API key (ex: Cloud Text-to-Speech).
 */
export async function getAccessToken() {
  const auth = getAuth();
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}
