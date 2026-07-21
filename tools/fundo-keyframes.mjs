#!/usr/bin/env node
// Prepara os LUGARES do modo Ermos: gera o keyframe de cada um, publica a
// thumb da biblioteca e reescreve o manifest a partir de src/fundos.js.
//
// O keyframe vai pro MESMO caminho que o src/fromFundo.js usa
// (output/quadros/fundos/<id>/keyframe.png). Assim a imagem que o Vitor vê no
// preview é EXATAMENTE o primeiro quadro do vídeo — sem isso o fromFundo
// geraria outra imagem na hora de ativar e o preview viraria mentira.
//
// Uso:
//   node tools/fundo-keyframes.mjs            # só os que faltam
//   node tools/fundo-keyframes.mjs --forcar    # refaz todos
//   node tools/fundo-keyframes.mjs loft-industrial japandi
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { FUNDOS } from '../src/fundos.js';
import { generateProductImage } from '../src/generateProductImage.js';

const execFileAsync = promisify(execFile);
const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_FUNDOS = path.join(RAIZ, 'output/quadros/fundos');
const DIR_ASSETS = path.join(RAIZ, 'web/quadros/assets/fundos');
const SIPS = '/usr/bin/sips';

const args = process.argv.slice(2);
const forcar = args.includes('--forcar');
const alvos = args.filter((a) => !a.startsWith('--'));

async function tenta(fn, rotulo, n = 3) {
  let erro;
  for (let i = 1; i <= n; i += 1) {
    try { return await fn(); } catch (e) {
      erro = e;
      const cota = /429|RESOURCE_EXHAUSTED|quota/i.test(e.message || '');
      console.error(`  ${rotulo} tentativa ${i} falhou${cota ? ' (cota)' : ''}: ${String(e.message).slice(0, 130)}`);
      if (i < n) await new Promise((r) => setTimeout(r, cota ? i * 25000 : 3000));
    }
  }
  throw erro;
}

const lista = FUNDOS.filter((f) => !alvos.length || alvos.includes(f.id));
console.log(`${lista.length} lugar(es) na lista${forcar ? ' — refazendo todos' : ''}\n`);

const falhas = [];
for (const f of lista) {
  const dir = path.join(DIR_FUNDOS, f.id);
  const kf = path.join(dir, 'keyframe.png');
  const thumb = path.join(DIR_ASSETS, `${f.id}.jpg`);
  if (existsSync(kf) && existsSync(thumb) && !forcar) { console.log(`· ${f.id} já pronto`); continue; }
  try {
    await mkdir(dir, { recursive: true });
    if (!existsSync(kf) || forcar) {
      console.log(`⟳ ${f.id} — gerando keyframe…`);
      await tenta(() => generateProductImage({ prompt: f.keyframe, outputPath: kf }), f.id);
    }
    // thumb da biblioteca: mesma imagem, leve (JPG 720 de largura)
    await copyFile(kf, `${thumb}.png`);
    await execFileAsync(SIPS, ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72',
      '--resampleWidth', '720', `${thumb}.png`, '--out', thumb]);
    await execFileAsync('/bin/rm', ['-f', `${thumb}.png`]);
    console.log(`✓ ${f.id} — keyframe + thumb`);
  } catch (e) {
    falhas.push(f.id);
    console.error(`✗ ${f.id}: ${String(e.message).slice(0, 160)}`);
  }
}

// manifest sempre derivado do fundos.js — não dá pra sair do lugar
const manifest = FUNDOS
  .filter((f) => existsSync(path.join(DIR_ASSETS, `${f.id}.jpg`)))
  .map((f) => ({ id: f.id, nome: f.nome, hint: f.hint }));
await writeFile(path.join(DIR_ASSETS, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nmanifest: ${manifest.length} lugares${falhas.length ? ` · falharam: ${falhas.join(', ')}` : ''}`);
