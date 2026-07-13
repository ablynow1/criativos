import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expandCenario } from './expandCenario.js';
import { buildKeyframePrompts } from './cenarios.js';
import { generateProductImage } from './generateProductImage.js';
import { img2img } from './img2img.js';

/**
 * Motor de CENÁRIO (o "palco") do Estúdio de Quadros.
 *
 * Texto livre (avatar/ambiente/moldura) → 6 keyframes em TELA VERDE, prontos
 * pra receber qualquer arte depois (via src/fromMockup.js). K1 é o master
 * (text2img); K2..K6 derivam dele por img2img pra travar a identidade.
 *
 * NÃO gera vídeo — só as imagens-base do palco, pra conferência humana.
 * Ver MOCKUP-NATIVO.md §6.
 *
 * Uso: node src/fromCenario.js --config inputs/cenario.json --out output/quadros/cenarios/<id>
 * Config (web manda): {
 *   id?, nome?,
 *   // canônico (já em EN) OU texto livre pra expandir:
 *   avatar?, ambiente?, moldura?,
 *   avatarText?, ambienteText?, molduraText?, descricao?,
 *   movimento?='medio', temAbertura?=false
 * }
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

// Gera 1 keyframe com até 2 retentativas (o modelo às vezes devolve vazio).
async function genKeyframe(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      lastErr = err;
      console.error(`  ${label} tentativa ${attempt} falhou: ${String(err.message).slice(0, 160)}`);
    }
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/fromCenario.js --config <cfg.json> --out <dir do cenario>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const outDir = args.out;
  const kfDir = path.join(outDir, 'keyframes');
  await mkdir(kfDir, { recursive: true });

  const total = 7; // 1 expand + 6 keyframes

  // 1) canoniza avatar/ambiente/moldura (expande do texto livre se preciso)
  let { avatar, ambiente, moldura, nome } = cfg;
  const precisaExpandir = !avatar || !ambiente || !moldura;
  if (precisaExpandir) {
    console.log(`[1/${total}] interpretando a descrição (texto → prompt)…`);
    const ex = await expandCenario({
      avatarText: cfg.avatarText,
      ambienteText: cfg.ambienteText,
      molduraText: cfg.molduraText,
      descricao: cfg.descricao,
    });
    avatar = avatar || ex.avatar;
    ambiente = ambiente || ex.ambiente;
    moldura = moldura || ex.moldura;
    nome = nome || ex.nome;
  } else {
    console.log(`[1/${total}] cenário já canônico, pulando interpretação`);
  }

  const prompts = buildKeyframePrompts({ avatar, ambiente, moldura });
  const ids = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];

  // 2) K1 = master (text2img)
  const k1Path = path.join(kfDir, 'K1.png');
  console.log(`[2/${total}] gerando K1 (master, text→imagem)…`);
  await genKeyframe(
    () => generateProductImage({ prompt: prompts.K1.prompt, outputPath: k1Path }),
    'K1',
  );
  if (!existsSync(k1Path)) throw new Error('K1 não foi gerado');

  // 3..7) K2..K6 = img2img a partir do K1 (mantém identidade/loja)
  for (let i = 1; i < ids.length; i += 1) {
    const id = ids[i];
    const dst = path.join(kfDir, `${id}.png`);
    console.log(`[${i + 2}/${total}] gerando ${id} (img2img de K1)…`);
    await genKeyframe(
      () =>
        img2img({
          inputPaths: [k1Path],
          prompt: prompts[id].prompt,
          outputPath: dst,
          aspectRatio: '9:16',
        }),
      id,
    );
  }

  // grava o manifesto do cenário (fonte de verdade do palco)
  const cenario = {
    id: cfg.id || path.basename(outDir),
    nome: nome || 'Cenário sem nome',
    avatar,
    ambiente,
    moldura,
    movimento: cfg.movimento || 'medio',
    temAbertura: !!cfg.temAbertura,
    versoKeyframe: cfg.versoKeyframe || null,
    keyframes: ids.map((id) => `keyframes/${id}.png`),
    status: 'aguardando_aprovacao',
    criadoEm: new Date().toISOString(),
  };
  await writeFile(path.join(outDir, 'cenario.json'), JSON.stringify(cenario, null, 2));
  console.log(`OK cenário "${cenario.nome}" — 6 keyframes em ${kfDir}`);
  console.log(`CENARIO_JSON ${path.join(outDir, 'cenario.json')}`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
