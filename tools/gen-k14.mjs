// K14 = K13 com as CORES do verso corrigidas pra casar com a foto real.
import { img2img } from '../src/img2img.js';

const prompt = `First image: a woman holding a large picture frame showing its back, in a framing store — keep EVERYTHING identical (woman, pose, hands, store, lighting, frame angle, composition).
Second image: the real reference photo of the frame's back.
Fix ONLY the colors and materials of the frame back in the first image to match the second image exactly: the kraft paper tape border must be a warm ORANGE-TAN (gummed paper tape color, like in the reference — not pale beige), the central MDF hardboard panel must be a medium warm BROWN with subtle fiber texture and faint stains, the outer edge stays light raw pine wood, and the small galvanized sawtooth hanger sits on the horizontal wood slat at the top with two crooked orange-tan tape strips beside it. Same warm store lighting as the scene. Do not change anything else. Photorealistic.`;

await img2img({
  inputPaths: ['output/mockup-loja/keyframes/K13.png', 'inputs/verso-real.jpeg'],
  prompt,
  outputPath: 'output/mockup-loja/keyframes/K14.png',
  aspectRatio: '9:16',
});
console.log('K14 ok');
