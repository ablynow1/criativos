import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expandCenario } from './expandCenario.js';
import { expandPersonas } from './expandPersonas.js';
import { buildKeyframePrompts } from './cenarios.js';
import { describeMoldura } from './describeMoldura.js';
import { generateProductImage } from './generateProductImage.js';
import { img2img } from './img2img.js';
import { makeLimiter } from './limiter.js';

// teto GLOBAL de chamadas de imagem em voo (vale pros 2 palcos somados)
const imgLimiter = makeLimiter({ max: Math.max(1, Number(process.env.IMG_CONCURRENCY || 3)) });

/**
 * Motor de CENÁRIO (o "palco") do Estúdio de Quadros.
 *
 * Texto livre (avatar/ambiente/moldura) → 6 keyframes em TELA VERDE, prontos
 * pra receber qualquer arte depois (via src/fromMockup.js). K1 é o master;
 * K2..K6 derivam dele por img2img pra travar a identidade.
 *
 * PRODUÇÃO EM MASSA: `variacoes: N` (2-4) gera N PALCOS DISTINTOS de uma
 * descrição só — o expandPersonas devolve N personas diversificadas numa
 * chamada (diversidade garantida) e cada uma vira um cenário completo em
 * `<out>-pN/`. `diversificar`: 'avatar' | 'ambiente' | 'ambos'.
 *
 * NÃO gera vídeo — só as imagens-base, pra conferência humana. MOCKUP-NATIVO §6.
 *
 * Uso: node src/fromCenario.js --config <cfg.json> --out <dir base>
 * Config (web manda): {
 *   id?, nome?,
 *   avatar?, ambiente?, moldura?,          // canônico EN (pula expansão)
 *   avatarText?, ambienteText?, molduraText?, descricao?,  // texto livre
 *   molduraImage?,                          // foto da biblioteca (referência)
 *   variacoes?=1, diversificar?='avatar',
 *   movimento?='medio', temAbertura?=false
 * }
 * Saída por palco: linha `CENARIO_DIR <dir>` (o worker coleta e sobe cada um).
 */
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

// Gera 1 keyframe com retentativas. Trata a cota do Vertex (429/RESOURCE_
// EXHAUSTED) com BACKOFF longo — esse limite é por minuto, então esperar 20/40/
// 60s costuma resolver (retentar na hora não adianta). Erro comum (modelo devolve
// vazio) espera pouco.
async function genKeyframe(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      lastErr = err;
      // bloqueio de política é determinístico: retentar queima render à toa
      if (err.code === 'IMG_RAI_BLOCKED') throw err;
      const is429 = /429|RESOURCE_EXHAUSTED|exhausted|quota/i.test(err.message || '');
      const waitMs = is429 ? attempt * 20000 : 2000;
      console.error(`  ${label} tentativa ${attempt} falhou${is429 ? ' (cota 429)' : ''}: ${String(err.message).slice(0, 140)}`);
      if (attempt < 4) {
        if (is429) console.error(`  esperando ${waitMs / 1000}s pela cota…`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Gera UM palco completo (6 keyframes + cenario.json) em `outDir`.
 * `marker(j)` formata o prefixo de progresso do keyframe j (1-6).
 */
async function gerarPalco({ persona, outDir, molduraImg, molduraRef, movimento, temAbertura, marker }) {
  const kfDir = path.join(outDir, 'keyframes');
  await mkdir(kfDir, { recursive: true });
  // a foto da moldura vive dentro de cada palco (reprodutibilidade)
  let moldLocal = null;
  if (molduraImg) {
    moldLocal = path.join(outDir, 'moldura' + path.extname(molduraImg));
    if (!existsSync(moldLocal)) await copyFile(molduraImg, moldLocal);
  }
  const prompts = buildKeyframePrompts({
    avatar: persona.avatar, ambiente: persona.ambiente, moldura: persona.moldura,
    molduraRef: !!moldLocal,
  });
  const ids = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];

  const k1Path = path.join(kfDir, 'K1.png');
  console.log(`${marker(1)} gerando K1 (master${moldLocal ? ', moldura por referência' : ''})…`);
  await genKeyframe(
    () => moldLocal
      ? img2img({ inputPaths: [moldLocal], prompt: prompts.K1.prompt, outputPath: k1Path, aspectRatio: '9:16' })
      : generateProductImage({ prompt: prompts.K1.prompt, outputPath: k1Path }),
    'K1',
  );
  if (!existsSync(k1Path)) throw new Error('K1 não foi gerado');

  // K2..K6 derivam SÓ de K1 — a ordem entre eles é irrelevante e a
  // serialização era artificial: mais da metade do tempo de um palco era
  // espera em fila de um por vez. O limiter global segura a cota (429).
  const resto = ids.slice(1);
  console.log(`${marker(2)} gerando ${resto.join(', ')} em paralelo (img2img de K1${moldLocal ? '+moldura' : ''})…`);
  const rs = await Promise.allSettled(resto.map((id) =>
    imgLimiter.run(() => genKeyframe(
      () => img2img({
        inputPaths: moldLocal ? [k1Path, moldLocal] : [k1Path],
        prompt: prompts[id].prompt,
        outputPath: path.join(kfDir, `${id}.png`),
        aspectRatio: '9:16',
      }),
      id,
    ))));
  const mortos = resto.filter((_, i) => rs[i].status === 'rejected');
  if (mortos.length) {
    throw new Error(`keyframes falharam: ${mortos.join(', ')} — ${rs.find((r) => r.status === 'rejected').reason.message}`);
  }

  const cenario = {
    id: path.basename(outDir),
    nome: persona.nome || 'Cenário sem nome',
    avatar: persona.avatar,
    ambiente: persona.ambiente,
    moldura: persona.moldura,
    movimento: movimento || 'medio',
    temAbertura: !!temAbertura,
    molduraFoto: moldLocal ? path.basename(moldLocal) : null,
    versoKeyframe: null,
    keyframes: ids.map((id) => `keyframes/${id}.png`),
    status: 'aguardando_aprovacao',
    criadoEm: new Date().toISOString(),
  };
  await writeFile(path.join(outDir, 'cenario.json'), JSON.stringify(cenario, null, 2));
  console.log(`OK palco "${cenario.nome}" — ${outDir}`);
  console.log(`CENARIO_DIR ${outDir}`);
  return cenario;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/fromCenario.js --config <cfg.json> --out <dir do cenario>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const outBase = args.out;
  const variacoes = Math.max(1, Math.min(4, Number(cfg.variacoes) || 1));

  // moldura por FOTO (biblioteca): referência em TODOS os keyframes + descrição
  // pela visão (uma vez só, compartilhada entre as variações).
  let molduraImg = null;
  let molduraDesc = null;
  if (cfg.molduraImage && existsSync(cfg.molduraImage)) {
    molduraImg = cfg.molduraImage;
    console.log(`[1/7] lendo a moldura da foto (visão)…`);
    const md = await describeMoldura(molduraImg);
    molduraDesc = md.moldura;
    console.log(`  moldura: ${molduraDesc}`);
  }

  if (variacoes === 1) {
    // ---- caminho único (original) ----
    let { avatar, ambiente, moldura, nome } = cfg;
    if (molduraDesc) moldura = molduraDesc;
    if (!avatar || !ambiente || !moldura) {
      console.log(`[1/7] interpretando a descrição (texto → prompt)…`);
      const ex = await expandCenario({
        avatarText: cfg.avatarText, ambienteText: cfg.ambienteText,
        molduraText: molduraDesc || cfg.molduraText, descricao: cfg.descricao,
      });
      avatar = avatar || ex.avatar;
      ambiente = ambiente || ex.ambiente;
      moldura = moldura || ex.moldura;
      nome = nome || ex.nome;
    } else {
      console.log(`[1/7] cenário já canônico, pulando interpretação`);
    }
    await gerarPalco({
      persona: { avatar, ambiente, moldura, nome: nome || 'Cenário sem nome' },
      outDir: outBase, molduraImg,
      movimento: cfg.movimento, temAbertura: cfg.temAbertura,
      marker: (j) => `[${j + 1}/7]`,
    });
    // compat com o formato antigo
    console.log(`CENARIO_JSON ${path.join(outBase, 'cenario.json')}`);
    return;
  }

  // ---- produção em massa: N personas distintas numa chamada só ----
  console.log(`[1/7] gerando ${variacoes} personas (${cfg.diversificar || 'avatar'})…`);
  const personas = await expandPersonas({
    descricao: cfg.descricao, avatarText: cfg.avatarText,
    ambienteText: cfg.ambienteText, molduraText: molduraDesc || cfg.molduraText,
    n: variacoes, diversificar: cfg.diversificar,
  });
  personas.forEach((p, i) => console.log(`  P${i + 1}: ${p.nome}`));
  if (molduraDesc) personas.forEach((p) => { p.moldura = molduraDesc; });

  // 2 palcos em voo, compartilhando o MESMO limiter de imagem: o teto de
  // chamadas simultâneas continua o do limiter — o pool só elimina a espera
  // serial de um palco inteiro atrás do outro.
  const falhas = [];
  const filaPersonas = personas.map((p, i) => ({ p, i }));
  const PALCOS_MAX = Math.max(1, Number(process.env.PALCOS_CONCURRENCY || 2));
  await Promise.all(Array.from({ length: Math.min(PALCOS_MAX, filaPersonas.length) }, async () => {
    for (let item = filaPersonas.shift(); item; item = filaPersonas.shift()) {
      const outDir = `${outBase}-p${item.i + 1}`;
      try {
        await gerarPalco({
          persona: item.p, outDir, molduraImg,
          movimento: cfg.movimento, temAbertura: cfg.temAbertura,
          marker: (j) => `[P ${item.i + 1}/${personas.length} K ${j}/6]`,
        });
      } catch (e) {
        falhas.push(item.p.nome);
        console.error(`  persona ${item.i + 1} falhou (seguindo): ${String(e.message).slice(0, 140)}`);
      }
    }
  }));
  if (falhas.length === personas.length) throw new Error('todas as personas falharam');
  if (falhas.length) console.log(`ATENÇÃO: ${falhas.length} persona(s) falharam: ${falhas.join(', ')}`);
  console.log(`OK ${personas.length - falhas.length}/${personas.length} palcos gerados`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
