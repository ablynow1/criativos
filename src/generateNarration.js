import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';
import { getDurationSeconds, runFfmpeg } from './ffmpeg.js';

// v1beta1 (não v1): enableTimePointing só existe nessa versão da API.
const TTS_URL = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

/**
 * 3 gerações de voz, roteadas pelo nome:
 *  - "pt-BR-Neural2-*" / "pt-BR-Wavenet-*"  → clássicas (aceitam <mark> SSML = timestamp exato)
 *  - "pt-BR-Chirp3-HD-*"                    → Chirp 3 HD (muito mais natural; sem marks)
 *  - "gemini-tts:<Voz>"                     → Gemini-TTS (a mais humana; aceita DIREÇÃO de atuação)
 * Pras vozes sem marks, a legenda é alinhada via STT (se habilitado) ou por
 * mapa proporcional (timings do mesmo texto em Neural2, escalados pra duração real).
 */
export function voiceKind(voiceName = '') {
  if (voiceName.startsWith('gemini-tts:')) return 'gemini';
  if (/Chirp3/i.test(voiceName)) return 'chirp';
  return 'marks';
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSsml(text) {
  const words = text.trim().split(/\s+/);
  const marked = words.map((word, i) => `<mark name="w${i}"/>${escapeXml(word)}`).join(' ');
  return { ssml: `<speak>${marked}</speak>`, words };
}

// ---------- caminho clássico: SSML marks → timestamps exatos ----------
async function synthWithMarks({ text, voiceName, outputAudioPath, accessToken }) {
  const { ssml, words } = buildSsml(text);
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: config.ttsLanguageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3' },
      enableTimePointing: ['SSML_MARK'],
    }),
  });
  if (!res.ok) throw new Error(`Cloud TTS ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (outputAudioPath) await writeFile(outputAudioPath, Buffer.from(data.audioContent, 'base64'));
  const timeByMark = new Map((data.timepoints || []).map((t) => [t.markName, t.timeSeconds]));
  return words.map((word, i) => ({ word, startSeconds: timeByMark.get(`w${i}`) ?? null }));
}

// ---------- Chirp 3 HD: texto puro, sem marks ----------
async function synthChirp({ text, voiceName, outputAudioPath, accessToken }) {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: config.ttsLanguageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`Cloud TTS (Chirp) ${res.status}: ${await res.text()}`);
  const data = await res.json();
  await writeFile(outputAudioPath, Buffer.from(data.audioContent, 'base64'));
}

// ---------- Gemini-TTS: voz dirigível por instrução de atuação ----------
async function synthGemini({ text, voiceName, direcao, outputAudioPath, accessToken }) {
  const project = requireProjectId();
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-pro-tts';
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  const voz = voiceName.split(':')[1] || 'Charon';
  const instrucao = (direcao || 'Fale em português do Brasil de forma natural e humana, como uma pessoa real contando algo pra um amigo — ritmo conversacional, emoção genuína, sem tom de locutor.').trim();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${instrucao}\n\nTexto a falar (diga EXATAMENTE estas palavras, nada além delas): ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini-TTS ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`Gemini-TTS sem áudio: ${JSON.stringify(data).slice(0, 300)}`);
  // vem PCM L16 24kHz — converte pra MP3
  const rate = part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] || '24000';
  const rawPath = path.join(os.tmpdir(), `gtts-${Date.now()}.raw`);
  await writeFile(rawPath, Buffer.from(part.inlineData.data, 'base64'));
  await runFfmpeg(['-f', 's16le', '-ar', rate, '-ac', '1', '-i', rawPath, '-b:a', '192k', outputAudioPath]);
  await unlink(rawPath).catch(() => {});
}

// ---------- alinhamento pra vozes sem marks ----------
async function alignBySTT({ audioPath, accessToken }) {
  const mp3 = await readFile(audioPath);
  const res = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      config: { languageCode: config.ttsLanguageCode, enableWordTimeOffsets: true, encoding: 'MP3', sampleRateHertz: 24000 },
      audio: { content: mp3.toString('base64') },
    }),
  });
  if (!res.ok) throw new Error(`STT ${res.status}`);
  const data = await res.json();
  const words = (data.results || []).flatMap((r) => r.alternatives?.[0]?.words || []);
  if (!words.length) throw new Error('STT sem palavras');
  return words.map((w) => ({ word: w.word, startSeconds: parseFloat(String(w.startTime).replace('s', '')) || 0 }));
}

/**
 * Fallback sem STT: pega o RITMO do mesmo texto falado pela Neural2 (marks exatos)
 * e escala os timestamps pra duração real do áudio da voz nova. O SRT agrupa
 * 3-4 palavras por bloco, então o erro residual fica imperceptível.
 */
async function alignByProportion({ text, audioPath, accessToken }) {
  const refTimings = await synthWithMarks({ text, voiceName: 'pt-BR-Neural2-B', outputAudioPath: null, accessToken });
  const realDur = await getDurationSeconds(audioPath);
  const refLast = refTimings.filter((t) => t.startSeconds !== null).at(-1)?.startSeconds || 1;
  const refDur = refLast * 1.06 + 0.35; // estimativa do fim da fala de referência
  const scale = realDur / refDur;
  return refTimings.map((t) => ({ word: t.word, startSeconds: t.startSeconds === null ? null : t.startSeconds * scale }));
}

/**
 * Gera a narração em áudio a partir de um texto, com timestamps por palavra.
 * `direcao` (opcional) só se aplica a vozes gemini-tts: instrução de atuação.
 * Retorna { audioPath, wordTimings: [{ word, startSeconds }] }
 */
export async function generateNarration({ text, outputAudioPath, voiceName, direcao }) {
  const accessToken = await getAccessToken();
  const voice = voiceName || config.ttsVoiceName;
  const kind = voiceKind(voice);

  if (kind === 'marks') {
    const wordTimings = await synthWithMarks({ text, voiceName: voice, outputAudioPath, accessToken });
    return { audioPath: outputAudioPath, wordTimings };
  }

  if (kind === 'chirp') await synthChirp({ text, voiceName: voice, outputAudioPath, accessToken });
  else await synthGemini({ text, voiceName: voice, direcao, outputAudioPath, accessToken });

  // legenda: tenta STT (timestamps reais); sem STT habilitado, cai pro mapa proporcional
  let wordTimings;
  try {
    wordTimings = await alignBySTT({ audioPath: outputAudioPath, accessToken });
    // STT transcreve o que OUVIU — remapeia pros palavras originais se a contagem bater razoavelmente
    const original = text.trim().split(/\s+/);
    if (Math.abs(wordTimings.length - original.length) <= Math.ceil(original.length * 0.2)) {
      const n = Math.min(wordTimings.length, original.length);
      wordTimings = original.map((word, i) => ({
        word,
        startSeconds: i < n ? wordTimings[Math.round((i * (wordTimings.length - 1)) / Math.max(1, original.length - 1))].startSeconds : null,
      }));
    }
  } catch {
    wordTimings = await alignByProportion({ text, audioPath: outputAudioPath, accessToken });
  }
  return { audioPath: outputAudioPath, wordTimings };
}
