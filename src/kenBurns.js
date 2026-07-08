import { runFfmpeg } from './ffmpeg.js';

/**
 * Gera um clipe 1080x1920 (9:16, 24fps) com movimento Ken Burns (zoom/pan lento)
 * a partir de UMA imagem estática. Fallback pro Veo quando ele bloqueia a cena
 * (ex: filtro de conteúdo com criança). O clipe sai mudo — o áudio entra no merge.
 *
 * `index` varia o movimento entre cenas pra não ficarem idênticas.
 */
export async function kenBurns({ imagePath, outputPath, durationSeconds = 8, index = 0 }) {
  const fps = 24;
  const frames = Math.max(1, Math.round(durationSeconds * fps));
  const zoomTo = 1.14;
  const inc = (zoomTo - 1) / frames;

  // alterna o movimento por cena: 0=zoom-in centro, 1=zoom-in com deriva pra cima,
  // 2=zoom-out (começa fechado), 3=zoom-in com deriva pra baixo
  const variant = index % 4;
  let z, y;
  if (variant === 2) {
    // zoom-out: começa em zoomTo e diminui
    z = `if(eq(on,0),${zoomTo},max(zoom-${inc.toFixed(6)},1.0))`;
    y = `ih/2-(ih/zoom/2)`;
  } else {
    z = `min(zoom+${inc.toFixed(6)},${zoomTo})`;
    if (variant === 1) y = `ih*0.42-(ih/zoom/2)`;      // deriva pra cima
    else if (variant === 3) y = `ih*0.58-(ih/zoom/2)`; // deriva pra baixo
    else y = `ih/2-(ih/zoom/2)`;                        // centro
  }
  const x = `iw/2-(iw/zoom/2)`;

  const vf =
    `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,` +
    `zoompan=z='${z}':d=${frames}:x='${x}':y='${y}':s=1080x1920:fps=${fps},` +
    `format=yuv420p`;

  await runFfmpeg([
    '-loop', '1', '-i', imagePath, '-t', String(durationSeconds), '-r', String(fps),
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    outputPath,
  ]);
  return outputPath;
}
