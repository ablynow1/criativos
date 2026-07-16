import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

// Olha a FOTO de uma moldura (biblioteca do Estúdio de Quadros) e devolve a
// descrição canônica em inglês pra injetar nos prompts dos keyframes. A foto
// também entra como referência img2img (fidelidade visual); a descrição serve
// pro texto do prompt reforçar o que o modelo deve copiar (perfil, cor,
// material, ornamento) — o mesmo padrão do kraft-texture→K12.

const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

function mimeOf(p) {
  const e = path.extname(p).toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  return 'image/png';
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nome: {
      type: 'STRING',
      description: 'Rótulo curto da moldura em pt-BR pra biblioteca (ex: "Dourada ornamentada", "Preta fina fosca", "Madeira clara"). Máx 26 caracteres.',
    },
    moldura: {
      type: 'STRING',
      description: 'Descrição em INGLÊS da moldura como sintagma nominal começando com artigo, encaixável em "Only the ___ around it": perfil (fino/largo/escalonado), material, acabamento, cor e ornamento. Ex: "an ornate antique gold moulding with carved floral relief". Uma frase curta.',
    },
  },
  required: ['nome', 'moldura'],
};

/**
 * @param {string} imagePath foto da moldura (de frente ou em ângulo)
 * @returns {Promise<{nome:string, moldura:string}>}
 */
export async function describeMoldura(imagePath) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const buf = await readFile(imagePath);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mimeOf(imagePath), data: buf.toString('base64') } },
          { text: 'Esta foto mostra uma MOLDURA de quadro (pode estar em ângulo, com ou sem arte dentro). Descreva SÓ a moldura (perfil, material, acabamento, cor, ornamento) nos campos pedidos. Ignore a arte/conteúdo interno e o fundo.' },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini vision (moldura) ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Resposta inesperada do Gemini: ${JSON.stringify(data).slice(0, 400)}`);
  return JSON.parse(text);
}
