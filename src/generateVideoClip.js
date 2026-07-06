import { readFile, writeFile } from 'node:fs/promises';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

function baseUrl() {
  return `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1`;
}

function modelPath() {
  const project = requireProjectId();
  return `projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${config.veoModel}`;
}

function mimeTypeFromPath(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function vertexFetch(path, accessToken, body) {
  const res = await fetch(`${baseUrl()}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Vertex AI ${res.status}: ${errBody}`);
  }
  return res.json();
}

/**
 * Gera um clipe de vídeo (até 8s) animando uma imagem de cena, via Veo na Vertex AI.
 * Autentica com OAuth2 (service account) — fatura na conta de billing do projeto GCP.
 * Retorna o caminho do arquivo .mp4 salvo em disco.
 */
export async function generateVideoClip({
  imagePath,
  prompt,
  outputPath,
  aspectRatio = '9:16',
  resolution = '1080p',
  durationSeconds = 8,
}) {
  const accessToken = await getAccessToken();
  const imageBuffer = await readFile(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const startRes = await vertexFetch(`${modelPath()}:predictLongRunning`, accessToken, {
    instances: [
      {
        prompt,
        image: { bytesBase64Encoded: imageBase64, mimeType: mimeTypeFromPath(imagePath) },
      },
    ],
    parameters: {
      aspectRatio,
      resolution,
      durationSeconds,
      sampleCount: 1,
    },
  });

  const operationName = startRes.name;
  if (!operationName) {
    throw new Error(`Resposta inesperada da Vertex AI: ${JSON.stringify(startRes)}`);
  }

  let operation = { done: false };
  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    operation = await vertexFetch(`${modelPath()}:fetchPredictOperation`, accessToken, {
      operationName,
    });
  }

  if (operation.error) {
    throw new Error(`Veo generation falhou: ${JSON.stringify(operation.error)}`);
  }

  const prediction = operation.response?.predictions?.[0] || operation.response?.videos?.[0];
  const videoBase64 = prediction?.bytesBase64Encoded;
  if (!videoBase64) {
    throw new Error(`Nenhum vídeo retornado: ${JSON.stringify(operation.response)}`);
  }

  await writeFile(outputPath, Buffer.from(videoBase64, 'base64'));
  return outputPath;
}
