import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { scrapeLandingPage } from './scrapeLandingPage.js';
import { analyzeCopy } from './analyzeCopy.js';
import { generateProductImage } from './generateProductImage.js';
import { img2img } from './img2img.js';
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

function slugFromUrl(url) {
  return new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') ||
    new URL(url).hostname.replace(/\W+/g, '-');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url;
  if (!url) {
    console.error('Uso: node src/fromLandingPage.js --url <URL da LP> [--out output/final.mp4] [--estilo contorno] [--ref-foto caminho.png] [--briefing-only]');
    process.exit(1);
  }

  const slug = args.slug || slugFromUrl(url);
  const outputPath = args.out || `output/${slug}.mp4`;
  const tmpDir = path.join('tmp', slug);
  await mkdir(tmpDir, { recursive: true });
  await mkdir('inputs', { recursive: true });

  console.log(`[LP 1/3] Baixando e lendo a copy de ${url}...`);
  const scraped = await scrapeLandingPage(url);
  if (scraped.textContent.length < 300) {
    console.warn(
      `   ⚠️  Só extraí ${scraped.textContent.length} caracteres — a LP pode ser uma SPA client-side. ` +
      `O briefing pode sair fraco; se sair, me passe a copy manualmente.`
    );
  } else {
    console.log(`   ${scraped.textContent.length} caracteres de copy extraídos`);
  }

  console.log(`[LP 2/3] Analisando copy com Gemini (produto, público, narração, cenas)...`);
  const briefing = await analyzeCopy(scraped);
  console.log(`   produto: ${briefing.produto}`);
  console.log(`   público: ${briefing.publicoAlvo}`);
  console.log(`   tom: ${briefing.tom}`);
  console.log(`   voz: ${briefing.voz}`);
  console.log(`   narração: "${briefing.narracao}"`);

  const imagePath = path.join('inputs', `${slug}.png`);
  if (args['ref-foto']) {
    console.log(`[LP 3/3] Gerando imagem contextual do produto (com o rosto da foto de referência)...`);
    const refPrompt = `Using the attached reference photo as the person's face and likeness (keep their exact real facial features, skin tone, hair and expression precisely as shown), generate this scene: ${briefing.imagemPrompt}`;
    await img2img({ inputPaths: args['ref-foto'], prompt: refPrompt, outputPath: imagePath, aspectRatio: '9:16' });
  } else {
    console.log(`[LP 3/3] Gerando imagem contextual do produto...`);
    await generateProductImage({ prompt: briefing.imagemPrompt, outputPath: imagePath });
  }
  console.log(`   imagem: ${imagePath}`);

  const project = {
    narracao: briefing.narracao,
    voz: briefing.voz,
    estiloLegenda: args.estilo || 'contorno',
    audio: {
      ...(typeof args.musica === 'string' ? { musica: args.musica } : {}),
      ...(args['sem-ambiente'] === true ? { ambiente: false } : {}),
    },
    cenas: briefing.cenas.map((cena) => ({ imagem: imagePath, prompt: cena.prompt })),
  };

  const projectPath = path.join('inputs', `${slug}.json`);
  await writeFile(projectPath, JSON.stringify({ ...project, _briefing: briefing, _url: url }, null, 2), 'utf-8');
  console.log(`   briefing salvo em ${projectPath}`);

  if (args['briefing-only']) {
    console.log('\n✅ Briefing + imagem prontos (--briefing-only: não gerei o vídeo). Revise e rode:');
    console.log(`   node src/index.js --config ${projectPath} --out ${outputPath}`);
    return;
  }

  await runPipeline(project, { tmpDir, outputPath });
}

main().catch(async (err) => {
  const id = await logError({ source: 'cli:fromLandingPage.js', error: err }).catch(() => null);
  console.error(`Erro${id ? ' #' + id : ''}:`, err.message);
  process.exit(1);
});
