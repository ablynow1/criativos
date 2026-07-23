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

// O Nano Banana NÃO tem negativePrompt — as exclusões vão no corpo do prompt.
// Este bloco fecha os buracos por onde saem os artefatos clássicos que matam
// um anúncio: marca d'água, texto fantasma, dedo a mais, moldura torta.
const IMG_GUARD =
  'Image integrity: pristine full-bleed photograph — absolutely free of watermarks, '
  + 'logos, on-screen text, captions, UI elements, borders or vignettes. Hands are '
  + 'anatomically correct with five natural fingers each. The picture-frame moulding '
  + 'has perfectly straight edges and true right-angle corners — never bent, bowed or warped.';

// Bloco de qualidade/formato — comum a todo keyframe verde. {avatar}, {ambiente}
// e {moldura} entram aqui; o requisito do chroma é inegociável (recorte perfeito).
//
// A direção de fotografia é EXPLÍCITA (câmera, luz nomeada, color grade): sem
// isso o modelo decidia sozinho e cada job saía com uma cara — "warm cozy
// lighting" não é um esquema de luz, é um palpite.
function styleBlock({ avatar, ambiente, moldura }) {
  return `Photorealistic vertical 9:16 frame from a premium lifestyle commercial, shot on a full-frame mirrorless camera. Lighting scheme: one large soft key from a window or wide practical source, gentle warm fill, subtle rim from ambient practicals — flattering, dimensional, no harsh shadows on the face. Color grade of a high-end home-decor campaign: natural skin tones, warm highlights, clean deep shadows, rich but never oversaturated color.
Setting: ${ambiente}.
Subject: ${avatar} — see per-shot pose below. Body language is relaxed and genuinely proud, like someone showing a piece they love to a friend — never stiff, never stock-photo posed.
The product: a VERY LARGE vertical poster frame, about 1 meter tall, with ${moldura}. The frame is the hero of the image.
CRITICAL REQUIREMENT: the entire artwork area inside the moulding is a SOLID, FLAT, UNIFORM BRIGHT CHROMA-KEY GREEN (#00FF00) — perfectly even pure green from edge to edge, like a professional green screen. NO reflections, NO gradient, NO texture, NO glare and NO shadows on the green area. Only the ${moldura} around it.
${IMG_GUARD}`;
}

// NUNCA escrever "she/her/the woman" aqui. O avatar é escolhido pelo usuário —
// pronome fixo no prompt briga com a imagem de referência e o modelo troca a
// pessoa (foi assim que um cenário de homem virou mulher no K4, o shot mais
// centrado na pessoa). Texto neutro + "same gender" explícito trava a identidade.
const MESMA_PESSOA =
  'the SAME person as in the reference image (same face, same gender, same age, '
  + 'same hair, same outfit, same hands) — never replace them with a different person';

function sameBlock({ moldura }) {
  return `Use the reference image for the identity of ${MESMA_PESSOA}, the same setting, the same lighting scheme and color grade, and the same large frame with ${moldura} and the flat chroma-key green (#00FF00) artwork area — keep the green perfectly solid, flat and uniform, no reflections.
${IMG_GUARD}`;
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
    ? `First reference image: the identity of ${MESMA_PESSOA}, the same setting, lighting scheme and color grade. LAST reference image: the EXACT picture-frame moulding — keep reproducing it faithfully on the large frame (same profile, material, finish, color and ornament). The frame keeps its flat chroma-key green (#00FF00) artwork area — perfectly solid, flat and uniform, no reflections.
${IMG_GUARD}`
    : sameBlock({ moldura });
  // Cada shot tem LENTE e MICROEXPRESSÃO próprias. Antes era "soft smile" em
  // 4 dos 6 — sorriso de banco de imagem. A sequência agora conta uma emoção:
  // orgulho → conexão → cuidado → cumplicidade → contemplação → objeto.
  return {
    K1: {
      master: true,
      prompt: `${STYLE}
Shot: full-body wide shot, 24mm equivalent, camera at chest height, generous headroom. The person stands in the middle of the place holding the large frame half-turned (about 45 degrees from camera), caught mid-turn as if just presenting it. The green surface is partially visible in perspective. Micro-expression: eyes on the frame with quiet, genuine pride — the moment before showing something you love.`,
    },
    K2: {
      prompt: `${SAME}
New shot: medium frontal shot, 35mm equivalent at eye level. The large green-screen frame now faces the camera straight on, filling most of the lower 2/3 of the image. Their head and shoulders appear above the top edge of the frame, hands gripping the sides. Micro-expression: warm, direct eye contact with an easy confident smile — sharing, not selling. Background softly blurred with creamy bokeh.`,
    },
    K3: {
      prompt: `${SAME}
New shot: close-up on the frame itself, 50mm equivalent, shallow depth of field. The flat green surface and the ${moldura} fill almost the whole image, slightly angled in gentle perspective so the moulding profile catches the light. One of their hands rests lightly on the left edge, fingertips relaxed — the touch of someone handling a piece with care. Warm practical lights melt into the blurry background.`,
    },
    K4: {
      prompt: `${SAME}
New shot: close frontal shot, 50mm equivalent. ${MESMA_PESSOA} stands BEHIND the large frame: only their head is visible above the top edge, chin slightly down, both hands resting flat on the top edge of the moulding. Micro-expression: playful, relaxed peek over the frame — a hint of a genuine smile reaching the eyes. Background softly blurred.`,
    },
    K5: {
      prompt: `${SAME}
New shot: wide shot of a different corner of the same place, 35mm equivalent. The large green-screen frame now HANGS on a clean white gallery wall with a small black picture light mounted above it, perfectly level. The person stands to the side, seen from behind in three-quarter view, quietly admiring the framed green surface on the wall — weight on one leg, at ease, contemplative. Soft ambient depth around.`,
    },
    K6: {
      prompt: `${SAME}
New shot: no people. The large green-screen frame hanging on the clean white gallery wall with the black picture light above it casting a soft wash down the wall, seen from a 30-degree side angle with gentle perspective, 50mm equivalent. Background softly blurred. Elegant, quiet gallery mood — the product standing on its own.`,
    },
  };
}

// Cláusula INVIOLÁVEL: a arte é uma pintura física estática. Sem isso o Veo
// anima o conteúdo do retrato (deforma). Ver MOCKUP-NATIVO.md §4.1.
const STATIC_ART =
  'The artwork inside the moulding is a STATIC physical painting — it stays ' +
  'EXACTLY as in the reference image, rigid and unchanged, moving only together ' +
  'with the frame as one solid object; nothing inside the picture moves or morphs.';

// negativePrompt NATIVO do Veo 3.1 — vai em parameters, não no texto. Lista o
// que derruba um anúncio: deformação da arte/moldura, mão errada, texto na
// tela, e os tiques de vídeo gerado (jump cut, zoom brusco, flicker).
export const VEO_NEGATIVE =
  'cartoon, painting-style rendering, morphing or warping artwork, frame bending, '
  + 'extra fingers, deformed hands, face distortion, identity change, on-screen text, '
  + 'captions, subtitles, watermark, logo, jump cut, sudden zoom, camera shake, '
  + 'flickering, oversaturation, people walking through the frame';

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
      prompt: `The person in the image stands holding the large framed painting half-turned, presenting it: they tilt the frame just a few degrees toward the camera, make tiny natural grip adjustments, and look between the painting and the camera with a warm proud smile. ${STATIC_ART} NO large rotation of the frame. Static camera with a very subtle handheld sway, no zoom. Quiet room tone, soft fabric and wood sounds.`,
    },
    V2A: {
      kf: 'K2A',
      prompt: `The person in the image holds the big framed painting facing the camera, makes tiny natural adjustments to their grip, tilts their head slightly and smiles warmly. ${STATIC_ART} ${m.push} Cozy ambience, faint room tone.`,
    },
    V3A: {
      kf: 'K3A',
      prompt: `Slow smooth diagonal camera glide along the large framed painting and the moulding, their hand steady on the edge. ${STATIC_ART} It changes only in natural perspective as the camera moves. Soft room tone.`,
    },
    V4A: {
      kf: 'K4A',
      prompt: `The person in the image rests their hands on the top edge of the frame, taps their fingers gently once, tilts their head and smiles at the camera. ${STATIC_ART} ${m.push} Shallow depth of field. Quiet ambience.`,
    },
    V5A: {
      kf: 'K5A',
      prompt: `The framed painting hangs on the white gallery wall under the black picture light. The person in the image stands to the side quietly admiring the framed artwork, gently nodding and turning their head as they appreciate it. ${STATIC_ART} Static camera. Quiet ambience.`,
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
