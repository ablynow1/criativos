#!/usr/bin/env node
/**
 * Consulta o log de erros do Cricri (data/errors.json no servidor).
 * Todo erro do sistema — Veo, TTS, geração de imagem, ffmpeg, worker, site —
 * é registrado ali com um número. Aqui é onde se busca "o que aconteceu".
 *
 * Uso:
 *   node tools/error-log.mjs           → lista os últimos erros
 *   node tools/error-log.mjs 47        → mostra o erro #47 completo (stack, contexto)
 */
import 'dotenv/config';

const BASE = process.env.CRICRI_URL || 'https://lventerprise.com.br/criativos';
const TOKEN = process.env.CRICRI_TOKEN || '';

async function call(action, qs = '') {
  const res = await fetch(`${BASE}/api.php?action=${action}${qs}`, { headers: { 'X-Cricri-Token': TOKEN } });
  const data = await res.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const arg = process.argv[2];

  if (arg) {
    const { error: e } = await call('error_get', `&id=${encodeURIComponent(arg)}`);
    console.log(`\n━━ Erro #${e.id} ━━`);
    console.log('quando: ', new Date(e.ts).toLocaleString('pt-BR'));
    console.log('origem: ', e.source);
    console.log('mensagem:', e.message);
    if (e.context && Object.keys(e.context).length) console.log('contexto:', JSON.stringify(e.context, null, 2));
    if (e.stack) console.log('\nstack:\n' + e.stack);
    console.log('');
    return;
  }

  const { errors } = await call('errors', '&limit=25');
  if (!errors.length) { console.log('nenhum erro registrado ainda 🎉'); return; }
  console.log(`\nÚltimos ${errors.length} erros (mais recente primeiro):\n`);
  for (const e of errors) {
    const when = new Date(e.ts).toLocaleString('pt-BR');
    console.log(`#${e.id}  ${when}  [${e.source}]  ${e.message.slice(0, 90)}`);
  }
  console.log('\nVer detalhe: node tools/error-log.mjs <numero>\n');
}

main().catch((err) => {
  console.error('Erro ao consultar o log:', err.message);
  process.exit(1);
});
