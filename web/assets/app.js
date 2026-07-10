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

// ---------- ícones (stroke 1.6, terminações redondas — linguagem única) ----------
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const I = {
  studio: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  queue: svg('<path d="m12 2 9 4.9-9 4.9-9-4.9L12 2Z"/><path d="m3 11.9 9 4.9 9-4.9"/><path d="m3 16.9 9 4.9 9-4.9"/>'),
  gallery: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m3 15.5 4.5-4.5 3.5 3.5 4-4L21 16.5"/><circle cx="9" cy="8.5" r="1.4"/>'),
  lib: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 7h6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01c.26.62.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.4a1 1 0 0 1 1.52-.86l10.2 6.17a1 1 0 0 1 0 1.72L9.52 18.6A1 1 0 0 1 8 17.74V5.4Z"/></svg>',
  trash: svg('<path d="M3.5 6.5h17"/><path d="M8.5 6.5v-2a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2"/><path d="M18.5 6.5 18 19a2 2 0 0 1-2 1.9H8A2 2 0 0 1 6 19l-.5-12.5"/><path d="M10 10.8v5.4M14 10.8v5.4"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="3"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  down: svg('<path d="M12 3.5v11.5m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4.5 20.5h15"/>'),
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  dn: svg('<path d="m6 9 6 6 6-6"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  dup: svg('<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/>'),
  spark: svg('<path d="M12 2.5 13.8 8l5.7.2-4.5 3.6 1.6 5.7L12 14.2l-4.6 3.3 1.6-5.7L4.5 8.2 10.2 8 12 2.5Z"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};

// ---------- reveal on scroll ----------
let revealIO = null;
function initReveal() {
  if (!('IntersectionObserver' in window)) return;
  if (revealIO) revealIO.disconnect();
  revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('#main .card, #main .item, #main .gitem, #main .job, #main .acc').forEach((el, i) => {
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // já visível: não esconde
    el.classList.add('reveal');
    revealIO.observe(el);
  });
}

// ---------- lightbox de vídeo ----------
function lightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<button class="lbx" aria-label="fechar">${I.x}</button><video src="${esc(src)}" controls autoplay playsinline></video>`;
  document.body.appendChild(lb);
  requestAnimationFrame(() => lb.classList.add('on'));
  const close = () => { lb.classList.remove('on'); setTimeout(() => lb.remove(), 300); };
  lb.onclick = (e) => { if (e.target === lb) close(); };
  $('.lbx', lb).onclick = close;
}

// ---------- helpers de domínio ----------
function wps() { return (S.config?.defaults?.wps) || 2.7; }
function durCena() { return (S.config?.defaults?.duracao_cena) || 8; }
function estimate(narracao) {
  const words = (narracao || '').trim().split(/\s+/).filter(Boolean).length;
  const sec = words / wps();
  return { words, sec, scenes: Math.max(1, Math.round(sec / durCena())) };
}

// Score DR (0-100) — heurísticas de direct response pra Meta Ads
function scoreDR(text, nCenas) {
  const t = (text || '').trim();
  if (!t) return { score: 0, tips: [] };
  const tips = [];
  let s = 0;
  const first = (t.split(/[.!?…]+/)[0] || '').trim();
  const fw = first.split(/\s+/).filter(Boolean).length;
  if (fw > 0 && fw <= 9) s += 15; else tips.push('gancho: 1ª frase com até 9 palavras');
  if (/\?|\d/.test(first) || /\b(voc[eê]|teu|tua|seu|sua)\b/i.test(first)) s += 15;
  else tips.push('gancho: pergunta, número ou "você/seu" na 1ª frase');
  if (/\b(pe[cç]a|fa[cç]a|garanta|veja|clique|toque|aproveite|manda|mande|crie|monte|transforme|comece|teste|baixe|acesse)\b/i.test(t.slice(-90))) s += 20;
  else tips.push('CTA imperativo no final');
  if (/\b(hoje|agora|antes d[eo]|últim|dia d[oa]s?\s|amanh[ãa]|s[óo]\s+at[ée])\b/i.test(t)) s += 10;
  else tips.push('urgência/deadline real');
  if (/\d/.test(t)) s += 10; else tips.push('um número concreto dá credibilidade');
  const lint = lintNarracao(t, nCenas);
  if (!lint.some(l => l.level === 'bad')) s += 20; else tips.push('resolver o bloqueio ⛔');
  const est = estimate(t);
  if (nCenas > 0 && Math.abs(est.sec - nCenas * durCena()) <= 2.5) s += 10;
  else tips.push('casar duração da fala com o vídeo');
  return { score: Math.min(100, s), tips: tips.slice(0, 3) };
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
    ref_foto: '', quadro_prompt_id: '', quadro_prompt: '', quadro_grupo: '', quadro_nome: '', moldura: 'ornate-gold', cenario: '',
    narracao: '', voz: d.voz || 'gemini-tts:Charon', estiloLegenda: d.estiloLegenda || 'contorno',
    direcao_voz: '',
    audio: { ambiente: true, musica: 'emocional' },
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
  const running = S.jobs.filter(j => j.status === 'running').length;
  const queued = S.jobs.filter(j => ['queued', 'claimed'].includes(j.status)).length;
  const activeJobs = running + queued;
  const statusPill = running
    ? `<span class="status-pill"><span class="dot"></span>renderizando</span>`
    : queued ? `<span class="status-pill" style="color:var(--gold2);background:rgba(201,162,92,.1);border-color:rgba(201,162,92,.25)"><span class="dot"></span>${queued} na fila</span>` : '';
  const animate = S._lastView !== (S.editing ? 'editor' : S.tab);
  S._lastView = S.editing ? 'editor' : S.tab;
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand">Cricri <small>criativos</small></div>
      <div class="right">${statusPill}</div>
    </header>
    <main id="main"><div class="view${animate ? ' anim' : ''}">${content}</div></main>
    <nav class="nav">
      ${[['estudio', 'Estúdio', I.studio], ['fila', 'Fila', I.queue], ['galeria', 'Galeria', I.gallery], ['biblioteca', 'Biblioteca', I.lib], ['ajustes', 'Ajustes', I.gear]]
        .map(([k, l, ic]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''} ${k === 'fila' && activeJobs ? 'badge' : ''}" aria-label="${l}">${ic}<span class="dot"></span>${l}</button>`).join('')}
    </nav>`;
  $$('.nav button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.editing = null; render(); });
}

function render() {
  if (!S.auth) return renderLogin();
  if (S.editing) { renderEditor(); initReveal(); return; }
  const views = { estudio: vEstudio, fila: vFila, galeria: vGaleria, biblioteca: vBiblioteca, ajustes: vAjustes };
  shell(views[S.tab]());
  const binds = { estudio: bEstudio, fila: bFila, galeria: bGaleria, biblioteca: bBiblioteca, ajustes: bAjustes };
  binds[S.tab]();
  managePoll();
  initReveal();
}

// ============ ESTÚDIO (lista) ============
function vEstudio() {
  const list = S.criativos.map(c => {
    const thumb = (c.modo === 'quadro' || c.modo === 'lp') ? (c.ref_foto || c.cenas?.[0]?.imagem) : c.cenas?.[0]?.imagem;
    const job = jobDoCriativo(c.id);
    const done = S.jobs.find(j => j.criativo_id === c.id && j.status === 'done');
    const est = estimate(c.narracao);
    const modoTag = c.modo === 'lp' ? 'a partir de LP' : c.modo === 'quadro' ? '🖼️ quadro · ' + `${c.cenas?.length || 0} cena(s)` : `${c.cenas?.length || 0} cena(s) · ~${est.sec.toFixed(0)}s`;
    return `<div class="item" data-id="${c.id}">
      <div class="thumb ${thumb ? '' : 'ph'}" ${thumb ? `style="background-image:url('${esc(thumb)}')"` : ''}>${thumb ? '' : '🎬'}</div>
      <div class="grow">
        <div class="t">${esc(c.nome)}</div>
        <div class="s">${modoTag} · ${esc(c.voz || '')}</div>
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
  const modo = c.modo || 'manual';
  const est = estimate(c.narracao);
  const modoHint = {
    manual: 'Você envia a imagem de cada cena + o roteiro. Controle total.',
    quadro: 'Escolhe o estilo do quadro — a IA pinta a arte e gera o avatar segurando o quadro emoldurado. Foto é opcional: sem ela, a IA inventa um personagem pelo contexto (estilo + cenário).',
    lp: 'Só a URL da landing page — o Gemini escreve o briefing, a narração e gera a imagem sozinho. Foto de referência é opcional, pra usar um rosto real na cena.',
  }[modo];

  const quadroGroups = {};
  (S.presets?.quadros || []).forEach(q => { (quadroGroups[q.grupo] ||= []).push(q); });
  const molduras = S.presets?.molduras || [];
  const estiloNome = (S.presets?.quadros || []).find(q => q.id === c.quadro_prompt_id)?.nome;

  const lpCard = `
    <div class="card">
      <h3>Landing page</h3>
      <label class="f"><span class="lbl">URL da LP</span>
        <input class="in" id="f-lp" type="url" value="${esc(c.lp_url)}" placeholder="https://atelier.usemalta.com/pinturapai"></label>
      <div class="hint">O worker baixa a LP, o Gemini escreve o briefing + narração, gera a imagem e roda o pipeline inteiro sozinho.</div>
      <div class="hr"></div>
      <div class="row" style="align-items:flex-start">
        <div class="imgbox ${c.ref_foto ? 'has' : ''}" id="ref-box" style="width:76px;height:114px;${c.ref_foto ? `background-image:url('${esc(c.ref_foto)}')` : ''}">${c.ref_foto ? '' : 'sem foto — opcional'}</div>
        <div class="grow">
          <div class="hint" style="margin-bottom:8px">${c.ref_foto ? 'Foto de referência — o rosto real dela entra na imagem que o Gemini gera.' : 'Opcional. Sem foto, a imagem sai 100% automática (como sempre). Com foto, o rosto real dela é usado na cena gerada pelo briefing.'}</div>
          <div class="row">
            <button class="btn sm grow" id="ref-btn">${I.up} ${c.ref_foto ? 'Trocar foto' : 'Enviar foto'}</button>
            ${c.ref_foto ? `<button class="iconbtn" id="ref-clear" aria-label="remover foto">${I.x}</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  const quadroCard = `
    <div class="card">
      <h3>O quadro</h3>
      <div class="row" style="align-items:flex-start;margin-bottom:14px">
        <div class="imgbox ${c.ref_foto ? 'has' : ''}" id="ref-box" style="width:88px;height:132px;${c.ref_foto ? `background-image:url('${esc(c.ref_foto)}')` : ''}">${c.ref_foto ? '' : 'sem foto — opcional'}</div>
        <div class="grow">
          <div class="hint" style="margin-bottom:8px">${c.ref_foto ? 'Foto de referência do rosto — é a partir dela que a arte é pintada.' : 'Opcional. Sem foto, a IA inventa um personagem fictício com base no estilo escolhido e no cenário abaixo (descreva o cenário pra guiar a criação).'}</div>
          <div class="row">
            <button class="btn sm grow" id="ref-btn">${I.up} ${c.ref_foto ? 'Trocar foto' : 'Enviar foto'}</button>
            ${c.ref_foto ? `<button class="iconbtn" id="ref-clear" aria-label="remover foto">${I.x}</button>` : ''}
          </div>
        </div>
      </div>
      <label class="f"><span class="lbl">Estilo do quadro</span>
        <button class="btn block" id="pick-quadro" style="justify-content:space-between">
          <span>${estiloNome ? esc(estiloNome) : 'Escolher estilo…'}</span><span style="color:var(--dim)">▾</span>
        </button></label>
      ${c.quadro_tipo === 'boneco' ? '' : `<label class="f"><span class="lbl">Moldura</span>
        <select class="in" id="f-moldura">${molduras.map(m => `<option value="${esc(m.id)}" ${m.id === (c.moldura || 'ornate-gold') ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>`}
      <label class="f"><span class="lbl">Cenário ${c.ref_foto ? '(opcional)' : '— vira contexto pro personagem fictício'}</span>
        <input class="in" id="f-cenario" value="${esc(c.cenario || '')}" placeholder="${c.ref_foto ? 'ex: a warm cozy living room (deixe vazio pro padrão)' : 'ex: quarto do corinthians, sala de casa simples…'}"></label>
    </div>`;

  const narracaoCard = `
    <div class="card">
      <h3>Narração <span style="text-transform:none;letter-spacing:0">· passa pela régua de copy automaticamente</span></h3>
      <textarea class="in" id="f-narracao" rows="4" placeholder="Gancho nos 3 primeiros segundos…">${esc(c.narracao)}</textarea>
      <div class="meter">
        <span class="m"><b id="m-w">${est.words}</b> palavras</span>
        <span class="m">≈ <b id="m-s">${est.sec.toFixed(1)}</b>s falados</span>
        <span class="m">sugere <b id="m-c">${est.scenes}</b> cena(s)</span>
        <span class="m">nota DR <b id="m-dr">–</b></span>
      </div>
      <div class="lint" id="lint"></div>
      <div class="spacer"></div>
      <div class="chips" id="ganchos">${(S.presets?.ganchos || []).slice(0, 6).map(g => `<button class="chip" data-g="${esc(g.id)}" title="${esc(g.texto)}">+ ${esc(g.nome)}</button>`).join('')}</div>
    </div>`;

  const cenasCard = `
    <div class="card">
      <h3>Cenas — movimento do vídeo (${c.cenas.length})</h3>
      ${modo === 'quadro' ? '<div class="hint" style="margin-bottom:10px">No modo quadro, todas as cenas animam a MESMA imagem gerada (o avatar segurando o quadro). Aqui você só descreve o movimento de câmera de cada trecho.</div>' : ''}
      <button class="btn block" id="arquetipo" style="margin-bottom:12px">${I.spark} Aplicar arquétipo de criativo…</button>
      <div id="cenas">${c.cenas.map((cn, i) => sceneHTML(cn, i, c.cenas.length, modo !== 'quadro')).join('')}</div>
      <button class="btn block" id="addCena">${I.plus} Adicionar cena</button>
    </div>`;

  const au = c.audio || {};
  const audioCard = `
    <div class="card">
      <h3>Áudio · trilha + som ambiente</h3>
      <label class="f"><span class="lbl">Trilha musical (gerada por IA)</span>
        <select class="in" id="f-musica">
          ${[['nenhuma', 'Sem música'], ['emocional', 'Emocional · piano e cordas'], ['energetica', 'Energética · pop moderno'], ['epica', 'Épica · orquestral'], ['suave', 'Suave · violão e pads'], ['misteriosa', 'Misteriosa · atmosférica']]
            .map(([v, l]) => `<option value="${v}" ${(au.musica || 'nenhuma') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <div class="chips">
        <button class="chip ${au.ambiente !== false ? 'on' : ''}" id="f-ambiente">${au.ambiente !== false ? '🔊' : '🔇'} Som ambiente da cena (Veo)</button>
      </div>
      <div class="hint" style="margin-top:8px">A narração fica sempre na frente: música e ambiente abaixam sozinhos quando a voz fala (ducking). Master em -14 LUFS, padrão do Meta.</div>
    </div>`;

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
        <button class="chip ${modo === 'manual' ? 'on' : ''}" data-modo="manual">Manual</button>
        <button class="chip ${modo === 'quadro' ? 'on' : ''}" data-modo="quadro">🖼️ Quadro</button>
        <button class="chip ${modo === 'lp' ? 'on' : ''}" data-modo="lp">LP automático</button>
      </div>
      <div class="hint" style="margin-top:8px">${modoHint}</div>
    </div>

    ${modo === 'lp' ? lpCard : ''}
    ${modo === 'quadro' ? quadroCard : ''}
    ${modo !== 'lp' ? narracaoCard + cenasCard : ''}
    ${audioCard}

    <div class="card">
      <h3>Voz & legenda</h3>
      <label class="f"><span class="lbl">Voz do narrador</span>
        <select class="in" id="f-voz">${vozes.map(v => `<option value="${esc(v.id)}" ${v.id === c.voz ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      ${(c.voz || '').startsWith('gemini-tts:') ? `
      <label class="f"><span class="lbl">Direção da voz (atuação)</span>
        <textarea class="in" id="f-direcao" rows="2" placeholder="ex: fale como um filho emocionado contando pro amigo, ritmo natural, quase se emocionando no final">${esc(c.direcao_voz || '')}</textarea></label>
      <div class="hint" style="margin-top:-6px;margin-bottom:10px">Vozes ★ Gemini aceitam direção de cena — descreva COMO falar (emoção, ritmo, personagem). É o que mata o tom robótico.</div>` : ''}
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

function sceneHTML(cn, i, total, withImage = true) {
  return `<div class="scene" data-i="${i}">
    <div class="head">
      <span class="num">${i + 1}</span>
      <div class="grow"></div>
      <button class="iconbtn mv-up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${I.up}</button>
      <button class="iconbtn mv-dn" ${i === total - 1 ? 'disabled style="opacity:.3"' : ''}>${I.dn}</button>
      <button class="iconbtn rm">${I.trash}</button>
    </div>
    <div class="row" style="align-items:flex-start">
      ${withImage ? `<div class="imgbox ${cn.imagem ? 'has' : ''}" style="${cn.imagem ? `background-image:url('${esc(cn.imagem)}')` : ''}">${cn.imagem ? '' : 'toque p/ enviar imagem 9:16'}</div>` : ''}
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
  $('#f-voz').onchange = (e) => { c.voz = e.target.value; renderEditor(); };
  const dirEl = $('#f-direcao');
  if (dirEl) dirEl.oninput = (e) => c.direcao_voz = e.target.value;
  $('#f-notas').oninput = (e) => c.notas = e.target.value;
  $$('[data-modo]').forEach(b => b.onclick = () => { c.modo = b.dataset.modo; renderEditor(); });
  $$('[data-leg]').forEach(b => b.onclick = () => { c.estiloLegenda = b.dataset.leg; renderEditor(); });

  // áudio (todos os modos)
  c.audio = c.audio || { ambiente: true, musica: 'nenhuma' };
  $('#f-musica').onchange = (e) => c.audio.musica = e.target.value;
  $('#f-ambiente').onclick = () => { c.audio.ambiente = c.audio.ambiente === false; renderEditor(); };

  // upload de foto de referência (opcional) — compartilhado entre modo LP e Quadro
  if (c.modo === 'lp' || c.modo === 'quadro') {
    $('#ref-btn').onclick = () => pickImage(url => { c.ref_foto = url; renderEditor(); });
    $('#ref-box').onclick = () => pickImage(url => { c.ref_foto = url; renderEditor(); });
    const refClear = $('#ref-clear');
    if (refClear) refClear.onclick = (e) => { e.stopPropagation(); c.ref_foto = ''; renderEditor(); };
  }

  if (c.modo === 'quadro') {
    const mold = $('#f-moldura');
    if (mold) mold.onchange = (e) => c.moldura = e.target.value;
    $('#f-cenario').oninput = (e) => c.cenario = e.target.value;
    $('#pick-quadro').onclick = () => pickQuadro((q) => {
      c.quadro_prompt_id = q.id; c.quadro_prompt = q.texto; c.quadro_tipo = q.tipo || 'quadro';
      c.quadro_grupo = q.grupo || ''; c.quadro_nome = q.nome || '';
      renderEditor();
    });
  }

  if (c.modo === 'lp') {
    $('#f-lp').oninput = (e) => c.lp_url = e.target.value;
  } else {
    const upd = () => {
      const est = estimate(c.narracao);
      $('#m-w').textContent = est.words;
      $('#m-s').textContent = est.sec.toFixed(1);
      $('#m-c').textContent = est.scenes;
      const dr = scoreDR(c.narracao, c.cenas.length);
      const drEl = $('#m-dr');
      drEl.textContent = dr.score + '/100';
      drEl.style.color = dr.score >= 80 ? 'var(--ok)' : dr.score >= 55 ? 'var(--gold2)' : 'var(--err)';
      const lints = lintNarracao(c.narracao, c.cenas.length)
        .map(l => `<div class="li ${l.level}">${l.level === 'bad' ? '⛔' : l.level === 'warn' ? '⚠️' : '✅'} ${esc(l.msg)}</div>`);
      if (dr.tips.length && (c.narracao || '').trim()) {
        lints.push(`<div class="li warn">📈 Pra subir a nota: ${esc(dr.tips.join(' · '))}</div>`);
      }
      $('#lint').innerHTML = lints.join('');
    };
    $('#f-narracao').oninput = (e) => { c.narracao = e.target.value; upd(); };
    upd();
    $$('#ganchos .chip').forEach(b => b.onclick = () => {
      const g = (S.presets?.ganchos || []).find(x => x.id === b.dataset.g);
      if (!g) return;
      c.narracao = (c.narracao ? c.narracao.trim() + ' ' : '') + g.texto;
      renderEditor();
    });

    $('#arquetipo').onclick = () => pickArquetipo((a) => {
      const keepImg = c.cenas[0]?.imagem || '';
      c.cenas = a.cenas.map(cn => ({ imagem: keepImg, prompt: cn.prompt, duracao: cn.duracao || durCena() }));
      renderEditor();
      toast('arquétipo aplicado — ' + a.nome);
    });
    $('#addCena').onclick = () => { c.cenas.push({ imagem: c.cenas.at(-1)?.imagem || '', prompt: '', duracao: durCena() }); renderEditor(); };
    $$('.scene').forEach(sc => {
      const i = +sc.dataset.i;
      $('.rm', sc).onclick = () => { if (c.cenas.length <= 1) return toast('precisa de ao menos 1 cena', true); c.cenas.splice(i, 1); renderEditor(); };
      $('.mv-up', sc).onclick = () => { if (i > 0) { [c.cenas[i - 1], c.cenas[i]] = [c.cenas[i], c.cenas[i - 1]]; renderEditor(); } };
      $('.mv-dn', sc).onclick = () => { if (i < c.cenas.length - 1) { [c.cenas[i + 1], c.cenas[i]] = [c.cenas[i], c.cenas[i + 1]]; renderEditor(); } };
      $('.scene-prompt', sc).oninput = (e) => c.cenas[i].prompt = e.target.value;
      $('.scene-dur', sc).onchange = (e) => c.cenas[i].duracao = +e.target.value;
      const ib = $('.imgbox', sc);
      if (ib) ib.onclick = () => pickImage(url => { c.cenas[i].imagem = url; renderEditor(); });
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

function pickArquetipo(cb) {
  const arqs = S.presets?.arquetipos || [];
  drawer(`<h2>Arquétipos de criativo</h2>
    <div class="hint" style="margin-bottom:12px">Estruturas de anúncio comprovadas em DR — substituem suas cenas por um roteiro visual pronto (a dica de gancho vem junto).</div>
    ${arqs.map(a => `<div class="preset" data-id="${esc(a.id)}" style="cursor:pointer">
      <div class="t">${esc(a.nome)} <span class="hint">· ${(a.cenas || []).length} cena(s)</span></div>
      <div class="x">${esc(a.dica || '')}</div></div>`).join('') || '<div class="empty">sem arquétipos — adicione na Biblioteca</div>'}`,
    (dr) => $$('.preset', dr).forEach(p => p.onclick = () => {
      const a = arqs.find(x => x.id === p.dataset.id);
      closeDrawer(); if (a) cb(a);
    }));
}

function pickQuadro(cb) {
  const quadros = S.presets?.quadros || [];
  const groups = {};
  quadros.forEach(q => { (groups[q.grupo] ||= []).push(q); });
  const html = `<h2>Estilo do quadro</h2>
    <div class="hint" style="margin-bottom:12px">${quadros.length} prompts dos projetos Malta. A arte é pintada a partir da foto de referência.</div>
    ${Object.entries(groups).map(([g, items]) => `
      <div class="preset" style="background:transparent;border:0;padding:0;margin-bottom:6px"><div class="t" style="color:var(--gold2)">${esc(g)}</div></div>
      <div class="chips" style="margin-bottom:14px">
        ${items.map(q => `<button class="chip q-pick" data-id="${esc(q.id)}" title="${esc(q.texto.slice(0, 160))}…">${esc(q.nome)}</button>`).join('')}
      </div>`).join('')}`;
  drawer(html, (dr) => $$('.q-pick', dr).forEach(b => b.onclick = () => {
    const q = quadros.find(x => x.id === b.dataset.id);
    closeDrawer(); if (q) cb(q);
  }));
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
      const pillTxt = { queued: 'na fila', claimed: 'pego', running: `${j.pct || 0}%`, done: 'pronto', error: 'erro' }[j.status] || j.status;
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
        <div class="vwrap" data-src="${esc(j.video)}">
          <video src="${esc(j.video)}#t=0.5" preload="metadata" playsinline muted></video>
          <div class="playov"><span class="pbtn">${I.play}</span></div>
        </div>
        <div class="meta">
          <div class="t">${esc(j.nome)}</div>
          <div class="s">${new Date(j.updated_at).toLocaleDateString('pt-BR')}</div>
          <a class="btn sm block" href="${esc(j.video)}" download>${I.down} Baixar</a>
        </div>
      </div>`).join('')}</div>` :
    '<div class="empty"><div class="big">🎞️</div>Nada renderizado ainda.</div>'}`;
}
function bGaleria() {
  $$('.gitem .vwrap').forEach(w => w.onclick = () => lightbox(w.dataset.src));
}

// ============ BIBLIOTECA ============
function vBiblioteca() {
  const p = S.presets || {};
  const secs = [
    ['arquetipos', 'Arquétipos de criativo (DR)', 'Estruturas de anúncio comprovadas — roteiro visual pronto por objetivo.'],
    ['quadros', 'Estilos de quadro (por projeto)', 'Os prompts que geram a arte que o avatar segura. Um por estilo de cada projeto Malta.'],
    ['molduras', 'Molduras', 'A moldura da cena "avatar segurando o quadro".'],
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
            ${it.texto ? `<div class="x ${it.texto.length > 220 ? 'fade' : ''}">${esc(it.texto)}</div>` :
              it.dica ? `<div class="x">${esc(it.dica)} · ${(it.cenas || []).length} cena(s)</div>` : `<div class="x">${esc(it.id)}</div>`}
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
      $('.p-copy', pr).onclick = () => { navigator.clipboard.writeText(item.texto || item.dica || item.id); toast('copiado'); };
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
  const kind = tipo === 'vozes' ? 'voz' : tipo === 'molduras' ? 'moldura' : tipo === 'quadros' ? 'quadro' : tipo === 'arquetipos' ? 'arquetipo' : 'texto';
  const blank = { voz: { id: '', label: '', genero: 'M' }, moldura: { id: '', label: '' }, quadro: { id: '', grupo: '', nome: '', texto: '' }, arquetipo: { id: '', nome: '', dica: '', cenas: [] }, texto: { id: '', nome: '', texto: '' } }[kind];
  const item = idx >= 0 ? S.presets[tipo][idx] : blank;
  const forms = {
    voz: `<label class="f"><span class="lbl">ID da voz (Google)</span><input class="in" id="p-a" value="${esc(item.id)}" placeholder="pt-BR-Neural2-B"></label>
      <label class="f"><span class="lbl">Label</span><input class="in" id="p-b" value="${esc(item.label)}" placeholder="Masculina · quente"></label>`,
    moldura: `<label class="f"><span class="lbl">ID (slug)</span><input class="in" id="p-a" value="${esc(item.id)}" placeholder="ornate-gold"></label>
      <label class="f"><span class="lbl">Label</span><input class="in" id="p-b" value="${esc(item.label)}" placeholder="Dourada ornamentada"></label>`,
    quadro: `<label class="f"><span class="lbl">Grupo (projeto)</span><input class="in" id="p-g" value="${esc(item.grupo || '')}" placeholder="Pinturapai (Dia dos Pais)"></label>
      <label class="f"><span class="lbl">Nome</span><input class="in" id="p-a" value="${esc(item.nome)}"></label>
      <label class="f"><span class="lbl">Prompt do quadro (img2img)</span><textarea class="in" id="p-b" rows="10">${esc(item.texto)}</textarea></label>`,
    arquetipo: `<label class="f"><span class="lbl">Nome</span><input class="in" id="p-a" value="${esc(item.nome)}"></label>
      <label class="f"><span class="lbl">Dica de gancho/copy</span><input class="in" id="p-g" value="${esc(item.dica || '')}"></label>
      <label class="f"><span class="lbl">Cenas — 1 por linha, formato "8|prompt em inglês"</span>
      <textarea class="in" id="p-b" rows="8" placeholder="8|Authentic handheld smartphone footage...">${esc((item.cenas || []).map(cn => `${cn.duracao || 8}|${cn.prompt}`).join('\n'))}</textarea></label>`,
    texto: `<label class="f"><span class="lbl">Nome</span><input class="in" id="p-a" value="${esc(item.nome)}"></label>
      <label class="f"><span class="lbl">Texto</span><textarea class="in" id="p-b" rows="8">${esc(item.texto)}</textarea></label>`,
  };
  drawer(`<h2>${idx >= 0 ? 'Editar' : 'Novo'} — ${tipo}</h2>${forms[kind]}<button class="btn primary block" id="p-save">Salvar</button>`,
    (dr) => {
      $('#p-save', dr).onclick = async () => {
        const a = $('#p-a', dr).value.trim(), b = $('#p-b', dr).value.trim();
        if (!a || !b) return toast('preencha os campos', true);
        let novo;
        if (kind === 'voz') novo = { id: a, label: b, genero: item.genero || 'M' };
        else if (kind === 'moldura') novo = { id: a, label: b };
        else if (kind === 'quadro') novo = { id: item.id || ('qd_' + Date.now().toString(36)), grupo: ($('#p-g', dr).value.trim() || 'Outros'), nome: a, texto: b };
        else if (kind === 'arquetipo') {
          const cenas = b.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
            const m = l.match(/^(\d+)\s*\|\s*(.+)$/);
            return m ? { duracao: +m[1], prompt: m[2] } : { duracao: 8, prompt: l };
          });
          if (!cenas.length) return toast('adicione ao menos 1 cena', true);
          novo = { id: item.id || ('arq_' + Date.now().toString(36)), nome: a, dica: $('#p-g', dr).value.trim(), cenas };
        }
        else novo = { id: item.id || ('p_' + Date.now().toString(36)), nome: a, texto: b };
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

    <div class="card">
      <h3>Log de erros</h3>
      <div class="hint" style="margin-bottom:10px">Todo erro do sistema — Veo, TTS, geração de imagem, worker, o próprio site — ganha um número aqui. Se um job falhar, o erro na Fila já vem com "Erro #N"; consulte o detalhe (stack, contexto) tocando abaixo.</div>
      <button class="btn block" id="s-errors">Ver últimos erros</button>
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
  $('#s-errors').onclick = verErros;
}

async function verErros() {
  drawer(`<h2>Log de erros</h2><div id="err-list" class="hint">carregando…</div>`, async (dr) => {
    try {
      const r = await api('errors');
      const list = $('#err-list', dr);
      if (!r.errors.length) { list.textContent = 'nenhum erro registrado ainda 🎉'; return; }
      list.className = '';
      list.innerHTML = r.errors.map(e => `
        <div class="preset">
          <div class="t">#${esc(e.id)} · ${new Date(e.ts).toLocaleString('pt-BR')}</div>
          <div class="hint" style="margin-bottom:6px">${esc(e.source)}</div>
          <div class="x">${esc(e.message)}</div>
          ${e.context && Object.keys(e.context).length ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">contexto</summary><div class="log">${esc(JSON.stringify(e.context, null, 2))}</div></details>` : ''}
          ${e.stack ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">stack trace</summary><div class="log">${esc(e.stack)}</div></details>` : ''}
        </div>`).join('');
    } catch (err) { $('#err-list', dr).textContent = 'erro ao carregar: ' + err.message; }
  });
}

// captura QUALQUER erro do próprio site (JS) e manda pro mesmo log numerado
window.addEventListener('error', (e) => {
  api('log_client_error', { body: { source: 'window.onerror', message: e.message, stack: e.error?.stack, url: location.href } }).catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  api('log_client_error', { body: { source: 'unhandledrejection', message: String(reason?.message || reason), stack: reason?.stack, url: location.href } }).catch(() => {});
});

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
