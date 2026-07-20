// FUNDOS do modo ERMOS — lugares cenográficos de luxo onde o quadro "flutua"
// (réplica estrutural do ad Ermos 3981810798791050: produto sobreposto a vídeo
// de lifestyle mediterrâneo, SEM pessoas em destaque).
//
// Cada preset tem: prompt do KEYFRAME (Nano Banana, 9:16 — a mesma imagem é a
// thumb da biblioteca) e prompt de MOVIMENTO (Veo 8s, câmera contida, vida
// ambiente: água, brisa, luz — nada que roube atenção do produto).
//
// Regras: sem pessoas próximas/identificáveis (RAI-safe e foco no produto);
// terço central relativamente "limpo" (o quadro flutua ali por cima).

const BASE =
  'Photorealistic vertical 9:16 frame from a luxury lifestyle smartphone video, natural colors, crisp daylight, deep blue sky, high-end aspirational mood. No people in the foreground, no readable text or signage, no watermarks. Composition leaves the central third relatively uncluttered (a product will float over it).';

const MOVE_BASE =
  'Subtle ambient motion only: gentle camera drift or slow handheld sway. No people entering the frame, no fast movement, nothing distracting in the center. Quiet ambient sound of the place.';

export const FUNDOS = [
  {
    id: 'marina-luxo',
    nome: 'Marina de luxo',
    hint: 'iates, palmeiras, carros — o cenário do ad original',
    keyframe: `${BASE} Scene: an exclusive Mediterranean luxury marina promenade in Puerto Banús style — white yachts moored in turquoise water, tall palm trees, elegant white low-rise buildings, a parked luxury car glinting in the sun, ornate street lamps.`,
    movimento: `${MOVE_BASE} Water glitters and ripples softly around the yachts, palm fronds sway in the breeze, sunlight flares subtly.`,
  },
  {
    id: 'amalfi',
    nome: 'Costa Amalfitana',
    hint: 'Positano — casas pastel no penhasco sobre o mar',
    keyframe: `${BASE} Scene: the Amalfi coast seen from a scenic terrace — pastel colored houses of Positano stacked on the cliffside, bougainvillea flowers, the deep blue Tyrrhenian sea below, a lemon tree branch at the edge of frame.`,
    movimento: `${MOVE_BASE} The sea shimmers far below, bougainvillea and lemon leaves tremble lightly in the coastal breeze.`,
  },
  {
    id: 'santorini',
    nome: 'Santorini',
    hint: 'branco e azul grego sobre a caldeira',
    keyframe: `${BASE} Scene: Santorini, Greece — whitewashed cubic houses and a blue-domed chapel over the caldera, infinite Aegean sea horizon, golden late-afternoon light on the white walls.`,
    movimento: `${MOVE_BASE} Distant sea sparkles, a white curtain in a doorway breathes with the wind, warm light shifts slowly.`,
  },
  {
    id: 'toscana',
    nome: 'Toscana',
    hint: 'ciprestes e colinas douradas',
    keyframe: `${BASE} Scene: the Tuscan countryside at golden hour — a winding gravel road lined with tall cypress trees, rolling golden wheat hills, a distant stone villa, soft warm haze.`,
    movimento: `${MOVE_BASE} Wheat sways in waves across the hills, cypress tips bend gently, golden light deepens.`,
  },
  {
    id: 'museu',
    nome: 'Museu clássico',
    hint: 'salão de mármore com colunas',
    keyframe: `${BASE} Scene: the grand hall of a classical European art museum — polished marble floor with reflections, tall ionic columns, a coffered ceiling with a skylight, soft diffused museum light. Empty of visitors.`,
    movimento: `${MOVE_BASE} Dust motes drift in the skylight beam, reflections on the marble floor shift as the light breathes.`,
  },
  {
    id: 'como',
    nome: 'Lago de Como',
    hint: 'lago alpino, vilas e montanhas',
    keyframe: `${BASE} Scene: Lake Como, Italy, from a stone balustrade terrace — deep blue-green alpine lake, elegant historic villas with cypress gardens on the far shore, misty mountains behind, a classic wooden boat crossing far away.`,
    movimento: `${MOVE_BASE} The lake surface ripples slowly, the distant boat glides leaving a soft wake, mountain mist drifts.`,
  },
  {
    id: 'riviera',
    nome: 'Riviera Francesa',
    hint: 'porto estilo Mônaco ao entardecer',
    keyframe: `${BASE} Scene: a French Riviera harbor in Monaco style at dusk — superyachts with warm deck lights, apartment terraces climbing the hill behind, the Mediterranean turning violet-blue, elegant promenade railing in the foreground.`,
    movimento: `${MOVE_BASE} Deck lights twinkle on the water, masts sway almost imperceptibly, dusk colors deepen.`,
  },
  {
    id: 'grecia-antiga',
    nome: 'Grécia antiga',
    hint: 'ruínas de templo em luz dourada',
    keyframe: `${BASE} Scene: ancient Greek temple ruins on a hill at golden hour — weathered marble Doric columns against a saturated blue sky, olive trees below, the Aegean sea far in the distance, warm sun rays raking across the stone.`,
    movimento: `${MOVE_BASE} Olive leaves flicker silver in the breeze, sun rays shift slowly across the marble, distant sea glints.`,
  },
];

export function getFundo(id) {
  return FUNDOS.find((f) => f.id === id) || null;
}
