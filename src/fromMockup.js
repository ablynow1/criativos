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
  const genClip = async (id) => {
    const kfa = path.join(kfDir, `${veo[id].kf}.png`);
    if (!existsSync(kfa)) throw new Error(`${veo[id].kf}.png não existe`);
    await generateVideoClip({
      imagePath: kfa,
      prompt: veo[id].prompt,
      outputPath: path.join(clipsDir, `${id}.mp4`),
      aspectRatio: '9:16', resolution: '1080p', durationSeconds: 8, ambiente: true,
    });
  };
  // 1ª passada em lotes de 3
  let pendentes = [...usados];
  const falhou = [];
  for (let i = 0; i < pendentes.length; i += 3) {
    const lote = pendentes.slice(i, i + 3);
    lote.forEach((id) => console.log(`  → ${id} (a partir de ${veo[id].kf})`));
    const res = await Promise.allSettled(lote.map((id) => genClip(id)));
    res.forEach((r, j) => {
      if (r.status === 'rejected') {
        falhou.push(lote[j]);
        console.error(`  FALHOU ${lote[j]}: ${String(r.reason?.message).slice(0, 120)}`);
      }
    });
  }
  // RETRY: o RAI do Veo é estocástico — a mesma imagem passa numa 2ª/3ª tentativa
  // (foi o que resolveu o pastor na mão). Retenta cada cena caída, 1 por vez.
  for (let tent = 1; tent <= 2 && falhou.length; tent += 1) {
    const retry = falhou.splice(0, falhou.length);
    console.log(`  retry ${tent}/2 de: ${retry.join(' ')}`);
    for (const id of retry) {
      try { await genClip(id); console.log(`  ✓ ${id} passou na retentativa`); }
      catch (e) { falhou.push(id); console.error(`  ainda falhou ${id}: ${String(e.message).slice(0, 100)}`); }
    }
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
      '-vf', 'fps=30,scale=1080:1920,setsar=1',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
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
