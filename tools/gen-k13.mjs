// Gera K13: keyframe da abertura com o verso do quadro substituído pela
// FOTO REAL do cliente (inputs/verso-real.jpeg) como referência direta.
import { img2img } from '../src/img2img.js';

const prompt = `First image: a woman holding a large picture frame turned away from the camera in a framing store — keep EVERYTHING about it (the woman, her pose, her hands, the store, the lighting, the frame size and angle) IDENTICAL.
Second image: a real photo of the BACK of a framed picture, lying on a floor.
Task: replace ONLY the visible back of the frame in the first image so it reproduces the back shown in the second image EXACTLY and faithfully: outer edge of light raw pine wood; at the top a horizontal raw-wood slat with a small galvanized SAWTOOTH metal hanger at its center and two crooked strips of orange-tan kraft tape on either side; a wide border of warm orange-tan gummed kraft paper tape around the inner perimeter with folded corners and small tears; a medium-brown MDF hardboard panel in the center with faint stains and tiny staple marks. Match the second image precisely — same layout, same proportions, same details — but rendered in the store lighting and perspective of the first image. Do not change anything else. Photorealistic, no camera UI.`;

await img2img({
  inputPaths: ['output/mockup-loja/keyframes/K12.png', 'inputs/verso-real.jpeg'],
  prompt,
  outputPath: 'output/mockup-loja/keyframes/K13.png',
  aspectRatio: '9:16',
});
console.log('K13 ok');
