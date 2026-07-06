import { readFile, writeFile } from 'node:fs/promises';
import { requireGeminiKey } from './config.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-generate-preview';

function mimeTypeFromPath(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function apiFetch(path, apiKey, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Veo API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Gera um clipe de vídeo (até 8s) animando uma imagem de cena, a partir de um prompt.
 * Retorna o caminho do arquivo .mp4 salvo em disco.
 */
export async function generateVideoClip({
  imagePath,
  prompt,
  outputPath,
  aspectRatio = '9:16',
  resolution = '1080p',
  durationSeconds = '8',
}) {
  const apiKey = requireGeminiKey();
  const imageBuffer = await readFile(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const startRes = await apiFetch(`/models/${MODEL}:predictLongRunning`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      instances: [
        {
          prompt,
          image: { inlineData: { mimeType: mimeTypeFromPath(imagePath), data: imageBase64 } },
        },
      ],
      parameters: {
        aspectRatio,
        resolution,
        durationSeconds,
      },
    }),
  });

  const operationName = startRes.name;
  if (!operationName) {
    throw new Error(`Resposta inesperada da Veo API: ${JSON.stringify(startRes)}`);
  }

  let operation = startRes;
  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    operation = await apiFetch(`/${operationName}`, apiKey);
  }

  if (operation.error) {
    throw new Error(`Veo generation falhou: ${JSON.stringify(operation.error)}`);
  }

  const sample = operation.response?.generateVideoResponse?.generatedSamples?.[0];
  const videoUri = sample?.video?.uri;
  if (!videoUri) {
    throw new Error(`Nenhum vídeo retornado: ${JSON.stringify(operation.response)}`);
  }

  const videoRes = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
  if (!videoRes.ok) {
    throw new Error(`Falha ao baixar vídeo gerado: ${videoRes.status}`);
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  await writeFile(outputPath, videoBuffer);
  return outputPath;
}
