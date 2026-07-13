import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildVeoPrompts, buildSegments } from './cenarios.js';
import { generateVideoClip } from './generateVideoClip.js';
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
  const falhou = [];
  for (let i = 0; i < usados.length; i += 3) {
    const lote = usados.slice(i, i + 3);
    const res = await Promise.allSettled(
      lote.map(async (id) => {
        const kfa = path.join(kfDir, `${veo[id].kf}.png`);
        if (!existsSync(kfa)) throw new Error(`${veo[id].kf}.png não existe`);
        console.log(`  → ${id} (a partir de ${veo[id].kf})`);
        await generateVideoClip({
          imagePath: kfa,
          prompt: veo[id].prompt,
          outputPath: path.join(clipsDir, `${id}.mp4`),
          aspectRatio: '9:16',
          resolution: '1080p',
          durationSeconds: 8,
          ambiente: true,
        });
      }),
    );
    res.forEach((r, j) => {
      if (r.status === 'rejected') {
        falhou.push(lote[j]);
        console.error(`  FALHOU ${lote[j]}: ${String(r.reason?.message).slice(0, 160)}`);
      }
    });
  }
  if (usaAbertura) await copyFile(aberturaClip, path.join(clipsDir, 'ABERTURA.mp4'));

  // se alguma cena falhou no RAI, remove os segmentos dela (não trava a entrega)
  const okSegments = segments.filter((s) => !falhou.includes(s[0]));
  if (okSegments.length < segments.length) {
    console.log(`  ${segments.length - okSegments.length} segmento(s) caíram (cena bloqueada); seguindo com ${okSegments.length}`);
  }
  if (!okSegments.length) throw new Error('todas as cenas falharam no Veo');

  // 3) montagem (filter_complex dinâmico a partir dos segmentos)
  console.log('[3/4] montando o vídeo…');
  const inputs = [];
  const seen = [];
  let filter = '';
  const labels = [];
  okSegments.forEach(([clip, tin, tout], n) => {
    let idx = seen.indexOf(clip);
    if (idx === -1) {
      inputs.push('-i', path.join(clipsDir, `${clip}.mp4`));
      seen.push(clip);
      idx = seen.length - 1;
    }
    filter += `[${idx}:v]trim=start=${tin}:end=${tout},setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1[v${n}];`;
    filter += `[${idx}:a]atrim=start=${tin}:end=${tout},asetpts=PTS-STARTPTS,aresample=48000[a${n}];`;
    labels.push(`[v${n}][a${n}]`);
  });
  filter += `${labels.join('')}concat=n=${okSegments.length}:v=1:a=1[vc][ac];`;
  filter += `[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;

  const silent = path.join(tmpDir, 'montagem.mp4');
  await runFfmpeg([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[vc]', '-map', '[aout]',
    '-t', String(duracaoAlvo),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    silent,
  ]);

  // 4) áudio: por ora usa o som ambiente da montagem (narração+trilha entram
  //    numa próxima iteração — a infra de TTS/Lyria já existe no repo).
  console.log('[4/4] finalizando…');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(silent, outputPath);

  const dur = await getDurationSeconds(outputPath);
  console.log(`OK mockup "${cenario.nome}" — ${dur.toFixed(2)}s em ${outputPath}`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
