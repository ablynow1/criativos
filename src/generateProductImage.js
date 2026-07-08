import { writeFile } from 'node:fs/promises';
import { imageModelUrl } from './config.js';
import { getAccessToken } from './googleAuth.js';

/**
 * Gera uma imagem contextual do produto (retrato 9:16) via modelo de imagem
 * do Gemini na Vertex AI (Nano Banana Pro por padrão). Retorna o caminho do PNG.
 */
export async function generateProductImage({ prompt, outputPath }) {
  const accessToken = await getAccessToken();
  const url = imageModelUrl();

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
    throw new Error(`Geração de imagem ${res.status}: ${body}`);
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
