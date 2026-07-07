import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { generateClip } from './videoEngine.js';
import { refineImage } from './refineImage.js';
import { generateNarration } from './generateNarration.js';
import { generateSubtitles } from './generateSubtitles.js';
import { mergeFinal } from './mergeFinal.js';
import { getDurationSeconds } from './ffmpeg.js';

// Resolve um flag booleano com precedência: cena > projeto > default (config/env).
function resolveFlag(sceneVal, projectVal, fallback) {
  if (sceneVal !== undefined) return Boolean(sceneVal);
  if (projectVal !== undefined) return Boolean(projectVal);
  return fallback;
}

/**
 * Roda o pipeline completo (TTS → [refino] → motor de vídeo → legenda → merge)
 * a partir de um objeto de projeto:
 *   { narracao, cenas, voz?, estiloLegenda?, motor?, refino? }
 * - `motor`: "veo" (default) ou "freepik:<model>" (ex "freepik:kling-v2");
 *   pode ser sobrescrito por cena via `cena.motor`.
 * - `refino`: liga o upscaler de precisão antes do vídeo; por cena via `cena.refino`.
 */
export async function runPipeline(project, { tmpDir, outputPath }) {
  const { narracao, cenas, voz, estiloLegenda, motor, refino } = project;

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

  const engineDefault = motor || config.videoEngine;
  console.log(`[2/4] Gerando ${cenas.length} clipe(s) de vídeo (motor padrão: ${engineDefault}) — pode levar alguns minutos...`);
  const clipPaths = [];
  for (let i = 0; i < cenas.length; i += 1) {
    const cena = cenas[i];
    const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
    const engine = cena.motor || engineDefault;
    const doRefino = resolveFlag(cena.refino, refino, config.refineImages);

    let sourceImage = cena.imagem;
    if (doRefino) {
      const refinedPath = path.join(tmpDir, `refined-${i}${path.extname(cena.imagem) || '.png'}`);
      console.log(`   cena ${i + 1}/${cenas.length}: refinando imagem (upscaler de precisão)...`);
      sourceImage = await refineImage({ imagePath: cena.imagem, outputPath: refinedPath });
    }

    console.log(`   cena ${i + 1}/${cenas.length}: ${sourceImage} → motor ${engine}`);
    await generateClip({
      engine,
      imagePath: sourceImage,
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
