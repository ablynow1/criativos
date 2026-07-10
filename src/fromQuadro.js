import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { generateQuadro } from './generateQuadro.js';
import { runPipeline } from './pipeline.js';
import { logError } from './errorLog.js';

/**
 * Modo "Quadro": foto de referência + prompt de quadro escolhido → arte pintada →
 * cena do avatar segurando o quadro emoldurado → pipeline (TTS→Veo→legenda→merge).
 *
 * Uso: node src/fromQuadro.js --config inputs/x.json --out output/x.mp4
 * Config: { refFoto?, quadroPrompt, quadroGrupo?, quadroNome?, nomeCreativo?, moldura?, cenario?, narracao, voz?, estiloLegenda?, cenas:[{prompt,duracao?}] }
 * `refFoto` é OPCIONAL — sem ela, gera um personagem fictício a partir do
 * contexto (estilo escolhido + cenário + nome do criativo).
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error('Uso: node src/fromQuadro.js --config inputs/projeto.json --out output/final.mp4');
    process.exit(1);
  }
  const cfg = JSON.parse(await readFile(args.config, 'utf-8'));
  const outputPath = args.out || 'output/quadro.mp4';
  const slug = path.basename(args.config, '.json');
  const tmpDir = path.join('tmp', slug);
  await mkdir(tmpDir, { recursive: true });

  if (!cfg.quadroPrompt) throw new Error('falta quadroPrompt (o prompt do quadro escolhido)');
  if (!cfg.narracao || !Array.isArray(cfg.cenas) || cfg.cenas.length === 0) {
    throw new Error('falta narracao e/ou cenas');
  }

  console.log(cfg.refFoto
    ? '[Q 1/2] Gerando a arte (foto → quadro) e a cena do avatar segurando o quadro...'
    : '[Q 1/2] Sem foto — inventando personagem fictício pelo contexto, depois a arte e a cena...');
  const { artworkPath, scenePath } = await generateQuadro({
    refPhotoPath: cfg.refFoto || null,
    quadroPrompt: cfg.quadroPrompt,
    outDir: tmpDir,
    moldura: cfg.moldura || 'ornate-gold',
    cenario: cfg.cenario || 'a warm, cozy living room with soft natural window light',
    tipoProduto: cfg.tipoProduto || 'quadro',
    quadroGrupo: cfg.quadroGrupo || '',
    quadroNome: cfg.quadroNome || '',
    nomeCreativo: cfg.nomeCreativo || '',
  });
  console.log(`   arte: ${artworkPath}`);
  console.log(`   cena: ${scenePath}`);

  console.log('[Q 2/2] Rodando o pipeline de vídeo...');
  const project = {
    narracao: cfg.narracao,
    voz: cfg.voz,
    estiloLegenda: cfg.estiloLegenda || 'contorno',
    direcaoVoz: cfg.direcaoVoz,
    audio: cfg.audio || {},
    cenas: cfg.cenas.map((c) => ({ imagem: scenePath, prompt: c.prompt, duracaoSegundos: c.duracao || 8 })),
  };
  await runPipeline(project, { tmpDir, outputPath });
}

main().catch(async (err) => {
  const id = await logError({ source: 'cli:fromQuadro.js', error: err }).catch(() => null);
  console.error(`Erro${id ? ' #' + id : ''}:`, err.message);
  process.exit(1);
});
