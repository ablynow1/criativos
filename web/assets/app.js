/* ============================================================
   CRICRI · SPA vanilla — estúdio de criativos
   Tabs: Estúdio · Fila · Galeria · Biblioteca · Ajustes
   ============================================================ */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const S = {
  auth: false, config: null, criativos: [], jobs: [], presets: null,
  tab: 'estudio', editing: null, pollTimer: null, uploadBusy: false,
};

// ---------- API ----------
async function api(action, { body = null, form = null } = {}) {
  const opt = { method: body || form ? 'POST' : 'GET', headers: { 'X-Cricri': '1' } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  if (form) { opt.body = form; }
  const res = await fetch(`api.php?action=${encodeURIComponent(action)}`, opt);
  const data = await res.json().catch(() => ({ ok: false, error: 'resposta inválida do servidor' }));
  if (res.status === 401 && action !== 'login' && action !== 'me') { S.auth = false; renderLogin(); throw new Error('sessão expirou'); }
  if (!data.ok) throw new Error(data.error || 'erro');
  return data;
}

// ---------- toast ----------
let toastT = null;
function toast(msg, isErr = false) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle('err', isErr); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- drawer ----------
function drawer(html, onMount) {
  closeDrawer();
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'ov';
  const dr = document.createElement('div'); dr.className = 'drawer'; dr.id = 'dr';
  dr.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(ov, dr);
  requestAnimationFrame(() => { ov.classList.add('on'); dr.classList.add('on'); });
  ov.onclick = closeDrawer;
  if (onMount) onMount(dr);
}
function closeDrawer() {
  const ov = $('#ov'), dr = $('#dr');
  if (ov) { ov.classList.remove('on'); setTimeout(() => ov.remove(), 250); }
  if (dr) { dr.classList.remove('on'); setTimeout(() => dr.remove(), 300); }
}

// ---------- ícones ----------
const I = {
  studio: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="18" height="4" rx="1.5"/><rect x="3" y="16" width="12" height="4" rx="1.5"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="9" cy="8" r="1.6"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 21h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg>',
};

// ---------- helpers de domínio ----------
function wps() { return (S.config?.defaults?.wps) || 2.7; }
function durCena() { return (S.config?.defaults?.duracao_cena) || 8; }
function estimate(narracao) {
  const words = (narracao || '').trim().split(/\s+/).filter(Boolean).length;
  const sec = words / wps();
  return { words, sec, scenes: Math.max(1, Math.round(sec / durCena())) };
}

// Linter — implementa a régua de narração (anti-IA + verdade do produto)
function lintNarracao(text, nCenas) {
  const out = [];
  const t = (text || '').trim();
  if (!t) return out;
  if (/\b(feit[oa]s?\s+)?[àa]\s+m[ãa]o\b/i.test(t) || /pintad[oa]s?\s+[àa]\s+m[ãa]o/i.test(t))
    out.push({ level: 'bad', msg: '"à mão" é proibido — o produto é impressão fine art (risco legal). Troque por "arte" / "obra de arte".' });
  if (/gamechanger|game changer|divisor de águas/i.test(t))
    out.push({ level: 'warn', msg: 'Clichê de IA detectado ("gamechanger"/"divisor de águas") — corte.' });
  if (/a melhor parte\?/i.test(t))
    out.push({ level: 'warn', msg: '"A melhor parte?" (pergunta+resposta) soa IA — reescreva direto.' });
  if (/(^|[.!?]\s+)(simplesmente|apenas)\s/i.test(t))
    out.push({ level: 'warn', msg: 'Frase começando com "simplesmente/apenas" soa IA — corte o filler.' });
  const sentences = t.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  let shortRun = 0, staccato = false;
  for (const s of sentences) { const w = s.split(/\s+/).length; if (w <= 3) { shortRun++; if (shortRun >= 3) staccato = true; } else shortRun = 0; }
  if (staccato) out.push({ level: 'warn', msg: 'Staccato de IA: 3+ frases curtinhas em sequência. Varie o tamanho das frases.' });
  if ((t.match(/!/g) || []).length > 2)
    out.push({ level: 'warn', msg: 'Muitas exclamações — no máximo 1–2, senão vira grito de IA.' });
  const est = estimate(t);
  const videoSec = nCenas * durCena();
  if (nCenas > 0 && Math.abs(est.sec - videoSec) > 3)
    out.push({ level: 'warn', msg: `Narração ~${est.sec.toFixed(1)}s vs vídeo ${videoSec}s (${nCenas} cena${nCenas > 1 ? 's' : ''} × ${durCena()}s). Ajuste texto ou nº de cenas.` });
  if (!out.length) out.push({ level: 'good', msg: 'Passou na régua: sem termos proibidos, ritmo ok.' });
  return out;
}

function novoCriativo() {
  const d = S.config?.defaults || {};
  return {
    id: null, nome: '', modo: 'manual', lp_url: '',
    narracao: '', voz: d.voz || 'pt-BR-Neural2-B', estiloLegenda: d.estiloLegenda || 'contorno',
    cenas: [{ imagem: '', prompt: '', duracao: durCena() }], notas: '',
  };
}
function jobDoCriativo(id) {
  return S.jobs.find(j => j.criativo_id === id && ['queued', 'claimed', 'running'].includes(j.status));
}

// ---------- render raiz ----------
function renderLogin(msg = '') {
  stopPoll();
  $('#app').innerHTML = `
    <div class="login">
      <div class="mark">Cricri</div>
      <div class="tag">estúdio de criativos · LV Enterprise</div>
      <form id="loginF">
        <input class="in" type="password" id="pw" placeholder="senha" autocomplete="current-password" autofocus>
        <button class="btn primary block" type="submit">Entrar</button>
        <div class="err">${esc(msg)}</div>
      </form>
    </div>`;
  $('#loginF').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('login', { body: { password: $('#pw').value } });
      await boot();
    } catch (err) { renderLogin(err.message); }
  };
}

function shell(content) {
  const activeJobs = S.jobs.filter(j => ['queued', 'claimed', 'running'].includes(j.status)).length;
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand">Cricri <small>criativos</small></div>
      <div class="right"><span class="hint">${activeJobs ? activeJobs + ' na fila' : ''}</span></div>
    </header>
    <main id="main">${content}</main>
    <nav class="nav">
      ${[['estudio', 'Estúdio', I.studio], ['fila', 'Fila', I.queue], ['galeria', 'Galeria', I.gallery], ['biblioteca', 'Biblioteca', I.lib], ['ajustes', 'Ajustes', I.gear]]
        .map(([k, l, ic]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''} ${k === 'fila' && activeJobs ? 'badge' : ''}">${ic}<span class="dot"></span>${l}</button>`).join('')}
    </nav>`;
  $$('.nav button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.editing = null; render(); });
}

function render() {
  if (!S.auth) return renderLogin();
  if (S.editing) return renderEditor();
  const views = { estudio: vEstudio, fila: vFila, galeria: vGaleria, biblioteca: vBiblioteca, ajustes: vAjustes };
  shell(views[S.tab]());
  const binds = { estudio: bEstudio, fila: bFila, galeria: bGaleria, biblioteca: bBiblioteca, ajustes: bAjustes };
  binds[S.tab]();
  managePoll();
}

// ============ ESTÚDIO (lista) ============
function vEstudio() {
  const list = S.criativos.map(c => {
    const thumb = c.cenas?.[0]?.imagem;
    const job = jobDoCriativo(c.id);
    const done = S.jobs.find(j => j.criativo_id === c.id && j.status === 'done');
    const est = estimate(c.narracao);
    return `<div class="item" data-id="${c.id}">
      <div class="thumb ${thumb ? '' : 'ph'}" ${thumb ? `style="background-image:url('${esc(thumb)}')"` : ''}>${thumb ? '' : '🎬'}</div>
      <div class="grow">
        <div class="t">${esc(c.nome)}</div>
        <div class="s">${c.modo === 'lp' ? 'a partir de LP' : `${c.cenas?.length || 0} cena(s) · ~${est.sec.toFixed(0)}s`} · ${esc(c.voz || '')}</div>
      </div>
      ${job ? `<span class="pill ${job.status === 'running' ? 'r' : 'q'}">${job.status === 'running' ? 'rodando' : 'na fila'}</span>` : done ? '<span class="pill d">pronto</span>' : ''}
    </div>`;
  }).join('');
  return `
    <div class="h1">Estúdio</div>
    <div class="sub">Seus criativos — toque pra editar, ou crie um novo.</div>
    <button class="btn primary block" id="novo">${I.plus} Novo criativo</button>
    <div class="spacer"></div><div class="spacer"></div>
    ${list || '<div class="empty"><div class="big">🦗</div>Nenhum criativo ainda.<br>Crie o primeiro — leva 2 minutos.</div>'}`;
}
function bEstudio() {
  $('#novo').onclick = () => { S.editing = novoCriativo(); render(); };
  $$('.item').forEach(el => el.onclick = () => {
    const c = S.criativos.find(x => x.id === el.dataset.id);
    if (c) { S.editing = JSON.parse(JSON.stringify(c)); render(); }
  });
}

// ============ EDITOR ============
function renderEditor() {
  const c = S.editing;
  const vozes = S.presets?.vozes || [];
  const isLP = c.modo === 'lp';
  const est = estimate(c.narracao);
  shell(`
    <div class="row" style="margin:6px 0 12px">
      <button class="iconbtn" id="back">${I.back}</button>
      <div class="h1" style="margin:0">${c.id ? 'Editar' : 'Novo'} criativo</div>
    </div>

    <div class="card">
      <label class="f"><span class="lbl">Nome</span>
        <input class="in" id="f-nome" value="${esc(c.nome)}" placeholder="ex: pinturapai — POV filho v2"></label>
      <span class="lbl" style="display:block;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:600">Modo</span>
      <div class="chips">
        <button class="chip ${!isLP ? 'on' : ''}" data-modo="manual">Manual · imagem + roteiro</button>
        <button class="chip ${isLP ? 'on' : ''}" data-modo="lp">Automático · a partir de LP</button>
      </div>
    </div>

    ${isLP ? `
    <div class="card">
      <h3>Landing page</h3>
      <label class="f"><span class="lbl">URL da LP</span>
        <input class="in" id="f-lp" type="url" value="${esc(c.lp_url)}" placeholder="https://atelier.usemalta.com/pinturapai"></label>
      <div class="hint">O worker baixa a LP, o Gemini escreve o briefing + narração, gera a imagem e roda o pipeline inteiro sozinho.</div>
    </div>` : `
    <div class="card">
      <h3>Narração <span style="text-transform:none;letter-spacing:0">· passa pela régua de copy automaticamente</span></h3>
      <textarea class="in" id="f-narracao" rows="4" placeholder="Gancho nos 3 primeiros segundos…">${esc(c.narracao)}</textarea>
      <div class="meter">
        <span class="m"><b id="m-w">${est.words}</b> palavras</span>
        <span class="m">≈ <b id="m-s">${est.sec.toFixed(1)}</b>s falados</span>
        <span class="m">sugere <b id="m-c">${est.scenes}</b> cena(s)</span>
      </div>
      <div class="lint" id="lint"></div>
      <div class="spacer"></div>
      <div class="chips" id="ganchos">${(S.presets?.ganchos || []).slice(0, 6).map(g => `<button class="chip" data-g="${esc(g.id)}" title="${esc(g.texto)}">+ ${esc(g.nome)}</button>`).join('')}</div>
    </div>

    <div class="card">
      <h3>Cenas (${c.cenas.length})</h3>
      <div id="cenas">${c.cenas.map((cn, i) => sceneHTML(cn, i, c.cenas.length)).join('')}</div>
      <button class="btn block" id="addCena">${I.plus} Adicionar cena</button>
    </div>`}

    <div class="card">
      <h3>Voz & legenda</h3>
      <label class="f"><span class="lbl">Voz do narrador</span>
        <select class="in" id="f-voz">${vozes.map(v => `<option value="${esc(v.id)}" ${v.id === c.voz ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <span class="lbl" style="display:block;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:600">Estilo da legenda</span>
      <div class="chips">
        <button class="chip ${c.estiloLegenda === 'contorno' ? 'on' : ''}" data-leg="contorno">Contorno (Hormozi)</button>
        <button class="chip ${c.estiloLegenda === 'caixa' ? 'on' : ''}" data-leg="caixa">Caixa preta</button>
      </div>
    </div>

    <div class="card">
      <h3>Notas</h3>
      <textarea class="in" id="f-notas" rows="2" placeholder="anotações livres (ângulo, público, hipótese do teste…)">${esc(c.notas || '')}</textarea>
    </div>

    <div class="stack">
      <button class="btn primary block" id="salvarFila">${I.play} Salvar e mandar pra fila</button>
      <button class="btn block" id="salvar">Salvar rascunho</button>
      <div class="row">
        ${c.id ? `<button class="btn sm grow" id="duplicar">${I.dup} Duplicar</button>
        <button class="btn sm grow" id="exportar">${I.copy} Copiar projeto.json</button>
        <button class="btn sm danger" id="excluir">${I.trash}</button>` : ''}
      </div>
    </div>`);
  bEditor();
}

function sceneHTML(cn, i, total) {
  return `<div class="scene" data-i="${i}">
    <div class="head">
      <span class="num">${i + 1}</span>
      <div class="grow"></div>
      <button class="iconbtn mv-up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${I.up}</button>
      <button class="iconbtn mv-dn" ${i === total - 1 ? 'disabled style="opacity:.3"' : ''}>${I.dn}</button>
      <button class="iconbtn rm">${I.trash}</button>
    </div>
    <div class="row" style="align-items:flex-start">
      <div class="imgbox ${cn.imagem ? 'has' : ''}" style="${cn.imagem ? `background-image:url('${esc(cn.imagem)}')` : ''}">${cn.imagem ? '' : 'toque p/ enviar imagem 9:16'}</div>
      <div class="grow">
        <textarea class="in scene-prompt" rows="4" placeholder="Prompt de movimento pro Veo (inglês)…">${esc(cn.prompt)}</textarea>
        <div class="row" style="margin-top:8px">
          <select class="in scene-dur" style="max-width:110px;min-height:40px;padding:8px 30px 8px 12px">
            ${[4, 6, 8].map(d => `<option value="${d}" ${(cn.duracao || 8) == d ? 'selected' : ''}>${d}s</option>`).join('')}
          </select>
          <button class="btn sm grow scene-tpl">usar template…</button>
        </div>
      </div>
    </div>
  </div>`;
}

function bEditor() {
  const c = S.editing;
  $('#back').onclick = () => { S.editing = null; render(); };
  $('#f-nome').oninput = (e) => c.nome = e.target.value;
  $('#f-voz').onchange = (e) => c.voz = e.target.value;
  $('#f-notas').oninput = (e) => c.notas = e.target.value;
  $$('[data-modo]').forEach(b => b.onclick = () => { c.modo = b.dataset.modo; renderEditor(); });
  $$('[data-leg]').forEach(b => b.onclick = () => { c.estiloLegenda = b.dataset.leg; renderEditor(); });

  if (c.modo === 'lp') {
    $('#f-lp').oninput = (e) => c.lp_url = e.target.value;
  } else {
    const upd = () => {
      const est = estimate(c.narracao);
      $('#m-w').textContent = est.words;
      $('#m-s').textContent = est.sec.toFixed(1);
      $('#m-c').textContent = est.scenes;
      $('#lint').innerHTML = lintNarracao(c.narracao, c.cenas.length)
        .map(l => `<div class="li ${l.level}">${l.level === 'bad' ? '⛔' : l.level === 'warn' ? '⚠️' : '✅'} ${esc(l.msg)}</div>`).join('');
    };
    $('#f-narracao').oninput = (e) => { c.narracao = e.target.value; upd(); };
    upd();
    $$('#ganchos .chip').forEach(b => b.onclick = () => {
      const g = (S.presets?.ganchos || []).find(x => x.id === b.dataset.g);
      if (!g) return;
      c.narracao = (c.narracao ? c.narracao.trim() + ' ' : '') + g.texto;
      renderEditor();
    });

    $('#addCena').onclick = () => { c.cenas.push({ imagem: c.cenas.at(-1)?.imagem || '', prompt: '', duracao: durCena() }); renderEditor(); };
    $$('.scene').forEach(sc => {
      const i = +sc.dataset.i;
      $('.rm', sc).onclick = () => { if (c.cenas.length <= 1) return toast('precisa de ao menos 1 cena', true); c.cenas.splice(i, 1); renderEditor(); };
      $('.mv-up', sc).onclick = () => { if (i > 0) { [c.cenas[i - 1], c.cenas[i]] = [c.cenas[i], c.cenas[i - 1]]; renderEditor(); } };
      $('.mv-dn', sc).onclick = () => { if (i < c.cenas.length - 1) { [c.cenas[i + 1], c.cenas[i]] = [c.cenas[i], c.cenas[i + 1]]; renderEditor(); } };
      $('.scene-prompt', sc).oninput = (e) => c.cenas[i].prompt = e.target.value;
      $('.scene-dur', sc).onchange = (e) => c.cenas[i].duracao = +e.target.value;
      $('.imgbox', sc).onclick = () => pickImage(url => { c.cenas[i].imagem = url; renderEditor(); });
      $('.scene-tpl', sc).onclick = () => pickTemplate(t => { c.cenas[i].prompt = t; renderEditor(); });
    });
  }

  const save = async (queue) => {
    try {
      const r = await api('save_criativo', { body: { criativo: c } });
      const idx = S.criativos.findIndex(x => x.id === r.criativo.id);
      if (idx >= 0) S.criativos[idx] = r.criativo; else S.criativos.unshift(r.criativo);
      S.editing = null;
      if (queue) {
        const q = await api('queue_job', { body: { criativo_id: r.criativo.id } });
        S.jobs.unshift(q.job);
        S.tab = 'fila';
        toast('na fila! o worker do Mac vai renderizar 🎬');
      } else toast('salvo');
      render();
    } catch (e) { toast(e.message, true); }
  };
  $('#salvar').onclick = () => save(false);
  $('#salvarFila').onclick = () => save(true);
  if (c.id) {
    $('#duplicar').onclick = async () => {
      const dup = JSON.parse(JSON.stringify(c)); dup.id = null; dup.nome = c.nome + ' (cópia)';
      S.editing = dup; renderEditor(); toast('cópia criada — salve pra confirmar');
    };
    $('#exportar').onclick = () => {
      const projeto = { narracao: c.narracao, voz: c.voz, estiloLegenda: c.estiloLegenda,
        cenas: c.cenas.map(x => ({ imagem: x.imagem, prompt: x.prompt, duracaoSegundos: x.duracao || 8 })) };
      navigator.clipboard.writeText(JSON.stringify(projeto, null, 2));
      toast('projeto.json copiado');
    };
    $('#excluir').onclick = async () => {
      if (!confirm('Excluir este criativo?')) return;
      await api('delete_criativo', { body: { id: c.id } });
      S.criativos = S.criativos.filter(x => x.id !== c.id);
      S.editing = null; render(); toast('excluído');
    };
  }
}

function pickImage(cb) {
  if (S.uploadBusy) return;
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    S.uploadBusy = true; toast('enviando imagem…');
    try {
      const form = new FormData(); form.append('file', f);
      const r = await api('upload_image', { form });
      cb(r.url); toast('imagem ok');
    } catch (e) { toast(e.message, true); }
    S.uploadBusy = false;
  };
  inp.click();
}

function pickTemplate(cb) {
  const tps = S.presets?.templates || [];
  drawer(`<h2>Templates de prompt</h2>
    ${tps.map(t => `<div class="preset" data-id="${esc(t.id)}" style="cursor:pointer">
      <div class="t">${esc(t.nome)}</div><div class="x fade">${esc(t.texto)}</div></div>`).join('') || '<div class="empty">sem templates — adicione na Biblioteca</div>'}`,
    (dr) => $$('.preset', dr).forEach(p => p.onclick = () => {
      const t = tps.find(x => x.id === p.dataset.id);
      closeDrawer(); if (t) cb(t.texto);
    }));
}

// ============ FILA ============
function vFila() {
  const jobs = S.jobs;
  return `
    <div class="h1">Fila de render</div>
    <div class="sub">O worker no Mac puxa daqui, roda o pipeline (TTS → Veo → legenda) e sobe o vídeo pronto.</div>
    ${jobs.length ? jobs.map(j => {
      const pillClass = { queued: 'q', claimed: 'q', running: 'r', done: 'd', error: 'e' }[j.status] || 'n';
      const pillTxt = { queued: 'na fila', claimed: 'pego', running: 'rodando', done: 'pronto', error: 'erro' }[j.status] || j.status;
      return `<div class="job" data-id="${j.id}">
        <div class="head"><div class="t">${esc(j.nome)}</div><span class="pill ${pillClass}">${pillTxt}</span></div>
        ${['running', 'claimed'].includes(j.status) ? `<div class="bar"><i style="width:${j.pct || 2}%"></i></div>` : ''}
        <div class="stage">${esc(j.stage || '')}${j.error ? ' — ' + esc(j.error) : ''}</div>
        ${j.log?.length ? `<details><summary class="hint" style="cursor:pointer;margin-top:8px">log (${j.log.length})</summary><div class="log">${esc(j.log.join('\n'))}</div></details>` : ''}
        <div class="row" style="margin-top:10px">
          ${j.status === 'done' && j.video ? `<a class="btn sm primary grow" href="${esc(j.video)}" target="_blank">${I.play} Ver vídeo</a>` : ''}
          ${j.status === 'error' ? `<button class="btn sm grow act" data-op="retry">Tentar de novo</button>` : ''}
          ${['queued', 'claimed', 'running'].includes(j.status) ? `<button class="btn sm grow act" data-op="cancel">Cancelar</button>` : ''}
          <button class="btn sm danger act" data-op="delete">${I.trash}</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty"><div class="big">🛋️</div>Fila vazia.<br>Manda um criativo do Estúdio pra cá.</div>'}
    <div class="card tight"><div class="hint">💻 Worker parado? No Mac: <span class="copybox" style="display:block;margin-top:6px">cd ~/Desktop/CLAUDE/criativos && node tools/cricri-worker.mjs</span></div></div>`;
}
function bFila() {
  $$('.job .act').forEach(b => b.onclick = async () => {
    const id = b.closest('.job').dataset.id, op = b.dataset.op;
    if (op === 'delete' && !confirm('Excluir este job' + (S.jobs.find(j => j.id === id)?.video ? ' e o vídeo dele' : '') + '?')) return;
    try {
      await api('job_action', { body: { id, op } });
      const r = await api('jobs'); S.jobs = r.jobs; render();
    } catch (e) { toast(e.message, true); }
  });
}

// ============ GALERIA ============
function vGaleria() {
  const done = S.jobs.filter(j => j.status === 'done' && j.video);
  return `
    <div class="h1">Galeria</div>
    <div class="sub">Criativos prontos — 1080×1920, é baixar e subir no Ads Manager.</div>
    ${done.length ? `<div class="gal">${done.map(j => `
      <div class="gitem">
        <video src="${esc(j.video)}" controls preload="metadata" playsinline></video>
        <div class="meta">
          <div class="t">${esc(j.nome)}</div>
          <div class="s">${new Date(j.updated_at).toLocaleDateString('pt-BR')}</div>
          <a class="btn sm block" href="${esc(j.video)}" download>${I.down} Baixar</a>
        </div>
      </div>`).join('')}</div>` :
    '<div class="empty"><div class="big">🎞️</div>Nada renderizado ainda.</div>'}`;
}
function bGaleria() {}

// ============ BIBLIOTECA ============
function vBiblioteca() {
  const p = S.presets || {};
  const secs = [
    ['estilos', 'Estilos de arte ({STYLE})', 'Fragmentos que entram no template mestre do retrato.'],
    ['templates', 'Templates de prompt', 'Prompts prontos — retrato mestre e cenas do Veo.'],
    ['ganchos', 'Ganchos de copy', 'Aberturas testadas pra colar na narração.'],
    ['vozes', 'Vozes TTS', 'Neural2/Wavenet pt-BR (Chirp3-HD não sincroniza legenda).'],
  ];
  return `
    <div class="h1">Biblioteca</div>
    <div class="sub">Tudo modular — edite, adicione e reuse em qualquer criativo.</div>
    ${secs.map(([k, title, hint]) => `
    <div class="acc" data-k="${k}">
      <button class="h">${title}<span class="cnt">${(p[k] || []).length} itens ›</span></button>
      <div class="body">
        <div class="hint" style="margin-bottom:10px">${hint}</div>
        ${(p[k] || []).map((it, i) => `
          <div class="preset" data-i="${i}">
            <div class="t">${esc(it.nome || it.label || it.id)}</div>
            ${it.texto ? `<div class="x ${it.texto.length > 220 ? 'fade' : ''}">${esc(it.texto)}</div>` : `<div class="x">${esc(it.id)}</div>`}
            <div class="row" style="margin-top:9px">
              <button class="btn sm grow p-copy">${I.copy} Copiar</button>
              <button class="btn sm grow p-edit">Editar</button>
              <button class="btn sm danger p-del">${I.trash}</button>
            </div>
          </div>`).join('')}
        <button class="btn block p-add">${I.plus} Adicionar</button>
      </div>
    </div>`).join('')}`;
}
function bBiblioteca() {
  $$('.acc').forEach(acc => {
    const k = acc.dataset.k;
    $('.h', acc).onclick = () => acc.classList.toggle('open');
    $$('.preset', acc).forEach(pr => {
      const i = +pr.dataset.i;
      const item = S.presets[k][i];
      $('.p-copy', pr).onclick = () => { navigator.clipboard.writeText(item.texto || item.id); toast('copiado'); };
      $('.p-del', pr).onclick = async () => {
        if (!confirm('Excluir "' + (item.nome || item.label || item.id) + '"?')) return;
        S.presets[k].splice(i, 1);
        await api('save_presets', { body: { tipo: k, items: S.presets[k] } });
        render(); toast('excluído');
      };
      $('.p-edit', pr).onclick = () => editPreset(k, i);
    });
    $('.p-add', acc).onclick = () => editPreset(k, -1);
  });
}
function editPreset(tipo, idx) {
  const isVoz = tipo === 'vozes';
  const item = idx >= 0 ? S.presets[tipo][idx] : (isVoz ? { id: '', label: '', genero: 'M' } : { id: '', nome: '', texto: '' });
  drawer(`<h2>${idx >= 0 ? 'Editar' : 'Novo'} — ${tipo}</h2>
    ${isVoz ? `
      <label class="f"><span class="lbl">ID da voz (Google)</span><input class="in" id="p-a" value="${esc(item.id)}" placeholder="pt-BR-Neural2-B"></label>
      <label class="f"><span class="lbl">Label</span><input class="in" id="p-b" value="${esc(item.label)}" placeholder="Masculina · quente"></label>` : `
      <label class="f"><span class="lbl">Nome</span><input class="in" id="p-a" value="${esc(item.nome)}"></label>
      <label class="f"><span class="lbl">Texto</span><textarea class="in" id="p-b" rows="8">${esc(item.texto)}</textarea></label>`}
    <button class="btn primary block" id="p-save">Salvar</button>`,
    (dr) => {
      $('#p-save', dr).onclick = async () => {
        const a = $('#p-a', dr).value.trim(), b = $('#p-b', dr).value.trim();
        if (!a || !b) return toast('preencha os dois campos', true);
        const novo = isVoz ? { id: a, label: b, genero: item.genero || 'M' } : { id: item.id || ('p_' + Date.now().toString(36)), nome: a, texto: b };
        if (idx >= 0) S.presets[tipo][idx] = novo; else S.presets[tipo].push(novo);
        try {
          await api('save_presets', { body: { tipo, items: S.presets[tipo] } });
          closeDrawer(); render(); toast('salvo');
        } catch (e) { toast(e.message, true); }
      };
    });
}

// ============ AJUSTES ============
function vAjustes() {
  const d = S.config?.defaults || {};
  const vozes = S.presets?.vozes || [];
  return `
    <div class="h1">Ajustes</div>
    <div class="sub">Defaults do estúdio, senha e worker — tudo parametrizável.</div>

    <div class="card">
      <h3>Padrões de novo criativo</h3>
      <label class="f"><span class="lbl">Voz padrão</span>
        <select class="in" id="s-voz">${vozes.map(v => `<option value="${esc(v.id)}" ${v.id === d.voz ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="f"><span class="lbl">Estilo de legenda padrão</span>
        <select class="in" id="s-leg"><option value="contorno" ${d.estiloLegenda === 'contorno' ? 'selected' : ''}>Contorno</option><option value="caixa" ${d.estiloLegenda === 'caixa' ? 'selected' : ''}>Caixa</option></select></label>
      <div class="row">
        <label class="f grow"><span class="lbl">Duração da cena (s)</span>
          <select class="in" id="s-dur">${[4, 6, 8].map(x => `<option ${d.duracao_cena == x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f grow"><span class="lbl">Palavras/segundo</span>
          <input class="in" id="s-wps" type="number" step="0.1" min="1" max="5" value="${d.wps || 2.7}"></label>
      </div>
      <div class="hint">Palavras/segundo calibra o estimador da narração (medido: ~2,7 no pt-BR Neural2).</div>
      <div class="spacer"></div>
      <button class="btn primary block" id="s-save">Salvar padrões</button>
    </div>

    <div class="card">
      <h3>Segurança</h3>
      <label class="f"><span class="lbl">Nova senha do painel</span>
        <input class="in" id="s-pass" type="password" placeholder="mín. 6 caracteres" autocomplete="new-password"></label>
      <button class="btn block" id="s-passbtn">Trocar senha</button>
    </div>

    <div class="card">
      <h3>Worker (Mac)</h3>
      <div class="hint" style="margin-bottom:10px">O render roda no seu Mac (Veo/TTS/ffmpeg são locais). Deixa este comando rodando num Terminal:</div>
      <div class="copybox">cd ~/Desktop/CLAUDE/criativos && node tools/cricri-worker.mjs</div>
      <div class="spacer"></div>
      <label class="f"><span class="lbl">Token do worker</span>
        <input class="in" id="s-token" value="${esc(S.config?.worker_token || '')}"></label>
      <div class="hint">Se trocar aqui, atualize o CRICRI_TOKEN no .env do repo criativos.</div>
      <div class="spacer"></div>
      <button class="btn block" id="s-tokenbtn">Salvar token</button>
    </div>

    <button class="btn danger block" id="s-logout">Sair</button>`;
}
function bAjustes() {
  $('#s-save').onclick = async () => {
    try {
      const r = await api('save_config', { body: { defaults: {
        voz: $('#s-voz').value, estiloLegenda: $('#s-leg').value,
        duracao_cena: +$('#s-dur').value, wps: +$('#s-wps').value,
      } } });
      S.config = r.config; toast('padrões salvos');
    } catch (e) { toast(e.message, true); }
  };
  $('#s-passbtn').onclick = async () => {
    const p = $('#s-pass').value;
    if (p.length < 6) return toast('senha muito curta', true);
    try { await api('save_config', { body: { new_password: p } }); $('#s-pass').value = ''; toast('senha trocada'); }
    catch (e) { toast(e.message, true); }
  };
  $('#s-tokenbtn').onclick = async () => {
    try {
      const r = await api('save_config', { body: { worker_token: $('#s-token').value.trim() } });
      S.config = r.config; toast('token salvo — atualize o .env do Mac');
    } catch (e) { toast(e.message, true); }
  };
  $('#s-logout').onclick = async () => { await api('logout', { body: {} }); S.auth = false; renderLogin(); };
}

// ---------- polling da fila ----------
function managePoll() {
  const active = S.jobs.some(j => ['queued', 'claimed', 'running'].includes(j.status));
  if ((S.tab === 'fila' || active) && !S.pollTimer) {
    S.pollTimer = setInterval(async () => {
      try {
        const r = await api('jobs');
        const changed = JSON.stringify(r.jobs) !== JSON.stringify(S.jobs);
        S.jobs = r.jobs;
        const stillActive = S.jobs.some(j => ['queued', 'claimed', 'running'].includes(j.status));
        if (!stillActive && S.tab !== 'fila') stopPoll();
        if (changed && !S.editing && !$('#dr')) render();
      } catch (e) { /* silencioso */ }
    }, 5000);
  } else if (!(S.tab === 'fila' || active) && S.pollTimer) stopPoll();
}
function stopPoll() { if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }

// ---------- boot ----------
async function boot() {
  try {
    const me = await api('me');
    if (!me.auth) return renderLogin();
    const st = await api('state');
    S.auth = true; S.config = st.config; S.criativos = st.criativos; S.jobs = st.jobs; S.presets = st.presets;
    render();
  } catch (e) { renderLogin(); }
}
boot();
