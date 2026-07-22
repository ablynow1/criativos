import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, getDurationSeconds, hasAudioStream } from './ffmpeg.js';
import { getSubtitleStyle } from './subtitleStyles.js';

/**
 * Monta o vídeo final com MIXAGEM DE ESTÚDIO:
 *   - narração em primeiro plano (normalizada, sempre inteligível)
 *   - som ambiente nativo dos clipes Veo como camada de realismo, com DUCKING
 *     (abaixa sozinho quando a narração fala — sidechain compression)
 *   - trilha musical opcional (Lyria) com fade in/out, também duckada
 *   - master em -14 LUFS (padrão de loudness das plataformas sociais/Meta)
 *   - legenda queimada por cima
 * Saída: 1080x1920.
 */
export async function mergeFinal({
  clipPaths,
  narrationAudioPath,
  srtPath,
  outputPath,
  tmpDir,
  subtitleStyle = 'caixa',
  musicPath = null,   // WAV/MP3 da trilha (opcional)
  ambiente = true,    // usa o som nativo dos clipes como camada ambiente
  marginV = null,     // px do rodapé pra legenda (zona segura do Reels)
}) {
  // --- 1) concatena os clipes preservando o áudio nativo ---
  let videoInput = clipPaths[0];
  if (clipPaths.length > 1) {
    // garante faixa de áudio em todo clipe (clipes sem som ganham silêncio) pro concat não quebrar
    const normalized = [];
    for (let i = 0; i < clipPaths.length; i += 1) {
      const p = clipPaths[i];
      if (await hasAudioStream(p)) { normalized.push(p); continue; }
      const fixed = path.join(tmpDir, `clip-silent-${i}.mp4`);
      await runFfmpeg(['-i', p, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', fixed]);
      normalized.push(fixed);
    }
    const inputs = normalized.flatMap((p) => ['-i', p]);
    const n = normalized.length;
    const pads = normalized.map((_, i) => `[${i}:v][${i}:a]`).join('');
    const concatenated = path.join(tmpDir, 'concatenated.mp4');
    await runFfmpeg([
      ...inputs,
      '-filter_complex', `${pads}concat=n=${n}:v=1:a=1[v][a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
      '-c:a', 'aac', '-ar', '48000',
      concatenated,
    ]);
    videoInput = concatenated;
  }

  const videoDuration = await getDurationSeconds(videoInput);
  const useAmbient = ambiente !== false && await hasAudioStream(videoInput);
  const useMusic = Boolean(musicPath);

  // --- 2) monta o filtergraph da mixagem ---
  const srtEscaped = srtPath.replace(/:/g, '\\:');
  let styleString = getSubtitleStyle(subtitleStyle);
  // `marginV` (opcional): sobe a legenda pra fora da UI do Instagram. O Reels
  // cobre ~450px no rodapé — sem isso a legenda nasce atrás dos botões.
  // Só quem passa o parâmetro muda (o Cricri segue com o padrão dele).
  if (marginV) {
    styleString = /MarginV=\d+/.test(styleString)
      ? styleString.replace(/MarginV=\d+/, `MarginV=${marginV}`)
      : `${styleString},MarginV=${marginV}`;
  }

  const args = ['-i', videoInput, '-i', narrationAudioPath];
  if (useMusic) args.push('-i', musicPath);
  const musIdx = 2; // índice do input da música quando presente

  const layers = 1 + (useAmbient ? 1 : 0) + (useMusic ? 1 : 0);
  const fc = [];

  // narração: normaliza e clona pros sidechains do ducking
  // apad até a duração do vídeo ANTES do split. Sem isso o sidechaincompress
  // do ducking morre quando a fala acaba (ele para no mais curto dos dois
  // lados) e leva junto ambiente e trilha: num vídeo de 15s com 4,7s de
  // narração, os outros 10s saíam MUDOS. O -t no fim corta na medida.
  const durAudio = (videoDuration + 0.3).toFixed(2);
  const scCopies = (useAmbient ? 1 : 0) + (useMusic ? 1 : 0);
  if (scCopies > 0) {
    const outs = ['[nar]', ...Array.from({ length: scCopies }, (_, i) => `[sc${i}]`)].join('');
    fc.push(`[1:a]loudnorm=I=-16:TP=-2,aresample=48000,apad=whole_dur=${durAudio},asplit=${scCopies + 1}${outs}`);
  } else {
    fc.push(`[1:a]loudnorm=I=-16:TP=-2,aresample=48000[nar]`);
  }

  let sc = 0;
  if (useAmbient) {
    // ambiente do Veo: presença real, mas cede pra voz (ducking)
    fc.push(`[0:a]aresample=48000,volume=0.9[amb]`);
    fc.push(`[amb][sc${sc}]sidechaincompress=threshold=0.02:ratio=12:attack=10:release=400[ambd]`);
    sc += 1;
  }
  if (useMusic) {
    // trilha: loopa se precisar, corta na duração, fades, nível de fundo, ducking
    const fadeOutStart = Math.max(0, videoDuration - 1.4).toFixed(2);
    fc.push(
      `[${musIdx}:a]aresample=48000,aloop=loop=-1:size=1440000,atrim=0:${(videoDuration + 0.2).toFixed(2)},` +
      `afade=t=in:d=0.6,afade=t=out:st=${fadeOutStart}:d=1.4,volume=0.32[mus]`
    );
    fc.push(`[mus][sc${sc}]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=500[musd]`);
  }

  const mixIn = ['[nar]', useAmbient ? '[ambd]' : null, useMusic ? '[musd]' : null].filter(Boolean).join('');
  // master: -14 LUFS integrado (alvo das plataformas), true peak -1.5
  // duration=LONGEST, nunca "first": "first" é a NARRAÇÃO, e ela quase sempre
  // acaba antes do vídeo — o mix morria junto e o resto saía mudo (num vídeo de
  // 15s com 4,7s de fala, 10s sem trilha e sem ambiente). O -t no final é quem
  // corta na duração certa.
  fc.push(`${mixIn}amix=inputs=${layers}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

  // vídeo: legenda queimada
  fc.push(`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${srtEscaped}:force_style='${styleString}'[vout]`);

  await runFfmpeg([
    ...args,
    '-filter_complex', fc.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    '-t', String(videoDuration),
    outputPath,
  ]);

  return outputPath;
}
