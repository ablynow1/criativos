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
  // Imagem: Nano Banana Pro (Gemini 3) = o mais fotorrealista. Só existe na location "global".
  imageModel: process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview',
  imageLocation: process.env.IMAGE_LOCATION || 'global',
  ttsVoiceName: process.env.TTS_VOICE_NAME || 'pt-BR-Neural2-C',
  ttsLanguageCode: process.env.TTS_LANGUAGE_CODE || 'pt-BR',
};

export function requireProjectId() {
  return config.googleCloudProject || required('GOOGLE_CLOUD_PROJECT');
}

/** URL do modelo de imagem (Gemini/Vertex). location "global" usa o host sem prefixo de região. */
export function imageModelUrl() {
  const project = requireProjectId();
  const loc = config.imageLocation;
  const host = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${config.imageModel}:generateContent`;
}
