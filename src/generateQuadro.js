import { img2img } from './img2img.js';
import { generateProductImage } from './generateProductImage.js';

/**
 * Deriva o TIPO de sujeito (adulto/criança/pet) a partir do grupo/nome do
 * estilo escolhido — usado só quando NÃO há foto de referência, pra saber
 * que tipo de personagem fictício inventar. Mesma lógica de idade que os
 * prompts do motor já respeitam (nunca adultizar criança, etc).
 */
function inferSubjectType(grupo = '', nomeEstilo = '') {
  if (/pet/i.test(grupo)) return 'pet';
  if (/criança/i.test(grupo) || /kids/i.test(nomeEstilo)) return 'child';
  return 'adult';
}

/**
 * Gera uma foto de referência FICTÍCIA (pessoa/criança/pet inventado, NÃO
 * baseado em ninguém real) a partir do contexto disponível — pro modo Quadro
 * funcionar sem exigir upload. Segue o mesmo padrão ético que o próprio motor
 * Malta já usa pros assets de exemplo das LPs (lp-src-kid/fut/fe): deixa
 * explícito no prompt que é fictício, pra nunca confundir com pessoa real.
 */
async function generateFictionalSubject({ subjectType, contextText, outputPath }) {
  const base = {
    adult: 'a completely FICTIONAL Brazilian adult (30s-50s), warm genuine expression, natural features',
    child: 'a completely FICTIONAL Brazilian child around 8 years old, joyful genuine expression, natural features — do NOT age the child up, keep authentic childlike proportions',
    pet: 'a completely FICTIONAL friendly dog, medium-sized, warm brown/golden short fur, calm natural expression',
  }[subjectType];

  const prompt = `IMPORTANT: invent a brand-new, entirely FICTIONAL subject — NOT a real person, NOT based on any actual photo, NOT a public figure. Generate a PHOTOREALISTIC reference photo (a real photo look, not a painting) of ${base}, wearing simple everyday clothing that fits the context below.

CONTEXT (use it to inform wardrobe, setting mood and vibe — keep it subtle and natural, don't over-illustrate it): ${contextText || 'a warm, ordinary Brazilian household moment'}

Head-and-shoulders portrait, facing camera, soft natural light, neutral indoor background slightly blurred, 85mm portrait lens look, natural skin/fur texture, sharp focus on the eyes. Vertical 9:16 framing, centered, comfortable margins. The subject is entirely invented and not based on any real individual.`;

  await generateProductImage({ prompt, outputPath });
  return outputPath;
}

/**
 * Molduras disponíveis pra cena "avatar segurando o quadro".
 * (a mesma linguagem visual dos funis Malta — dourada ornamentada é a do site.)
 */
export const MOLDURAS = {
  'ornate-gold': 'an ornate GILDED GOLD classical frame with detailed carved ornamentation and a beaded inner edge, like a premium fine-art gallery frame',
  'thin-black': 'a slim modern matte-black gallery frame with a clean thin profile',
  'natural-wood': 'a warm natural oak wood frame with a simple elegant profile',
  'baroque-silver': 'an elaborate antique silver baroque frame with scrollwork ornamentation',
  'none': 'a simple thin frame',
};

/**
 * Gera a cena de um avatar segurando o quadro:
 *  1) foto de referência + prompt do quadro  -> a ARTE pintada (img2img)
 *  2) [arte, foto de referência] -> foto realista do avatar segurando a arte emoldurada
 * Retorna { artworkPath, scenePath }.
 */
export async function generateQuadro({
  refPhotoPath,
  quadroPrompt,
  outDir,
  moldura = 'ornate-gold',
  cenario = 'a warm, cozy living room with soft natural window light',
  aspect = '9:16',
  tipoProduto = 'quadro', // 'quadro' (arte emoldurada) | 'boneco' (colecionável bobblehead)
  quadroGrupo = '',       // metadados do estilo escolhido — só usado pra inventar o fictício
  quadroNome = '',
  nomeCreativo = '',
}) {
  // sem foto de referência: inventa um personagem fictício a partir do contexto
  // disponível (estilo escolhido define adulto/criança/pet; cenário e nome do
  // criativo entram como pistas de vibe/ambientação).
  if (!refPhotoPath) {
    const subjectType = inferSubjectType(quadroGrupo, quadroNome);
    const contextText = [cenario, quadroNome, nomeCreativo].filter(Boolean).join(' · ');
    refPhotoPath = `${outDir}/ref-fictional.png`;
    await generateFictionalSubject({ subjectType, contextText, outputPath: refPhotoPath });
  }

  // passo 1 — o produto (retrato/product-shot 3:4, como o produto real)
  const artworkPath = `${outDir}/artwork.png`;
  await img2img({ inputPaths: refPhotoPath, prompt: quadroPrompt, outputPath: artworkPath, aspectRatio: '3:4' });

  // passo 2 — o avatar segurando o produto
  let scenePrompt;
  if (tipoProduto === 'boneco') {
    scenePrompt = `Create ONE photorealistic vertical ${aspect} photograph.
The FIRST reference image is a COLLECTIBLE BOBBLEHEAD FIGURINE (a product shot). The SECOND reference image is the real subject (a person, or a parent with their child).
Show that SAME real subject (matching the second image exactly — same face, hair, skin tone, age and features) in ${cenario}, proudly holding the COLLECTIBLE FIGURINE from the FIRST image with both hands at chest height, slightly tilted toward the camera.
CRITICAL COMPOSITION: the subject's OWN REAL FACE stays FULLY VISIBLE above the figurine. The subject looks at the figurine (or at the camera) with a delighted, proud smile. We clearly see BOTH the real face AND the collectible at once.
The figurine must look exactly like the FIRST reference image (same face, same kit colours, same base). Realistic natural hands with correct fingers around the figurine's base. Soft natural window light, warm cozy tones, shallow depth of field, photorealistic, high detail, candid joyful moment. The figurine is clearly visible, well lit and facing the camera.`;
  } else {
    const molduraDesc = MOLDURAS[moldura] || MOLDURAS['ornate-gold'];
    scenePrompt = `Create ONE photorealistic vertical ${aspect} photograph.
The FIRST reference image is an ARTWORK (a framed print / painting). The SECOND reference image is the real subject (a person, or an owner with their pet).
Show that SAME real subject (matching the second image exactly — same face, hair, skin tone, age and features) in ${cenario}, holding a FRAMED print of the FIRST image at CHEST HEIGHT, tilted slightly toward the camera.
CRITICAL COMPOSITION: hold the frame LOW at the chest so the subject's OWN REAL FACE stays FULLY VISIBLE above the top edge of the frame. The subject looks at the artwork with a moved, grateful, emotional smile, eyes slightly glossy. We clearly see BOTH the real face AND the framed artwork at once. Do NOT let the frame cover the face.
The art inside the frame must look exactly like the FIRST reference image (same style, same subject, same colors). The picture frame is ${molduraDesc}.
Realistic natural hands with correct fingers gripping the lower frame edges. Soft natural window light, warm cozy tones, shallow depth of field, photorealistic, high detail, candid heartfelt moment. The framed artwork is large, clearly visible and well lit, facing the camera.`;
  }

  const scenePath = `${outDir}/scene.png`;
  await img2img({ inputPaths: [artworkPath, refPhotoPath], prompt: scenePrompt, outputPath: scenePath, aspectRatio: aspect });

  return { artworkPath, scenePath };
}
