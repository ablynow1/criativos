import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPipeline } from './pipeline.js';

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
    console.error('Uso: node src/index.js --config inputs/projeto.json [--out output/final.mp4] [--motor veo|freepik:kling-v2] [--refino|--no-refino]');
    process.exit(1);
  }

  const project = JSON.parse(await readFile(configPath, 'utf-8'));

  // Overrides de CLI (têm precedência sobre o que está no JSON).
  if (typeof args.motor === 'string') project.motor = args.motor;
  if (args.refino === true) project.refino = true;
  if (args['no-refino'] === true) project.refino = false;

  const tmpDir = path.join('tmp', path.basename(configPath, '.json'));
  await runPipeline(project, { tmpDir, outputPath });
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
