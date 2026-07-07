import { writeFile } from 'node:fs/promises';
import { config } from './config.js';
import { getAccessToken } from './googleAuth.js';

// v1beta1 (não v1): enableTimePointing só existe nessa versão da API.
const TTS_URL = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Monta SSML com uma <mark> antes de cada palavra, pra Cloud TTS devolver
 * o timestamp exato de cada palavra (timepointing).
 */
function buildSsml(text) {
  const words = text.trim().split(/\s+/);
  const marked = words
    .map((word, i) => `<mark name="w${i}"/>${escapeXml(word)}`)
    .join(' ');
  return { ssml: `<speak>${marked}</speak>`, words };
}

/**
 * Gera a narração em áudio a partir de um texto, com timestamps por palavra.
 * Retorna { audioPath, wordTimings: [{ word, startSeconds }] }
 */
export async function generateNarration({ text, outputAudioPath, voiceName }) {
  const accessToken = await getAccessToken();
  const { ssml, words } = buildSsml(text);

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: config.ttsLanguageCode, name: voiceName || config.ttsVoiceName },
      audioConfig: { audioEncoding: 'MP3' },
      enableTimePointing: ['SSML_MARK'],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloud TTS API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const audioBuffer = Buffer.from(data.audioContent, 'base64');
  await writeFile(outputAudioPath, audioBuffer);

  const timepoints = data.timepoints || [];
  const timeByMark = new Map(timepoints.map((t) => [t.markName, t.timeSeconds]));
  const wordTimings = words.map((word, i) => ({
    word,
    startSeconds: timeByMark.get(`w${i}`) ?? null,
  }));

  return { audioPath: outputAudioPath, wordTimings };
}
