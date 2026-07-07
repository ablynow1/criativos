import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';

function mimeOf(p) {
  const e = path.extname(p).toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  return 'image/png';
}

/**
 * Image-to-image via Nano Banana (gemini-2.5-flash-image) na Vertex AI.
 * Passa uma ou mais imagens de referência + um prompt de texto; devolve o PNG gerado.
 * Usado pra "foto -> óleo" (retrato do produto) e pra compor cena a partir da arte.
 */
export async function img2img({ inputPaths, prompt, outputPath, aspectRatio = '3:4' }) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${IMAGE_MODEL}:generateContent`;

  const paths = Array.isArray(inputPaths) ? inputPaths : [inputPaths];
  const imageParts = [];
  for (const p of paths) {
    const buf = await readFile(p);
    imageParts.push({ inlineData: { mimeType: mimeOf(p), data: buf.toString('base64') } });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`img2img (${IMAGE_MODEL}) ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    throw new Error(`Nenhuma imagem retornada: ${JSON.stringify(data).slice(0, 500)}`);
  }
  await writeFile(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));
  return outputPath;
}
