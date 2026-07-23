import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { generateMusic } from './musicGen.js';
import { baixaTrilhaYoutube } from './trilhaYoutube.js';
import { runFfmpeg, getDurationSeconds, probeWH } from './ffmpeg.js';

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
// bold só pro nome do artista (o .ttc não expõe o peso pro drawtext)
const FONTE_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const LOGO_PADRAO = 'tools/assets/logo-atelier.png'; // Atelier by Malta (SVG do Vitor)

// CANVAS 1440x2560 — a resolução que o Meta recomenda pra Reels ads. Em
// 4:2:0 o croma tem METADE da resolução da luma: a 1080 sobravam 540px de cor
// pra arte com linha fina e cor saturada; a 1440 sobem pra 720px, e o
// re-encode do IG parte de fonte melhor. Toda a geometria deriva de ESCALA
// sobre os valores aprovados em 1080 — os números de referência não mudam.
const ESCALA = 4 / 3;
const px = (v) => Math.round(v * ESCALA);
const CANVAS_W = px(1080);   // 1440
const CANVAS_H = px(1920);   // 2560

// ZONA DE SEGURANÇA do Reels (valores de referência em 1080x1920):
// a UI do Instagram come 220px no topo e 450px no rodapé — nada escrito pode
// cair aí. Os 1080x1440 de cima são a CAPA que aparece no perfil.
const SAFE_TOP = px(220);
const SAFE_BOTTOM = px(450);
const CAPA_H = px(1440);
const LOGO_W = px(300);
const FONTE_PT = px(28);
// EM PÉ: quadro alto, vive entre a logo e a legenda, centrado na área da CAPA
// (é o que aparece na capa do Reels no perfil).
const QUADRO_W = px(700);
const QUADRO_H = Math.round(QUADRO_W * 4 / 3);
const QUADRO_Y = Math.round((CAPA_H + SAFE_TOP + px(110) - QUADRO_H) / 2);
// DEITADO: com a mesma largura ficaria baixinho e colado na logo, sobrando
// meio criativo vazio embaixo. Então alarga e desce pro centro do criativo.
const QUADRO_W_H = px(880);

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
  const ritmo = Math.max(0.15, Number(cfg.ritmo) || 0.4);
  const trocaFundo = Math.max(2, Number(cfg.trocaFundo) || 3.5);
  const slug = path.basename(outputPath, '.mp4');
  const tmpDir = path.join('tmp', `ermos-${slug}`);
  await mkdir(tmpDir, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });

  // duração independente do nº de artes: elas CICLAM em loop durante o vídeo
  // inteiro (é o que dá o efeito de "desfile" do ad de referência).
  const T = Math.min(20, Math.max(5, Number(cfg.duracao) || 8));

  // 1) monta o quadro 2D de cada arte (produto flutuante)
  console.log(`[1/3] montando ${artes.length} quadro(s) (moldura ${moldura})…`);
  // A MOLDURA É UMA SÓ o vídeo inteiro — quem troca é a arte. Então o aspecto
  // se decide UMA vez, aqui, pelas artes de verdade (não pelo que a UI achou),
  // e vai igual pra todas. Sem isso cada obra gerava um quadro de altura
  // diferente e a moldura "pulsava" a cada troca.
  const ladosArte = [];
  for (const a of artes) {
    const m = await probeWH(a);
    ladosArte.push(m.w > m.h * 1.04 ? 'h' : (m.w < m.h * 0.96 ? 'v' : 'q'));
  }
  const nH = ladosArte.filter((l) => l === 'h').length;
  const nV = ladosArte.filter((l) => l === 'v').length;
  if (nH && nV) {
    console.error(`  ⚠️ artes misturadas (${nV} em pé, ${nH} deitadas) — vale a maioria. Use um lado só.`);
  }
  const deitado = nH > nV;
  const quadrado = !nH && !nV;
  const aspecto = quadrado ? 1 : (deitado ? 1.414 : 0.707);

  const quadros = [];
  for (let i = 0; i < artes.length; i += 1) {
    const q = path.join(tmpDir, `quadro-${i}.png`);
    await run(PY, [COMPOSE, '--arte', artes[i], '--moldura', moldura, '--out', q,
      '--largura', '1280', '--aspecto', String(aspecto)]);
    quadros.push(q);
  }
  const medida = await probeWH(quadros[0]);   // todos idênticos por construção
  const larguraQ = deitado ? QUADRO_W_H : QUADRO_W;
  const alturaQ = Math.round(larguraQ * medida.h / medida.w);
  // em pé: centro da CAPA do Reels (1440). deitado/quadrado: centro do criativo.
  const quadroY = deitado || quadrado ? Math.round((CANVAS_H - alturaQ) / 2) : QUADRO_Y;
  console.log(`  quadro ${quadrado ? 'quadrado' : deitado ? 'deitado' : 'em pé'} (aspecto ${aspecto}): ${larguraQ}x${alturaQ} em y=${quadroY} — igual pras ${artes.length} artes`);

  // 2) base: fundos em sequência (ciclando) até cobrir T
  console.log('[2/3] montando a base de fundos…');
  const segs = [];
  for (let t = 0, i = 0; t < T; t += trocaFundo, i += 1) {
    segs.push({ dir: fundos[i % fundos.length], dur: Math.min(trocaFundo, T - t) });
  }
  const inputs = []; let filter = ''; const vlabels = [];
  segs.forEach((s, n) => {
    inputs.push('-i', path.join(s.dir, 'fundo.mp4'));
    filter += `[${n}:v]trim=0:${s.dur.toFixed(3)},setpts=PTS-STARTPTS,fps=24,scale=${CANVAS_W}:${CANVAS_H}:flags=lanczos,setsar=1[v${n}];`;
    filter += `[${n}:a]atrim=0:${s.dur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000[a${n}];`;
    vlabels.push(`[v${n}][a${n}]`);
  });
  filter += `${vlabels.join('')}concat=n=${segs.length}:v=1:a=1[bv][ba]`;
  const base = path.join(tmpDir, 'base.mp4');
  await runFfmpeg([...inputs, '-filter_complex', filter, '-map', '[bv]', '-map', '[ba]',
    '-t', String(T), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', base]);

  // trilha: YouTube (trecho escolhido) OU mood gerado pela Lyria OU nenhuma
  let musicPath = null;
  if (cfg.ytId) {
    musicPath = await baixaTrilhaYoutube({ ytId: cfg.ytId, inicio: cfg.ytInicio, duracao: T, tmpDir });
  } else if (cfg.musica && cfg.musica !== 'nenhuma') {
    try {
      musicPath = path.join(tmpDir, 'trilha.wav');
      await generateMusic({ mood: cfg.musica, outputPath: musicPath });
    } catch (e) { console.error(`  trilha falhou (seguindo sem): ${String(e.message).slice(0, 100)}`); musicPath = null; }
  }

  // 3) overlays: quadros trocando + logo + legenda
  console.log('[3/3] compondo o produto flutuante…');
  const oIn = ['-i', base];
  quadros.forEach((q) => oIn.push('-i', q));
  // logo: a do usuário se mandou; senão a padrão (Atelier by Malta); 'nenhuma' desliga
  const logoEscolhida = cfg.logoPath && existsSync(cfg.logoPath) ? cfg.logoPath
    : (cfg.semLogo ? null : (existsSync(LOGO_PADRAO) ? LOGO_PADRAO : null));
  const temLogo = !!logoEscolhida;
  if (temLogo) oIn.push('-i', logoEscolhida);
  if (musicPath) oIn.push('-i', musicPath);

  let of = '';
  let cur = '[0:v]';
  const N = quadros.length;
  const R = ritmo.toFixed(3);
  // PELÍCULA: véu de cor sobre o FUNDO, por baixo de tudo. Entra antes do
  // quadro e do texto de propósito — escurecer (ou clarear) só o cenário dá
  // contraste pra legenda sem tocar na obra nem na moldura.
  const PELI = { preta: 'black', branca: 'white' };
  const peliCor = PELI[cfg.pelicula];
  if (peliCor) {
    const op = Math.max(0, Math.min(0.9, Number(cfg.peliculaOp ?? 0.3))).toFixed(2);
    of += `[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=${peliCor}@${op}:t=fill[pel];`;
    cur = '[pel]';
    console.log(`  película ${cfg.pelicula} a ${Math.round(op * 100)}%`);
  }
  // Tudo escrito fica dentro do quadro seguro do Reels (1080x1920):
  // a UI do Instagram cobre o topo (220px) e o rodapé (450px). Além disso os
  // 1080x1440 de cima são a CAPA do Reels no perfil — o quadro mora aí.
  quadros.forEach((_, i) => {
    of += `[${i + 1}:v]scale=${larguraQ}:-1[q${i}];`;
    // ALTERNÂNCIA CÍCLICA: o slot atual é floor(t/ritmo); a arte i aparece
    // sempre que slot % N == i — as artes se revezam do início ao fim.
    of += `${cur}[q${i}]overlay=(W-w)/2:${quadroY}:enable='eq(mod(floor(t/${R}),${N}),${i})'[o${i}];`;
    cur = `[o${i}]`;
  });
  if (temLogo) {
    of += `[${quadros.length + 1}:v]scale=${LOGO_W}:-1[lg];`;
    of += `${cur}[lg]overlay=(W-w)/2:${SAFE_TOP + px(18)}[olg];`;
    cur = '[olg]';
  }
  // ARTISTA: troca junto com a arte (mesmo enable do overlay). Fica entre o
  // quadro e a legenda, em bold — é o único elemento em negrito.
  const artistas = Array.isArray(cfg.artistas) ? cfg.artistas : [];
  artistas.slice(0, quadros.length).forEach((nome, i) => {
    const txt = String(nome || '').trim().replace(/[\\:'"%]/g, ' ').slice(0, 42);
    if (!txt) return;
    of += `${cur}drawtext=fontfile=${FONTE_BOLD}:text='${txt}':fontcolor=white:fontsize=${FONTE_PT}:`
        + `shadowcolor=black@0.65:shadowx=1:shadowy=2:x=(w-text_w)/2:y=h-${SAFE_BOTTOM + px(92)}:`
        + `enable='eq(mod(floor(t/${R}),${N}),${i})'[a${i}];`;
    cur = `[a${i}]`;
  });
  const legenda = (cfg.legenda || 'TODAS AS OBRAS JÁ DISPONÍVEIS EM NOSSO SITE')
    .toUpperCase().replace(/[\\:'"]/g, ' ');
  // baseline do texto acima do limite inferior seguro (h - SAFE_BOTTOM)
  of += `${cur}drawtext=fontfile=${FONTE}:text='${legenda}':fontcolor=white@0.92:fontsize=${FONTE_PT}:shadowcolor=black@0.6:shadowx=1:shadowy=1:x=(w-text_w)/2:y=h-${SAFE_BOTTOM + px(46)}[vt]`;
  let mapa = ['-map', '[vt]'];
  // SÓ a trilha escolhida. O áudio do fundo (som ambiente que o Veo gera) NÃO
  // entra: o criativo tem que sair com exatamente o que ele escolheu. Sem
  // trilha o vídeo sai mudo — de propósito, é o que "só o que eu escolhi" quer.
  if (musicPath) {
    const mi = quadros.length + (temLogo ? 2 : 1);
    of += `;[${mi}:a]afade=t=in:d=1,afade=t=out:st=${Math.max(0, T - 2)}:d=2,`
        + `loudnorm=I=-14:TP=-1.5:LRA=11[am]`;
    mapa = ['-map', '[vt]', '-map', '[am]'];
  } else {
    console.log('  sem trilha escolhida — o vídeo sai mudo (o som do fundo não entra)');
  }
  await runFfmpeg([...oIn, '-filter_complex', of, ...mapa, '-t', String(T),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath]);

  const formatos = Array.isArray(cfg.formatos) ? cfg.formatos : ['9:16'];
  if (formatos.includes('4:5')) {
    const out45 = outputPath.replace(/\.mp4$/, '-45.mp4');
    await runFfmpeg(['-i', outputPath, '-vf', `crop=${CANVAS_W}:${px(1350)}:0:${px(285)}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
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
