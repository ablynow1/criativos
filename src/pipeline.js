import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateVideoClip } from './generateVideoClip.js';
import { kenBurns } from './kenBurns.js';
import { generateNarration } from './generateNarration.js';
import { generateSubtitles } from './generateSubtitles.js';
import { generateMusic, MUSIC_MOODS } from './musicGen.js';
import { mergeFinal } from './mergeFinal.js';
import { getDurationSeconds } from './ffmpeg.js';

/**
 * Roda o pipeline completo (TTS → [trilha] → Veo+áudio nativo → legenda → mix) a
 * partir de um objeto de projeto:
 *   { narracao, cenas, voz?, estiloLegenda?, audio?: { ambiente?: bool, musica?: mood|'nenhuma' } }
 * - `audio.ambiente` (default true): som nativo do Veo como camada de realismo.
 * - `audio.musica` (default 'nenhuma'): trilha Lyria — emocional|energetica|epica|suave|misteriosa.
 */
export async function runPipeline(project, { tmpDir, outputPath }) {
  const { narracao, cenas, voz, estiloLegenda } = project;
  const audio = project.audio || {};
  const ambiente = audio.ambiente !== false;
  const mood = audio.musica && audio.musica !== 'nenhuma' ? audio.musica : null;

  if (!narracao || !Array.isArray(cenas) || cenas.length === 0) {
    throw new Error('projeto precisa de "narracao" (string) e "cenas" (array de {imagem, prompt})');
  }

  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  console.log(`[1/4] Gerando narração (TTS) + timestamps...`);
  const narrationAudioPath = path.join(tmpDir, 'narracao.mp3');
  const { wordTimings } = await generateNarration({ text: narracao, outputAudioPath: narrationAudioPath, voiceName: voz, direcao: project.direcaoVoz });
  const narrationDuration = await getDurationSeconds(narrationAudioPath);
  console.log(`   narração: ${narrationDuration.toFixed(1)}s`);

  const estimatedClipsDuration = cenas.length * 8;
  if (Math.abs(estimatedClipsDuration - narrationDuration) > 3) {
    console.warn(
      `   ⚠️  ${cenas.length} cena(s) x 8s = ${estimatedClipsDuration}s, mas a narração tem ${narrationDuration.toFixed(1)}s.` +
      ` Ajuste o número de cenas em "cenas" pra bater melhor com o tempo da narração.`
    );
  }

  let musicPath = null;
  if (mood) {
    console.log(`[1.5/4] Gerando trilha musical (Lyria, mood: ${mood})...`);
    try {
      musicPath = path.join(tmpDir, 'trilha.wav');
      await generateMusic({ mood, outputPath: musicPath });
    } catch (err) {
      console.warn(`   ⚠️  trilha falhou (${err.message.slice(0, 120)}) — seguindo sem música.`);
      musicPath = null;
    }
  }

  console.log(`[2/4] Gerando ${cenas.length} clipe(s) de vídeo via Veo${ambiente ? ' +áudio nativo' : ''} (isso pode levar alguns minutos)...`);
  const clipPaths = [];
  for (let i = 0; i < cenas.length; i += 1) {
    const cena = cenas[i];
    const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
    const dur = cena.duracaoSegundos || 8;
    console.log(`   cena ${i + 1}/${cenas.length}: ${cena.imagem}`);
    try {
      await generateVideoClip({
        imagePath: cena.imagem,
        prompt: cena.prompt,
        outputPath: clipPath,
        aspectRatio: '9:16',
        resolution: '1080p',
        durationSeconds: dur,
        ambiente,
      });
    } catch (err) {
      if (err.code === 'VEO_RAI_BLOCKED') {
        // Veo bloqueou (ex: criança) — não falha o job, cai pro movimento Ken Burns.
        console.warn(`   ⚠️  Veo bloqueou a cena ${i + 1} (filtro de conteúdo) — usando movimento Ken Burns na imagem.`);
        await kenBurns({ imagePath: cena.imagem, outputPath: clipPath, durationSeconds: dur, index: i });
      } else {
        throw err;
      }
    }
    clipPaths.push(clipPath);
  }

  console.log(`[3/4] Gerando legendas sincronizadas...`);
  const srtPath = path.join(tmpDir, 'legenda.srt');
  await generateSubtitles({
    wordTimings,
    totalDurationSeconds: narrationDuration,
    outputSrtPath: srtPath,
  });

  console.log(`[4/4] Mixando vídeo final (narração + ambiente + trilha, master -14 LUFS)...`);
  await mergeFinal({
    clipPaths,
    narrationAudioPath,
    srtPath,
    outputPath,
    tmpDir,
    subtitleStyle: estiloLegenda,
    musicPath,
    ambiente,
  });

  console.log(`\n✅ Pronto: ${outputPath}`);
  return outputPath;
}
