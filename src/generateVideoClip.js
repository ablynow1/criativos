import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';
import { runFfmpeg } from './ffmpeg.js';

function baseUrl() {
  return `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1`;
}

function modelPath() {
  const project = requireProjectId();
  return `projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${config.veoModel}`;
}

// A Vertex AI só aceita JPEG ou PNG — outros formatos (webp, etc) precisam converter antes.
async function ensureSupportedImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    return { path: imagePath, mimeType: ext === '.png' ? 'image/png' : 'image/jpeg' };
  }
  const convertedPath = path.join(os.tmpdir(), `${path.basename(imagePath, ext)}-${Date.now()}.png`);
  await runFfmpeg(['-i', imagePath, convertedPath]);
  return { path: convertedPath, mimeType: 'image/png' };
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
  ambiente = true, // áudio nativo do Veo (som ambiente/SFX que casa com a cena)
}) {
  const accessToken = await getAccessToken();
  const supportedImage = await ensureSupportedImage(imagePath);
  const imageBuffer = await readFile(supportedImage.path);
  const imageBase64 = imageBuffer.toString('base64');

  const startRes = await vertexFetch(`${modelPath()}:predictLongRunning`, accessToken, {
    instances: [
      {
        prompt,
        image: { bytesBase64Encoded: imageBase64, mimeType: supportedImage.mimeType },
      },
    ],
    parameters: {
      aspectRatio,
      resolution,
      durationSeconds,
      sampleCount: 1,
      generateAudio: ambiente !== false,
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
    // Bloqueio de CONTEÚDO na imagem de ENTRADA (ex: rosto/pessoa sensível — código 3
    // "blocked by your current safety settings for person/face generation"). É recusa
    // de política do Google, não erro de infra — mesmo tratamento do bloqueio de saída:
    // cai pro Ken Burns em vez de derrubar o job. Erros de infra (rede, quota, auth)
    // NÃO batem nesse padrão e continuam falhando o job normalmente (não mascarar bug real).
    const isSafetyBlock = /safety|blocked|face generation|person generation/i.test(operation.error.message || '');
    const err = new Error(`Veo generation falhou: ${JSON.stringify(operation.error)}`);
    if (isSafetyBlock) err.code = 'VEO_RAI_BLOCKED';
    throw err;
  }

  // Filtro de segurança (RAI) do Veo bloqueou a geração — erro com código pro fallback.
  if (operation.response?.raiMediaFilteredCount > 0) {
    const motivo = (operation.response.raiMediaFilteredReasons || []).join(' ');
    const err = new Error(
      `Veo BLOQUEOU o vídeo pelo filtro de conteúdo do Google (política de segurança). ` +
      `Causa comum: imagem com CRIANÇA/menor, ou rosto/cena sensível. Não foi cobrado. [${motivo.slice(0, 200)}]`
    );
    err.code = 'VEO_RAI_BLOCKED';
    throw err;
  }

  const prediction = operation.response?.predictions?.[0] || operation.response?.videos?.[0];
  const videoBase64 = prediction?.bytesBase64Encoded;
  if (!videoBase64) {
    throw new Error(`Nenhum vídeo retornado pelo Veo: ${JSON.stringify(operation.response).slice(0, 300)}`);
  }

  await writeFile(outputPath, Buffer.from(videoBase64, 'base64'));
  return outputPath;
}
