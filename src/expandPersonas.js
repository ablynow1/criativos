import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

// Gera N PERSONAS DISTINTAS de uma descrição só — o coração da produção em
// massa de cenários. Uma chamada única devolve o conjunto inteiro (o modelo
// enxerga todas de uma vez ⇒ diversidade GARANTIDA; N chamadas separadas
// convergiriam pra avatares parecidos). Cada persona segue as mesmas regras
// do expandCenario (avatar rico e estável = identidade travada no img2img).

const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const PERSONA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    personas: {
      type: 'ARRAY',
      description: 'Exatamente N personas, todas CLARAMENTE diferentes entre si.',
      items: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING', description: 'Rótulo curto pt-BR "Ambiente · Avatar" (ex: "Galeria clara · Morena 40s"). Máx 34 chars.' },
          avatar: { type: 'STRING', description: 'Descrição EN da pessoa, específica e repetível (idade, cabelo cor/comprimento/textura, pele/etnia, maquiagem, unhas, roupa exata). Uma frase densa, sem ponto final.' },
          ambiente: { type: 'STRING', description: 'Descrição EN do espaço (tipo, piso, luz, período, fundo), rico e cinematográfico, uma frase, sem ponto final. Plausível pra exibir um quadro grande emoldurado.' },
          moldura: { type: 'STRING', description: 'Sintagma nominal EN com artigo, encaixável em "Only the ___ around it".' },
        },
        required: ['nome', 'avatar', 'ambiente', 'moldura'],
      },
    },
  },
  required: ['personas'],
};

/**
 * @param {{descricao?:string, avatarText?:string, ambienteText?:string, molduraText?:string,
 *          n:number, diversificar?:'avatar'|'ambiente'|'ambos'}} input
 *   `diversificar` controla O QUE muda entre as personas:
 *   - 'avatar'  (default): mesmo tipo de ambiente, modelos bem diferentes
 *   - 'ambiente': mesma pessoa (descrita 1x, repetida idêntica), lugares diferentes
 *   - 'ambos':   tudo diferente — máxima variedade pro teste de criativo
 * @returns {Promise<Array<{nome:string, avatar:string, ambiente:string, moldura:string}>>}
 */
export async function expandPersonas(input) {
  const n = Math.max(2, Math.min(4, Number(input.n) || 2));
  const div = input.diversificar || 'avatar';
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const partes = [];
  if (input.descricao) partes.push(`Descrição geral: ${input.descricao}`);
  if (input.avatarText) partes.push(`Avatar base: ${input.avatarText}`);
  if (input.ambienteText) partes.push(`Ambiente base: ${input.ambienteText}`);
  if (input.molduraText) partes.push(`Moldura: ${input.molduraText}`);
  if (!partes.length) throw new Error('expandPersonas: descreva a cena base.');

  const regraDiv = {
    avatar: `Gere ${n} personas com o MESMO estilo de ambiente da descrição, mas AVATARES claramente diferentes entre si: varie etnia/tom de pele, cor e tipo de cabelo, faixa etária (20s a 50s) e estilo de roupa. Ambientes podem ter variações sutis de ângulo/decoração mas devem parecer o mesmo tipo de lugar.`,
    ambiente: `Gere ${n} personas com o MESMO avatar (descreva a MESMA pessoa, idêntica, nas ${n}), mas AMBIENTES claramente diferentes entre si: varie o tipo de espaço, a luz e o período do dia, mantendo lugares plausíveis pra exibir um quadro grande.`,
    ambos: `Gere ${n} personas TOTALMENTE diferentes entre si: avatares diversos (etnia, cabelo, idade, estilo) E ambientes diversos (tipos de espaço, luz, período). Máxima variedade pra teste A/B de criativo.`,
  }[div];

  const prompt = `Você monta cenários pra mockups de vídeo onde uma pessoa apresenta um quadro grande emoldurado (tela verde que recebe a arte depois). A partir da base do usuário, gere ${n} personas pro teste de criativos de anúncio.

${partes.join('\n')}

${regraDiv}

Regras:
- Cada AVATAR precisa ser detalhado e ESTÁVEL (mesma pessoa em 6 fotos geradas por img2img): fixe cabelo, pele, maquiagem, unhas e roupa exata.
- IMPORTANTE (filtro de conteúdo): ambientes sempre COMERCIAIS/NEUTROS (loja, galeria, escritório, estúdio, sala de estar clean) — nunca quarto/cama/banheiro/ambiente íntimo.
- Tudo em inglês natural de prompt de imagem, EXCETO "nome" (rótulo curto pt-BR).
- As ${n} personas devem ser distinguíveis à primeira vista.`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: PERSONA_SCHEMA,
        temperature: 0.9,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini (personas) ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Resposta inesperada do Gemini: ${JSON.stringify(data).slice(0, 400)}`);
  const out = JSON.parse(text).personas || [];
  if (out.length < n) throw new Error(`Gemini devolveu ${out.length}/${n} personas`);
  return out.slice(0, n);
}
