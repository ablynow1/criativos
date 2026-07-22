import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { buildKeyframePrompts } from './cenarios.js';
import { img2img } from './img2img.js';

/**
 * Refaz UM keyframe de um cenário já aprovado/em conferência.
 *
 * Quando uma das 6 cenas sai errada (a pessoa trocou, o verde sujou, a moldura
 * mudou), regerar o cenário inteiro é caro e ainda pode estragar as 5 que
 * estavam boas. Aqui o K1 continua sendo o master da identidade: a cena nova
 * nasce por img2img dele, exatamente como nasceu da primeira vez.
 *
 * Só K2..K6. K1 é a raiz da identidade — refazer ele sozinho deixaria as
 * outras cinco descasadas, então nesse caso o certo é refazer o cenário.
 *
 * Uso: node src/refazKeyframe.js --config <cfg.json> --out <arquivo.png>
 * Config: { kf: 'K4', k1Path, molduraPath?, avatar, ambiente, moldura }
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

// mesmo backoff longo do fromCenario: 429 do Vertex é limite POR MINUTO,
// retentar na hora não adianta
async function tenta(fn, rotulo, n = 4) {
  let erro;
  for (let i = 1; i <= n; i += 1) {
    try { return await fn(); } catch (e) {
      erro = e;
      const cota = /429|RESOURCE_EXHAUSTED|quota/i.test(e.message || '');
      console.error(`  ${rotulo} tentativa ${i} falhou${cota ? ' (cota)' : ''}: ${String(e.message).slice(0, 130)}`);
      if (i < n) await new Promise((r) => setTimeout(r, cota ? i * 20000 : 3000));
    }
  }
  throw erro;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/refazKeyframe.js --config <cfg.json> --out <arquivo.png>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const kf = String(cfg.kf || '');
  if (!['K2', 'K3', 'K4', 'K5', 'K6'].includes(kf)) {
    throw new Error(`só dá pra refazer K2..K6 (veio "${kf}") — o K1 é o master da identidade`);
  }
  if (!cfg.k1Path || !existsSync(cfg.k1Path)) throw new Error('K1 (master da identidade) não veio');
  const moldura = cfg.molduraPath && existsSync(cfg.molduraPath) ? cfg.molduraPath : null;

  const prompts = buildKeyframePrompts({
    avatar: cfg.avatar, ambiente: cfg.ambiente, moldura: cfg.moldura, molduraRef: !!moldura,
  });
  console.log(`[1/1] refazendo ${kf} (img2img de K1${moldura ? '+moldura' : ''})…`);
  await tenta(() => img2img({
    inputPaths: moldura ? [cfg.k1Path, moldura] : [cfg.k1Path],
    prompt: prompts[kf].prompt,
    outputPath: args.out,
    aspectRatio: '9:16',
  }), kf);
  if (!existsSync(args.out)) throw new Error(`${kf} não foi gerado`);
  console.log(`OK ${kf} -> ${args.out}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
