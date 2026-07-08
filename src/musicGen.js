import { writeFile } from 'node:fs/promises';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

const LYRIA_MODEL = process.env.MUSIC_MODEL || 'lyria-002';

/**
 * Trilhas por "mood" — prompts calibrados pra fundo de anúncio DR:
 * instrumental, sem vocal (vocal brigaria com a narração), com arco emocional.
 */
export const MUSIC_MOODS = {
  emocional:
    'warm emotional cinematic piano with soft strings, heartfelt and intimate, gentle build with a hopeful swell, tasteful and modern, instrumental only',
  energetica:
    'upbeat energetic modern pop-electronic advertising track, punchy percussion, bright plucks and synths, confident and motivational, instrumental only',
  epica:
    'epic cinematic orchestral build, powerful taiko drums, inspiring strings and brass, goosebumps trailer energy, instrumental only',
  suave:
    'soft acoustic guitar with warm ambient pads, calm cozy premium mood, minimal and elegant, instrumental only',
  misteriosa:
    'mysterious atmospheric pulse, deep soft synth bass, sparse celestial textures, intriguing and cinematic, instrumental only',
};

/**
 * Gera uma trilha instrumental (~30s WAV 48kHz) via Lyria na Vertex AI.
 * `mood` é uma chave de MUSIC_MOODS ou um prompt livre em inglês.
 * Retorna o caminho do WAV salvo.
 */
export async function generateMusic({ mood = 'emocional', outputPath }) {
  const prompt = MUSIC_MOODS[mood] || mood;
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/${LYRIA_MODEL}:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt, negative_prompt: 'vocals, singing, lyrics, voice' }],
      parameters: {},
    }),
  });
  if (!res.ok) {
    throw new Error(`Lyria (${LYRIA_MODEL}) ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded || data.predictions?.[0]?.audioContent;
  if (!b64) {
    throw new Error(`Lyria sem áudio na resposta: ${JSON.stringify(data).slice(0, 300)}`);
  }
  await writeFile(outputPath, Buffer.from(b64, 'base64'));
  return outputPath;
}
