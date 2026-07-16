import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

// Reescreve a narração base com um GANCHO diferente — usada com `audio.variar`
// no lote de mockups: cada job chama isto de forma independente (temperatura
// alta ⇒ cada vídeo sai com uma abertura/ângulo próprio), então um lote de N
// artes vira N criativos com copies distintas pra teste A/B de verdade.
// A promessa/oferta do texto base NUNCA muda — só o ângulo de entrada e a ordem.

const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    narracao: {
      type: 'STRING',
      description: 'A narração reescrita, em pt-BR falado natural, mesma duração aproximada do texto base.',
    },
    angulo: { type: 'STRING', description: 'Rótulo curto do ângulo usado (ex: "pergunta", "dor", "prova", "curiosidade").' },
  },
  required: ['narracao', 'angulo'],
};

/**
 * @param {{base:string, duracaoAlvo?:number}} input
 * @returns {Promise<{narracao:string, angulo:string}>}
 */
export async function variarNarracao({ base, duracaoAlvo = 25 }) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
  const palavras = duracaoAlvo <= 16 ? '30-40' : duracaoAlvo <= 26 ? '55-70' : '65-85';

  const prompt = `Você é um copywriter sênior de resposta direta pra anúncios de vídeo no Meta (Reels).
Reescreva a narração abaixo com um GANCHO DE ABERTURA DIFERENTE (sorteie um ângulo: pergunta direta, dor/incômodo, curiosidade, prova/resultado, história-relâmpago, comando). Mantenha:
- a MESMA oferta/promessa e o mesmo produto (não invente benefício novo, não invente preço/desconto);
- pt-BR falado natural (como gente fala, não como texto lido);
- ${palavras} palavras (o vídeo tem ${duracaoAlvo}s);
- um fechamento com comando claro (CTA implícito ou explícito).
Proibido: "à mão", "feito à mão", emojis, hashtags, jargão de IA.

NARRAÇÃO BASE:
${base}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 1.0,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini (variação de copy) ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Resposta inesperada do Gemini: ${JSON.stringify(data).slice(0, 400)}`);
  return JSON.parse(text);
}
