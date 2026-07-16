#!/usr/bin/env node
/**
 * QUADROS WORKER — roda no Mac, conecta o Estúdio de Quadros ao pipeline nativo.
 *
 * Dois tipos de job:
 *   • cenario — gera os 6 keyframes VERDES de um palco novo (fromCenario.js) e
 *               sobe os thumbs pra você aprovar.
 *   • mockup  — aplica uma arte num cenário aprovado e renderiza o vídeo nativo
 *               de ~25s (fromMockup.js).
 *
 * Os cenários VIVEM aqui no Mac (output/quadros/cenarios/<id>/); a web guarda só
 * os thumbnails e o metadado. Um job de mockup resolve o cenário pela pasta local.
 *
 * Uso:  node tools/quadros-worker.mjs
 * Env:  QUADROS_URL   (default https://lventerprise.com.br/criativos/quadros)
 *       QUADROS_TOKEN (default lê do .env)
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { logError } from '../src/errorLog.js';

const BASE = process.env.QUADROS_URL || 'https://lventerprise.com.br/criativos/quadros';
const TOKEN = process.env.QUADROS_TOKEN || '';
const POLL_MS = 8000;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CENARIOS = path.join(ROOT, 'output', 'quadros', 'cenarios');

if (!TOKEN) {
  console.error('Falta QUADROS_TOKEN no .env (pegue em Ajustes > Worker no painel de Quadros).');
  process.exit(1);
}

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '·', ...a);

async function call(action, { body = null, form = null } = {}) {
  const opt = { method: body || form ? 'POST' : 'GET', headers: { 'X-Quadros-Token': TOKEN } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (form) opt.body = form;
  const res = await fetch(`${BASE}/api.php?action=${action}`, opt);
  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(`${action}: ${data?.error || res.status}`);
  return data;
}

let progressChain = Promise.resolve();
const progress = (job_id, pct, stage, logLine) => {
  progressChain = progressChain.then(() =>
    call('worker_progress', { body: { job_id, pct, stage, log: logLine } }).catch(() => {}));
  return progressChain;
};
const flushProgress = () => progressChain.catch(() => {});

async function download(url, dest) {
  const full = url.startsWith('http') ? url : `${BASE}/${url}`;
  const res = await fetch(full);
  if (!res.ok) throw new Error(`download ${res.status}: ${full}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function runCli(args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, { cwd: ROOT });
    let tail = [];
    const feed = (buf) => {
      for (const line of buf.toString().split('\n')) {
        const l = line.trim();
        if (!l) continue;
        tail.push(l); tail = tail.slice(-25);
        onLine(l);
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`cli saiu com código ${code}\n…${tail.slice(-6).join('\n')}`)));
    child.on('error', reject);
  });
}

// [x/7] cenário · [x/4] mockup → % e rótulo
function stageOf(l) {
  let m = l.match(/\[(\d+)\/7\]/);
  if (m) { const x = +m[1]; return [Math.round((x / 7) * 90), x === 1 ? 'interpretando a descrição' : `gerando keyframe ${x - 1}/6`]; }
  m = l.match(/\[(\d+)\/4\]/);
  if (m) {
    const x = +m[1];
    return [[8, 20, 85, 94][x - 1] || null,
      ['aplicando a arte nos keyframes', 'gerando as cenas no Veo', 'montando o vídeo', 'finalizando'][x - 1]];
  }
  if (/→ (V\dA)/.test(l)) return [null, l.replace(/.*→/, 'Veo:').trim()];
  return [null, null];
}

async function processCenario(job) {
  const snap = job.snapshot || {};
  const id = snap.id || job.id;
  const outDir = path.join(CENARIOS, id);
  await mkdir(outDir, { recursive: true });
  const cfgPath = path.join(ROOT, 'tmp', `cenario-${job.id}.json`);
  await mkdir(path.dirname(cfgPath), { recursive: true });
  // moldura da biblioteca (foto): baixa e entra como referência na geração
  let molduraImage = null;
  if (snap.molduraUrl) {
    await progress(job.id, 2, 'baixando a foto da moldura');
    const ext = (snap.molduraUrl.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    molduraImage = path.join(ROOT, 'tmp', `moldura-${job.id}.${ext}`);
    await download(snap.molduraUrl, molduraImage);
  }
  await writeFile(cfgPath, JSON.stringify({ ...snap, id, molduraImage }, null, 2));

  await progress(job.id, 3, 'iniciando geração do palco');
  let lastSend = 0;
  await runCli(['src/fromCenario.js', '--config', cfgPath, '--out', outDir], (line) => {
    const [pct, stage] = stageOf(line);
    const now = Date.now();
    if (pct !== null) { progress(job.id, pct, stage, line); lastSend = now; }
    else if (now - lastSend > 4000) { progress(job.id, undefined, undefined, line); lastSend = now; }
  });

  // sobe os 6 keyframes + o cenario.json pra aprovação
  await progress(job.id, 95, 'subindo os keyframes pra aprovação');
  const form = new FormData();
  form.append('job_id', job.id);
  form.append('cenario_id', id);
  const cj = await readFile(path.join(outDir, 'cenario.json'), 'utf-8');
  form.append('cenario', cj);
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) {
    const p = path.join(outDir, 'keyframes', `${k}.png`);
    if (existsSync(p)) {
      const buf = await readFile(p);
      // 'keyframes[]' (com colchetes) — senão o PHP só captura o último arquivo
      form.append('keyframes[]', new Blob([buf], { type: 'image/png' }), `${k}.png`);
    }
  }
  await call('worker_done', { form });
  log(`✅ cenário ${id} gerado — 6 keyframes enviados pra aprovação`);
}

async function processMockup(job) {
  const snap = job.snapshot || {};
  const cenarioDir = path.join(CENARIOS, snap.cenarioId || '');
  if (!existsSync(path.join(cenarioDir, 'cenario.json'))) {
    throw new Error(`cenário "${snap.cenarioId}" não existe neste Mac (gere/aprove ele antes)`);
  }
  const jobDir = path.join(ROOT, 'tmp', `mockup-${job.id}`);
  await mkdir(jobDir, { recursive: true });

  // baixa a arte
  await progress(job.id, 3, 'baixando a arte');
  const ext = (snap.arteUrl.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const artePath = path.join(jobDir, `arte.${ext}`);
  await download(snap.arteUrl, artePath);

  const cfg = {
    cenarioDir,
    arte: artePath,
    movimento: snap.movimento || 'medio',
    duracaoAlvo: snap.duracaoAlvo || 25,
    abertura: !!snap.abertura,
    audio: snap.audio || {},
    formatos: Array.isArray(snap.formatos) ? snap.formatos : ['9:16'],
  };
  const cfgPath = path.join(jobDir, 'mockup.json');
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  const outPath = path.join('output', 'quadros', 'mockups', `mockup-${job.id}.mp4`);

  await progress(job.id, 5, 'pipeline iniciando');
  let lastSend = 0;
  await runCli(['src/fromMockup.js', '--config', cfgPath, '--out', outPath], (line) => {
    const [pct, stage] = stageOf(line);
    const now = Date.now();
    if (pct !== null) { progress(job.id, pct, stage, line); lastSend = now; }
    else if (now - lastSend > 4000) { progress(job.id, undefined, undefined, line); lastSend = now; }
  });

  await progress(job.id, 96, 'subindo o vídeo pra galeria');
  const videoBuf = await readFile(path.join(ROOT, outPath));
  const form = new FormData();
  form.append('job_id', job.id);
  form.append('video', new Blob([videoBuf], { type: 'video/mp4' }), `mockup-${job.id}.mp4`);
  // export 4:5 (se o fromMockup gerou)
  const path45 = path.join(ROOT, outPath.replace(/\.mp4$/, '-45.mp4'));
  if (existsSync(path45)) {
    const buf45 = await readFile(path45);
    form.append('video45', new Blob([buf45], { type: 'video/mp4' }), `mockup-${job.id}-45.mp4`);
  }
  await call('worker_done', { form });
  log(`✅ mockup ${job.id} (“${job.nome}”) pronto — ${(videoBuf.length / 1e6).toFixed(1)}MB enviados`);
}

async function loop() {
  log(`Quadros worker ligado → ${BASE} (poll ${POLL_MS / 1000}s). Ctrl+C pra parar.`);
  for (;;) {
    try {
      const { job } = await call('worker_poll');
      if (job) {
        log(`🖼️  job recebido: ${job.id} — “${job.nome}” (${job.snapshot?.tipo || '?'})`);
        try {
          if (job.snapshot?.tipo === 'cenario') await processCenario(job);
          else await processMockup(job);
        } catch (err) {
          await flushProgress();
          const already = err.message.match(/Erro #(L?\d+):\s*([\s\S]+)/);
          let id, cleanMsg;
          if (already) { [, id, cleanMsg] = already; cleanMsg = cleanMsg.trim(); }
          else {
            id = await logError({ source: 'quadros:processJob', error: err,
              context: { job_id: job.id, nome: job.nome, tipo: job.snapshot?.tipo } });
            cleanMsg = err.message;
          }
          log(`❌ job ${job.id} falhou (#${id}):`, cleanMsg);
          await call('worker_error', { body: { job_id: job.id, message: `Erro #${id} — ${cleanMsg}` } }).catch(() => {});
        }
        continue;
      }
    } catch (err) {
      const id = await logError({ source: 'quadros:poll', error: err }).catch(() => null);
      log(`⚠️ poll falhou${id ? ' (#' + id + ')' : ''}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('unhandledRejection', async (err) => {
  const e = err instanceof Error ? err : new Error(String(err));
  const id = await logError({ source: 'quadros:unhandledRejection', error: e }).catch(() => null);
  log(`💥 promessa rejeitada${id ? ' (#' + id + ')' : ''}:`, e.message);
});

loop();
