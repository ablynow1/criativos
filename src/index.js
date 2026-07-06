import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateVideoClip } from './generateVideoClip.js';
import { generateNarration } from './generateNarration.js';
import { generateSubtitles } from './generateSubtitles.js';
import { mergeFinal } from './mergeFinal.js';
import { getDurationSeconds } from './ffmpeg.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
      if (value !== true) i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config;
  const outputPath = args.out || 'output/final.mp4';

  if (!configPath) {
    console.error('Uso: node src/index.js --config inputs/projeto.json [--out output/final.mp4]');
    process.exit(1);
  }

  const tmpDir = path.join('tmp', path.basename(configPath, '.json'));
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  const project = JSON.parse(await readFile(configPath, 'utf-8'));
  const { narracao, cenas } = project;

  if (!narracao || !Array.isArray(cenas) || cenas.length === 0) {
    throw new Error('projeto.json precisa de "narracao" (string) e "cenas" (array de {imagem, prompt})');
  }

  console.log(`[1/4] Gerando narração (TTS) + timestamps...`);
  const narrationAudioPath = path.join(tmpDir, 'narracao.mp3');
  const { wordTimings } = await generateNarration({ text: narracao, outputAudioPath: narrationAudioPath });
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
  });

  console.log(`\n✅ Pronto: ${outputPath}`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
