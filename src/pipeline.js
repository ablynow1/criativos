import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateVideoClip } from './generateVideoClip.js';
import { generateNarration } from './generateNarration.js';
import { generateSubtitles } from './generateSubtitles.js';
import { mergeFinal } from './mergeFinal.js';
import { getDurationSeconds } from './ffmpeg.js';

/**
 * Roda o pipeline completo (TTS → Veo → legenda → merge) a partir de um
 * objeto de projeto ({ narracao, cenas, voz?, estiloLegenda? }).
 */
export async function runPipeline(project, { tmpDir, outputPath }) {
  const { narracao, cenas, voz, estiloLegenda } = project;

  if (!narracao || !Array.isArray(cenas) || cenas.length === 0) {
    throw new Error('projeto precisa de "narracao" (string) e "cenas" (array de {imagem, prompt})');
  }

  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  console.log(`[1/4] Gerando narração (TTS) + timestamps...`);
  const narrationAudioPath = path.join(tmpDir, 'narracao.mp3');
  const { wordTimings } = await generateNarration({ text: narracao, outputAudioPath: narrationAudioPath, voiceName: voz });
  const narrationDuration = await getDurationSeconds(narrationAudioPath);
  console.log(`   narração: ${narrationDuration.toFixed(1)}s`);

  const estimatedClipsDuration = cenas.length * 8;
  if (Math.abs(estimatedClipsDuration - narrationDuration) > 3) {
    console.warn(
      `   ⚠️  ${cenas.length} cena(s) x 8s = ${estimatedClipsDuration}s, mas a narração tem ${narrationDuration.toFixed(1)}s.` +
      ` Ajuste o número de cenas em "cenas" pra bater melhor com o tempo da narração.`
    );
  }

  console.log(`[2/4] Gerando ${cenas.length} clipe(s) de vídeo via Veo (isso pode levar alguns minutos)...`);
  const clipPaths = [];
  for (let i = 0; i < cenas.length; i += 1) {
    const cena = cenas[i];
    const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
    console.log(`   cena ${i + 1}/${cenas.length}: ${cena.imagem}`);
    await generateVideoClip({
      imagePath: cena.imagem,
      prompt: cena.prompt,
      outputPath: clipPath,
      aspectRatio: '9:16',
      resolution: '1080p',
      durationSeconds: cena.duracaoSegundos || 8,
    });
    clipPaths.push(clipPath);
  }

  console.log(`[3/4] Gerando legendas sincronizadas...`);
  const srtPath = path.join(tmpDir, 'legenda.srt');
  await generateSubtitles({
    wordTimings,
    totalDurationSeconds: narrationDuration,
    outputSrtPath: srtPath,
  });

  console.log(`[4/4] Montando vídeo final (áudio + legenda queimada)...`);
  await mergeFinal({
    clipPaths,
    narrationAudioPath,
    srtPath,
    outputPath,
    tmpDir,
    subtitleStyle: estiloLegenda,
  });

  console.log(`\n✅ Pronto: ${outputPath}`);
  return outputPath;
}
