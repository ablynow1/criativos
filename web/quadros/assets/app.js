/* ESTÚDIO DE QUADROS — SPA vanilla. Contrato: web/quadros/api.php.
   Fluxo: Cenário (palco, monta 1x) → Mockup (take, troca a arte). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');

const S = {
  auth: false, tab: 'cenarios', screen: null,
  cenarios: [], jobs: [], defaults: { movimento: 'medio', duracaoAlvo: 25 },
  // form do mockup
  mk: { cenarioId: null, arteUrl: null, artePrev: null, movimento: 'medio', duracaoAlvo: 25, abertura: false },
  // form do cenário
  cn: { descricao: '', avatarText: '', ambienteText: '', molduraText: '', nome: '', movimento: 'medio', temAbertura: false },
};

const IC = {
  cenarios: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  novo: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-6h6v6"/><circle cx="12" cy="9" r="2"/></svg>',
  fila: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  galeria: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
};

async function api(action, { body, form } = {}) {
  const opt = { method: body || form ? 'POST' : 'GET', headers: { 'X-Quadros': '1' } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (form) opt.body = form;
  const res = await fetch(`api.php?action=${action}`, opt);
  const data = await res.json().catch(() => ({ ok: false, error: 'resposta inválida' }));
  if (!data.ok) throw new Error(data.error || `erro ${res.status}`);
  return data;
}

let toastT;
function toast(msg, isErr) {
  clearTimeout(toastT);
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); document.body.appendChild(t); }
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  toastT = setTimeout(() => t.remove(), 3400);
}

// ---------- LOGIN ----------
function renderLogin() {
  app.innerHTML = `<div class="login">
    <h1>Quadros</h1>
    <p>Estúdio de mockups de vitrine</p>
    <input id="pw" type="password" placeholder="senha" autofocus>
    <button class="btn" id="go">Entrar</button>
  </div>`;
  const go = async () => {
    try { await api('login', { body: { password: $('#pw').value } }); S.auth = true; await boot(); }
    catch (e) { toast(e.message, true); }
  };
  $('#go').onclick = go;
  $('#pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ---------- SHELL ----------
function shell(inner) {
  const tab = (id, label) => `<button class="${S.tab === id && !S.screen ? 'on' : ''}" data-tab="${id}">${IC[id]}<span>${label}</span></button>`;
  app.innerHTML = `
    <header class="top"><span class="mk">Quadros</span><span class="sp"></span></header>
    <main>${inner}</main>
    <nav class="tabs">
      ${tab('cenarios', 'Cenários')}${tab('novo', 'Novo')}${tab('fila', 'Fila')}${tab('galeria', 'Galeria')}${tab('ajustes', 'Ajustes')}
    </nav>`;
  app.querySelectorAll('nav.tabs button').forEach((b) => {
    b.onclick = () => { S.tab = b.dataset.tab; S.screen = null; render(); };
  });
}

// ---------- CENÁRIOS ----------
function viewCenarios() {
  const cards = S.cenarios.map((c) => {
    const thumbs = (c.thumbs || []).slice(0, 3).map((u) => `<img src="${esc(u)}" alt="">`).join('') || '<div></div><div></div><div></div>';
    const wait = c.status !== 'aprovado';
    return `<div class="card">
      <div class="thumbs">${thumbs}</div>
      <div class="cbody">
        <h3>${esc(c.nome)}</h3>
        <div class="st ${wait ? 'wait' : 'ok'}">${wait ? '● aguardando aprovação' : '✓ aprovado'}</div>
        <p class="desc">${esc(c.ambiente || '')}</p>
      </div>
      <div class="cactions">
        ${wait ? `<button class="btn sm" data-approve="${esc(c.id)}">Ver / aprovar</button>` : `<button class="btn sm" data-use="${esc(c.id)}">Usar</button>`}
        <button class="btn sm danger" data-del="${esc(c.id)}">✕</button>
      </div>
    </div>`;
  }).join('');
  shell(`
    <h2 class="view-t">Cenários</h2>
    <p class="view-sub">O palco: modelo + ambiente + moldura. Monta uma vez, reusa sempre.</p>
    <button class="btn" id="new-cen">+ Novo cenário</button>
    <div class="spacer"></div>
    ${S.cenarios.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Nenhum cenário ainda.<br>Crie o primeiro palco acima.</div>'}
  `);
  $('#new-cen').onclick = () => { S.screen = 'novo-cenario'; render(); };
  app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => { S.screen = 'aprovar:' + b.dataset.approve; render(); });
  app.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { S.mk.cenarioId = b.dataset.use; S.tab = 'novo'; S.screen = null; render(); });
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Apagar este cenário?')) return;
    try { await api('delete_cenario', { body: { id: b.dataset.del } }); await refresh(); toast('cenário apagado'); }
    catch (e) { toast(e.message, true); }
  });
}

// ---------- NOVO CENÁRIO (form) ----------
function viewNovoCenario() {
  const c = S.cn;
  const moveChips = ['calmo', 'medio', 'dinamico'].map((m) =>
    `<button class="chip ${c.movimento === m ? 'on' : ''}" data-move="${m}">${m}</button>`).join('');
  shell(`
    <h2 class="view-t">Novo cenário</h2>
    <p class="view-sub">Descreva em texto livre — eu viro o prompt técnico e gero os 6 quadros-base pra você aprovar.</p>
    <div class="field"><label>Descrição da cena</label>
      <textarea id="f-desc" placeholder="ex: uma ruiva de vestido preto numa galeria minimalista branca, luz de dia, moldura dourada">${esc(c.descricao)}</textarea>
      <div class="hint">Pode jogar tudo aqui, ou detalhar nos campos abaixo.</div>
    </div>
    <div class="field"><label>Avatar (opcional)</label><input type="text" id="f-av" placeholder="quem apresenta o quadro" value="${esc(c.avatarText)}"></div>
    <div class="field"><label>Ambiente (opcional)</label><input type="text" id="f-am" placeholder="onde é a cena" value="${esc(c.ambienteText)}"></div>
    <div class="field"><label>Moldura (opcional)</label><input type="text" id="f-mo" placeholder="ex: preta fina, dourada, madeira clara" value="${esc(c.molduraText)}"></div>
    <div class="field"><label>Movimento das cenas</label><div class="chips">${moveChips}</div></div>
    <div class="row"><span class="rl">Preparar abertura com reveal do verso</span><button class="tg ${c.temAbertura ? 'on' : ''}" id="f-ab"></button></div>
    <div class="hint" style="margin:6px 0 16px">O reveal do verso é gerado depois, sob demanda. Deixe desligado por ora.</div>
    <button class="btn" id="cen-go">Gerar quadros-base</button>
    <div class="spacer"></div>
    <button class="btn ghost" id="cen-back">Voltar</button>
  `);
  $('#f-desc').oninput = (e) => c.descricao = e.target.value;
  $('#f-av').oninput = (e) => c.avatarText = e.target.value;
  $('#f-am').oninput = (e) => c.ambienteText = e.target.value;
  $('#f-mo').oninput = (e) => c.molduraText = e.target.value;
  app.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { c.movimento = b.dataset.move; render(); });
  $('#f-ab').onclick = () => { c.temAbertura = !c.temAbertura; render(); };
  $('#cen-back').onclick = () => { S.screen = null; render(); };
  $('#cen-go').onclick = async () => {
    if (!c.descricao.trim() && (!c.avatarText.trim() || !c.ambienteText.trim())) return toast('descreva ao menos avatar e ambiente', true);
    try {
      await api('queue_cenario', { body: { ...c, nome: c.nome || (c.ambienteText || c.descricao).slice(0, 30) } });
      S.cn = { descricao: '', avatarText: '', ambienteText: '', molduraText: '', nome: '', movimento: 'medio', temAbertura: false };
      S.screen = null; S.tab = 'fila'; await refresh();
      toast('gerando o palco — acompanhe na Fila');
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- APROVAR CENÁRIO ----------
function viewAprovar(id) {
  const c = S.cenarios.find((x) => x.id === id);
  if (!c) { S.screen = null; return render(); }
  const imgs = (c.thumbs || []).map((u) => `<img src="${esc(u)}" alt="">`).join('');
  shell(`
    <h2 class="view-t">${esc(c.nome)}</h2>
    <p class="view-sub">Confira: a mesma pessoa nas 6 cenas? verde limpo? moldura certa?</p>
    <div class="approve-grid">${imgs}</div>
    <button class="btn" id="ap-ok">Aprovar palco</button>
    <div class="spacer"></div>
    <button class="btn ghost" id="ap-back">Voltar</button>
  `);
  $('#ap-back').onclick = () => { S.screen = null; render(); };
  $('#ap-ok').onclick = async () => {
    try { await api('approve_cenario', { body: { id } }); await refresh(); S.screen = null; S.tab = 'cenarios'; toast('cenário aprovado ✓'); render(); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- NOVO MOCKUP ----------
function viewNovo() {
  const aprovados = S.cenarios.filter((c) => c.status === 'aprovado');
  if (!aprovados.length) {
    return shell(`<h2 class="view-t">Novo mockup</h2><div class="empty">Você precisa de um cenário aprovado primeiro.<br>Vá em Cenários e crie um palco.</div>`);
  }
  if (!S.mk.cenarioId || !aprovados.find((c) => c.id === S.mk.cenarioId)) S.mk.cenarioId = aprovados[0].id;
  const m = S.mk;
  const cenChips = aprovados.map((c) => `<button class="chip ${m.cenarioId === c.id ? 'on' : ''}" data-cen="${esc(c.id)}">${esc(c.nome)}</button>`).join('');
  const moveChips = ['calmo', 'medio', 'dinamico'].map((x) => `<button class="chip ${m.movimento === x ? 'on' : ''}" data-move="${x}">${x}</button>`).join('');
  const durChips = [15, 25, 30].map((x) => `<button class="chip ${m.duracaoAlvo === x ? 'on' : ''}" data-dur="${x}">${x}s</button>`).join('');
  const cen = aprovados.find((c) => c.id === m.cenarioId);
  shell(`
    <h2 class="view-t">Novo mockup</h2>
    <p class="view-sub">Escolha o palco, suba a arte e ajuste. Sai o vídeo nativo de ${m.duracaoAlvo}s.</p>
    <div class="field"><label>Cenário</label><div class="chips">${cenChips}</div></div>
    <div class="field"><label>Arte do quadro</label>
      <div class="drop ${m.artePrev ? 'has' : ''}" id="drop">
        ${m.artePrev ? `<img src="${esc(m.artePrev)}" alt=""><div class="t">trocar a arte</div>` : '<div class="t">toque pra subir a imagem</div><div class="hint">png · jpg · webp</div>'}
      </div>
    </div>
    <div class="field"><label>Movimento</label><div class="chips">${moveChips}</div></div>
    <div class="field"><label>Duração</label><div class="chips">${durChips}</div></div>
    ${cen && cen.temAbertura ? `<div class="row"><span class="rl">Abrir com reveal do verso</span><button class="tg ${m.abertura ? 'on' : ''}" id="mk-ab"></button></div>` : ''}
    <div class="spacer"></div>
    <button class="btn" id="mk-go" ${m.arteUrl ? '' : 'disabled'}>Renderizar mockup</button>
  `);
  app.querySelectorAll('[data-cen]').forEach((b) => b.onclick = () => { m.cenarioId = b.dataset.cen; render(); });
  app.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { m.movimento = b.dataset.move; render(); });
  app.querySelectorAll('[data-dur]').forEach((b) => b.onclick = () => { m.duracaoAlvo = +b.dataset.dur; render(); });
  const ab = $('#mk-ab'); if (ab) ab.onclick = () => { m.abertura = !m.abertura; render(); };
  $('#drop').onclick = pickArt;
  $('#mk-go').onclick = async () => {
    try {
      await api('queue_mockup', { body: { cenarioId: m.cenarioId, arteUrl: m.arteUrl, nome: '', movimento: m.movimento, duracaoAlvo: m.duracaoAlvo, abertura: m.abertura } });
      S.tab = 'fila'; await refresh(); toast('renderizando — acompanhe na Fila');
    } catch (e) { toast(e.message, true); }
  };
}

function pickArt() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try {
      toast('subindo a arte…');
      const r = await api('upload_image', { form: fd });
      S.mk.arteUrl = r.url; S.mk.artePrev = URL.createObjectURL(f);
      render();
    } catch (e) { toast(e.message, true); }
  };
  inp.click();
}

// ---------- FILA ----------
function viewFila() {
  const jobs = S.jobs;
  const rows = jobs.map((j) => {
    const running = ['claimed', 'running'].includes(j.status);
    const badge = j.tipo === 'mockup' ? '<span class="jt mock">mockup</span>' : '<span class="jt">cenário</span>';
    return `<div class="job">
      <div class="jh">${badge}<span class="jn">${esc(j.nome)}</span></div>
      <div class="stage">${esc(j.stage || j.status)}${j.status === 'done' ? ' ✓' : ''}</div>
      ${j.status !== 'done' && j.status !== 'error' ? `<div class="bar ${running ? 'run' : ''}"><i style="width:${j.pct || 0}%"></i></div>` : ''}
      ${j.error ? `<div class="err">${esc(j.error)}</div>` : ''}
      <div class="jactions">
        ${j.status === 'error' ? `<button class="btn sm ghost" data-retry="${esc(j.id)}">Tentar de novo</button>` : ''}
        ${['queued', 'claimed', 'running'].includes(j.status) ? `<button class="btn sm ghost" data-cancel="${esc(j.id)}">Cancelar</button>` : ''}
        ${['done', 'error'].includes(j.status) ? `<button class="btn sm danger" data-djob="${esc(j.id)}">Apagar</button>` : ''}
        ${j.tipo === 'cenario' && j.status === 'done' ? `<button class="btn sm" data-goto-cen="1">Ver cenário</button>` : ''}
      </div>
    </div>`;
  }).join('');
  shell(`<h2 class="view-t">Fila</h2><p class="view-sub">O worker no seu Mac processa um por vez.</p>
    ${jobs.length ? rows : '<div class="empty">Fila vazia.</div>'}`);
  const act = async (op, id) => { try { await api('job_action', { body: { op, job_id: id } }); await refresh(); } catch (e) { toast(e.message, true); } };
  app.querySelectorAll('[data-retry]').forEach((b) => b.onclick = () => act('retry', b.dataset.retry));
  app.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => act('cancel', b.dataset.cancel));
  app.querySelectorAll('[data-djob]').forEach((b) => b.onclick = () => act('delete', b.dataset.djob));
  app.querySelectorAll('[data-goto-cen]').forEach((b) => b.onclick = () => { S.tab = 'cenarios'; render(); });
}

// ---------- GALERIA ----------
function viewGaleria() {
  const done = S.jobs.filter((j) => j.tipo === 'mockup' && j.status === 'done' && j.video);
  const cells = done.map((j) => `<div><video src="${esc(j.video)}" controls playsinline preload="metadata"></video><div class="gcap">${esc(j.nome)}</div></div>`).join('');
  shell(`<h2 class="view-t">Galeria</h2><p class="view-sub">Seus mockups prontos.</p>
    ${done.length ? `<div class="gal">${cells}</div>` : '<div class="empty">Nenhum mockup pronto ainda.</div>'}`);
}

// ---------- AJUSTES ----------
function viewAjustes() {
  shell(`<h2 class="view-t">Ajustes</h2>
    <div class="field"><label>Worker (no seu Mac)</label>
      <div class="hint">Pra gerar cenários e vídeos, deixe o worker rodando:<br><code>node tools/quadros-worker.mjs</code></div>
    </div>
    <div class="field"><label>QUADROS_TOKEN (pro .env)</label>
      <input type="text" id="tok" readonly value="${esc(S.workerToken || '—')}">
      <div class="hint">Cole no <code>.env</code> do repo como <code>QUADROS_TOKEN=…</code></div>
    </div>
    <div class="spacer"></div>
    <button class="btn ghost" id="logout">Sair</button>`);
  const t = $('#tok'); if (t) t.onclick = () => { t.select(); document.execCommand && document.execCommand('copy'); toast('token copiado'); };
  $('#logout').onclick = async () => { await api('logout').catch(() => {}); S.auth = false; renderLogin(); };
}

// ---------- ROUTER ----------
function render() {
  if (!S.auth) return renderLogin();
  if (S.screen === 'novo-cenario') return viewNovoCenario();
  if (S.screen && S.screen.startsWith('aprovar:')) return viewAprovar(S.screen.slice(8));
  ({ cenarios: viewCenarios, novo: viewNovo, fila: viewFila, galeria: viewGaleria, ajustes: viewAjustes }[S.tab] || viewCenarios)();
}

// ---------- DADOS + POLLING ----------
async function refresh() {
  const st = await api('state');
  S.cenarios = st.cenarios || [];
  S.jobs = st.jobs || [];
  if (st.defaults) S.defaults = st.defaults;
  if (st.worker_token) S.workerToken = st.worker_token;
  render();
}

let pollT, lastSig = '';
function startPoll() {
  clearInterval(pollT);
  pollT = setInterval(async () => {
    try {
      const { jobs } = await api('jobs');
      const sig = jobs.map((j) => `${j.id}:${j.status}:${j.pct}`).join('|');
      if (sig !== lastSig) {
        lastSig = sig;
        // se um cenário acabou de ficar pronto, recarrega o state (traz thumbs)
        const st = await api('state');
        S.cenarios = st.cenarios || []; S.jobs = st.jobs || [];
        render();
      }
    } catch (e) { /* silencioso */ }
  }, 5000);
}

async function boot() {
  try {
    const me = await api('me');
    S.auth = !!me.auth;
    if (S.auth) { await refresh(); startPoll(); }
    else renderLogin();
  } catch (e) { renderLogin(); }
}

boot();
