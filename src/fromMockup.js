import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildVeoPrompts, buildSegments, VEO_NEGATIVE } from './cenarios.js';
import { generateVideoClip } from './generateVideoClip.js';
import { generateNarration } from './generateNarration.js';
import { generateSubtitles } from './generateSubtitles.js';
import { generateMusic } from './musicGen.js';
import { baixaTrilhaYoutube } from './trilhaYoutube.js';
import { makeLimiter } from './limiter.js';

// quota do Veo costuma ser poucas operações simultâneas — degrada pra fila no 429
const veoLimiter = makeLimiter({ max: Math.max(1, Number(process.env.VEO_CONCURRENCY || 3)) });
import { variarNarracao } from './variarNarracao.js';
import { mergeFinal } from './mergeFinal.js';
import { runFfmpeg, getDurationSeconds } from './ffmpeg.js';

/**
 * Motor de MOCKUP (o "take") do Estúdio de Quadros.
 *
 * Cenário (palco pronto) + arte + parâmetros → vídeo nativo de ~25s. A arte é
 * aplicada nos keyframes verdes ANTES do Veo (é o que faz parecer real; ver
 * MOCKUP-NATIVO.md). Pipeline: art-keyframes.py → Veo (V*A) → montagem.
 *
 * Uso: node src/fromMockup.js --config <cfg.json> --out output/x.mp4
 * Config (web manda): {
 *   cenarioDir,           // pasta do cenário aprovado (tem cenario.json + keyframes/)
 *   arte,                 // caminho da arte já baixada
 *   movimento?='medio',   // calmo | medio | dinamico
 *   duracaoAlvo?=25,      // 15 | 25 | 30
 *   abertura?=false,      // liga o reveal do verso (se o cenário tiver)
 *   audio?: { narracao?, voz?, musica? }  // opcional; sem isso = só ambiente
 * }
 */
const PY = 'tools/.venv-compose/bin/python';
const ART_KF = 'tools/mockup-art-keyframes.py';

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

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`)),
    );
    p.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/fromMockup.js --config <cfg.json> --out <final.mp4>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const outputPath = args.out;
  const cenarioDir = cfg.cenarioDir;
  if (!cenarioDir || !existsSync(path.join(cenarioDir, 'cenario.json'))) {
    throw new Error(`cenário inválido em ${cenarioDir}`);
  }
  if (!cfg.arte || !existsSync(cfg.arte)) throw new Error(`arte não encontrada: ${cfg.arte}`);
  const cenario = JSON.parse(await readFile(path.join(cenarioDir, 'cenario.json'), 'utf-8'));

  const movimento = cfg.movimento || cenario.movimento || 'medio';
  const duracaoAlvo = Number(cfg.duracaoAlvo || 25);
  const slug = path.basename(outputPath, path.extname(outputPath));
  const tmpDir = path.join('tmp', `mockup-${slug}`);
  const kfDir = path.join(tmpDir, 'keyframes');
  const clipsDir = path.join(tmpDir, 'clips');
  await mkdir(kfDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  // abertura: só se pedida E o cenário tiver o clipe de reveal pré-renderizado
  // (o verso não tem arte, então o reveal é gerado 1x por cenário e reusado).
  const aberturaClip = path.join(cenarioDir, 'clips', 'abertura.mp4');
  const usaAbertura = !!cfg.abertura && cenario.temAbertura && existsSync(aberturaClip);
  if (cfg.abertura && !usaAbertura) {
    console.log('  (abertura pedida mas o cenário não tem reveal do verso — indo sem)');
  }

  // 1) copia os keyframes verdes do cenário pro tmp e aplica a arte neles
  console.log('[1/4] aplicando a arte nos keyframes do cenário…');
  for (const id of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) {
    const src = path.join(cenarioDir, 'keyframes', `${id}.png`);
    if (existsSync(src)) await copyFile(src, path.join(kfDir, `${id}.png`));
  }
  await run(PY, [ART_KF, '--arte', cfg.arte, '--kf-dir', kfDir]);

  // 2) gera os clipes V*A no Veo (só os usados na montagem; V1A é RAI-frágil e
  //    fica de fora — ver MOCKUP-NATIVO.md §4.2)
  const segments = buildSegments({ duracaoAlvo, abertura: usaAbertura ? 'ABERTURA' : null });
  const veo = buildVeoPrompts({ movimento });
  const usados = [...new Set(segments.map((s) => s[0]).filter((c) => c !== 'ABERTURA'))];
  console.log(`[2/4] gerando ${usados.length} cenas no Veo (${usados.join(' ')})…`);
  const genClip = async (id) => {
    const kfa = path.join(kfDir, `${veo[id].kf}.png`);
    if (!existsSync(kfa)) throw new Error(`${veo[id].kf}.png não existe`);
    await generateVideoClip({
      imagePath: kfa,
      prompt: veo[id].prompt,
      outputPath: path.join(clipsDir, `${id}.mp4`),
      aspectRatio: '9:16', resolution: '1080p', durationSeconds: 8, ambiente: true,
      negativePrompt: VEO_NEGATIVE,
    });
  };
  // POOL DESLIZANTE em vez de lote-comboio: no lote de 3, o lote inteiro
  // esperava o clipe mais lento antes de abrir as próximas vagas — e o Veo
  // varia de 1 a 3min por clipe. Aqui, terminou um, entra o próximo.
  // O polling é I/O puro (10s de sleep por rodada), então 3 em voo não pesa
  // no Mac; a cota é do limiter.
  const falhou = [];
  await Promise.all(usados.map((id) => veoLimiter.run(async () => {
    console.log(`  → ${id} (a partir de ${veo[id].kf})`);
    try { await genClip(id); }
    catch (e) {
      falhou.push(id);
      console.error(`  FALHOU ${id}: ${String(e.message).slice(0, 120)}`);
    }
  })));
  // RETRY: o RAI do Veo é estocástico — a mesma imagem passa numa 2ª/3ª tentativa
  // (foi o que resolveu o pastor na mão). Retenta as caídas, também em pool.
  for (let tent = 1; tent <= 2 && falhou.length; tent += 1) {
    const retry = falhou.splice(0, falhou.length);
    console.log(`  retry ${tent}/2 de: ${retry.join(' ')}`);
    await Promise.all(retry.map((id) => veoLimiter.run(async () => {
      try { await genClip(id); console.log(`  ✓ ${id} passou na retentativa`); }
      catch (e) { falhou.push(id); console.error(`  ainda falhou ${id}: ${String(e.message).slice(0, 100)}`); }
    })));
  }
  if (usaAbertura) await copyFile(aberturaClip, path.join(clipsDir, 'ABERTURA.mp4'));

  // se alguma cena falhou no RAI, remove os segmentos dela (não trava a entrega)
  const okSegments = segments.filter((s) => !falhou.includes(s[0]));
  if (okSegments.length < segments.length) {
    console.log(`  ${segments.length - okSegments.length} segmento(s) caíram (cena bloqueada); seguindo com ${okSegments.length}`);
  }
  if (!okSegments.length) throw new Error('todas as cenas falharam no Veo');

  // 3) montagem — CORTAR cada trecho num arquivo, depois CONCATENAR (concat
  //    demuxer). Evita o filter_complex único lendo o mesmo clipe em vários
  //    pontos de trim, que faz o ffmpeg empacar (medido: 24min+ a 97% CPU num
  //    grafo com reuso de input; cortes independentes = segundos). Preset
  //    veryfast (mockup não precisa de x264 slow — ~4s vs ~30s).
  console.log('[3/4] montando o vídeo…');
  const segDir = path.join(tmpDir, 'seg');
  await mkdir(segDir, { recursive: true });
  const listLines = [];
  for (let n = 0; n < okSegments.length; n += 1) {
    const [clip, tin, tout] = okSegments[n];
    const dur = (tout - tin).toFixed(3);
    const inClip = path.join(clipsDir, `${clip}.mp4`);
    const segOut = path.join(segDir, `seg${n}.mp4`);
    // -ss ANTES do -i = seek rápido; corta + escala + reencoda (curto, veryfast)
    await runFfmpeg([
      '-ss', String(tin), '-i', inClip, '-t', dur,
      // o Veo só gera 24fps — forçar 30 duplicava 1 frame a cada 4 (stutter visível
      // nos movimentos de câmera). 24 constante = movimento limpo de ponta a ponta.
      '-vf', 'fps=24,scale=1080:1920,setsar=1',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart',
      segOut,
    ]);
    listLines.push(`file '${path.resolve(segOut)}'`);
  }
  const listFile = path.join(tmpDir, 'list.txt');
  await writeFile(listFile, listLines.join('\n') + '\n');

  // concat demuxer (sem re-encode de vídeo) + dynaudnorm no áudio (nivela sem
  // travar — loudnorm single-pass empaca com clipes do Veo)
  const silent = path.join(tmpDir, 'montagem.mp4');
  await runFfmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile, '-t', String(duracaoAlvo),
    '-c:v', 'copy', '-af', 'dynaudnorm', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', silent,
  ]);

  // 4) áudio de anúncio (opcional): narração TTS + trilha Lyria + legenda
  //    queimada, com a mixagem de estúdio do repo (ducking sidechain, -14 LUFS).
  console.log('[4/4] áudio e finalização…');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const audio = cfg.audio || {};
  const temNarracao = !!(audio.narracao && String(audio.narracao).trim());
  const temMusica = !!(audio.musica && audio.musica !== 'nenhuma');

  let musicPath = null;
  if (audio.ytId) {
    // trilha do YouTube tem precedência sobre o mood gerado — quem escolheu
    // uma música específica não quer a do Lyria por cima
    musicPath = await baixaTrilhaYoutube({
      ytId: audio.ytId, inicio: audio.ytInicio, duracao: duracaoAlvo, tmpDir,
    });
  } else if (temMusica) {
    console.log(`  trilha (${audio.musica})…`);
    musicPath = path.join(tmpDir, 'trilha.wav');
    try {
      await generateMusic({ mood: audio.musica, outputPath: musicPath });
    } catch (e) {
      console.error(`  trilha falhou (seguindo sem): ${String(e.message).slice(0, 120)}`);
      musicPath = null;
    }
  }

  if (temNarracao) {
    let textoNarracao = String(audio.narracao).trim();
    // variação automática de copy (lote A/B): cada job reescreve a base com um
    // gancho diferente (temperatura alta ⇒ jobs independentes divergem sozinhos)
    if (audio.variar) {
      try {
        const v = await variarNarracao({ base: textoNarracao, duracaoAlvo });
        textoNarracao = v.narracao;
        console.log(`  copy variada (ângulo: ${v.angulo}): "${textoNarracao.slice(0, 70)}…"`);
      } catch (e) {
        console.error(`  variação de copy falhou (usando a base): ${String(e.message).slice(0, 100)}`);
      }
    }
    console.log('  narração (TTS)…');
    const narr = await generateNarration({
      text: textoNarracao,
      outputAudioPath: path.join(tmpDir, 'narracao.mp3'),
      voiceName: audio.voz || undefined,
      direcao: audio.direcaoVoz || undefined,
    });
    // SRT: com legenda desligada, um SRT vazio queima nada (mergeFinal exige o arquivo)
    const srtPath = path.join(tmpDir, 'legenda.srt');
    if (audio.legenda && audio.legenda !== 'nenhuma') {
      await generateSubtitles({
        wordTimings: narr.wordTimings,
        totalDurationSeconds: duracaoAlvo,
        outputSrtPath: srtPath,
        wordsPerCaption: 4,
      });
    } else {
      await writeFile(srtPath, '');
    }
    await mergeFinal({
      clipPaths: [silent],
      narrationAudioPath: narr.audioPath,
      srtPath,
      outputPath,
      tmpDir,
      subtitleStyle: audio.legenda && audio.legenda !== 'nenhuma' ? audio.legenda : 'caixa',
      musicPath,
      ambiente: true,
      marginV: 480, // acima dos 450px de UI do Reels (zona segura)
    });
  } else if (musicPath) {
    // só trilha (sem narração): mix simples ambiente + música com fade
    await runFfmpeg([
      '-i', silent, '-i', musicPath,
      '-filter_complex',
      `[1:a]volume=0.35,afade=t=in:d=1,afade=t=out:st=${Math.max(0, duracaoAlvo - 2)}:d=2[m];` +
      `[0:a][m]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      outputPath,
    ]);
  } else {
    await copyFile(silent, outputPath);
  }

  // export extra 4:5 (feed do Meta): center-crop 1080x1350 do 9:16
  const formatos = Array.isArray(cfg.formatos) ? cfg.formatos : ['9:16'];
  if (formatos.includes('4:5')) {
    const out45 = outputPath.replace(/\.mp4$/, '-45.mp4');
    console.log('  exportando 4:5 (feed)…');
    await runFfmpeg([
      '-i', outputPath,
      '-vf', 'crop=1080:1350:0:285',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart',
      out45,
    ]);
    console.log(`OK45 ${out45}`);
  }

  const dur = await getDurationSeconds(outputPath);
  console.log(`OK mockup "${cenario.nome}" — ${dur.toFixed(2)}s em ${outputPath}`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
