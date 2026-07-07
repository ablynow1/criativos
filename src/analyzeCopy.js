import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    produto: { type: 'STRING', description: 'Nome/descrição curta do produto vendido na LP' },
    publicoAlvo: { type: 'STRING', description: 'Quem compra: gênero, idade, dor, desejo' },
    tom: { type: 'STRING', description: 'Tom da comunicação da marca (ex: emocional, urgente, premium)' },
    narracao: {
      type: 'STRING',
      description: 'Narração pro criativo de vídeo, 8-11 segundos falados (~25-35 palavras), em pt-BR, direta, no tom da LP, com CTA implícito',
    },
    voz: {
      type: 'STRING',
      description: 'Voz do Cloud TTS que combina com o público: pt-BR-Wavenet-B ou pt-BR-Neural2-B (masculinas), pt-BR-Neural2-C ou pt-BR-Wavenet-A (femininas)',
    },
    imagemPrompt: {
      type: 'STRING',
      description: 'Prompt em inglês pra gerar UMA imagem fotorrealista contextual do produto em uso pelo público-alvo, formato retrato 9:16, cena emocional que vende o benefício',
    },
    cenas: {
      type: 'ARRAY',
      description: 'Exatamente 2 cenas de vídeo animando a imagem gerada',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description: 'Prompt em inglês pro Veo: movimento de câmera + ação sutil dos personagens + luz, cinematográfico, photorealistic',
          },
        },
        required: ['prompt'],
      },
    },
  },
  required: ['produto', 'publicoAlvo', 'tom', 'narracao', 'voz', 'imagemPrompt', 'cenas'],
};

/**
 * Analisa a copy de uma LP e devolve o briefing do criativo:
 * produto, público, narração no tom certo, voz, prompt de imagem e cenas.
 */
export async function analyzeCopy(scraped) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const copyText = (scraped.textContent || '').slice(0, 20_000);
  const prompt = `Você é um diretor criativo sênior de resposta direta pra Meta Ads.
Analise a copy desta landing page e monte o briefing de UM criativo em vídeo 9:16 (Reels).

URL: ${scraped.url}
Título: ${scraped.title || scraped.ogTitle || '(sem título)'}
Descrição: ${scraped.metaDescription || scraped.ogDescription || '(sem descrição)'}

COPY COMPLETA DA PÁGINA:
${copyText}

Regras:
- A narração deve soar como um anúncio nativo de Reels falado em pt-BR, não como texto lido.
- A narração deve ter entre 25 e 35 palavras (8 a 11 segundos falados).
- O imagemPrompt deve mostrar o produto no contexto de uso do público-alvo, emocional, vendendo o benefício central da copy.
- As 2 cenas animam essa MESMA imagem: cena 1 foca no produto/benefício, cena 2 fecha na emoção das pessoas.`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini (Vertex) ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Resposta inesperada do Gemini: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return JSON.parse(text);
}
