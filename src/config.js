import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name} no .env (veja .env.example)`);
  }
  return value;
}

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  ttsApiKey: process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || '',
  ttsVoiceName: process.env.TTS_VOICE_NAME || 'pt-BR-Chirp3-HD-Achernar',
  ttsLanguageCode: process.env.TTS_LANGUAGE_CODE || 'pt-BR',
};

export function requireGeminiKey() {
  return config.geminiApiKey || required('GEMINI_API_KEY');
}

export function requireTtsKey() {
  return config.ttsApiKey || required('GOOGLE_TTS_API_KEY');
}
