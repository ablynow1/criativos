import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} no .env (veja .env.example)`);
  }
  return value;
}

export const config = {
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || '',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  googleServiceAccountFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'service-account.json',
  veoModel: process.env.VEO_MODEL || 'veo-3.1-generate-001',
  ttsVoiceName: process.env.TTS_VOICE_NAME || 'pt-BR-Neural2-C',
  ttsLanguageCode: process.env.TTS_LANGUAGE_CODE || 'pt-BR',
};

export function requireProjectId() {
  return config.googleCloudProject || required('GOOGLE_CLOUD_PROJECT');
}
