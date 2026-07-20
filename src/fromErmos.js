import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { generateMusic } from './musicGen.js';
import { runFfmpeg, getDurationSeconds } from './ffmpeg.js';

/**
 * Motor de MOCKUP ERMOS — réplica estrutural do ad 3981810798791050:
 * o QUADRO (arte + moldura) flutua sobre vídeos de fundo cenográficos,
 * trocando de arte em ritmo acelerado; logo fixo no topo, legenda fixa
 * embaixo. SEM pessoas, SEM Veo por mockup (os fundos já existem) —
 * composição pura em ffmpeg = produção em massa quase grátis.
 *
 * Uso: node src/fromErmos.js --config <cfg.json> --out <final.mp4>
 * Config: {
 *   fundoDirs: [dir,...],   // fundos prontos (fundo.mp4 em cada)
 *   moldura: 'preto'|'branco'|'marfim'|'arabesco',
 *   artes: [img,...],       // já baixadas
 *   ritmo?: 0.9,            // segundos por arte (0.7 rápido | 0.9 | 1.2)
 *   trocaFundo?: 3.5,       // segundos por cena de fundo
 *   legenda?: 'TODAS AS OBRAS JÁ DISPONÍVEIS EM NOSSO SITE',
 *   logoPath?,              // PNG com alpha (opcional, topo central)
 *   musica?: 'nenhuma'|mood, formatos?: ['9:16','4:5']
 * }
 */
const PY = 'tools/.venv-compose/bin/python';
const COMPOSE = 'tools/ermos-compose.py';
const FONTE = '/System/Library/Fonts/Helvetica.ttc';

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
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} código ${code}`))));
    p.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/fromErmos.js --config <cfg.json> --out <final.mp4>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const outputPath = args.out;
  const fundos = (cfg.fundoDirs || []).filter((d) => existsSync(path.join(d, 'fundo.mp4')));
  if (!fundos.length) throw new Error('nenhum fundo pronto (ative os lugares primeiro)');
  const artes = (cfg.artes || []).filter((a) => existsSync(a));
  if (!artes.length) throw new Error('nenhuma arte');
  const moldura = cfg.moldura || 'preto';
  const ritmo = Math.max(0.5, Number(cfg.ritmo) || 0.9);
  const trocaFundo = Math.max(2, Number(cfg.trocaFundo) || 3.5);
  const slug = path.basename(outputPath, '.mp4');
  const tmpDir = path.join('tmp', `ermos-${slug}`);
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  // duração: todas as artes desfilam 1x (mín 6s, máx 15s — formato de feed)
  const T = Math.min(15, Math.max(6, artes.length * ritmo));

  // 1) monta o quadro 2D de cada arte (produto flutuante)
  console.log(`[1/3] montando ${artes.length} quadro(s) (moldura ${moldura})…`);
  const quadros = [];
  for (let i = 0; i < artes.length; i += 1) {
    const q = path.join(tmpDir, `quadro-${i}.png`);
    await run(PY, [COMPOSE, '--arte', artes[i], '--moldura', moldura, '--out', q, '--largura', '860']);
    quadros.push(q);
  }

  // 2) base: fundos em sequência (ciclando) até cobrir T
  console.log('[2/3] montando a base de fundos…');
  const segs = [];
  for (let t = 0, i = 0; t < T; t += trocaFundo, i += 1) {
    segs.push({ dir: fundos[i % fundos.length], dur: Math.min(trocaFundo, T - t) });
  }
  const inputs = []; let filter = ''; const vlabels = [];
  segs.forEach((s, n) => {
    inputs.push('-i', path.join(s.dir, 'fundo.mp4'));
    filter += `[${n}:v]trim=0:${s.dur.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1[v${n}];`;
    filter += `[${n}:a]atrim=0:${s.dur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000[a${n}];`;
    vlabels.push(`[v${n}][a${n}]`);
  });
  filter += `${vlabels.join('')}concat=n=${segs.length}:v=1:a=1[bv][ba]`;
  const base = path.join(tmpDir, 'base.mp4');
  await runFfmpeg([...inputs, '-filter_complex', filter, '-map', '[bv]', '-map', '[ba]',
    '-t', String(T), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', base]);

  // trilha opcional
  let musicPath = null;
  if (cfg.musica && cfg.musica !== 'nenhuma') {
    try {
      musicPath = path.join(tmpDir, 'trilha.wav');
      await generateMusic({ mood: cfg.musica, outputPath: musicPath });
    } catch (e) { console.error(`  trilha falhou (seguindo sem): ${String(e.message).slice(0, 100)}`); musicPath = null; }
  }

  // 3) overlays: quadros trocando + logo + legenda
  console.log('[3/3] compondo o produto flutuante…');
  const oIn = ['-i', base];
  quadros.forEach((q) => oIn.push('-i', q));
  const temLogo = cfg.logoPath && existsSync(cfg.logoPath);
  if (temLogo) oIn.push('-i', cfg.logoPath);
  if (musicPath) oIn.push('-i', musicPath);

  let of = '';
  let cur = '[0:v]';
  quadros.forEach((_, i) => {
    const ini = (i * ritmo).toFixed(3);
    const fim = (i === quadros.length - 1 ? T : (i + 1) * ritmo).toFixed(3);
    of += `[${i + 1}:v]scale=760:-1[q${i}];`;
    of += `${cur}[q${i}]overlay=(W-w)/2:(H-h)/2-40:enable='between(t,${ini},${fim})'[o${i}];`;
    cur = `[o${i}]`;
  });
  if (temLogo) {
    of += `[${quadros.length + 1}:v]scale=190:-1[lg];`;
    of += `${cur}[lg]overlay=(W-w)/2:96[olg];`;
    cur = '[olg]';
  }
  const legenda = (cfg.legenda || 'TODAS AS OBRAS JÁ DISPONÍVEIS EM NOSSO SITE')
    .toUpperCase().replace(/[\\:'"]/g, ' ');
  of += `${cur}drawtext=fontfile=${FONTE}:text='${legenda}':fontcolor=white@0.92:fontsize=25:shadowcolor=black@0.55:shadowx=1:shadowy=1:x=(w-text_w)/2:y=h-150[vt]`;
  let mapa = ['-map', '[vt]'];
  if (musicPath) {
    const mi = quadros.length + (temLogo ? 2 : 1);
    of += `;[${mi}:a]volume=0.32,afade=t=in:d=1,afade=t=out:st=${Math.max(0, T - 2)}:d=2[mm];[0:a][mm]amix=inputs=2:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[am]`;
    mapa = ['-map', '[vt]', '-map', '[am]'];
  } else {
    mapa = ['-map', '[vt]', '-map', '0:a'];
  }
  await runFfmpeg([...oIn, '-filter_complex', of, ...mapa, '-t', String(T),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath]);

  const formatos = Array.isArray(cfg.formatos) ? cfg.formatos : ['9:16'];
  if (formatos.includes('4:5')) {
    const out45 = outputPath.replace(/\.mp4$/, '-45.mp4');
    await runFfmpeg(['-i', outputPath, '-vf', 'crop=1080:1350:0:285',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', out45]);
    console.log(`OK45 ${out45}`);
  }
  const dur = await getDurationSeconds(outputPath);
  console.log(`OK ermos — ${dur.toFixed(2)}s · ${artes.length} artes · ${fundos.length} fundos · moldura ${moldura}`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
