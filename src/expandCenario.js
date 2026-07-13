import { config, requireProjectId } from './config.js';
import { getAccessToken } from './googleAuth.js';

// Transforma a descrição LIVRE do Vitor (PT, solta) nas 3 variáveis canônicas
// em inglês que os templates de cenário esperam (src/cenarios.js): avatar,
// ambiente, moldura. O ganho é duplo: (1) traduz/estrutura pro inglês, que o
// Nano Banana/Veo entendem melhor; (2) deixa o AVATAR específico e repetível o
// bastante pra travar a identidade nas 6 cenas (img2img encadeado exige uma
// descrição rica e estável — vaga demais = a modelo "vira outra pessoa").

const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nome: {
      type: 'STRING',
      description: 'Rótulo curto do cenário em pt-BR pra biblioteca, no formato "Ambiente · Avatar" (ex: "Galeria branca · Ruiva"). Máx 34 caracteres.',
    },
    avatar: {
      type: 'STRING',
      description:
        'Descrição em INGLÊS da pessoa que apresenta o quadro, específica e repetível o bastante pra travar a identidade em 6 fotos: idade aproximada, cabelo (cor/comprimento/textura), pele/etnia, maquiagem, unhas, e a roupa exata. Comece com "an elegant ..." ou similar. Uma frase densa, sem ponto final. Se o usuário não especificar algo, escolha um valor coerente e mantenha.',
    },
    ambiente: {
      type: 'STRING',
      description:
        'Descrição em INGLÊS do cenário/local onde a cena acontece: tipo de espaço (loja de molduras, galeria de arte, sala premium...), piso, iluminação, período do dia e o que aparece no fundo. Rico e cinematográfico, uma frase, sem ponto final. Deve ser um espaço plausível pra alguém exibir um quadro grande emoldurado.',
    },
    moldura: {
      type: 'STRING',
      description:
        'Descrição em INGLÊS da moldura do quadro como sintagma nominal começando com artigo, encaixável na frase "Only the ___ around it" (ex: "a thin matte-black wooden moulding", "an ornate gold moulding", "a natural light-oak frame"). Curto.',
    },
  },
  required: ['nome', 'avatar', 'ambiente', 'moldura'],
};

/**
 * @param {{avatarText?:string, ambienteText?:string, molduraText?:string, descricao?:string}} input
 *   Campos livres em PT. `descricao` é um catch-all opcional (o usuário pode
 *   jogar tudo numa caixa só); avatarText/ambienteText/molduraText refinam.
 * @returns {Promise<{nome:string, avatar:string, ambiente:string, moldura:string}>}
 */
export async function expandCenario(input) {
  const accessToken = await getAccessToken();
  const project = requireProjectId();
  const url = `https://${config.googleCloudLocation}-aiplatform.googleapis.com/v1/projects/${project}/locations/${config.googleCloudLocation}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const partes = [];
  if (input.descricao) partes.push(`Descrição geral: ${input.descricao}`);
  if (input.avatarText) partes.push(`Avatar (quem apresenta): ${input.avatarText}`);
  if (input.ambienteText) partes.push(`Ambiente: ${input.ambienteText}`);
  if (input.molduraText) partes.push(`Moldura: ${input.molduraText}`);
  if (!partes.length) throw new Error('expandCenario: descreva ao menos avatar e ambiente.');

  const prompt = `Você monta cenários pra um mockup de vídeo onde uma pessoa apresenta um quadro grande numa loja/galeria (o quadro tem tela verde que depois recebe qualquer arte). Converta a descrição livre do usuário nas variáveis canônicas em inglês, prontas pra injetar num gerador de imagem.

${partes.join('\n')}

Regras:
- O AVATAR precisa ser detalhado e ESTÁVEL (a mesma pessoa aparece em 6 fotos geradas por img2img — descrição vaga faz a identidade variar). Fixe cabelo, pele, maquiagem, unhas e roupa exata.
- O AMBIENTE deve ser um espaço onde faz sentido exibir um quadro grande emoldurado, com luz e fundo bem descritos.
- A MOLDURA é um sintagma nominal curto encaixável em "Only the ___ around it".
- Tudo em inglês natural de prompt de imagem, EXCETO o campo "nome" que é um rótulo curto em pt-BR.
- Preencha lacunas com escolhas coerentes; nunca deixe genérico demais.`;

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
        temperature: 0.6,
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
