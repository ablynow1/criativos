#!/usr/bin/env node
/**
 * CRICRI WORKER — roda no Mac, conecta o estúdio web ao pipeline local.
 *
 * Loop: pergunta à fila (lventerprise.com.br/criativos) se tem job → baixa as
 * imagens de referência → monta o projeto.json → roda o pipeline (TTS → Veo →
 * legenda → merge) → sobe o MP4 pronto pra galeria. Progresso em tempo real.
 *
 * Uso:  node tools/cricri-worker.mjs
 * Env:  CRICRI_URL (default https://lventerprise.com.br/criativos)
 *       CRICRI_TOKEN (default lê do .env)
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { logError } from '../src/errorLog.js';

const BASE = process.env.CRICRI_URL || 'https://lventerprise.com.br/criativos';
const TOKEN = process.env.CRICRI_TOKEN || '';
const POLL_MS = 8000;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

if (!TOKEN) {
  console.error('Falta CRICRI_TOKEN no .env (pegue em Ajustes > Worker no painel).');
  process.exit(1);
}

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), '·', ...a);

async function call(action, { body = null, form = null } = {}) {
  const opt = { method: body || form ? 'POST' : 'GET', headers: { 'X-Cricri-Token': TOKEN } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (form) opt.body = form;
  const res = await fetch(`${BASE}/api.php?action=${action}`, opt);
  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(`${action}: ${data?.error || res.status}`);
  return data;
}

// progresso serializado (chain) — garante ordem e permite flush antes do worker_error,
// pra um progresso em voo nunca ressuscitar um job que já falhou.
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

function runPipeline(args, onLine) {
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
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`pipeline saiu com código ${code}\n…${tail.slice(-6).join('\n')}`)));
    child.on('error', reject);
  });
}

// mapeia as linhas do pipeline pra % de progresso
function stageFromLine(l, nCenas) {
  if (l.includes('[1/4]')) return [8, 'gerando narração (TTS)'];
  if (l.includes('[2/4]')) return [15, 'gerando clipes no Veo'];
  if (l.includes('Ken Burns')) return [null, 'Veo bloqueou uma cena — usando movimento Ken Burns'];
  const m = l.match(/cena (\d+)\/(\d+)/);
  if (m) { const [_, x, n] = m.map(Number); return [15 + Math.round(55 * (x / (n || nCenas || 1))), `Veo: cena ${x}/${n}`]; }
  if (l.includes('[3/4]')) return [78, 'sincronizando legendas'];
  if (l.includes('[4/4]')) return [88, 'montando vídeo final'];
  if (l.includes('[LP 1/3]')) return [5, 'lendo a landing page'];
  if (l.includes('[LP 2/3]')) return [10, 'briefing com Gemini'];
  if (l.includes('[LP 3/3]')) return [14, 'gerando imagem do produto'];
  if (l.includes('[Q 1/2]')) return [8, 'gerando o quadro (foto → arte → avatar segurando)'];
  if (l.includes('[Q 2/2]')) return [15, 'gerando clipes no Veo'];
  return [null, null];
}

async function processJob(job) {
  const snap = job.snapshot || {};
  const jobDir = path.join(ROOT, 'tmp', 'cricri', job.id);
  await mkdir(jobDir, { recursive: true });
  const outPath = path.join('output', `cricri-${job.id}.mp4`);
  let args;

  if (snap.modo === 'lp') {
    args = ['src/fromLandingPage.js', '--url', snap.lp_url, '--slug', `cricri-${job.id}`,
      '--estilo', snap.estiloLegenda || 'contorno', '--out', outPath];
    if (snap.audio?.musica && snap.audio.musica !== 'nenhuma') args.push('--musica', snap.audio.musica);
    if (snap.audio?.ambiente === false) args.push('--sem-ambiente');
    // foto de referência é OPCIONAL — se tiver, o rosto real entra na imagem
    // gerada; sem ela, segue 100% automático como sempre foi.
    if (snap.ref_foto) {
      await progress(job.id, 3, 'baixando foto de referência');
      const ext = (snap.ref_foto.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const refLocal = path.join(jobDir, `ref.${ext}`);
      await download(snap.ref_foto, refLocal);
      args.push('--ref-foto', refLocal);
    }
  } else if (snap.modo === 'quadro') {
    // foto de referência é OPCIONAL — se tiver, baixa; se não, o fromQuadro.js
    // inventa um personagem fictício a partir do contexto (grupo/cenário/nome).
    let refLocal = null;
    if (snap.ref_foto) {
      await progress(job.id, 3, 'baixando foto de referência');
      const ext = (snap.ref_foto.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      refLocal = path.join(jobDir, `ref.${ext}`);
      await download(snap.ref_foto, refLocal);
    }
    const cfg = {
      refFoto: refLocal,
      quadroPrompt: snap.quadro_prompt,
      tipoProduto: snap.quadro_tipo || 'quadro',
      quadroGrupo: snap.quadro_grupo || '',
      quadroNome: snap.quadro_nome || '',
      nomeCreativo: snap.nome || '',
      moldura: snap.moldura || 'ornate-gold',
      cenario: snap.cenario || undefined,
      narracao: snap.narracao,
      voz: snap.voz,
      estiloLegenda: snap.estiloLegenda || 'contorno',
      direcaoVoz: snap.direcao_voz || undefined,
      audio: snap.audio || {},
      cenas: (snap.cenas || []).map((c) => ({ prompt: c.prompt, duracao: c.duracao || 8 })),
    };
    const cfgPath = path.join(jobDir, 'quadro.json');
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    args = ['src/fromQuadro.js', '--config', cfgPath, '--out', outPath];
  } else {
    // baixa imagens das cenas e monta o projeto.json do pipeline
    const cenas = [];
    for (let i = 0; i < (snap.cenas || []).length; i++) {
      const cn = snap.cenas[i];
      const ext = (cn.imagem.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const local = path.join(jobDir, `cena-${i}.${ext}`);
      await progress(job.id, 3 + i, 'baixando imagens de referência');
      await download(cn.imagem, local);
      cenas.push({ imagem: local, prompt: cn.prompt, duracaoSegundos: cn.duracao || 8 });
    }
    const projeto = { narracao: snap.narracao, voz: snap.voz, estiloLegenda: snap.estiloLegenda || 'contorno', direcaoVoz: snap.direcao_voz || undefined, audio: snap.audio || {}, cenas };
    const cfgPath = path.join(jobDir, 'projeto.json');
    await writeFile(cfgPath, JSON.stringify(projeto, null, 2));
    args = ['src/index.js', '--config', cfgPath, '--out', outPath];
  }

  await progress(job.id, 5, 'pipeline iniciando');
  let lastSend = 0;
  await runPipeline(args, (line) => {
    const [pct, stage] = stageFromLine(line, snap.cenas?.length);
    const now = Date.now();
    if (pct !== null) { progress(job.id, pct, stage, line); lastSend = now; }
    else if (now - lastSend > 4000) { progress(job.id, undefined, undefined, line); lastSend = now; }
  });

  await progress(job.id, 96, 'subindo o vídeo pro painel');
  const videoBuf = await readFile(path.join(ROOT, outPath));
  const form = new FormData();
  form.append('job_id', job.id);
  form.append('video', new Blob([videoBuf], { type: 'video/mp4' }), `cricri-${job.id}.mp4`);
  await call('worker_done', { form });
  log(`✅ job ${job.id} (“${job.nome}”) pronto — ${(videoBuf.length / 1e6).toFixed(1)}MB enviados`);
}

async function loop() {
  log(`Cricri worker ligado → ${BASE} (poll ${POLL_MS / 1000}s). Ctrl+C pra parar.`);
  for (;;) {
    try {
      const { job } = await call('worker_poll');
      if (job) {
        log(`🎬 job recebido: ${job.id} — “${job.nome}” (${job.snapshot?.modo || 'manual'})`);
        try {
          await processJob(job);
        } catch (err) {
          await flushProgress(); // espera todo progresso em voo antes de marcar erro
          // o processo filho (CLI) já loga e imprime "Erro #N: <msg>" antes de sair —
          // se essa marca estiver no erro capturado aqui, reaproveita o número e a
          // mensagem limpa em vez de logar tudo de novo (duplicava #N + #N+1 aninhados).
          const already = err.message.match(/Erro #(L?\d+):\s*([\s\S]+)/);
          let id, cleanMsg;
          if (already) {
            [, id, cleanMsg] = already;
            cleanMsg = cleanMsg.trim();
          } else {
            id = await logError({
              source: 'worker:processJob', error: err,
              context: { job_id: job.id, nome: job.nome, modo: job.snapshot?.modo },
            });
            cleanMsg = err.message;
          }
          const msg = `Erro #${id} — ${cleanMsg}`;
          log(`❌ job ${job.id} falhou (#${id}):`, cleanMsg);
          await call('worker_error', { body: { job_id: job.id, message: msg } }).catch(() => {});
        }
        continue; // sem sleep: pega o próximo da fila direto
      }
    } catch (err) {
      const id = await logError({ source: 'worker:poll', error: err }).catch(() => null);
      log(`⚠️ poll falhou${id ? ' (#' + id + ')' : ''}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('unhandledRejection', async (err) => {
  const e = err instanceof Error ? err : new Error(String(err));
  const id = await logError({ source: 'worker:unhandledRejection', error: e }).catch(() => null);
  log(`💥 promessa rejeitada sem tratamento${id ? ' (#' + id + ')' : ''}:`, e.message);
});
process.on('uncaughtException', async (err) => {
  const id = await logError({ source: 'worker:uncaughtException', error: err }).catch(() => null);
  log(`💥 exceção não capturada${id ? ' (#' + id + ')' : ''}:`, err.message);
});

loop();
