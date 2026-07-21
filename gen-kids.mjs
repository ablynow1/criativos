// Gera as imagens do /futebolkids editando as cenas REALISTAS do /futebolbr (adulto → CRIANÇA),
// com o quadro que eles seguram batendo com o PRODUTO REAL (prompt do sistema: bobblehead
// HIPER-REALISTA, rosto de verdade, NÃO Funko). Nano Banana / gemini-2.5-flash-image (Vertex).
// Uso: node gen-kids.mjs sample | rest | all
import { img2img } from './src/img2img.js';
import path from 'node:path';

const SRC = '/Users/vitorpassos/Desktop/CLAUDE/maltaquadros/futebolbr/assets/showcase';    // base REALISTA (adulto)
const OUT = '/Users/vitorpassos/Desktop/CLAUDE/maltaquadros/futebolkids/assets/showcase';   // saída (criança)

// Spec do PRODUTO REAL dentro do quadro (destilado do futebolkids/api/generate.php):
const FIGURE =
  `INSIDE THE FRAME there is a HYPER-REALISTIC studio product photograph of a personalized collectible ` +
  `BOBBLEHEAD figurine of a CHILD football player — a REAL, lifelike child face with photographic likeness ` +
  `(this is NOT a cartoon, NOT a Funko Pop, NOT a stylized toy): realistic skin and hair, youthful child body ` +
  `proportions, a SHORT THICK neck (no spring, no coil), wearing a Brazilian football club home kit with a small ` +
  `embroidered team crest on the LEFT CHEST, one foot resting on a soccer ball, standing on a two-layer matte grass ` +
  `base with a short kids' NAME engraved in clean white lettering (NEVER the word "PAI"), against a blurred ` +
  `golden-hour football stadium. Premium, sharp, lifelike collectible product photography — like a professional figure shot.`;

const LIFE = (extra) => `EDIT THIS PHOTO into a heartwarming, photorealistic lifestyle scene. ` +
  `Replace the person/people with a JOYFUL YOUNG BRAZILIAN CHILD, about 7 years old, big genuine smile. ` +
  `The child is holding and admiring a FRAMED PORTRAIT (white wooden frame with glass). ${FIGURE} ` +
  `CRITICAL IDENTITY MATCH: the bobblehead figurine INSIDE the frame depicts THE EXACT SAME CHILD who is holding the frame — ` +
  `identical face, same hairstyle and hair colour, same skin tone, same features. It must be instantly obvious that the little ` +
  `collectible IS a personalized figure of that very child (same kid, twice: real in the room, and as the figurine in the frame). ` +
  `Keep a cozy warm Brazilian home setting, soft golden natural light, tasteful blurred background. ` +
  `Tender, premium, high quality. ${extra || ''} Vertical portrait 3:4.`;

const CARD = (club) => `EDIT THIS PHOTO. Keep the white framed portrait on a clean neutral background, product-card style. ` +
  FIGURE.replace('a Brazilian football club home kit', `the ${club} home kit`) +
  ` The framed photo fills the frame edge to edge. Crisp, premium, realistic. Vertical portrait 3:4.`;

// FIX de identidade: edita a imagem ATUAL (criança certa já segurando) e muda SÓ o boneco do quadro.
const FIXID = `This photo shows a YOUNG CHILD holding a white framed portrait. Keep the child, the room, the frame ` +
  `and the whole composition EXACTLY as they are — do not change the person holding it. ONLY replace the figurine ` +
  `INSIDE the frame: it must be a hyper-realistic collectible BOBBLEHEAD of THE EXACT SAME CHILD who is holding the ` +
  `frame — copy that child's precise face, hairstyle, hair colour and skin tone onto the figurine. It is a YOUNG KID, ` +
  `NEVER an adult, NEVER an elderly grey-haired man, NOT a cartoon or Funko. Short thick neck, child proportions, ` +
  `wearing a Brazilian football kit with a small crest, one foot on a ball, on a two-layer grass base with a kids' name ` +
  `engraved, blurred golden-hour stadium behind. Everything outside the frame stays identical. Vertical portrait 3:4.`;

const FIX = [
  { src: 'cena5.jpg', out: 'cena5.png', srcDir: OUT, prompt: FIXID },
  { src: 'cena6.jpg', out: 'cena6.png', srcDir: OUT, prompt: FIXID },
];

const CARDS2 = [
  { src: 'qp1.jpg', out: 'qp4.png', prompt: CARD('Flamengo (red and black horizontal hoops)') },
  { src: 'qp2.jpg', out: 'qp5.png', prompt: CARD('Palmeiras (all green with white details)') },
];

const ALL = [
  { src: 'cena2.jpg', out: 'cena2.png', prompt: LIFE('The child sits on a cozy sofa, hugging the frame to their chest, pure pride.') },
  { src: 'cena1.jpg', out: 'cena1.png', prompt: LIFE('The child shows the framed portrait to the camera in a bright living room.') },
  { src: 'cena3.jpg', out: 'cena3.png', prompt: LIFE('Close warm moment: a parent kneeling beside the smiling child who holds the frame.') },
  { src: 'cena4.jpg', out: 'cena4.png', prompt: LIFE('The framed portrait hangs on the wall of a child bedroom; the happy kid points at it.') },
  { src: 'cena5.jpg', out: 'cena5.png', prompt: LIFE('The child holds the frame up next to their own face, comparing, laughing.') },
  { src: 'cena6.jpg', out: 'cena6.png', prompt: LIFE('The child on the living-room floor, framed portrait leaning beside them.') },
  { src: 'qp1.jpg', out: 'qp1.png', prompt: CARD('Grêmio (blue, black and white vertical stripes)') },
  { src: 'qp2.jpg', out: 'qp2.png', prompt: CARD('Corinthians (white with black details)') },
  { src: 'qp3.jpg', out: 'qp3.png', prompt: CARD('Atlético-MG (black and white vertical stripes)') },
];

const mode = process.argv[2] || 'sample';
const jobs = mode === 'all'    ? ALL
           : mode === 'fix'    ? FIX        // corrige identidade do boneco no quadro (cena5+cena6)
           : mode === 'cards2' ? CARDS2     // +2 cards: Flamengo + Palmeiras (qp4, qp5)
           : mode === 'rest'  ? ALL.filter((_, i) => i !== 0 && i !== 7)
           : mode === 'cenas' ? ALL.filter((j) => j.src.startsWith('cena'))   // as 6 cenas de gente (identidade importa)
           : ALL.some((j) => j.src === mode + '.jpg') ? ALL.filter((j) => j.src === mode + '.jpg') // ex: node gen-kids.mjs qp3
           : [ALL[0], ALL[7]]; // sample = hero (cena2) + qp2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < jobs.length; i++) {
  const j = jobs[i];
  process.stdout.write(`→ ${j.src} → ${j.out} … `);
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    try {
      await img2img({ inputPaths: [path.join(j.srcDir || SRC, j.src)], prompt: j.prompt, outputPath: path.join(OUT, j.out), aspectRatio: '3:4' });
      console.log('ok'); done = true;
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('429') && attempt < 3) { await sleep(20000); continue; }  // rate limit → espera e tenta de novo
      console.log('ERRO: ' + msg.slice(0, 200));
    }
  }
  if (i < jobs.length - 1) await sleep(6000);   // respiro entre gerações (evita 429 em rajada)
}
console.log('feito.');
