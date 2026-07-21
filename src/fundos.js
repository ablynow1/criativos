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

// INTERIORES: aqui a variação é o produto. Cada um muda ÉPOCA, PALETA,
// MATERIAL DA PAREDE, PISO e sobretudo a QUALIDADE DA LUZ (dura, difusa, high
// key, low key, noturna) — dois nunca podem parecer o mesmo cômodo.
const BASE_INT =
  'Photorealistic vertical 9:16 interior frame from a high-end architectural film, wide-angle lens at eye level, realistic materials and light falloff, no HDR look. No people, no readable text or signage, no watermarks. The wall in the middle of the frame is completely BARE — no artwork, no picture, no mirror, no shelf on it (a framed picture will float over that area). Furniture stays low and to the sides.';

const MOVE_INT =
  'Subtle ambient motion only: a very slow camera dolly or gentle handheld drift. No people entering the frame. The life comes from light and small details — a curtain breathing, dust in a sunbeam, a flame flickering, plant leaves settling. Nothing moves in the center of the frame. Quiet room tone.';

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

  // ---------- INTERIORES DE CASA (8 estilos, luz e textura distintas) ----------
  {
    id: 'loft-industrial',
    nome: 'Loft industrial',
    hint: 'tijolo aparente e janela de aço — luz dura e recortada',
    keyframe: `${BASE_INT} Scene: a converted warehouse loft — exposed weathered red brick wall, tall black steel-framed factory windows, polished raw concrete floor, high ceiling with visible steel beams and ducts. Hard low afternoon sun comes through the window grid and throws sharp geometric shadows across the brick. Palette: rust, graphite, cold gray.`,
    movimento: `${MOVE_INT} The hard window shadows creep slowly across the brick, dust floats through the sunbeam.`,
  },
  {
    id: 'japandi',
    nome: 'Japandi minimalista',
    hint: 'microcimento e carvalho claro — luz difusa de shoji, sem sombra',
    keyframe: `${BASE_INT} Scene: a wabi-sabi Japandi living room — warm off-white micro-cement walls with a hand-troweled texture, pale oak plank floor, a very low linen sofa, a single ceramic vase with one dry branch. Light comes flat and shadowless through a paper shoji screen. Palette: oatmeal, greige, unbleached linen. Extremely calm and empty.`,
    movimento: `${MOVE_INT} The shoji light brightens and dims almost imperceptibly, the dry branch settles.`,
  },
  {
    id: 'paris-haussmann',
    nome: 'Clássico parisiense',
    hint: 'parquet espinha e boiserie — sol rasante da tarde',
    keyframe: `${BASE_INT} Scene: a Haussmann Paris apartment — herringbone oak parquet, ornate white boiserie wall mouldings, a carved marble fireplace, tall French windows with sheer white curtains and a wrought-iron balcony beyond. Warm late-afternoon sun rakes low across the parquet. Palette: cream, gilt, honey oak.`,
    movimento: `${MOVE_INT} The sheer curtain breathes against the window, warm light slides slowly along the parquet.`,
  },
  {
    id: 'escandinavo',
    nome: 'Escandinavo claro',
    hint: 'branco e bétula — luz fria de janela norte, quase sem sombra',
    keyframe: `${BASE_INT} Scene: a Scandinavian living room — matte white plaster walls, pale birch floorboards, a light gray wool sofa, linen cushions, a few matte ceramics, one green plant. Cool flat overcast north light through a large bare window, very high key, almost no shadows. Palette: chalk white, cold blue-gray, birch.`,
    movimento: `${MOVE_INT} Plant leaves stir faintly, the overcast light shifts as clouds pass outside.`,
  },
  {
    id: 'mid-century',
    nome: 'Mid-century anos 60',
    hint: 'nogueira e terracota — persiana ripada, sol baixo listrado',
    keyframe: `${BASE_INT} Scene: a 1960s mid-century modern living room — walnut wood wall panelling, a low-slung tan leather lounge chair and ottoman, a globe pendant lamp, a shag rug in olive and burnt orange. Warm low sun comes through slatted wooden blinds and throws striped shadows across the walnut. Palette: walnut brown, olive, burnt orange, mustard.`,
    movimento: `${MOVE_INT} The striped blind shadows drift slowly, warm light deepens toward amber.`,
  },
  {
    id: 'mediterraneo',
    nome: 'Mediterrâneo boho',
    hint: 'arcos de reboco e terracota — sol quente em manchas',
    keyframe: `${BASE_INT} Scene: a Mediterranean stone house interior — hand-troweled lime plaster walls with soft rounded arches, terracotta tile floor, rattan and raw wood furniture, olive branches in a clay pot, a woven jute rug. Hard warm midday sun enters from the side and paints bright irregular patches on the rough plaster. Palette: chalk white, terracotta, olive, sand.`,
    movimento: `${MOVE_INT} The sun patches creep across the plaster, olive leaves flicker, linen edges lift in a warm draft.`,
  },
  {
    id: 'biblioteca-escura',
    nome: 'Biblioteca escura',
    hint: 'verde profundo e mogno — luz baixa de abajur e lareira',
    keyframe: `${BASE_INT} Scene: a dark academia private study — deep forest-green lacquered walls, floor-to-ceiling mahogany bookshelves packed with old leather-bound books, a tufted leather armchair, a Persian rug. The only light is a brass banker's lamp and the glow of a small fireplace — low-key chiaroscuro lighting with deep shadows and warm pooled highlights. Palette: bottle green, oxblood, brass, mahogany.`,
    movimento: `${MOVE_INT} The fire glow pulses gently across the leather and brass, shadows breathe in the corners.`,
  },
  {
    id: 'penthouse-noite',
    nome: 'Penthouse à noite',
    hint: 'vidro do chão ao teto e mármore preto — cidade acesa lá fora',
    keyframe: `${BASE_INT} Scene: a contemporary penthouse living room at night — floor-to-ceiling glass revealing a glittering city skyline far below, black marble surfaces, brushed brass details, a deep charcoal velvet sofa, a single sculptural floor lamp. Cool blue night ambience outside against warm pooled interior light, reflections on the polished stone and glass. Palette: black, midnight blue, brass, amber.`,
    movimento: `${MOVE_INT} Distant city lights twinkle and a few move slowly, reflections shift across the black marble.`,
  },
];

export function getFundo(id) {
  return FUNDOS.find((f) => f.id === id) || null;
}
