#!/usr/bin/env node
// Mockup "loja de molduras" com quadro em TELA VERDE (chroma key) — replica a
// estrutura do anúncio de referência da Ad Library (id 34784776947833729):
// mulher apresenta um quadro grande numa loja de molduras, depois o quadro
// aparece pendurado na parede. A arte fica 100% verde (#00FF00) pra receber
// qualquer arte depois via chroma key, sem regenerar o vídeo.
//
// Uso:
//   node tools/mockup-loja.mjs keyframes          # gera os 6 keyframes (Nano Banana Pro)
//   node tools/mockup-loja.mjs keyframes K3 K5    # regenera só os keyframes citados
//   node tools/mockup-loja.mjs clips              # anima os 6 keyframes no Veo 3.1 (8s cada)
//   node tools/mockup-loja.mjs clips V2 V5        # regenera só os clipes citados
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { generateProductImage } from '../src/generateProductImage.js';
import { img2img } from '../src/img2img.js';
import { generateVideoClip } from '../src/generateVideoClip.js';

const OUT = path.resolve('output/mockup-loja');
const KF = path.join(OUT, 'keyframes');
const CLIPS = path.join(OUT, 'clips');

// Estilo comum a todas as cenas — loja de molduras premium, noite, tom UGC.
const STYLE = `Photorealistic vertical 9:16 frame from a casual smartphone video (natural colors, warm cozy lighting, shallow depth of field). Clean full-bleed photo WITHOUT any camera interface overlay — no recording indicator, no buttons, no HUD, no watermark.
Setting: an upscale picture-framing studio at night — honey-toned wood floor, black ceiling with spotlights, a glass partition showing a blue-lit back office, and display walls covered with dozens of chevron-shaped corner samples of picture-frame mouldings (gold, black, white, silver, walnut).
Subject: an elegant Brazilian woman in her late 20s, long wavy honey-blonde hair, natural makeup, red nail polish, wearing a fitted off-white satin midi dress.
The product: a VERY LARGE vertical poster frame, about 1 meter tall, with a thin matte-black wooden moulding.
CRITICAL REQUIREMENT: the entire artwork area inside the black moulding is a SOLID, FLAT, UNIFORM BRIGHT CHROMA-KEY GREEN (#00FF00) — perfectly even pure green from edge to edge, like a professional green screen. NO reflections, NO gradient, NO texture, NO glare and NO shadows on the green area. Only the thin black moulding around it.`;

const SAME = `Use the reference image for the woman's identity (same face, same hair, same off-white satin dress, same red nails), the same framing studio and the same large black frame with the flat chroma-key green (#00FF00) artwork area — keep the green perfectly solid, flat and uniform, no reflections.`;

// K1 é o master; K2–K6 derivam dele via img2img pra manter identidade.
const KEYFRAMES = {
  K1: {
    master: true,
    prompt: `${STYLE}
Shot: full-body wide shot. She stands in the middle of the store holding the large frame half-turned (about 45 degrees from camera), as if she is just turning it around to present it. The green surface is partially visible in perspective. She looks at the frame with a soft smile.`,
  },
  K2: {
    prompt: `${SAME}
New shot: medium frontal shot. The large green-screen frame now faces the camera straight on, filling most of the lower 2/3 of the image. Her head and shoulders appear above the top edge of the frame, smiling warmly at the camera, hands gripping the sides of the frame. Store background softly blurred.`,
  },
  K3: {
    prompt: `${SAME}
New shot: close-up on the frame itself. The flat green surface and the thin black moulding fill almost the whole image, slightly angled in gentle perspective. One of her hands with red nails holds the left edge. Warm store lights in the blurry background.`,
  },
  K4: {
    prompt: `${SAME}
New shot: close frontal shot. She stands BEHIND the large frame: only her head is visible above the top edge, chin slightly down, looking at the camera with a soft smile, both hands with red nail polish resting flat on the top edge of the black moulding. Background: wall of chevron frame samples, softly blurred.`,
  },
  K5: {
    prompt: `${SAME}
New shot: wide shot of a different corner of the same store. The large green-screen frame now HANGS on a clean white gallery wall with a small black picture light mounted above it. The woman stands to the side, seen from behind in three-quarter view, admiring the framed green surface on the wall. Wood floor, store ambience around.`,
  },
  K6: {
    prompt: `${SAME}
New shot: no people. The large green-screen frame hanging on the clean white gallery wall with the black picture light above it, seen from a 30-degree side angle with gentle perspective, glass storefront and street lights softly blurred in the background. Elegant gallery mood.`,
  },
  // K7 = keyframe do VERSO do quadro (abertura do reveal). Mesma mulher/loja/quadro,
  // mas a face voltada pra câmera é as COSTAS reais de um quadro emoldurado.
  K7: {
    prompt: `Use the reference image ONLY for the woman's identity (same face, same hair, same off-white satin dress, same red nails), the same picture-framing studio and the same large frame size and proportions.
New shot: full-body wide shot, she stands in the middle of the store holding the very large vertical frame turned AWAY from the camera — we see the BACK of the framed picture facing us, tilted about 20 degrees, as if she is just about to turn it around to present it.
CRITICAL — render the BACK of a real framed picture exactly like this: a warm medium-brown KRAFT PAPER dust cover stretched across the back; a border of lighter beige kraft masking tape sealing the paper all around the inner edge of the frame; a small galvanized silver metal SAWTOOTH TRIANGLE hanger fixed at the top-center; the thin matte-black wooden moulding visible as the outer edge all around. Slightly worn, authentic, a few small staples and marks. NO green anywhere on this back — it is brown kraft paper. Warm cozy store lighting, shallow depth of field, natural smartphone-video look, no camera UI overlay.`,
  },
};

// Prompts de movimento do Veo (câmera discreta estilo UGC + som ambiente).
const VEO = {
  V1: {
    kf: 'K1',
    prompt: `She smoothly rotates the large frame until the flat green surface faces the camera, then holds it steady with both hands and smiles at the camera. The green area stays perfectly solid flat chroma green (#00FF00), no reflections. Static camera with a very subtle handheld sway, no zoom. Quiet framing-shop room tone, soft fabric and wood sounds.`,
  },
  V2: {
    kf: 'K2',
    prompt: `She holds the big green-screen frame facing the camera, makes tiny natural adjustments to her grip, tilts her head slightly and smiles warmly. The green surface stays perfectly flat solid chroma green (#00FF00), no reflections. Very slow gentle push-in. Cozy store ambience, faint room tone.`,
  },
  V3: {
    kf: 'K3',
    prompt: `Slow smooth diagonal camera glide along the large flat green surface and the thin black moulding, her hand with red nails steady on the edge. The green stays perfectly uniform chroma green (#00FF00), no reflections, no glare. Soft store room tone.`,
  },
  V4: {
    kf: 'K4',
    prompt: `She rests her hands with red nails on the top edge of the frame, taps her fingers gently once, tilts her head and smiles at the camera. Green surface stays perfectly flat solid chroma green (#00FF00). Subtle slow push-in, shallow depth of field. Quiet store ambience.`,
  },
  V5: {
    kf: 'K5',
    prompt: `The framed flat green screen hangs on the white gallery wall under the picture light. The woman stands to the side quietly admiring the framed artwork, gently nodding and turning her head as she appreciates it. Green stays perfectly solid flat chroma green (#00FF00). Static camera. Quiet store ambience.`,
  },
  V6: {
    kf: 'K6',
    prompt: `Slow cinematic dolly-in toward the framed flat green screen hanging on the white gallery wall, gentle parallax against the storefront background. The green surface stays perfectly uniform solid chroma green (#00FF00), no reflections. Quiet elegant gallery ambience.`,
  },
  // V7 = HOLD do VERSO real (kraft + pendural) com leve movimento natural.
  // Movimento contido (sem giro grande do quadro) pra passar no filtro RAI do Veo;
  // o giro pro verde fica no V1. Ela apenas segura o verso e começa a inclinar de leve.
  V7: {
    kf: 'K7',
    prompt: `She stands holding the large picture frame with its brown kraft-paper BACK gently facing the camera, looking down at it warmly. She makes small natural movements — a subtle handheld sway, adjusting her grip, and slowly begins to tilt the frame forward just a little, as if about to turn it around to show it. The kraft-paper back and the small metal hanger stay clearly visible the whole time. No large rotation. Calm, gentle, elegant. Static camera, no zoom. Quiet framing-shop room tone, soft fabric and wood sounds.`,
  },
};

async function makeKeyframes(only) {
  await mkdir(KF, { recursive: true });
  const masterPath = path.join(KF, 'K1.png');

  if (!only.length || only.includes('K1')) {
    console.log('→ K1 (master, text-to-image)…');
    await generateProductImage({ prompt: KEYFRAMES.K1.prompt, outputPath: masterPath });
    console.log('  ok', masterPath);
  }
  if (!existsSync(masterPath)) throw new Error('K1.png não existe — gere o master primeiro.');

  for (const id of Object.keys(KEYFRAMES).filter((k) => k !== 'K1')) {
    if (only.length && !only.includes(id)) continue;
    console.log(`→ ${id} (img2img a partir do K1)…`);
    await img2img({
      inputPaths: masterPath,
      prompt: KEYFRAMES[id].prompt,
      outputPath: path.join(KF, `${id}.png`),
      aspectRatio: '9:16',
    });
    console.log('  ok', path.join(KF, `${id}.png`));
  }
}

async function makeClips(only) {
  await mkdir(CLIPS, { recursive: true });
  const jobs = Object.entries(VEO).filter(([id]) => !only.length || only.includes(id));
  // Lotes de 3 em paralelo — equilíbrio entre velocidade e quota da Vertex.
  const failed = [];
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = jobs.slice(i, i + 3);
    // allSettled: um clipe bloqueado pelo RAI não pode derrubar o lote inteiro.
    const results = await Promise.allSettled(
      batch.map(async ([id, job]) => {
        const imagePath = path.join(KF, `${job.kf}.png`);
        if (!existsSync(imagePath)) throw new Error(`Keyframe ${job.kf}.png não existe.`);
        console.log(`→ ${id} (Veo 3.1, 8s, a partir de ${job.kf})…`);
        await generateVideoClip({
          imagePath,
          prompt: job.prompt,
          outputPath: path.join(CLIPS, `${id}.mp4`),
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSeconds: 8,
          ambiente: true,
        });
        console.log(`  ok ${id}.mp4`);
      })
    );
    results.forEach((r, j) => {
      if (r.status === 'rejected') {
        failed.push(batch[j][0]);
        console.error(`  FALHOU ${batch[j][0]}: ${r.reason?.message?.slice(0, 200)}`);
      }
    });
  }
  if (failed.length) {
    console.error(`\nClipes com falha: ${failed.join(' ')} — rode de novo só eles: node tools/mockup-loja.mjs clips ${failed.join(' ')}`);
    process.exitCode = 1;
  }
}

const [stage, ...only] = process.argv.slice(2);
if (stage === 'keyframes') await makeKeyframes(only);
else if (stage === 'clips') await makeClips(only);
else {
  console.log('Uso: node tools/mockup-loja.mjs keyframes|clips [IDs…]');
  process.exit(1);
}
