import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getFundo } from './fundos.js';
import { generateProductImage } from './generateProductImage.js';
import { generateVideoClip } from './generateVideoClip.js';
import { VEO_NEGATIVE } from './cenarios.js';

/**
 * Motor de FUNDO do modo ERMOS: ativa um lugar da biblioteca gerando o VÍDEO
 * ambiente dele (1x — depois é reusado em todo mockup Ermos de graça).
 *
 * keyframe.png (já existe como thumb da biblioteca; gera se faltar) →
 * Veo 8s com movimento ambiente contido → fundo.mp4.
 *
 * Uso: node src/fromFundo.js --config <cfg.json> --out output/quadros/fundos/<id>
 * Config: { id }  (preset de src/fundos.js)
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

async function tenta(fn, label, n = 3) {
  let lastErr;
  for (let i = 1; i <= n; i += 1) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const is429 = /429|RESOURCE_EXHAUSTED|quota/i.test(e.message || '');
      console.error(`  ${label} tentativa ${i} falhou${is429 ? ' (cota)' : ''}: ${String(e.message).slice(0, 120)}`);
      if (i < n) await new Promise((r) => setTimeout(r, is429 ? i * 25000 : 3000));
    }
  }
  throw lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.out) {
    console.error('Uso: node src/fromFundo.js --config <cfg.json> --out <dir do fundo>');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const preset = getFundo(cfg.id);
  if (!preset) throw new Error(`fundo desconhecido: ${cfg.id}`);
  const outDir = args.out;
  await mkdir(outDir, { recursive: true });

  const kfPath = path.join(outDir, 'keyframe.png');
  if (!existsSync(kfPath)) {
    console.log('[F 1/2] gerando o keyframe do lugar…');
    await tenta(() => generateProductImage({ prompt: preset.keyframe, outputPath: kfPath }), 'keyframe');
  } else {
    console.log('[F 1/2] keyframe já existe, reusando');
  }

  const vidPath = path.join(outDir, 'fundo.mp4');
  console.log('[F 2/2] animando o lugar no Veo (8s, sem áudio)…');
  await tenta(() => generateVideoClip({
    imagePath: kfPath,
    prompt: preset.movimento,
    outputPath: vidPath,
    aspectRatio: '9:16',
    resolution: '1080p',
    durationSeconds: 8,
    // SEM áudio: o Ermos descarta 100% o som do fundo (só entra a trilha que o
    // Vitor escolhe). O SKU cobrado é "Veo 3 AUDIO Video Generation" — gerar
    // áudio pra jogar no lixo era pagar caro por nada.
    ambiente: false,
    negativePrompt: VEO_NEGATIVE,
  }), 'veo', 3);

  console.log(`OK fundo "${preset.nome}" — ${vidPath}`);
  console.log(`FUNDO_PRONTO ${cfg.id}`);
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exit(1);
});
