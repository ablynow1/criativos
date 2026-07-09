import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPipeline } from './pipeline.js';
import { logError } from './errorLog.js';

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
  const configPath = args.config;
  const outputPath = args.out || 'output/final.mp4';

  if (!configPath) {
    console.error('Uso: node src/index.js --config inputs/projeto.json [--out output/final.mp4] [--musica emocional] [--sem-ambiente]');
    process.exit(1);
  }

  const project = JSON.parse(await readFile(configPath, 'utf-8'));
  // overrides de CLI pro áudio
  project.audio = project.audio || {};
  if (typeof args.musica === 'string') project.audio.musica = args.musica;
  if (args['sem-ambiente'] === true) project.audio.ambiente = false;

  const tmpDir = path.join('tmp', path.basename(configPath, '.json'));
  await runPipeline(project, { tmpDir, outputPath });
}

main().catch(async (err) => {
  const id = await logError({ source: 'cli:index.js', error: err }).catch(() => null);
  console.error(`Erro${id ? ' #' + id : ''}:`, err.message);
  process.exit(1);
});
