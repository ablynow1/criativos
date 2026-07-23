import { writeFile } from 'node:fs/promises';
import { config, imageModelUrl } from './config.js';
import { getAccessToken } from './googleAuth.js';

// Resposta sem imagem tem duas naturezas MUITO diferentes: bloqueio de
// política (RAI) é determinístico — retentar queima render à toa (eram até 3
// retries + 6s de espera por keyframe bloqueado); resposta vazia comum é
// transitória e merece retry. O e.code separa os dois pros retriers.
export function extraiImagem(data, rotulo) {
  const cand = data.candidates?.[0];
  const imagePart = (cand?.content?.parts || []).find((p) => p.inlineData?.data);
  if (imagePart) return imagePart;
  const block = data.promptFeedback?.blockReason
    || (['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'RECITATION', 'BLOCKLIST']
      .includes(cand?.finishReason) ? cand.finishReason : null);
  if (block) {
    const e = new Error(`${rotulo}: bloqueio de política (${block}) — retentar não resolve, mude o prompt/cena`);
    e.code = 'IMG_RAI_BLOCKED';
    throw e;
  }
  throw new Error(`${rotulo}: nenhuma imagem retornada: ${JSON.stringify(data).slice(0, 400)}`);
}

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
        imageConfig: { aspectRatio: '9:16', imageSize: config.imageSize },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Geração de imagem ${res.status}: ${body}`);
  }

  const imagePart = extraiImagem(await res.json(), 'Geração de imagem');
  await writeFile(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));
  return outputPath;
}
