/* ESTÚDIO DE QUADROS — SPA vanilla. Contrato: web/quadros/api.php.
   Fluxo: Cenário (palco, monta 1x) → Mockup (take, troca a arte). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');

const S = {
  auth: false, tab: 'cenarios', screen: null, catFiltro: null, // null = home (pastas)
  refazer: null, // painel "refazer com outra moldura/lugar" aberto num job
  logAberto: null, // id do job com o log do pipeline expandido na Fila
  cenarios: [], categorias: [], molduras: [], fundos: [], jobs: [], defaults: { movimento: 'medio', duracaoAlvo: 25 },
  loja: { produtos: [], page: 1, paginas: 1, total: 0, busca: '', artista: '', artistas: [], orient: '', orientacoes: null, carregando: false, completo: true },
  yt: { busca: '', videos: [], sel: null, inicio: 0, carregando: false },
  // form do mockup (artes = lote [{url,prev}]; cenarioIds = pool multi-select)
  mk: { formato: 'ugc', cenarioIds: [], artes: [], modo: 'sortear', movimento: 'medio', duracaoAlvo: 25, abertura: false,
    narracao: '', voz: 'pt-BR-Neural2-C', musica: 'nenhuma', legenda: 'caixa', fmt45: false, variar: false,
    // ermos
    fundoIds: [], moldura2d: 'preto', ritmo: 0.3, duracaoErmos: 8,
    pelicula: 'nenhuma', peliculaOp: 0.3,
    ytId: null, ytTitulo: '', ytInicio: 0,
    legendaErmos: 'TODAS AS OBRAS JÁ DISPONÍVEIS EM NOSSO SITE', logoUrl: null },
  // form do cenário (molduraId = da biblioteca; duplicarDe = herda avatar/ambiente)
  cn: { descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
    nome: '', movimento: 'medio', temAbertura: false, duplicarDe: null, duplicarNome: '',
    variacoes: 1, diversificar: 'avatar', categoria: 'ugc', molduraPreset: 'preto' },
};

const VOZES = [
  { id: 'pt-BR-Neural2-C', label: 'Feminina' },
  { id: 'pt-BR-Wavenet-B', label: 'Masculina' },
];
const TRILHAS = ['nenhuma', 'emocional', 'energetica', 'epica', 'suave', 'misteriosa'];
const LEGENDAS = [['nenhuma', 'Sem legenda'], ['caixa', 'Caixa preta'], ['contorno', 'Contorno']];
// Mesmas 4 molduras do formato Ermos. No UGC a moldura e' 3D (a modelo segura),
// entao vira descricao no prompt dos keyframes do cenario.
const MOLDURAS_PRESET = [
  ['preto', 'Preto'], ['branco', 'Branco'],
  ['marfim', 'Marfim'], ['arabesco', 'Arabesco'],
];
// o botão mostra a FOTO da moldura de verdade — emoji não diz qual pau é
const chipMoldura = (id, lb, ativo, attr) =>
  `<button class="chip mol ${ativo ? 'on' : ''}" ${attr}="${id}">
     <img src="assets/molduras/${id}.jpg" alt="">${lb}</button>`;
// qual dos 4 presets o cenário usou (o registro guarda a descrição em inglês).
// null = moldura escrita à mão, aí não tem foto pra mostrar.
function molduraDoCenario(c) {
  const en = (c && c.moldura) || '';
  return (MOLDURAS_PRESET.find(([id]) => MOLDURA_EN[id] === en) || [null])[0];
}
const MOLDURA_EN = {
  preto: 'a thin matte-black wooden moulding',
  branco: 'a clean matte-white wooden moulding',
  marfim: 'a warm ivory wooden moulding with a subtle inner fillet',
  arabesco: 'an ornate carved antique-gold moulding with arabesque scrollwork',
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
/* ================================================================ ROTA ====
   A URL é a fonte da verdade da navegação. Antes o app inteiro vivia em três
   variáveis de memória (S.tab/S.screen/S.catFiltro): o Voltar do navegador e o
   gesto de voltar do iPhone saíam do estúdio, e recarregar perdia tudo.
   Aqui o estado continua sendo escrito pelos handlers — o que muda é que toda
   tela vira um endereço, e o endereço sabe voltar a virar estado.          */

function rotaDeEstado() {
  const { tab, screen, catFiltro } = S;
  if (screen === 'novo-cenario') return '/palco/novo';
  if (screen === 'categorias') return '/categorias';
  if (screen === 'molduras') return '/molduras';
  if (screen === 'loja') return '/novo/loja';
  if (screen === 'youtube') return '/novo/trilha';
  if (screen && screen.startsWith('aprovar:')) return `/palco/${screen.slice(8)}`;
  if (tab === 'cenarios') return catFiltro ? `/inicio/${catFiltro}` : '/inicio';
  return `/${tab}`;
}

function estadoDeRota(hash) {
  const p = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const base = { tab: 'cenarios', screen: null, catFiltro: null };
  if (!p.length || p[0] === 'inicio') return { ...base, catFiltro: p[1] || null };
  if (p[0] === 'palco') {
    return p[1] === 'novo' ? { ...base, screen: 'novo-cenario' }
                           : { ...base, screen: `aprovar:${p[1]}` };
  }
  if (p[0] === 'categorias') return { ...base, screen: 'categorias' };
  if (p[0] === 'molduras') return { ...base, screen: 'molduras' };
  if (p[0] === 'novo') {
    return { ...base, tab: 'novo',
      screen: p[1] === 'loja' ? 'loja' : p[1] === 'trilha' ? 'youtube' : null };
  }
  if (['fila', 'galeria', 'ajustes'].includes(p[0])) return { ...base, tab: p[0] };
  return base;
}

// ---------- SHELL ----------
// Monta o esqueleto UMA vez por rota e depois só troca o miolo. Antes cada
// toque em chip refazia header + main + nav e religava todos os handlers.
let rotaMontada = null;
const scrollPorRota = new Map();

function montaEsqueleto() {
  const tab = (id, label) =>
    `<button data-tab="${id}">${IC[id]}<span>${label}</span></button>`;
  app.innerHTML = `
    <header class="top"><button class="top-back" id="top-home" hidden>‹ home</button><span class="mk">Quadros</span><span class="sp"></span></header>
    <main></main>
    <nav class="tabs">
      ${tab('cenarios', 'Início')}${tab('novo', 'Novo')}${tab('fila', 'Fila')}${tab('galeria', 'Galeria')}${tab('ajustes', 'Ajustes')}
    </nav>`;
  app.querySelectorAll('nav.tabs button').forEach((b) => {
    b.onclick = () => {
      S.tab = b.dataset.tab; S.screen = null;
      if (b.dataset.tab === 'cenarios') S.catFiltro = null;   // Início = home das pastas
      render();
    };
  });
  $('#top-home').onclick = () => { S.tab = 'cenarios'; S.screen = null; S.catFiltro = null; render(); };
}

function pintaNav() {
  const emHome = S.tab === 'cenarios' && !S.screen && !S.catFiltro;
  $('#top-home').hidden = emHome;
  app.querySelectorAll('nav.tabs button').forEach((b) => {
    b.classList.toggle('on', S.tab === b.dataset.tab && !S.screen);
  });
  // quantos trabalhos estão rodando — some quando não há nenhum
  const rodando = S.jobs.filter((j) => ['queued', 'claimed', 'running'].includes(j.status)).length;
  const alvo = app.querySelector('nav.tabs [data-tab="fila"]');
  let bd = alvo.querySelector('.badge');
  if (rodando) {
    if (!bd) { bd = document.createElement('i'); bd.className = 'badge'; alvo.appendChild(bd); }
    bd.textContent = rodando;
  } else if (bd) bd.remove();
}

function shell(inner) {
  const rota = rotaDeEstado();
  const trocou = rota !== rotaMontada;
  if (!app.querySelector('main')) montaEsqueleto();
  if (trocou && rotaMontada) scrollPorRota.set(rotaMontada, window.scrollY);

  // guarda foco e cursor: a mesma tela sendo repintada (busca da loja, lista
  // que chegou) não pode arrancar o campo de baixo do dedo
  const ativo = document.activeElement;
  const foco = ativo && ativo.id && app.contains(ativo)
    ? { id: ativo.id, ini: ativo.selectionStart, fim: ativo.selectionEnd } : null;
  const y = window.scrollY;

  app.querySelector('main').innerHTML = inner;
  pintaNav();

  if (trocou) {
    rotaMontada = rota;
    const salvo = scrollPorRota.get(rota) || 0;
    requestAnimationFrame(() => window.scrollTo(0, salvo));
  } else {
    if (window.scrollY !== y) window.scrollTo(0, y);
    if (foco) {
      const el = document.getElementById(foco.id);
      if (el) {
        el.focus({ preventScroll: true });
        try { el.setSelectionRange(foco.ini, foco.fim); } catch (_) { /* input sem seleção */ }
      }
    }
  }
  sincronizaUrl(rota);
}

// escreve a rota na barra de endereço sem empilhar duplicata
let ignoraPop = false;
function sincronizaUrl(rota) {
  const alvo = `#${rota}`;
  if (location.hash === alvo) return;
  ignoraPop = true;
  history.pushState({ rota }, '', alvo);
  ignoraPop = false;
}

window.addEventListener('popstate', () => {
  if (ignoraPop) return;
  Object.assign(S, estadoDeRota(location.hash));
  render();
});

// ---------- CENÁRIOS ----------
function catNome(id) {
  return (S.categorias.find((k) => k.id === id) || {}).nome || id || '—';
}

// ---------- HOME: pastas por formato ----------
function viewPastas() {
  const conta = (id) => S.cenarios.filter((c) => (c.categoria || 'ugc') === id).length;
  const pastas = S.categorias.map((k) => {
    let sub, prev;
    if (k.id === 'ermos') {
      const prontos = S.fundos.filter((f) => f.status === 'pronto');
      sub = `${prontos.length} lugar${prontos.length === 1 ? '' : 'es'} ativo${prontos.length === 1 ? '' : 's'} de ${S.fundos.length} · quadro flutuante`;
      prev = (prontos[0] || S.fundos[0] || {}).thumb;
    } else {
      const n = conta(k.id);
      sub = n ? `${n} cenário${n === 1 ? '' : 's'} · modelo apresenta` : 'vazia — crie o primeiro cenário';
      prev = (S.cenarios.find((c) => (c.categoria || 'ugc') === k.id) || {}).thumbs?.[0];
    }
    return `<button class="pasta" data-pasta="${esc(k.id)}">
      <div class="pasta-ph">${prev ? `<img src="${esc(prev)}" alt="">` : '<span>📁</span>'}</div>
      <div class="pasta-tx"><b>${esc(k.nome)}</b><span>${esc(sub)}</span></div>
      <span class="pasta-ar">›</span>
    </button>`;
  }).join('');
  shell(`
    <h2 class="view-t">Formatos</h2>
    <p class="view-sub">Cada formato é uma linguagem de criativo, com seus próprios cenários.</p>
    <div class="pastas">${pastas}</div>
    <div class="spacer"></div>
    <div class="btnrow">
      <button class="btn ghost" id="edit-cats">⚙ Categorias</button>
      <button class="btn ghost" id="go-mold">🖼 Molduras${S.molduras.length ? ` (${S.molduras.length})` : ''}</button>
    </div>
  `);
  app.querySelectorAll('[data-pasta]').forEach((b) => b.onclick = () => { S.catFiltro = b.dataset.pasta; render(); });
  $('#edit-cats').onclick = () => { S.screen = 'categorias'; render(); };
  $('#go-mold').onclick = () => { S.screen = 'molduras'; render(); };
}

function viewCenarios() {
  if (!S.catFiltro) return viewPastas();
  // pasta ERMOS = biblioteca de LUGARES (quadro flutuante, sem modelo)
  if (S.catFiltro === 'ermos') return viewFundos();
  const catN = catNome(S.catFiltro);
  const visiveis = S.cenarios.filter((c) => (c.categoria || 'ugc') === S.catFiltro);
  const cards = visiveis.map((c) => {
    const thumbs = (c.thumbs || []).slice(0, 3).map((u) => `<img src="${esc(u)}" alt="">`).join('') || '<div></div><div></div><div></div>';
    const wait = c.status !== 'aprovado';
    return `<div class="card">
      <div class="thumbs">${thumbs}</div>
      <div class="cbody">
        <h3>${esc(c.nome)}</h3>
        <div class="st ${wait ? 'wait' : 'ok'}">${wait ? '● aguardando aprovação' : '✓ aprovado'}</div>
        <p class="desc">${esc(c.ambiente || '')}</p>
        <button class="cat-tag" data-movecat="${esc(c.id)}" title="mudar de categoria">${esc(catNome(c.categoria || 'ugc'))} ▾</button>
      </div>
      <div class="cactions">
        ${wait ? `<button class="btn sm" data-approve="${esc(c.id)}">Ver / aprovar</button>` : `<button class="btn sm" data-use="${esc(c.id)}">Usar</button><button class="btn sm ghost" data-dup="${esc(c.id)}" title="mesmo palco, outra moldura">⟳ moldura</button>`}
        <button class="btn sm danger" data-del="${esc(c.id)}">✕</button>
      </div>
    </div>`;
  }).join('');
  shell(`
    <h2 class="view-t">📁 ${esc(catN)}</h2>
    <p class="view-sub">Cenários do formato ${esc(catN)}: modelo + ambiente + moldura. Monta uma vez, reusa sempre.</p>
    <div class="btnrow">
      <button class="btn" id="new-cen">+ Novo cenário ${esc(catN)}</button>
      <button class="btn ghost" id="go-mold">🖼 Molduras${S.molduras.length ? ` (${S.molduras.length})` : ''}</button>
    </div>
    <div class="spacer"></div>
    ${cards ? `<div class="grid">${cards}</div>` : `<div class="empty">Pasta <b>${esc(catN)}</b> vazia.<br>Crie o primeiro cenário dela acima.</div>`}
  `);
  $('#new-cen').onclick = () => {
    S.cn.duplicarDe = null; S.cn.duplicarNome = '';
    S.cn.categoria = S.catFiltro;
    S.screen = 'novo-cenario'; render();
  };
  $('#go-mold').onclick = () => { S.screen = 'molduras'; render(); };
  app.querySelectorAll('[data-movecat]').forEach((b) => b.onclick = async () => {
    const c = S.cenarios.find((x) => x.id === b.dataset.movecat);
    if (!c || !S.categorias.length) return;
    const atual = c.categoria || 'ugc';
    const lista = S.categorias.map((k, i) => `${i + 1}. ${k.nome}`).join('\n');
    const escolha = prompt(`Mover "${c.nome}" para qual categoria?\n\n${lista}\n\n(digite o número)`, String(S.categorias.findIndex((k) => k.id === atual) + 1));
    if (!escolha) return;
    const alvo = S.categorias[Number(escolha) - 1];
    if (!alvo) return toast('opção inválida', true);
    try { await api('move_cenario', { body: { id: c.id, categoria: alvo.id } }); await refresh(); toast(`movido pra ${alvo.nome}`); }
    catch (e) { toast(e.message, true); }
  });
  app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => { S.screen = 'aprovar:' + b.dataset.approve; render(); });
  app.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { S.mk.cenarioId = b.dataset.use; S.tab = 'novo'; S.screen = null; render(); });
  app.querySelectorAll('[data-dup]').forEach((b) => b.onclick = () => {
    const c = S.cenarios.find((x) => x.id === b.dataset.dup);
    if (!c) return;
    S.cn = { ...S.cn, descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
      nome: '', movimento: c.movimento || 'medio', temAbertura: false, duplicarDe: c.id, duplicarNome: c.nome };
    S.screen = 'novo-cenario'; render();
  });
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Apagar este cenário?')) return;
    try { await api('delete_cenario', { body: { id: b.dataset.del } }); await refresh(); toast('cenário apagado'); }
    catch (e) { toast(e.message, true); }
  });
}

// ---------- FUNDOS (pasta ERMOS: lugares onde o quadro flutua) ----------
function viewFundos() {
  const cards = S.fundos.map((f) => {
    const st = f.status;
    const badge = st === 'pronto' ? '<span class="st ok">✓ pronto pra usar</span>'
      : st === 'gerando' ? '<span class="st wait">● gerando o vídeo…</span>'
      : st === 'erro' ? '<span class="st" style="color:var(--red)">✕ falhou</span>'
      : '<span class="st" style="color:var(--faint)">○ não ativado</span>';
    const acao = st === 'pronto' ? `<button class="btn sm" data-usef="${esc(f.id)}">Usar</button>`
      : st === 'gerando' ? ''
      : `<button class="btn sm ghost" data-ativar="${esc(f.id)}">${st === 'erro' ? 'Tentar de novo' : '⚡ Ativar lugar'}</button>`;
    return `<div class="card">
      <div class="fundo-ph"><img src="${esc(f.thumb)}" alt="${esc(f.nome)}" loading="lazy"></div>
      <div class="cbody"><h3>${esc(f.nome)}</h3>${badge}<p class="desc">${esc(f.hint)}</p></div>
      <div class="cactions">${acao}</div>
    </div>`;
  }).join('');
  shell(`
    <h2 class="view-t">📁 Ermos · Lugares</h2>
    <p class="view-sub">O quadro flutua sobre esses cenários (sem modelo). Ative um lugar 1x — o vídeo dele fica pronto pra sempre.</p>
    <div class="grid">${cards}</div>
    <div class="hint" style="margin-top:14px">Ativar = ~1 min (gera o vídeo ambiente do lugar no Veo). Depois, cada criativo Ermos é montado em segundos, sem custo de vídeo.</div>
  `);
  app.querySelectorAll('[data-ativar]').forEach((b) => b.onclick = async () => {
    try { await api('queue_fundo', { body: { id: b.dataset.ativar } }); await refresh(); toast('gerando o lugar — acompanhe na Fila'); }
    catch (e) { toast(e.message, true); }
  });
  app.querySelectorAll('[data-usef]').forEach((b) => b.onclick = () => {
    S.mk.formato = 'ermos';
    if (!S.mk.fundoIds.includes(b.dataset.usef)) S.mk.fundoIds.push(b.dataset.usef);
    S.tab = 'novo'; S.screen = null; render();
  });
}

// ---------- YOUTUBE (trilha: buscar, ouvir, marcar o início) ----------
function fmtT(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function viewYoutube() {
  const Y = S.yt;
  // a janela da música é a duração do vídeo do formato que ele está montando
  const dur = S.mk.formato === 'ermos' ? S.mk.duracaoErmos : S.mk.duracaoAlvo;
  const cells = Y.videos.map((v, i) => `
    <div class="yt-item ${Y.sel && Y.sel.id === v.id ? 'sel' : ''}" data-ytv="${i}">
      <img src="${esc(v.thumb)}" alt="" loading="lazy">
      <div class="yt-t"><b>${esc(v.titulo.slice(0, 52))}</b><span>${esc(v.canal.slice(0, 26))} · ${esc(v.durTxt)}</span></div>
    </div>`).join('');
  shell(`
    <h2 class="view-t">▶ Trilha do YouTube</h2>
    <p class="view-sub">Busque, ouça e marque onde a música começa. O worker baixa só o trecho de <b>${dur}s</b> que você escolher.</p>
    <div class="field"><input type="text" id="yt-q" placeholder="ex: cinematic emotional piano…" value="${esc(Y.busca)}">
      <div class="hint">Use trilhas que você tem direito de usar (royalty-free, sua própria ou licenciada) — anúncio com música de terceiros pode ser derrubado por direitos autorais.</div>
    </div>
    ${Y.sel ? `<div class="yt-player">
      <iframe id="yt-frame" allow="autoplay; encrypted-media" allowfullscreen
        src="${ytEmbedUrl(Y.sel.id, Y.inicio)}"></iframe>
      <div class="yt-marca">
        <div class="yt-marca-l">início: <b id="yt-ini">${fmtT(Y.inicio)}</b> → ${fmtT(Y.inicio + dur)}</div>
        <button class="btn sm" id="yt-aqui">marcar aqui ⏱</button>
      </div>
      <input type="range" id="yt-range" min="0" max="${Math.max(0, Y.sel.dur - dur)}" value="${Y.inicio}" step="1">
      <button class="btn ghost" id="yt-ouvir">▶ ouvir os ${dur}s deste trecho</button>
      <button class="btn" id="yt-ok">Usar esta trilha</button>
    </div>` : ''}
    ${Y.carregando ? '<div class="empty">buscando…</div>' : (cells ? `<div class="yt-grid">${cells}</div>` : '')}
    <div class="spacer"></div>
    <button class="btn ghost" id="yt-voltar">Voltar</button>
  `);
  let t;
  $('#yt-q').oninput = (e) => { Y.busca = e.target.value; clearTimeout(t); t = setTimeout(() => buscaYt(), 500); };
  $('#yt-voltar').onclick = () => { S.screen = null; render(); };
  app.querySelectorAll('[data-ytv]').forEach((el) => el.onclick = () => {
    Y.sel = Y.videos[+el.dataset.ytv]; Y.inicio = 0; render();
  });
  if (Y.sel) {
    ligaPonteYt();
    // NADA aqui pode chamar render(): recriar o #yt-frame mata o player e
    // reinicia a música no meio da escuta. Atualizamos o DOM na mão.
    const pintaInicio = () => {
      const el = $('#yt-ini');
      if (el) el.textContent = `${fmtT(Y.inicio)}`;
      const lbl = el && el.parentElement;
      if (lbl) lbl.innerHTML = `início: <b id="yt-ini">${fmtT(Y.inicio)}</b> → ${fmtT(Y.inicio + dur)}`;
    };
    const r = $('#yt-range');
    r.oninput = (e) => { Y.inicio = +e.target.value; pintaInicio(); };
    // arrastar já pula o áudio pra lá: ele ouve enquanto procura o ponto
    r.onchange = () => { ytCmd('seekTo', [Y.inicio, true]); ytCmd('playVideo'); ytPara = 0; };
    $('#yt-aqui').onclick = () => {
      if (ytTempo() === null) return toast('dê play no player primeiro', true);
      Y.inicio = Math.max(0, Math.min(Math.round(ytTempo()), Math.max(0, Y.sel.dur - dur)));
      r.value = Y.inicio; pintaInicio();
      toast(`trecho começa em ${fmtT(Y.inicio)}`);
    };
    // toca só a janela que vai virar trilha, e para sozinho no fim dela
    $('#yt-ouvir').onclick = () => {
      ytCmd('seekTo', [Y.inicio, true]); ytCmd('playVideo');
      ytPara = Y.inicio + dur;
      toast(`ouvindo ${fmtT(Y.inicio)} → ${fmtT(Y.inicio + dur)}`);
    };
    $('#yt-ok').onclick = () => {
      S.mk.ytId = Y.sel.id; S.mk.ytTitulo = Y.sel.titulo; S.mk.ytInicio = Y.inicio;
      S.mk.musica = 'nenhuma'; // a trilha do YouTube substitui o mood gerado
      S.screen = null; render(); toast('trilha escolhida ✓');
    };
  }
}

// ---------- PONTE COM O PLAYER DO YOUTUBE ----------
// Nada de iframe_api.js: a CSP do site é `script-src 'self'` e não vamos
// afrouxar isso. Falamos direto com o iframe pelo protocolo postMessage que a
// própria API usa por baixo — mesmo poder (seek, play, tempo atual), zero
// script de terceiro. Só o frame-src precisou ser liberado (ver .htaccess).
const YT_ORIGEM = 'https://www.youtube-nocookie.com';
let ytUlt = null;   // { t: segundos, quando: Date.now(), tocando: bool }
let ytPara = 0;     // pausa automática ao chegar aqui (0 = desligado)
let ytPonte = false;

function ytEmbedUrl(id, inicio) {
  const p = new URLSearchParams({
    enablejsapi: '1', start: String(Math.max(0, inicio | 0)), rel: '0',
    modestbranding: '1', playsinline: '1', origin: location.origin,
  });
  return `${YT_ORIGEM}/embed/${encodeURIComponent(id)}?${p}`;
}

function ytCmd(func, args = []) {
  const f = $('#yt-frame');
  if (!f || !f.contentWindow) return;
  f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGEM);
}

// tempo atual estimado: o YouTube manda o relógio a cada ~250ms; entre um
// aviso e outro a gente extrapola, senão o "marcar aqui" ficaria atrasado
function ytTempo() {
  if (!ytUlt) return null;
  if (!ytUlt.tocando) return ytUlt.t;
  return ytUlt.t + (Date.now() - ytUlt.quando) / 1000;
}

function ligaPonteYt() {
  ytUlt = null; ytPara = 0;
  const f = $('#yt-frame');
  // handshake: sem isso o YouTube não manda os infoDelivery com o tempo
  if (f) f.onload = () => f.contentWindow.postMessage(
    JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGEM);
  if (ytPonte) return;
  ytPonte = true;
  window.addEventListener('message', (e) => {
    if (e.origin !== YT_ORIGEM) return;
    let d; try { d = JSON.parse(e.data); } catch { return; }
    const info = d && d.info;
    if (!info) return;
    if (typeof info.currentTime === 'number') {
      ytUlt = { t: info.currentTime, quando: Date.now(), tocando: info.playerState === 1 };
    } else if (typeof info.playerState === 'number' && ytUlt) {
      ytUlt = { t: ytTempo(), quando: Date.now(), tocando: info.playerState === 1 };
    }
    // fim da janela em audição → pausa (ele ouve só o que vai virar trilha)
    if (ytPara && ytUlt && ytUlt.tocando && ytUlt.t >= ytPara) { ytPara = 0; ytCmd('pauseVideo'); }
  });
}

async function buscaYt() {
  if (!S.yt.busca.trim()) return;
  S.yt.carregando = true; render();
  try {
    const r = await api(`yt_busca&q=${encodeURIComponent(S.yt.busca)}`);
    S.yt.videos = r.videos || [];
  } catch (e) { toast(e.message, true); }
  S.yt.carregando = false; render();
}

// ---------- LOJA (picker de artes do catálogo Shopify) ----------
// ORIENTAÇÃO: o vídeo é sempre de um lado só — ou tudo em pé, ou tudo deitado.
// Misturar quebra a composição (a moldura e a posição no criativo mudam).
const ORIENT_NOME = { v: 'em pé', h: 'deitada', q: 'quadrada' };
// ícone desenhado em CSS: os glifos de retângulo (▯ ▭ ▢) não existem em toda
// fonte e viravam quadradinho vazio no iPhone
const ORIENT_ICO = { v: '<i class="oi v"></i>', h: '<i class="oi h"></i>', q: '<i class="oi q"></i>' };
// a orientação travada pelo que já está escolhido ('' = ainda livre).
// quadrada não trava nada: cabe nos dois.
function orientTravada() {
  const o = S.mk.artes.map((a) => a.orient).find((x) => x === 'v' || x === 'h');
  return o || '';
}

function viewLoja() {
  const L = S.loja;
  const sel = new Set(S.mk.artes.map((a) => a.url));
  const trava = orientTravada();
  const cells = L.produtos.map((p, i) => {
    const o = p.orient || 'v';
    const bloqueada = trava && o !== 'q' && o !== trava;
    return `
    <div class="loja-item ${sel.has(p.img) ? 'sel' : ''} ${bloqueada ? 'bloq' : ''}" data-lp="${i}">
      <img src="${esc(p.img)}" alt="" loading="lazy">
      <div class="lorient ${o}">${ORIENT_ICO[o]} ${ORIENT_NOME[o]}</div>
      <div class="lt">${esc(p.titulo.slice(0, 40))}${p.artista ? `<span class="la">${esc(p.artista)}</span>` : ''}</div>
      ${sel.has(p.img) ? '<div class="lcheck">✓</div>' : ''}
    </div>`;
  }).join('');
  const oc = L.orientacoes || { v: 0, h: 0, q: 0 };
  const orientChips = [
    ['', `todas · ${oc.v + oc.h + oc.q}`],
    ['v', `${ORIENT_ICO.v} em pé · ${oc.v + oc.q}`],
    ['h', `${ORIENT_ICO.h} deitadas · ${oc.h + oc.q}`],
  ].map(([v, txt]) => `<button class="chip ${L.orient === v ? 'on' : ''}" data-or="${v}">${txt}</button>`).join('');
  // artistas: o selecionado + os 14 com mais obras (o resto entra pela busca)
  const topArt = L.artistas.slice(0, 14);
  if (L.artista && !topArt.find((a) => a.nome === L.artista)) {
    const achado = L.artistas.find((a) => a.nome === L.artista);
    if (achado) topArt.unshift(achado);
  }
  const artChips = [
    `<button class="chip ${!L.artista ? 'on' : ''}" data-art="">todos os artistas</button>`,
    ...topArt.map((a) => `<button class="chip ${L.artista === a.nome ? 'on' : ''}" data-art="${esc(a.nome)}">${esc(a.nome)} · ${a.n}</button>`),
  ].join('');
  shell(`
    <h2 class="view-t">🛍 Escolher da loja</h2>
    <p class="view-sub">Atelier Malta · ${L.total} obra${L.total === 1 ? '' : 's'}${L.completo === false ? ' <b>(carregando o resto…)</b>' : ''}${L.artista ? ` de <b>${esc(L.artista)}</b>` : ''}${L.busca ? ` com “${esc(L.busca)}”` : ''}. ${S.mk.artes.length ? `<b>${S.mk.artes.length} selecionada${S.mk.artes.length > 1 ? 's' : ''}</b>.` : 'Toque pra selecionar.'}</p>
    <div class="field"><input type="text" id="lj-q" placeholder="buscar por obra ou artista…" value="${esc(L.busca)}"></div>
    <div class="field"><label>Orientação${trava ? ` — travada em <b>${ORIENT_NOME[trava]}</b> pelas que você já escolheu` : ''}</label>
      <div class="chips">${orientChips}</div>
      <div class="hint">Um vídeo é sempre de um lado só. Escolha um lado e a outra orientação fica bloqueada até você limpar a seleção.</div></div>
    <div class="field"><label>Artista</label><div class="chips">${artChips}</div></div>
    ${L.carregando ? '<div class="empty">carregando o catálogo…</div>'
      : (cells ? `<div class="loja-grid">${cells}</div>` : '<div class="empty">nada encontrado — tente outro termo ou artista</div>')}
    ${L.paginas > 1 ? `<div class="btnrow" style="margin-top:14px">
      <button class="btn ghost" id="lj-prev" ${L.page <= 1 ? 'disabled' : ''}>◀</button>
      <button class="btn ghost" disabled style="flex:0 0 auto;padding:12px 16px">${L.page}/${L.paginas}</button>
      <button class="btn ghost" id="lj-next" ${L.page >= L.paginas ? 'disabled' : ''}>▶</button>
    </div>` : ''}
    <div class="spacer"></div>
    <button class="btn" id="lj-ok">Concluir seleção${S.mk.artes.length ? ` (${S.mk.artes.length})` : ''}</button>
  `);
  let t;
  $('#lj-q').oninput = (e) => { L.busca = e.target.value; L.page = 1; clearTimeout(t); t = setTimeout(() => carregaLoja(), 350); };
  app.querySelectorAll('[data-art]').forEach((b) => b.onclick = () => { L.artista = b.dataset.art; L.page = 1; carregaLoja(); });
  app.querySelectorAll('[data-or]').forEach((b) => b.onclick = () => { L.orient = b.dataset.or; L.artista = ''; L.page = 1; carregaLoja(); });
  const pv = $('#lj-prev'); if (pv) pv.onclick = () => { if (L.page > 1) { L.page -= 1; carregaLoja(); } };
  const nx = $('#lj-next'); if (nx) nx.onclick = () => { if (L.page < L.paginas) { L.page += 1; carregaLoja(); } };
  $('#lj-ok').onclick = () => { S.screen = null; S.tab = 'novo'; render(); };
  app.querySelectorAll('[data-lp]').forEach((el) => el.onclick = () => {
    const p = L.produtos[+el.dataset.lp];
    const o = p.orient || 'v';
    const i = S.mk.artes.findIndex((a) => a.url === p.img);
    if (i >= 0) { S.mk.artes.splice(i, 1); return render(); }
    const t = orientTravada();
    if (t && o !== 'q' && o !== t) {
      return toast(`o vídeo já está com obras ${ORIENT_NOME[t]} — essa é ${ORIENT_NOME[o]}. É um lado só.`, true);
    }
    if (S.mk.artes.length >= 16) return toast('máximo 16 artes', true);
    S.mk.artes.push({ url: p.img, prev: p.img, orient: o, artista: p.artista || '' });
    render();
  });
}

async function carregaLoja() {
  S.loja.carregando = true; render();
  try {
    const r = await api(`loja_produtos&page=${S.loja.page}&q=${encodeURIComponent(S.loja.busca)}&artista=${encodeURIComponent(S.loja.artista)}&orient=${S.loja.orient || ''}`);
    S.loja.produtos = r.produtos || [];
    S.loja.paginas = r.paginas || 1;
    S.loja.total = r.total || 0;
    if (r.artistas) S.loja.artistas = r.artistas;
    if (r.orientacoes) S.loja.orientacoes = r.orientacoes;
    S.loja.completo = r.completo !== false;
  } catch (e) { toast(e.message, true); }
  S.loja.carregando = false; render();
  // catálogo grande vem em partes: continua puxando até completar
  if (!S.loja.completo && S.screen === 'loja') setTimeout(() => carregaLoja(), 400);
}

// ---------- CATEGORIAS ----------
function viewCategorias() {
  const conta = (id) => S.cenarios.filter((c) => (c.categoria || 'ugc') === id).length;
  const linhas = S.categorias.map((k) => `<div class="row">
    <span class="rl">${esc(k.nome)} <span style="color:var(--faint)">· ${conta(k.id)} cenário${conta(k.id) === 1 ? '' : 's'}</span></span>
    <span style="display:flex;gap:7px">
      <button class="btn sm ghost" data-rencat="${esc(k.id)}">renomear</button>
      <button class="btn sm danger" data-delcat="${esc(k.id)}">✕</button>
    </span>
  </div>`).join('');
  shell(`
    <h2 class="view-t">Categorias</h2>
    <p class="view-sub">Organize o acervo por linguagem de criativo (UGC, POV, Ermos…).</p>
    ${linhas}
    <div class="spacer"></div>
    <button class="btn" id="new-cat">+ Nova categoria</button>
    <div class="spacer"></div>
    <button class="btn ghost" id="cat-back">Voltar</button>
    <div class="hint" style="margin-top:10px">Ao apagar uma categoria, os cenários dela vão pra primeira da lista — nada se perde.</div>
  `);
  $('#cat-back').onclick = () => { S.screen = null; render(); };
  $('#new-cat').onclick = async () => {
    const nome = prompt('Nome da categoria (ex: POV, Unboxing, Depoimento):');
    if (!nome || !nome.trim()) return;
    try { await api('save_categoria', { body: { nome: nome.trim() } }); await refresh(); S.screen = 'categorias'; render(); toast('categoria criada ✓'); }
    catch (e) { toast(e.message, true); }
  };
  app.querySelectorAll('[data-rencat]').forEach((b) => b.onclick = async () => {
    const k = S.categorias.find((x) => x.id === b.dataset.rencat);
    const nome = prompt('Novo nome:', k?.nome || '');
    if (!nome || !nome.trim()) return;
    try { await api('save_categoria', { body: { id: k.id, nome: nome.trim() } }); await refresh(); S.screen = 'categorias'; render(); }
    catch (e) { toast(e.message, true); }
  });
  app.querySelectorAll('[data-delcat]').forEach((b) => b.onclick = async () => {
    const k = S.categorias.find((x) => x.id === b.dataset.delcat);
    const n = conta(k.id);
    if (!confirm(`Apagar a categoria "${k.nome}"?${n ? `\n\nOs ${n} cenário(s) dela vão pra primeira categoria da lista.` : ''}`)) return;
    try { await api('delete_categoria', { body: { id: k.id } }); if (S.catFiltro === k.id) S.catFiltro = null; await refresh(); S.screen = 'categorias'; render(); }
    catch (e) { toast(e.message, true); }
  });
}

// ---------- MOLDURAS (biblioteca) ----------
function viewMolduras() {
  const cards = S.molduras.map((m) => `<div class="card">
    <div class="mold-ph"><img src="${esc(m.url)}" alt="${esc(m.nome)}"></div>
    <div class="cbody"><h3>${esc(m.nome)}</h3></div>
    <div class="cactions">
      <button class="btn sm" data-usem="${esc(m.id)}">Usar num cenário</button>
      <button class="btn sm danger" data-delm="${esc(m.id)}">✕</button>
    </div>
  </div>`).join('');
  shell(`
    <h2 class="view-t">Molduras</h2>
    <p class="view-sub">Suba a foto de uma moldura real — ela vira referência e o palco é gerado com ela idêntica.</p>
    <button class="btn" id="up-mold">+ Subir foto de moldura</button>
    <div class="spacer"></div>
    ${S.molduras.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Biblioteca vazia.<br>Suba a primeira moldura acima.</div>'}
    <div class="spacer"></div>
    <button class="btn ghost" id="mold-back">Voltar</button>
  `);
  $('#mold-back').onclick = () => { S.screen = null; render(); };
  $('#up-mold').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try {
        toast('subindo a moldura…');
        const r = await api('upload_image', { form: fd });
        const nome = prompt('Nome da moldura (ex: Dourada ornamentada):') || 'Moldura';
        await api('save_moldura', { body: { nome, url: r.url } });
        await refresh(); S.screen = 'molduras'; render();
        toast('moldura salva na biblioteca ✓');
      } catch (e) { toast(e.message, true); }
    };
    inp.click();
  };
  app.querySelectorAll('[data-usem]').forEach((b) => b.onclick = () => {
    S.cn.molduraId = b.dataset.usem; S.cn.molduraText = '';
    S.screen = 'novo-cenario'; render();
  });
  app.querySelectorAll('[data-delm]').forEach((b) => b.onclick = async () => {
    if (!confirm('Apagar esta moldura da biblioteca?')) return;
    try { await api('delete_moldura', { body: { id: b.dataset.delm } }); await refresh(); S.screen = 'molduras'; render(); }
    catch (e) { toast(e.message, true); }
  });
}

// ---------- NOVO CENÁRIO (form) ----------
function viewNovoCenario() {
  const c = S.cn;
  const dup = !!c.duplicarDe;
  const moveChips = ['calmo', 'medio', 'dinamico'].map((m) =>
    `<button class="chip ${c.movimento === m ? 'on' : ''}" data-move="${m}">${m}</button>`).join('');
  const moldChips = S.molduras.map((m) =>
    `<button class="chip ${c.molduraId === m.id ? 'on' : ''}" data-mold="${esc(m.id)}">${esc(m.nome)}</button>`).join('')
    + `<button class="chip ${!c.molduraId ? 'on' : ''}" data-mold="">texto livre</button>`;
  shell(`
    <h2 class="view-t">${dup ? 'Trocar a moldura' : 'Novo cenário'}</h2>
    <p class="view-sub">${dup
      ? `Mesmo palco de <b>${esc(c.duplicarNome)}</b> (mesma modelo, mesmo lugar) — só a moldura muda. Um cenário novo é gerado pra você aprovar.`
      : 'Descreva em texto livre — eu viro o prompt técnico e gero os 6 quadros-base pra você aprovar.'}</p>
    ${dup ? '' : `
    <div class="field"><label>Categoria</label>
      <div class="chips">${S.categorias.map((k) => `<button class="chip ${c.categoria === k.id ? 'on' : ''}" data-catsel="${esc(k.id)}">${esc(k.nome)}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Descrição da cena</label>
      <textarea id="f-desc" placeholder="ex: uma ruiva de vestido preto numa galeria minimalista branca, luz de dia">${esc(c.descricao)}</textarea>
      <div class="hint">Pode jogar tudo aqui, ou detalhar nos campos abaixo.</div>
    </div>
    <div class="field"><label>Avatar (opcional)</label><input type="text" id="f-av" placeholder="quem apresenta o quadro" value="${esc(c.avatarText)}"></div>
    <div class="field"><label>Ambiente (opcional)</label><input type="text" id="f-am" placeholder="onde é a cena" value="${esc(c.ambienteText)}"></div>`}
    <div class="field"><label>Moldura</label>
      <div class="chips" style="margin-bottom:8px">
        ${MOLDURAS_PRESET.map(([id, lb]) => chipMoldura(id, lb, c.molduraPreset === id && !c.molduraId, 'data-mpre')).join('')}
        <button class="chip ${c.molduraPreset === 'livre' && !c.molduraId ? 'on' : ''}" data-mpre="livre">outra (texto)</button>
      </div>
      ${S.molduras.length ? `<div class="chips" style="margin-bottom:8px">${moldChips}</div>` : ''}
      ${c.molduraId
        ? `<div class="hint">A foto da biblioteca entra como referência — a moldura sai idêntica à real.</div>`
        : (c.molduraPreset === 'livre'
          ? `<input type="text" id="f-mo" placeholder="ex: prata escovada, nogueira, dupla dourada" value="${esc(c.molduraText)}">`
          : `<div class="hint">Mesmas 4 molduras do formato Ermos — o quadro da cena sai com ela.</div>`)}
      <div class="hint" style="margin-top:6px">Quer usar uma moldura sua? <a href="#" id="go-mold2">Suba a foto na biblioteca</a>.</div>
    </div>
    <div class="field"><label>Movimento das cenas</label><div class="chips">${moveChips}</div></div>
    ${dup ? '' : `<div class="field"><label>Variações de persona (produção em massa)</label>
      <div class="chips">${[1, 2, 3, 4].map((n) => `<button class="chip ${c.variacoes === n ? 'on' : ''}" data-varn="${n}">${n === 1 ? '1 palco' : n + ' palcos'}</button>`).join('')}</div>
      ${c.variacoes > 1 ? `<div class="chips" style="margin-top:8px">${[['avatar', 'variar a modelo'], ['ambiente', 'variar o lugar'], ['ambos', 'variar tudo']].map(([id, lb]) => `<button class="chip ${c.diversificar === id ? 'on' : ''}" data-divr="${id}">${lb}</button>`).join('')}</div>
      <div class="hint" style="margin-top:6px">Da sua descrição saem ${c.variacoes} palcos DIFERENTES entre si — aprova os que gostar.</div>` : ''}
    </div>
    <div class="row"><span class="rl">Preparar abertura com reveal do verso</span><button class="tg ${c.temAbertura ? 'on' : ''}" id="f-ab"></button></div>
    <div class="hint" style="margin:6px 0 16px">O reveal do verso é gerado depois, sob demanda. Deixe desligado por ora.</div>`}
    <button class="btn" id="cen-go">Gerar ${!dup && c.variacoes > 1 ? c.variacoes + ' palcos' : 'quadros-base'}</button>
    <div class="spacer"></div>
    <button class="btn ghost" id="cen-back">Voltar</button>
  `);
  const bind = (sel, fn) => { const el = $(sel); if (el) el.oninput = fn; };
  bind('#f-desc', (e) => c.descricao = e.target.value);
  bind('#f-av', (e) => c.avatarText = e.target.value);
  bind('#f-am', (e) => c.ambienteText = e.target.value);
  bind('#f-mo', (e) => c.molduraText = e.target.value);
  app.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { c.movimento = b.dataset.move; render(); });
  app.querySelectorAll('[data-mold]').forEach((b) => b.onclick = () => { c.molduraId = b.dataset.mold || null; render(); });
  app.querySelectorAll('[data-catsel]').forEach((b) => b.onclick = () => { c.categoria = b.dataset.catsel; render(); });
  app.querySelectorAll('[data-mpre]').forEach((b) => b.onclick = () => { c.molduraPreset = b.dataset.mpre; c.molduraId = null; render(); });
  app.querySelectorAll('[data-varn]').forEach((b) => b.onclick = () => { c.variacoes = +b.dataset.varn; render(); });
  app.querySelectorAll('[data-divr]').forEach((b) => b.onclick = () => { c.diversificar = b.dataset.divr; render(); });
  $('#go-mold2').onclick = (e) => { e.preventDefault(); S.screen = 'molduras'; render(); };
  const ab = $('#f-ab'); if (ab) ab.onclick = () => { c.temAbertura = !c.temAbertura; render(); };
  $('#cen-back').onclick = () => { S.screen = null; render(); };
  $('#cen-go').onclick = async () => {
    if (!dup && !c.descricao.trim() && (!c.avatarText.trim() || !c.ambienteText.trim())) return toast('descreva ao menos avatar e ambiente', true);
    if (dup && !c.molduraId && c.molduraPreset === 'livre' && !c.molduraText.trim()) return toast('escolha a moldura nova', true);
    try {
      const molduraTexto = c.molduraId ? '' : (c.molduraPreset === 'livre' ? c.molduraText : MOLDURA_EN[c.molduraPreset]);
      const moldNome = c.molduraId ? (S.molduras.find((m) => m.id === c.molduraId)?.nome || '')
        : (c.molduraPreset === 'livre' ? c.molduraText : (MOLDURAS_PRESET.find(([i]) => i === c.molduraPreset)?.[1] || '').replace(/[^\w áéíóúâêôãõç]/gi,'').trim());
      const nome = dup
        ? `${c.duplicarNome.split('·')[0].trim()} · ${moldNome.slice(0, 18)}`
        : (c.nome || (c.ambienteText || c.descricao).slice(0, 30));
      await api('queue_cenario', { body: { ...c, molduraText: molduraTexto, nome, variacoes: dup ? 1 : c.variacoes } });
      const nPalcos = dup ? 1 : c.variacoes;
      S.cn = { descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
        nome: '', movimento: 'medio', temAbertura: false, duplicarDe: null, duplicarNome: '',
        variacoes: 1, diversificar: 'avatar', categoria: c.categoria, molduraPreset: 'preto' };
      S.screen = null; S.tab = 'fila'; await refresh();
      toast(nPalcos > 1 ? `gerando ${nPalcos} palcos — acompanhe na Fila` : 'gerando o palco — acompanhe na Fila');
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- APROVAR CENÁRIO ----------
function viewAprovar(id) {
  const c = S.cenarios.find((x) => x.id === id);
  if (!c) { S.screen = null; return render(); }
  // cada cena tem seu "refazer": errar uma não pode custar as outras cinco.
  // A 1ª fica de fora — é ela que define a pessoa, as outras nascem dela.
  const refazendo = S.jobs.some((j) => j.tipo === 'keyframe'
    && j.snapshot?.cenarioId === id && ['queued', 'claimed', 'running'].includes(j.status));
  const imgs = (c.thumbs || []).map((u, i) => {
    const kf = `K${i + 1}`;
    return `<figure class="ap-cena">
      <img src="${esc(u)}" alt="">
      ${i === 0
        ? '<figcaption class="ap-tag">1ª · define a pessoa</figcaption>'
        : `<button class="ap-refaz" data-kf="${kf}" ${refazendo ? 'disabled' : ''}>↻ refazer esta cena</button>`}
    </figure>`;
  }).join('');
  shell(`
    <h2 class="view-t">${esc(c.nome)}</h2>
    <p class="view-sub">Confira: a mesma pessoa nas 6 cenas? verde limpo? moldura certa?</p>
    ${refazendo ? '<div class="hint" style="margin-bottom:10px">refazendo uma cena… acompanhe na Fila</div>' : ''}
    <div class="approve-grid">${imgs}</div>
    <div class="hint" style="margin:8px 0 14px">Se a <b>1ª</b> cena estiver errada, refaça o cenário inteiro — é dela que sai a identidade das outras.</div>
    <button class="btn" id="ap-ok">Aprovar palco</button>
    <div class="spacer"></div>
    <button class="btn ghost" id="ap-back">Voltar</button>
  `);
  $('#ap-back').onclick = () => { S.screen = null; render(); };
  app.querySelectorAll('[data-kf]').forEach((b) => b.onclick = async () => {
    b.disabled = true; b.textContent = 'enfileirando…';
    try {
      await api('queue_keyframe', { body: { id, kf: b.dataset.kf } });
      await refresh();
      toast('refazendo a cena — leva ~1 min');
    } catch (e) { toast(e.message, true); render(); }
  });
  $('#ap-ok').onclick = async () => {
    try { await api('approve_cenario', { body: { id } }); await refresh(); S.screen = null; S.tab = 'cenarios'; toast('cenário aprovado ✓'); render(); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- NOVO MOCKUP ----------
function viewNovo() {
  const fmtChips = `<div class="field"><label>Formato</label><div class="chips">
    <button class="chip ${S.mk.formato === 'ugc' ? 'on' : ''}" data-fmt="ugc">🎬 UGC (modelo apresenta)</button>
    <button class="chip ${S.mk.formato === 'ermos' ? 'on' : ''}" data-fmt="ermos">🖼 Ermos (quadro flutuante)</button>
  </div></div>`;
  const bindFmt = () => app.querySelectorAll('[data-fmt]').forEach((b) => b.onclick = () => { S.mk.formato = b.dataset.fmt; render(); });
  if (S.mk.formato === 'ermos') return viewNovoErmos(fmtChips, bindFmt);
  const aprovados = S.cenarios.filter((c) => c.status === 'aprovado');
  if (!aprovados.length) {
    shell(`<h2 class="view-t">Novo mockup</h2>${fmtChips}<div class="empty">Você precisa de um cenário aprovado primeiro.<br>Vá em Cenários e crie um palco.</div>`);
    return bindFmt();
  }
  const m = S.mk;
  // saneia o pool (cenários apagados/não-aprovados saem)
  m.cenarioIds = m.cenarioIds.filter((id) => aprovados.find((c) => c.id === id));
  if (!m.cenarioIds.length) m.cenarioIds = [aprovados[0].id];
  const multi = m.cenarioIds.length > 1;
  // total de vídeos = artes × cenários (matriz) ou 1 por arte (um/sortear)
  const total = m.artes.length * (multi && m.modo === 'matriz' ? m.cenarioIds.length : 1);
  const estClipes = total * 5;
  // no UGC a moldura é FÍSICA na cena (nasce nos keyframes), então ela não se
  // escolhe aqui — mas dá pra ver qual cada palco tem, com a foto do pau
  const cenChips = aprovados.map((c) => {
    const mid = molduraDoCenario(c);
    const sel = m.cenarioIds.includes(c.id);
    return `<button class="chip ${mid ? 'mol' : ''} ${sel ? 'on' : ''}" data-cen="${esc(c.id)}">
      ${mid ? `<img src="assets/molduras/${mid}.jpg" alt="">` : ''}${esc(c.nome)}</button>`;
  }).join('');
  const modoChips = [['sortear', '🎲 sortear (1 vídeo/arte, cenário aleatório)'], ['matriz', '⚡ matriz (todas × todos)']]
    .map(([id, lb]) => `<button class="chip ${m.modo === id ? 'on' : ''}" data-modo="${id}">${lb}</button>`).join('');
  const moveChips = ['calmo', 'medio', 'dinamico'].map((x) => `<button class="chip ${m.movimento === x ? 'on' : ''}" data-move="${x}">${x}</button>`).join('');
  const durChips = [15, 25, 30].map((x) => `<button class="chip ${m.duracaoAlvo === x ? 'on' : ''}" data-dur="${x}">${x}s</button>`).join('');
  const vozChips = VOZES.map((v) => `<button class="chip ${m.voz === v.id ? 'on' : ''}" data-voz="${v.id}">${v.label}</button>`).join('');
  const triChips = TRILHAS.map((t) => `<button class="chip ${m.musica === t ? 'on' : ''}" data-tri="${t}">${t}</button>`).join('');
  const legChips = LEGENDAS.map(([id, lb]) => `<button class="chip ${m.legenda === id ? 'on' : ''}" data-leg="${id}">${lb}</button>`).join('');
  const artesHtml = m.artes.map((a, i) => `<div class="arte-th"><img src="${esc(a.prev)}" alt="">
    <span class="arte-o">${ORIENT_ICO[a.orient || 'v']}</span>
    <button class="arte-x" data-delarte="${i}">✕</button></div>`).join('');
  const umCen = !multi ? aprovados.find((c) => c.id === m.cenarioIds[0]) : null;
  const temNarr = !!m.narracao.trim();
  const estouro = total > 20;
  shell(`
    <h2 class="view-t">Novo mockup</h2>
    ${fmtChips}
    <p class="view-sub">Escolha 1+ palcos, suba 1+ artes. ${total > 1 ? `Vai gerar <b>${total} vídeos</b> (~${estClipes} clipes Veo).` : `Sai o vídeo nativo de ${m.duracaoAlvo}s.`}</p>
    <div class="field"><label>Cenário${multi ? 's · ' + m.cenarioIds.length : ''} (toque pra ligar/desligar)</label>
      <div class="chips">${cenChips}</div>
      ${multi ? `<div class="chips" style="margin-top:8px">${modoChips}</div>
      <div class="hint">${m.modo === 'matriz' ? 'cada arte vira 1 vídeo em CADA cenário selecionado' : 'cada arte vira 1 vídeo num cenário sorteado do pool'}</div>` : ''}
      <div class="hint">Aqui a moldura é o quadro de verdade que a pessoa segura — vem do palco, não dá pra trocar na hora.
        ${umCen ? `<button class="linkish" data-dup-cen="${esc(umCen.id)}">criar este palco com outra moldura →</button>` : ''}</div>
    </div>
    <div class="field"><label>Arte${m.artes.length > 1 ? 's' : ''} do quadro ${m.artes.length ? `· ${m.artes.length}` : ''}</label>
      <div class="artes-row">${artesHtml}
        <div class="drop mini" id="drop"><div class="t">${m.artes.length ? '+ mais' : 'subir'}</div></div>
      </div>
      <div class="hint">png · jpg · webp — pode selecionar várias de uma vez (lote de teste A/B)</div>
    </div>
    <div class="field"><label>Movimento</label><div class="chips">${moveChips}</div></div>
    <div class="field"><label>Duração</label><div class="chips">${durChips}</div></div>
    <div class="field"><label>Narração (opcional — vira voz + legenda no vídeo)</label>
      <textarea id="mk-narr" placeholder="ex: Transforme a foto que você ama numa obra de arte de verdade…">${esc(m.narracao)}</textarea>
      <div class="hint">~${m.duracaoAlvo === 15 ? '30-40' : '55-70'} palavras cabem em ${m.duracaoAlvo}s. Vazio = só som ambiente.</div>
    </div>
    <div id="mk-narr-extras" ${temNarr ? '' : 'hidden'}>
      <div class="field"><label>Voz</label><div class="chips">${vozChips}</div></div>
      <div class="field"><label>Legenda queimada</label><div class="chips">${legChips}</div></div>
      ${total > 1 ? `<div class="row"><span class="rl">Variar a copy por vídeo (ganchos diferentes)</span><button class="tg ${m.variar ? 'on' : ''}" id="mk-var"></button></div>
      <div class="hint" style="margin:6px 0 10px">Cada vídeo do lote abre com um ângulo diferente (pergunta, dor, prova…) mantendo sua oferta.</div>` : ''}
    </div>
    <div class="field"><label>Trilha musical</label>
      <div class="chips">${triChips}
        <button class="chip ${m.ytId ? 'on' : ''}" data-yt-abrir="1">▶ do YouTube</button></div>
      ${m.ytId ? `<div class="yt-sel">
        <img src="https://i.ytimg.com/vi/${esc(m.ytId)}/mqdefault.jpg" alt="">
        <div class="yt-info"><b>${esc(m.ytTitulo || m.ytId)}</b>
          <span>começa em <b>${fmtT(m.ytInicio || 0)}</b> · pega ${m.duracaoAlvo}s</span></div>
        <button class="btn sm ghost" data-yt-abrir="1">trocar</button>
      </div>` : ''}
      ${m.ytId && temNarr ? '<div class="hint">a narração continua por cima — a trilha abaixa sozinha quando você fala</div>' : ''}
    </div>
    <div class="row"><span class="rl">Exportar também 4:5 (feed do Meta)</span><button class="tg ${m.fmt45 ? 'on' : ''}" id="mk-45"></button></div>
    ${umCen && umCen.temAbertura ? `<div class="row"><span class="rl">Abrir com reveal do verso</span><button class="tg ${m.abertura ? 'on' : ''}" id="mk-ab"></button></div>` : ''}
    <div class="spacer"></div>
    ${estouro ? `<div class="hint" style="color:var(--red);margin-bottom:8px">Máximo 20 vídeos por lote — reduza artes ou cenários.</div>` : ''}
    ${m.subindo ? `<div class="subindo">subindo artes… <b>${m.subindo.feitas}/${m.subindo.total}</b>
      <div class="bar"><i style="width:${Math.round(m.subindo.feitas / m.subindo.total * 100)}%"></i></div></div>` : ''}
    ${(m.falhas || []).length ? `<div class="falhas">⚠ ${m.falhas.length} arte(s) não subiram:<br>${m.falhas.map((f) => esc(f)).join('<br>')}</div>` : ''}
    <button class="btn" id="mk-go" ${m.artes.length && !estouro && !m.subindo ? '' : 'disabled'}>${
      m.subindo ? `aguarde… ${m.subindo.feitas}/${m.subindo.total}` : `Renderizar ${total > 1 ? total + ' vídeos' : 'mockup'}`}</button>
  `);
  bindFmt();
  app.querySelectorAll('[data-cen]').forEach((b) => b.onclick = () => {
    const id = b.dataset.cen;
    const i = m.cenarioIds.indexOf(id);
    if (i >= 0) { if (m.cenarioIds.length > 1) m.cenarioIds.splice(i, 1); }
    else m.cenarioIds.push(id);
    render();
  });
  // mesmo palco, outra moldura: cai no fluxo de duplicar (a moldura é física,
  // então o palco tem que nascer de novo com ela)
  app.querySelectorAll('[data-dup-cen]').forEach((b) => b.onclick = () => {
    const c = S.cenarios.find((x) => x.id === b.dataset.dupCen);
    if (!c) return;
    S.cn = { ...S.cn, descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
      nome: '', movimento: c.movimento || 'medio', temAbertura: false, duplicarDe: c.id, duplicarNome: c.nome };
    S.screen = 'novo-cenario'; render();
  });
  app.querySelectorAll('[data-modo]').forEach((b) => b.onclick = () => { m.modo = b.dataset.modo; render(); });
  app.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { m.movimento = b.dataset.move; render(); });
  app.querySelectorAll('[data-dur]').forEach((b) => b.onclick = () => { m.duracaoAlvo = +b.dataset.dur; render(); });
  app.querySelectorAll('[data-voz]').forEach((b) => b.onclick = () => { m.voz = b.dataset.voz; render(); });
  app.querySelectorAll('[data-tri]').forEach((b) => b.onclick = () => {
    m.musica = b.dataset.tri; m.ytId = null; m.ytTitulo = '';   // um OU outro
    render();
  });
  app.querySelectorAll('[data-yt-abrir]').forEach((b) => b.onclick = () => { S.screen = 'youtube'; render(); });
  app.querySelectorAll('[data-leg]').forEach((b) => b.onclick = () => { m.legenda = b.dataset.leg; render(); });
  app.querySelectorAll('[data-delarte]').forEach((b) => b.onclick = () => { m.artes.splice(+b.dataset.delarte, 1); render(); });
  // oninput NUNCA re-renderiza: era isso que fechava o teclado do iPhone na
  // primeira letra. Os blocos que dependem da narração já estão no DOM e só
  // aparecem/somem.
  const narr = $('#mk-narr');
  if (narr) narr.oninput = (e) => {
    m.narracao = e.target.value;
    const extras = $('#mk-narr-extras');
    if (extras) extras.hidden = !m.narracao.trim();
  };
  const tvar = $('#mk-var'); if (tvar) tvar.onclick = () => { m.variar = !m.variar; render(); };
  const t45 = $('#mk-45'); if (t45) t45.onclick = () => { m.fmt45 = !m.fmt45; render(); };
  const ab = $('#mk-ab'); if (ab) ab.onclick = () => { m.abertura = !m.abertura; render(); };
  $('#drop').onclick = pickArtes;
  $('#mk-go').onclick = async () => {
    try {
      const r = await api('queue_mockup', { body: {
        cenarioIds: m.cenarioIds,
        modo: multi ? m.modo : 'um',
        arteUrls: m.artes.map((a) => a.url),
        nome: '', movimento: m.movimento, duracaoAlvo: m.duracaoAlvo, abertura: m.abertura,
        audio: { narracao: m.narracao.trim(), voz: m.voz, musica: m.musica, legenda: m.legenda,
          ytId: m.ytId, ytInicio: m.ytInicio, variar: m.variar && total > 1 },
        formatos: m.fmt45 ? ['9:16', '4:5'] : ['9:16'],
      } });
      const n = (r.jobs || []).length;
      m.artes = [];
      S.tab = 'fila'; await refresh();
      toast(n > 1 ? `${n} vídeos na fila 🎬` : 'renderizando — acompanhe na Fila');
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- NOVO MOCKUP · formato ERMOS (quadro flutuante) ----------
function viewNovoErmos(fmtChips, bindFmt) {
  const m = S.mk;
  const prontos = S.fundos.filter((f) => f.status === 'pronto');
  m.fundoIds = m.fundoIds.filter((id) => prontos.find((f) => f.id === id));
  if (!prontos.length) {
    shell(`<h2 class="view-t">Novo mockup</h2>${fmtChips}
      <div class="empty">Nenhum lugar ativado ainda.<br>Vá em <b>Cenários → Ermos</b> e ative um lugar (Marina, Amalfi, Santorini…).</div>
      <button class="btn" id="go-fundos">Ver os lugares</button>`);
    bindFmt();
    $('#go-fundos').onclick = () => { S.tab = 'cenarios'; S.catFiltro = 'ermos'; render(); };
    return;
  }
  if (!m.fundoIds.length) m.fundoIds = [prontos[0].id];
  // TODOS os lugares aparecem aqui, inclusive os que ainda não foram ativados
  // — antes o form só listava os prontos e os novos ficavam invisíveis pra
  // quem não sabia que existia uma biblioteca separada.
  const fundoChips = S.fundos.map((f) => {
    const pronto = f.status === 'pronto';
    const sel = pronto && m.fundoIds.includes(f.id);
    const tag = f.status === 'gerando' ? 'ativando…'
      : f.status === 'erro' ? 'falhou — tocar de novo' : 'tocar pra ativar';
    return `<button class="fnd-card ${sel ? 'on' : ''} ${pronto ? '' : 'off'}" data-fnd="${esc(f.id)}">
      <img src="${esc(f.thumb)}" alt="" loading="lazy">
      <span>${esc(f.nome)}</span>
      ${sel ? '<i class="fnd-ok">✓</i>' : ''}
      ${pronto ? '' : `<i class="fnd-tag">${tag}</i>`}
    </button>`;
  }).join('');
  const moldBtns = MOLDURAS_PRESET
    .map(([id, lb]) => chipMoldura(id, lb, m.moldura2d === id, 'data-m2d')).join('');
  const ritmoChips = [[0.2, '⚡ 0,2s'], [0.3, '0,3s'], [0.5, '0,5s'], [0.8, '0,8s'], [1.2, '🐢 1,2s']]
    .map(([v, lb]) => `<button class="chip ${m.ritmo === v ? 'on' : ''}" data-rit="${v}">${lb}</button>`).join('');
  const durChipsEr = [6, 8, 10, 15].map((v) => `<button class="chip ${m.duracaoErmos === v ? 'on' : ''}" data-durer="${v}">${v}s</button>`).join('');
  const triChips = TRILHAS.map((t) => `<button class="chip ${m.musica === t ? 'on' : ''}" data-tri="${t}">${t}</button>`).join('');
  const artesHtml = m.artes.map((a, i) => `<div class="arte-th"><img src="${esc(a.prev)}" alt="">
    <span class="arte-o">${ORIENT_ICO[a.orient || 'v']}</span>
    <button class="arte-x" data-delarte="${i}">✕</button></div>`).join('');
  const trocas = Math.round(m.duracaoErmos / m.ritmo);
  shell(`
    <h2 class="view-t">Novo mockup</h2>
    ${fmtChips}
    <p class="view-sub">O quadro flutua sobre o lugar e as artes se <b>revezam em loop</b>. ${m.artes.length ? `${m.artes.length} artes · <b>${trocas} trocas</b> em ${m.duracaoErmos}s.` : 'Sem modelo, sem espera de Veo — sai em segundos.'}</p>
    <div class="field"><label>Lugar${m.fundoIds.length > 1 ? 'es · ' + m.fundoIds.length : ''} (2+ = o fundo troca durante o vídeo)</label>
      <div class="fnd-grid">${fundoChips}</div></div>
    <div class="field"><label>Moldura</label><div class="chips">${moldBtns}</div></div>
    <div class="field"><label>Arte${m.artes.length > 1 ? 's' : ''} ${m.artes.length ? `· ${m.artes.length}` : ''} (trocam em sequência)</label>
      <div class="artes-row">${artesHtml}
        <div class="drop mini" id="drop"><div class="t">${m.artes.length ? '+ mais' : 'subir'}</div></div>
        <button class="btn sm ghost" id="da-loja" style="align-self:center">🛍 da loja</button>
      </div>
    </div>
    <div class="field"><label>Velocidade da troca</label><div class="chips">${ritmoChips}</div>
      <div class="hint">tempo que cada arte fica na tela — as artes se revezam do início ao fim</div></div>
    <div class="field"><label>Duração do vídeo</label><div class="chips">${durChipsEr}</div></div>
    <div class="field"><label>Legenda fixa (embaixo)</label>
      <input type="text" id="er-leg" value="${esc(m.legendaErmos)}"></div>
    ${peliculaHtml(m, 'er')}
    <div class="field"><label>Logo no topo</label>
      <div class="chips">
        <button class="chip ${!m.logoUrl && !m.semLogo ? 'on' : ''}" data-logo="padrao">Atelier by Malta (padrão)</button>
        <button class="chip ${m.logoUrl ? 'on' : ''}" data-logo="upload">${m.logoUrl ? '✓ minha logo' : 'subir a minha'}</button>
        <button class="chip ${m.semLogo ? 'on' : ''}" data-logo="nenhuma">sem logo</button>
      </div>
      ${m.logoUrl ? `<div class="logo-prev"><img src="${esc(m.logoUrl)}" alt=""></div>` : ''}
    </div>
    <div class="field"><label>Trilha musical</label>
      <div class="chips">${triChips}
        <button class="chip ${m.ytId ? 'on' : ''}" data-yt-abrir="1">▶ do YouTube</button></div>
      ${m.ytId ? `<div class="yt-sel">
        <img src="https://i.ytimg.com/vi/${esc(m.ytId)}/mqdefault.jpg" alt="">
        <div class="yt-info"><b>${esc(m.ytTitulo || m.ytId)}</b>
          <span>começa em <b>${fmtT(m.ytInicio || 0)}</b> · pega ${m.duracaoErmos}s</span></div>
        <button class="btn sm ghost" data-yt-abrir="1">trocar</button>
      </div>` : ''}
    </div>
    <div class="row"><span class="rl">Exportar também 4:5 (feed do Meta)</span><button class="tg ${m.fmt45 ? 'on' : ''}" id="mk-45"></button></div>
    <div class="spacer"></div>
    ${m.subindo ? `<div class="subindo">subindo artes… <b>${m.subindo.feitas}/${m.subindo.total}</b>
      <div class="bar"><i style="width:${Math.round(m.subindo.feitas / m.subindo.total * 100)}%"></i></div></div>` : ''}
    ${(m.falhas || []).length ? `<div class="falhas">⚠ ${m.falhas.length} arte(s) não subiram:<br>${m.falhas.map((f) => esc(f)).join('<br>')}</div>` : ''}
    <button class="btn" id="er-go" ${m.artes.length && !m.subindo ? '' : 'disabled'}>${
      m.subindo ? `aguarde… ${m.subindo.feitas}/${m.subindo.total}`
      : `Renderizar${m.artes.length ? ` · ${m.artes.length} arte${m.artes.length > 1 ? 's' : ''}` : ''}`}</button>
  `);
  bindFmt();
  app.querySelectorAll('[data-fnd]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.fnd;
    const f = S.fundos.find((x) => x.id === id);
    // lugar ainda não ativado: o toque manda gerar aqui mesmo (é o Veo que
    // faz o vídeo do lugar — uma vez só, depois ele é reusado de graça)
    if (f && f.status !== 'pronto') {
      if (f.status === 'gerando') return toast(`${f.nome} já está sendo gerado`, true);
      try {
        await api('queue_fundo', { body: { id } });
        await refresh();
        toast(`${f.nome}: ativando — leva alguns minutos`);
      } catch (e) { toast(e.message, true); }
      return;
    }
    const i = m.fundoIds.indexOf(id);
    if (i >= 0) { if (m.fundoIds.length > 1) m.fundoIds.splice(i, 1); } else m.fundoIds.push(id);
    render();
  });
  bindPelicula(m, 'er');
  app.querySelectorAll('[data-m2d]').forEach((b) => b.onclick = () => { m.moldura2d = b.dataset.m2d; render(); });
  app.querySelectorAll('[data-rit]').forEach((b) => b.onclick = () => { m.ritmo = +b.dataset.rit; render(); });
  app.querySelectorAll('[data-durer]').forEach((b) => b.onclick = () => { m.duracaoErmos = +b.dataset.durer; render(); });
  app.querySelectorAll('[data-tri]').forEach((b) => b.onclick = () => { m.musica = b.dataset.tri; m.ytId = null; render(); });
  app.querySelectorAll('[data-yt-abrir]').forEach((b) => b.onclick = () => { S.screen = 'youtube'; render(); });
  app.querySelectorAll('[data-delarte]').forEach((b) => b.onclick = () => { m.artes.splice(+b.dataset.delarte, 1); render(); });
  $('#er-leg').oninput = (e) => { m.legendaErmos = e.target.value; };
  $('#drop').onclick = pickArtes;
  $('#da-loja').onclick = () => { S.screen = 'loja'; render(); if (!S.loja.produtos.length) carregaLoja(); };
  app.querySelectorAll('[data-logo]').forEach((b) => b.onclick = () => {
    const op = b.dataset.logo;
    if (op === 'padrao') { m.logoUrl = null; m.semLogo = false; return render(); }
    if (op === 'nenhuma') { m.logoUrl = null; m.semLogo = true; return render(); }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/svg+xml';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { const r = await api('upload_image', { form: fd }); m.logoUrl = r.url; m.semLogo = false; render(); toast('logo carregada ✓'); }
      catch (e) { toast(e.message, true); }
    };
    inp.click();
  });
  const t45 = $('#mk-45'); if (t45) t45.onclick = () => { m.fmt45 = !m.fmt45; render(); };
  $('#er-go').onclick = async () => {
    try {
      await api('queue_ermos', { body: {
        fundoIds: m.fundoIds, moldura: m.moldura2d,
        arteUrls: m.artes.map((a) => a.url),
        artistas: m.artes.map((a) => a.artista || ''),
        ritmo: m.ritmo, duracao: m.duracaoErmos, legenda: m.legendaErmos.trim(),
        pelicula: m.pelicula || 'nenhuma', peliculaOp: m.peliculaOp ?? 0.3,
        logoUrl: m.logoUrl, semLogo: !!m.semLogo, musica: m.musica,
        ytId: m.ytId, ytInicio: m.ytInicio,
        formatos: m.fmt45 ? ['9:16', '4:5'] : ['9:16'], nome: '',
      } });
      m.artes = [];
      S.tab = 'fila'; await refresh();
      toast('criativo Ermos na fila 🖼');
    } catch (e) { toast(e.message, true); }
  };
}

// createImageBitmap já aplica o EXIF (imageOrientation:'from-image'), então
// foto de celular girada não engana a medida
function orientDoArquivo(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' }).then((bm) => {
    const r = bm.width / bm.height; bm.close?.();
    return r > 1.04 ? 'h' : (r < 0.96 ? 'v' : 'q');
  });
}

function pickArtes() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.multiple = true;
  inp.onchange = async () => {
    const livres = 16 - S.mk.artes.length;
    const todos = [...inp.files];
    const files = todos.slice(0, livres);
    if (!files.length) return toast('limite de 16 artes atingido', true);
    if (todos.length > files.length) toast(`só cabem mais ${livres} artes — ${todos.length - files.length} ignoradas`, true);
    // trava o Renderizar enquanto sobe (senão clicar cedo manda só as prontas)
    S.mk.subindo = { feitas: 0, total: files.length };
    S.mk.falhas = [];
    render();
    for (const f of files) {
      S.mk.subindo.feitas += 1;
      // mede ANTES de subir: nada de deitar o que ele mandou em pé, e nada
      // de deixar entrar arte do lado contrário do que já está escolhido
      let o = 'v';
      try { o = await orientDoArquivo(f); } catch { /* ilegível: sobe como em pé */ }
      const t = orientTravada();
      if (t && o !== 'q' && o !== t) {
        S.mk.falhas.push(`${f.name}: é ${ORIENT_NOME[o]}, mas o vídeo já está com obras ${ORIENT_NOME[t]} — é um lado só`);
        render(); continue;
      }
      const fd = new FormData(); fd.append('file', f);
      try {
        const r = await api('upload_image', { form: fd });
        S.mk.artes.push({ url: r.url, prev: URL.createObjectURL(f), orient: o });
      } catch (e) { S.mk.falhas.push(`${f.name}: ${e.message}`); }
      render(); // barra de progresso viva
    }
    const falhas = S.mk.falhas;
    S.mk.subindo = null;
    render();
    if (falhas.length) toast(`${falhas.length} arte(s) recusadas — veja o aviso vermelho`, true);
    else toast(`${files.length} arte${files.length > 1 ? 's' : ''} pronta${files.length > 1 ? 's' : ''} ✓`);
  };
  inp.click();
}

// ---------- FILA ----------
// PELÍCULA: véu sobre o fundo pra legenda ficar legível. Mesmo controle no
// form novo e no refazer — é ajuste de tentativa e erro, tem que dar pra
// mexer sem remontar o criativo.
const PELICULAS = [['nenhuma', 'sem película'], ['preta', '⬛ preta'], ['branca', '⬜ branca']];
function peliculaHtml(o, pre) {
  const cor = o.pelicula || 'nenhuma';
  const op = Math.round((o.peliculaOp ?? 0.3) * 100);
  const chips = PELICULAS.map(([id, lb]) =>
    `<button class="chip ${cor === id ? 'on' : ''}" data-${pre}pel="${id}">${lb}</button>`).join('');
  return `<div class="field"><label>Película no fundo${cor !== 'nenhuma' ? ` · <b>${op}%</b>` : ''}</label>
    <div class="chips">${chips}</div>
    ${cor === 'nenhuma' ? '<div class="hint">um véu de cor só no cenário — a obra e a moldura não mudam</div>'
      : `<input type="range" id="${pre}-pelop" min="5" max="80" step="5" value="${op}">
         <div class="hint">quanto mais alto, mais o cenário some e mais a letra aparece</div>`}
  </div>`;
}
// liga os chips + slider da película num objeto de estado qualquer
function bindPelicula(o, pre, aoAjustar) {
  app.querySelectorAll(`[data-${pre}pel]`).forEach((b) => b.onclick = () => {
    o.pelicula = b.dataset[`${pre}pel`];
    if (o.peliculaOp == null) o.peliculaOp = 0.3;
    render();
  });
  const s = $(`#${pre}-pelop`);
  if (s) s.oninput = (e) => {
    o.peliculaOp = +e.target.value / 100;
    const lb = s.parentElement.querySelector('label b');
    if (lb) lb.textContent = `${e.target.value}%`;   // sem render: não perde o arrasto
    if (aoAjustar) aoAjustar();
  };
}

// REFAZER: o mesmo criativo com outra moldura e/ou outro lugar. Abre já
// marcado no que ele usou — trocar uma coisa é um toque e confirmar.
function refazerHtml(j) {
  const R = S.refazer;
  if (!R || R.id !== j.id) return '';
  const prontos = S.fundos.filter((f) => f.status === 'pronto');
  const molBtns = MOLDURAS_PRESET.map(([id, nome]) =>
    chipMoldura(id, nome, R.moldura === id, 'data-rf-mol')).join('');
  const lugBtns = prontos.map((f) =>
    `<button class="chip ${R.fundoIds.includes(f.id) ? 'on' : ''}" data-rf-fun="${esc(f.id)}">${esc(f.nome)}</button>`).join('');
  const mudou = R.moldura !== R.origMoldura || R.fundoIds.join() !== R.origFundos.join()
    || R.pelicula !== R.origPel || (R.pelicula !== 'nenhuma' && R.peliculaOp !== R.origPelOp);
  return `<div class="refazer">
    <div class="field"><label>Moldura</label><div class="chips">${molBtns}</div></div>
    <div class="field"><label>Lugar${R.fundoIds.length > 1 ? ' (troca durante o vídeo)' : ''}</label>
      <div class="chips">${lugBtns || '<span class="hint">nenhum lugar ativado ainda</span>'}</div></div>
    ${peliculaHtml(R, 'rf')}
    <div class="hint">As mesmas ${(j.snapshot?.arteUrls || []).length} artes, mesmo ritmo, mesma trilha.</div>
    <button class="btn sm" id="rf-go" ${mudou ? '' : 'disabled'}>${mudou ? 'Refazer com estas mudanças' : 'mude a moldura ou o lugar'}</button>
  </div>`;
}

const ROTULO_TIPO = { mockup: 'mockup', ermos: 'ermos', fundo: 'lugar', keyframe: '1 cena', cenario: 'cenário' };

function dur(seg) {
  if (!isFinite(seg) || seg < 0) return '—';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return m ? `${m}min${s ? ` ${s}s` : ''}` : `${s}s`;
}

// Quanto costuma levar um trabalho DESTE tipo? Sai da mediana do que já rodou
// aqui mesmo — estimativa medida, não chute. Sem histórico, não promete nada.
function tempoTipico(tipo) {
  const feitos = S.jobs
    .filter((j) => j.tipo === tipo && j.status === 'done' && j.created_at && j.updated_at)
    .map((j) => j.updated_at - j.created_at)
    .filter((d) => d > 2 && d < 3600)
    .sort((a, b) => a - b);
  return feitos.length >= 3 ? feitos[Math.floor(feitos.length / 2)] : null;
}

function viewFila() {
  const agora = Math.floor(Date.now() / 1000);
  const jobs = S.jobs;
  const ativos = jobs.filter((j) => ['queued', 'claimed', 'running'].includes(j.status));
  const rodando = ativos.filter((j) => j.status !== 'queued');
  // O worker parece parado? Só acusamos se HÁ trabalho esperando e nada se
  // mexeu há mais de 2 minutos — senão fila vazia pareceria worker morto.
  const ultimoToque = Math.max(0, ...jobs.map((j) => j.updated_at || 0));
  const travado = ativos.length > 0 && agora - ultimoToque > 120;

  const naFila = ativos.filter((j) => j.status === 'queued');
  const rows = jobs.map((j) => {
    const running = ['claimed', 'running'].includes(j.status);
    const badge = `<span class="jt ${['mockup', 'ermos'].includes(j.tipo) ? 'mock' : ''}">${ROTULO_TIPO[j.tipo] || j.tipo}</span>`;
    const temVideo = j.status === 'done' && j.video;
    const decorrido = j.created_at ? agora - j.created_at : null;
    const tipico = tempoTipico(j.tipo);

    // linha de tempo: honesta sobre o que sabe e o que não sabe
    let tempo = '';
    if (running) {
      const falta = tipico ? tipico - decorrido : null;
      tempo = `<b>${dur(decorrido)}</b> rodando`
        + (tipico ? ` · ${falta > 15 ? `~${dur(falta)} restando` : 'terminando'}` : '');
    } else if (j.status === 'queued') {
      const pos = naFila.indexOf(j) + 1;
      tempo = `${pos}º da fila${rodando.length ? ' · começa quando o atual terminar' : ''}`;
    } else if (j.status === 'done' && decorrido !== null) {
      tempo = `levou ${dur(j.updated_at - j.created_at)}`;
    }

    // o log ao vivo já chega em todo poll — antes era jogado fora
    const linhas = Array.isArray(j.log) ? j.log : [];
    const ultima = linhas[linhas.length - 1];
    const aberto = S.logAberto === j.id;

    return `<div class="job">
      <div class="jh">${badge}<span class="jn">${esc(j.nome)}</span></div>
      <div class="stage">${esc(j.stage || j.status)}${j.status === 'done' ? ' ✓' : ''}${tempo ? ` <span class="jtime">· ${tempo}</span>` : ''}</div>
      ${j.status !== 'done' && j.status !== 'error' ? `<div class="bar ${running ? 'run' : ''}"><i style="width:${j.pct || 0}%"></i></div>` : ''}
      ${ultima && j.status !== 'done' ? `<button class="jlog ${aberto ? 'on' : ''}" data-log="${esc(j.id)}">
        <span class="jlog-l">${esc(aberto ? 'esconder o detalhe' : ultima.slice(0, 96))}</span>
        <span class="jlog-c">${aberto ? '▲' : `▾ ${linhas.length}`}</span>
      </button>` : ''}
      ${aberto ? `<pre class="jlog-full">${esc(linhas.slice(-14).join('\n'))}</pre>` : ''}
      ${j.error ? `<div class="err">${esc(j.error)}</div>` : ''}
      ${temVideo ? `<div class="jvid">
        <video src="${esc(j.video)}" controls playsinline preload="metadata"></video>
        <div class="gdl">
          <a href="${esc(j.video)}" download>⬇ 9:16</a>
          ${j.video45 ? `<a href="${esc(j.video45)}" download>⬇ 4:5 feed</a>` : ''}
        </div>
      </div>` : ''}
      ${refazerHtml(j)}
      <div class="jactions">
        ${j.tipo === 'ermos' && j.status === 'done' ? `<button class="btn sm ghost" data-refazer="${esc(j.id)}">${S.refazer && S.refazer.id === j.id ? 'fechar' : '↻ Refazer'}</button>` : ''}
        ${j.status === 'error' ? `<button class="btn sm ghost" data-retry="${esc(j.id)}">Tentar de novo</button>` : ''}
        ${['queued', 'claimed', 'running'].includes(j.status) ? `<button class="btn sm ghost" data-cancel="${esc(j.id)}">Cancelar</button>` : ''}
        ${['done', 'error'].includes(j.status) ? `<button class="btn sm danger" data-djob="${esc(j.id)}">Apagar</button>` : ''}
        ${j.tipo === 'cenario' && j.status === 'done' ? `<button class="btn sm" data-goto-cen="1">Ver cenário</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const resumo = ativos.length
    ? `<b>${ativos.length}</b> na fila${rodando.length ? ` · <b>${esc(rodando[0].stage || 'rodando')}</b>` : ''}`
    : 'Nada rodando. O worker no seu Mac processa um por vez.';

  shell(`<h2 class="view-t">Fila</h2>
    <p class="view-sub">${resumo}</p>
    ${travado ? `<div class="aviso">O worker não dá sinal há <b>${dur(agora - ultimoToque)}</b> e tem trabalho esperando.
      Confira se ele está rodando no Mac.</div>` : ''}
    ${jobs.length ? rows : '<div class="empty">Fila vazia — nenhum trabalho ainda.</div>'}`);
  app.querySelectorAll('[data-log]').forEach((b) => b.onclick = () => {
    S.logAberto = S.logAberto === b.dataset.log ? null : b.dataset.log;
    render();
  });
  const act = async (op, id) => { try { await api('job_action', { body: { op, job_id: id } }); await refresh(); } catch (e) { toast(e.message, true); } };
  app.querySelectorAll('[data-retry]').forEach((b) => b.onclick = () => act('retry', b.dataset.retry));
  app.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => act('cancel', b.dataset.cancel));
  app.querySelectorAll('[data-djob]').forEach((b) => b.onclick = () => act('delete', b.dataset.djob));
  app.querySelectorAll('[data-goto-cen]').forEach((b) => b.onclick = () => { S.tab = 'cenarios'; render(); });
  app.querySelectorAll('[data-refazer]').forEach((b) => b.onclick = () => {
    const id = b.dataset.refazer;
    if (S.refazer && S.refazer.id === id) { S.refazer = null; return render(); }
    const j = S.jobs.find((x) => x.id === id);
    const s = j.snapshot || {};
    const pel = s.pelicula || 'nenhuma';
    const pelOp = s.peliculaOp ?? 0.3;
    S.refazer = { id, moldura: s.moldura, fundoIds: [...(s.fundoIds || [])],
      pelicula: pel, peliculaOp: pelOp,
      origMoldura: s.moldura, origFundos: [...(s.fundoIds || [])],
      origPel: pel, origPelOp: pelOp };
    render();
  });
  // arrastar a opacidade não re-renderiza (perderia o arrasto), então o botão
  // precisa ser destravado na mão
  if (S.refazer) bindPelicula(S.refazer, 'rf', () => {
    const g = $('#rf-go');
    if (g) { g.disabled = false; g.textContent = 'Refazer com estas mudanças'; }
  });
  app.querySelectorAll('[data-rf-mol]').forEach((b) => b.onclick = () => { S.refazer.moldura = b.dataset.rfMol; render(); });
  app.querySelectorAll('[data-rf-fun]').forEach((b) => b.onclick = () => {
    const F = S.refazer.fundoIds; const i = F.indexOf(b.dataset.rfFun);
    if (i >= 0) { if (F.length === 1) return toast('deixe ao menos um lugar', true); F.splice(i, 1); }
    else F.push(b.dataset.rfFun);
    render();
  });
  const rf = $('#rf-go');
  if (rf) rf.onclick = async () => {
    const R = S.refazer;
    rf.disabled = true; rf.textContent = 'enfileirando…';
    try {
      const r = await api('requeue_ermos', { body: { id: R.id, moldura: R.moldura, fundoIds: R.fundoIds,
        pelicula: R.pelicula, peliculaOp: R.peliculaOp } });
      S.refazer = null; await refresh();
      toast(`refazendo com ${r.mudou.join(' + ')} ↻`);
    } catch (e) { toast(e.message, true); render(); }
  };
}

// ---------- GALERIA ----------
function viewGaleria() {
  const done = S.jobs.filter((j) => ['mockup', 'ermos'].includes(j.tipo) && j.status === 'done' && j.video);
  const cells = done.map((j) => `<div>
    <video src="${esc(j.video)}" controls playsinline preload="metadata"></video>
    <div class="gcap">${esc(j.nome)}</div>
    <div class="gdl">
      <a href="${esc(j.video)}" download>⬇ 9:16</a>
      ${j.video45 ? `<a href="${esc(j.video45)}" download>⬇ 4:5 feed</a>` : ''}
    </div>
  </div>`).join('');
  shell(`<h2 class="view-t">Galeria</h2><p class="view-sub">Seus mockups prontos — baixa e sobe no Gerenciador de Anúncios.</p>
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
  salvaRascunho();
  if (S.screen === 'novo-cenario') return viewNovoCenario();
  if (S.screen === 'categorias') return viewCategorias();
  if (S.screen === 'molduras') return viewMolduras();
  if (S.screen === 'loja') return viewLoja();
  if (S.screen === 'youtube') return viewYoutube();
  if (S.screen && S.screen.startsWith('aprovar:')) return viewAprovar(S.screen.slice(8));
  ({ cenarios: viewCenarios, novo: viewNovo, fila: viewFila, galeria: viewGaleria, ajustes: viewAjustes }[S.tab] || viewCenarios)();
}

// ---------- DADOS + POLLING ----------
async function refresh() {
  const st = await api('state');
  S.cenarios = st.cenarios || [];
  S.categorias = st.categorias || [];
  S.molduras = st.molduras || [];
  S.fundos = st.fundos || [];
  S.jobs = st.jobs || [];
  if (st.defaults) S.defaults = st.defaults;
  if (st.worker_token) S.workerToken = st.worker_token;
  render();
}

let pollT, lastSig = '';
// A tela está OCUPADA com o usuário? O poll nunca pode repintar por cima de
// alguém digitando (o teclado do iPhone fechava na primeira letra), assistindo
// um vídeo, ou escolhendo o trecho da trilha (o iframe reiniciava a música).
function ocupado() {
  if (S.screen === 'youtube') return true;
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended);
}

function startPoll() {
  clearInterval(pollT);
  pollT = setInterval(async () => {
    try {
      const { jobs } = await api('jobs');
      const sig = jobs.map((j) => `${j.id}:${j.status}:${j.pct}`).join('|');
      if (sig === lastSig) return;
      // se um cenário acabou de ficar pronto, recarrega o state (traz thumbs)
      const st = await api('state');
      S.cenarios = st.cenarios || []; S.jobs = st.jobs || [];
      // o contador da aba Fila é barato e não mexe no miolo: atualiza sempre
      if (app.querySelector('nav.tabs')) pintaNav();
      if (ocupado()) return;        // mantém lastSig: repinta assim que ele soltar
      lastSig = sig;
      render();
    } catch (e) { /* silencioso */ }
  }, 5000);
}

/* ------------------------------------------------------------ RASCUNHO ---
   Sair pro WhatsApp e voltar, ou recarregar sem querer, não pode apagar um
   criativo montado pela metade. Guardamos os dois formulários no aparelho.
   As prévias de upload (blob:) não sobrevivem ao recarregar — caem pra URL
   do servidor, que é permanente.                                          */
const RASCUNHO = 'quadros:rascunho:v1';

function salvaRascunho() {
  try {
    const mk = { ...S.mk, artes: S.mk.artes.map((a) => ({ ...a, prev: a.url })) };
    localStorage.setItem(RASCUNHO, JSON.stringify({ mk, cn: S.cn }));
  } catch (_) { /* aba anônima / cota cheia */ }
}

function carregaRascunho() {
  try {
    const d = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
    if (!d) return;
    if (d.mk) Object.assign(S.mk, d.mk);
    if (d.cn) Object.assign(S.cn, d.cn);
  } catch (_) { /* rascunho corrompido: ignora */ }
}

async function boot() {
  try {
    const me = await api('me');
    S.auth = !!me.auth;
    if (!S.auth) return renderLogin();
    carregaRascunho();
    // a URL manda: recarregar a página cai na MESMA tela, não na home
    Object.assign(S, estadoDeRota(location.hash));
    await refresh();
    startPoll();
  } catch (e) { renderLogin(); }
}

boot();
