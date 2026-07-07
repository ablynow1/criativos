import { writeFile } from 'node:fs/promises';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-2.5-flash-image';

/**
 * Gera uma imagem contextual do produto (retrato 9:16) via modelo de imagem
 * do Gemini na Vertex AI. Retorna o caminho do PNG salvo.
 */
export async function generateProductImage({ prompt, outputPath }) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${IMAGE_MODEL}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt}\n\nVertical portrait format, 9:16 aspect ratio.` }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '9:16' },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Geração de imagem (${IMAGE_MODEL}) ${res.status}: ${body}`);
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
