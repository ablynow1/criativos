import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const LOCAL_DIR = path.resolve('tmp', 'error-log');
const LOCAL_FILE = path.join(LOCAL_DIR, 'errors.jsonl');
const LOCAL_SEQ = path.join(LOCAL_DIR, 'seq.txt');

async function nextLocalId() {
  let n = 0;
  try { n = parseInt((await readFile(LOCAL_SEQ, 'utf-8')).trim(), 10) || 0; } catch { /* primeira vez */ }
  n += 1;
  await writeFile(LOCAL_SEQ, String(n));
  return n;
}

/**
 * Registra QUALQUER erro do sistema com um número — tenta no servidor Cricri
 * primeiro (fica visível em Ajustes > Log de erros pro Vitor consultar do
 * celular), e SEMPRE grava uma cópia local em tmp/error-log/errors.jsonl como
 * seguro (funciona mesmo sem internet). Nunca lança — logar um erro não pode
 * quebrar o fluxo que estava tratando o erro original.
 *
 * `source` identifica de onde veio (ex: "worker:processJob", "cli:index.js").
 * `context` é qualquer coisa útil pra reconstruir o que estava acontecendo
 * (job_id, modelo, imagem, etc).
 *
 * Retorna uma string tipo "47" (id do servidor, canônico) ou "L12" (só local,
 * servidor indisponível) — sempre inclua no texto mostrado ao usuário.
 */
export async function logError({ source, error, context = {} }) {
  const message = error?.message || String(error);
  const stack = error?.stack || null;
  let serverId = null;

  const base = process.env.CRICRI_URL;
  const token = process.env.CRICRI_TOKEN;
  if (base && token) {
    try {
      const res = await fetch(`${base}/api.php?action=worker_log_error`, {
        method: 'POST',
        headers: { 'X-Cricri-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, message, stack, context }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) serverId = data.id;
    } catch { /* servidor fora do ar — segue só com o log local */ }
  }

  let label = serverId !== null ? String(serverId) : null;
  try {
    await mkdir(LOCAL_DIR, { recursive: true });
    if (label === null) label = 'L' + (await nextLocalId());
    const entry = { id: label, serverId, ts: new Date().toISOString(), source, message, stack, context };
    await appendFile(LOCAL_FILE, JSON.stringify(entry) + '\n');
  } catch { /* não deixa a gravação do log derrubar o processo */ }

  return label;
}
