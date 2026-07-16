// Templates de prompt do MOCKUP NATIVO, parametrizados por cenário.
//
// A GRAMÁTICA é fixa: os 6 shots (wide apresentando, frontal, close, mãos,
// parede, parede-lateral) e os movimentos de câmera são a linguagem do formato
// (espelham o anúncio de referência da Ad Library 34784776947833729). O que
// muda por cenário são só 3 variáveis:
//   - avatar   : quem segura/apresenta o quadro (aparência da modelo)
//   - ambiente : onde (a loja/galeria e a luz)
//   - moldura  : a moldura do quadro (cor/material)
//
// Isso mantém a consistência que custou caro e deixa o cenário trivial de
// trocar. Ver MOCKUP-NATIVO.md. As regras invioláveis (arte estática no Veo,
// verde 100% chapado, wide-giro frágil no RAI) estão codificadas aqui.

// Cenário #1 — o estado atual já validado/entregue. Serve de default e gabarito.
export const CENARIO_1 = {
  id: 'loja-noturna-loira',
  nome: 'Loja noturna · Loira',
  avatar:
    'an elegant Brazilian woman in her late 20s, long wavy honey-blonde hair, ' +
    'natural makeup, red nail polish, wearing a fitted off-white satin midi dress',
  ambiente:
    'an upscale picture-framing studio at night — honey-toned wood floor, black ' +
    'ceiling with spotlights, a glass partition showing a blue-lit back office, ' +
    'and display walls covered with dozens of chevron-shaped corner samples of ' +
    'picture-frame mouldings (gold, black, white, silver, walnut)',
  moldura: 'a thin matte-black wooden moulding',
  movimento: 'medio',
  temAbertura: true,
  versoKeyframe: 'K15', // verso real do quadro físico do Vitor (aprovado)
};

// Bloco de qualidade/formato — comum a todo keyframe verde. {avatar}, {ambiente}
// e {moldura} entram aqui; o requisito do chroma é inegociável (recorte perfeito).
function styleBlock({ avatar, ambiente, moldura }) {
  return `Photorealistic vertical 9:16 frame from a casual smartphone video (natural colors, warm cozy lighting, shallow depth of field). Clean full-bleed photo WITHOUT any camera interface overlay — no recording indicator, no buttons, no HUD, no watermark.
Setting: ${ambiente}.
Subject: ${avatar} — see per-shot pose below.
The product: a VERY LARGE vertical poster frame, about 1 meter tall, with ${moldura}.
CRITICAL REQUIREMENT: the entire artwork area inside the moulding is a SOLID, FLAT, UNIFORM BRIGHT CHROMA-KEY GREEN (#00FF00) — perfectly even pure green from edge to edge, like a professional green screen. NO reflections, NO gradient, NO texture, NO glare and NO shadows on the green area. Only the ${moldura} around it.`;
}

function sameBlock({ moldura }) {
  return `Use the reference image for the woman's identity (same face, same hair, same outfit, same hands), the same setting and the same large frame with ${moldura} and the flat chroma-key green (#00FF00) artwork area — keep the green perfectly solid, flat and uniform, no reflections.`;
}

// Os 6 shots FIXOS. Cada um recebe {avatar, ambiente, moldura} e devolve o
// prompt completo do keyframe. K1 usa styleBlock (text2img, master); K2..K6
// derivam por img2img (sameBlock) pra manter identidade.
//
// `molduraRef: true` = a moldura vem de uma FOTO da biblioteca (entra como
// referência img2img junto do prompt — mesmo padrão do kraft-texture→K12):
// K1 recebe [fotoMoldura], K2..K6 recebem [K1, fotoMoldura]. As cláusulas
// abaixo dizem ao modelo pra COPIAR a moldura da última referência; `moldura`
// (texto, vindo do describeMoldura) continua no prompt reforçando o alvo.
export function buildKeyframePrompts({ avatar, ambiente, moldura, molduraRef = false }) {
  const STYLE = molduraRef
    ? `The moulding reference image shows the EXACT picture-frame moulding of the product — reproduce it faithfully (same profile, material, finish, color and ornament) on the large frame.
${styleBlock({ avatar, ambiente, moldura })}`
    : styleBlock({ avatar, ambiente, moldura });
  const SAME = molduraRef
    ? `First reference image: the woman's identity (same face, same hair, same outfit, same hands) and the same setting. LAST reference image: the EXACT picture-frame moulding — keep reproducing it faithfully on the large frame (same profile, material, finish, color and ornament). The frame keeps its flat chroma-key green (#00FF00) artwork area — perfectly solid, flat and uniform, no reflections.`
    : sameBlock({ moldura });
  return {
    K1: {
      master: true,
      prompt: `${STYLE}
Shot: full-body wide shot. She stands in the middle of the store holding the large frame half-turned (about 45 degrees from camera), as if she is just turning it around to present it. The green surface is partially visible in perspective. She looks at the frame with a soft smile.`,
    },
    K2: {
      prompt: `${SAME}
New shot: medium frontal shot. The large green-screen frame now faces the camera straight on, filling most of the lower 2/3 of the image. Her head and shoulders appear above the top edge of the frame, smiling warmly at the camera, hands gripping the sides of the frame. Background softly blurred.`,
    },
    K3: {
      prompt: `${SAME}
New shot: close-up on the frame itself. The flat green surface and the ${moldura} fill almost the whole image, slightly angled in gentle perspective. One of her hands holds the left edge. Warm lights in the blurry background.`,
    },
    K4: {
      prompt: `${SAME}
New shot: close frontal shot. She stands BEHIND the large frame: only her head is visible above the top edge, chin slightly down, looking at the camera with a soft smile, both hands resting flat on the top edge of the moulding. Background softly blurred.`,
    },
    K5: {
      prompt: `${SAME}
New shot: wide shot of a different corner of the same place. The large green-screen frame now HANGS on a clean white gallery wall with a small black picture light mounted above it. The woman stands to the side, seen from behind in three-quarter view, admiring the framed green surface on the wall. Ambience around.`,
    },
    K6: {
      prompt: `${SAME}
New shot: no people. The large green-screen frame hanging on the clean white gallery wall with the black picture light above it, seen from a 30-degree side angle with gentle perspective, background softly blurred. Elegant gallery mood.`,
    },
  };
}

// Cláusula INVIOLÁVEL: a arte é uma pintura física estática. Sem isso o Veo
// anima o conteúdo do retrato (deforma). Ver MOCKUP-NATIVO.md §4.1.
const STATIC_ART =
  'The artwork inside the moulding is a STATIC physical painting — it stays ' +
  'EXACTLY as in the reference image, rigid and unchanged, moving only together ' +
  'with the frame as one solid object; nothing inside the picture moves or morphs.';

// Intensidade de movimento por cenário/mockup. "calmo" segura a câmera,
// "dinamico" empurra mais (mas nunca exagera — o Veo já tende a exagerar o fim).
const MOVE = {
  calmo: { push: 'The camera is almost static, only a very subtle handheld sway.', dolly: 'a very slow, barely-there drift' },
  medio: { push: 'Very slow gentle push-in.', dolly: 'a slow smooth dolly-in' },
  dinamico: { push: 'A smooth, noticeable push-in.', dolly: 'a smooth cinematic dolly-in' },
};

// Os prompts de movimento dos clipes NATIVOS (arte já aplicada no keyframe).
// Espelham V1A..V6A. Todos carregam a cláusula STATIC_ART. K1A (wide) fica de
// fora da montagem por padrão (RAI-frágil), mas o prompt existe pra completude.
export function buildVeoPrompts({ movimento = 'medio' } = {}) {
  const m = MOVE[movimento] || MOVE.medio;
  return {
    V1A: {
      kf: 'K1A',
      prompt: `She stands holding the large framed painting half-turned, presenting it: she tilts the frame just a few degrees toward the camera, makes tiny natural grip adjustments, and looks between the painting and the camera with a warm proud smile. ${STATIC_ART} NO large rotation of the frame. Static camera with a very subtle handheld sway, no zoom. Quiet room tone, soft fabric and wood sounds.`,
    },
    V2A: {
      kf: 'K2A',
      prompt: `She holds the big framed painting facing the camera, makes tiny natural adjustments to her grip, tilts her head slightly and smiles warmly. ${STATIC_ART} ${m.push} Cozy ambience, faint room tone.`,
    },
    V3A: {
      kf: 'K3A',
      prompt: `Slow smooth diagonal camera glide along the large framed painting and the moulding, her hand steady on the edge. ${STATIC_ART} It changes only in natural perspective as the camera moves. Soft room tone.`,
    },
    V4A: {
      kf: 'K4A',
      prompt: `She rests her hands on the top edge of the frame, taps her fingers gently once, tilts her head and smiles at the camera. ${STATIC_ART} ${m.push} Shallow depth of field. Quiet ambience.`,
    },
    V5A: {
      kf: 'K5A',
      prompt: `The framed painting hangs on the white gallery wall under the black picture light. The woman stands to the side quietly admiring the framed artwork, gently nodding and turning her head as she appreciates it. ${STATIC_ART} Static camera. Quiet ambience.`,
    },
    V6A: {
      kf: 'K6A',
      prompt: `${cap(m.dolly)} toward the framed painting hanging on the white gallery wall, gentle parallax against the background. ${STATIC_ART} It changes only in natural perspective as the camera moves. Quiet elegant gallery ambience.`,
    },
  };
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Montagem: os segmentos do formato (clipe:in:out), no ritmo do anúncio de
// referência. Parametrizado por duração-alvo. O default de 25s é o entregue e
// aprovado (10 segmentos, fecho na parede, SEM o wide-giro K1A — RAI-frágil).
// `abertura` (nome do clipe de reveal do verso, ex "V15") entra no slot 1 se
// temAbertura; senão o slot 1 vira o reveal frontal.
export function buildSegments({ duracaoAlvo = 25, abertura = null } = {}) {
  // Base 25s (o gabarito). Sem abertura, o slot 1 abre no frontal (V2A).
  const base = abertura
    ? [
        [abertura, 0.2, 2.2], // reveal do verso → corte no edge-on
        ['V2A', 0.2, 2.6],
        ['V4A', 0.2, 2.15],
        ['V3A', 0.4, 2.45],
        ['V4A', 2.7, 4.85],
        ['V2A', 4.1, 7.8],
        ['V5A', 1.0, 3.2],
        ['V6A', 0.3, 2.0],
        ['V6A', 2.2, 4.4],
        ['V5A', 3.0, 7.9],
      ]
    : [
        ['V2A', 0.2, 2.6], // abre direto no frontal
        ['V4A', 0.2, 2.15],
        ['V3A', 0.4, 2.45],
        ['V2A', 3.0, 5.6],
        ['V4A', 2.7, 4.85],
        ['V2A', 4.1, 7.8],
        ['V5A', 1.0, 3.2],
        ['V6A', 0.3, 2.0],
        ['V6A', 2.2, 4.4],
        ['V5A', 3.0, 7.9],
      ];
  if (duracaoAlvo >= 24) return base; // 25s: usa tudo, -t 25 crava
  // Encurta proporcionalmente pra 15s: tira 2 beats do meio e aperta o fecho.
  if (duracaoAlvo <= 16) {
    const short = base.filter((_, i) => ![4, 8].includes(i));
    short[short.length - 1] = [short[short.length - 1][0], 3.0, 6.0];
    return short;
  }
  return base; // 30s: mesma base, -t 30 (o fecho de parede segura)
}
