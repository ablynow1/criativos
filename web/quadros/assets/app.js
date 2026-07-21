/* ESTÚDIO DE QUADROS — SPA vanilla. Contrato: web/quadros/api.php.
   Fluxo: Cenário (palco, monta 1x) → Mockup (take, troca a arte). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');

const S = {
  auth: false, tab: 'cenarios', screen: null, catFiltro: null, // null = home (pastas)
  cenarios: [], categorias: [], molduras: [], fundos: [], jobs: [], defaults: { movimento: 'medio', duracaoAlvo: 25 },
  loja: { produtos: [], page: 1, paginas: 1, total: 0, busca: '', artista: '', artistas: [], carregando: false },
  // form do mockup (artes = lote [{url,prev}]; cenarioIds = pool multi-select)
  mk: { formato: 'ugc', cenarioIds: [], artes: [], modo: 'sortear', movimento: 'medio', duracaoAlvo: 25, abertura: false,
    narracao: '', voz: 'pt-BR-Neural2-C', musica: 'nenhuma', legenda: 'caixa', fmt45: false, variar: false,
    // ermos
    fundoIds: [], moldura2d: 'preto', ritmo: 0.3, duracaoErmos: 8,
    legendaErmos: 'TODAS AS OBRAS JÁ DISPONÍVEIS EM NOSSO SITE', logoUrl: null },
  // form do cenário (molduraId = da biblioteca; duplicarDe = herda avatar/ambiente)
  cn: { descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
    nome: '', movimento: 'medio', temAbertura: false, duplicarDe: null, duplicarNome: '',
    variacoes: 1, diversificar: 'avatar', categoria: 'ugc' },
};

const VOZES = [
  { id: 'pt-BR-Neural2-C', label: 'Feminina' },
  { id: 'pt-BR-Wavenet-B', label: 'Masculina' },
];
const TRILHAS = ['nenhuma', 'emocional', 'energetica', 'epica', 'suave', 'misteriosa'];
const LEGENDAS = [['nenhuma', 'Sem legenda'], ['caixa', 'Caixa preta'], ['contorno', 'Contorno']];

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
  const emHome = S.tab === 'cenarios' && !S.screen && !S.catFiltro;
  const tab = (id, label) => `<button class="${S.tab === id && !S.screen ? 'on' : ''}" data-tab="${id}">${IC[id]}<span>${label}</span></button>`;
  app.innerHTML = `
    <header class="top">${emHome ? '' : '<button class="top-back" id="top-home">‹ home</button>'}<span class="mk">Quadros</span><span class="sp"></span></header>
    <main>${inner}</main>
    <nav class="tabs">
      ${tab('cenarios', 'Início')}${tab('novo', 'Novo')}${tab('fila', 'Fila')}${tab('galeria', 'Galeria')}${tab('ajustes', 'Ajustes')}
    </nav>`;
  app.querySelectorAll('nav.tabs button').forEach((b) => {
    b.onclick = () => {
      S.tab = b.dataset.tab; S.screen = null;
      if (b.dataset.tab === 'cenarios') S.catFiltro = null; // Início = home das pastas
      render();
    };
  });
  const hb = $('#top-home');
  if (hb) hb.onclick = () => { S.tab = 'cenarios'; S.screen = null; S.catFiltro = null; render(); };
}

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

// ---------- LOJA (picker de artes do catálogo Shopify) ----------
function viewLoja() {
  const L = S.loja;
  const sel = new Set(S.mk.artes.map((a) => a.url));
  const cells = L.produtos.map((p, i) => `
    <div class="loja-item ${sel.has(p.img) ? 'sel' : ''}" data-lp="${i}">
      <img src="${esc(p.img)}" alt="" loading="lazy">
      <div class="lt">${esc(p.titulo.slice(0, 40))}${p.artista ? `<span class="la">${esc(p.artista)}</span>` : ''}</div>
      ${sel.has(p.img) ? '<div class="lcheck">✓</div>' : ''}
    </div>`).join('');
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
    <p class="view-sub">Atelier Malta · ${L.total} obra${L.total === 1 ? '' : 's'}${L.artista ? ` de <b>${esc(L.artista)}</b>` : ''}${L.busca ? ` com “${esc(L.busca)}”` : ''}. ${S.mk.artes.length ? `<b>${S.mk.artes.length} selecionada${S.mk.artes.length > 1 ? 's' : ''}</b>.` : 'Toque pra selecionar.'}</p>
    <div class="field"><input type="text" id="lj-q" placeholder="buscar por obra ou artista…" value="${esc(L.busca)}"></div>
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
  const pv = $('#lj-prev'); if (pv) pv.onclick = () => { if (L.page > 1) { L.page -= 1; carregaLoja(); } };
  const nx = $('#lj-next'); if (nx) nx.onclick = () => { if (L.page < L.paginas) { L.page += 1; carregaLoja(); } };
  $('#lj-ok').onclick = () => { S.screen = null; S.tab = 'novo'; render(); };
  app.querySelectorAll('[data-lp]').forEach((el) => el.onclick = () => {
    const p = L.produtos[+el.dataset.lp];
    const i = S.mk.artes.findIndex((a) => a.url === p.img);
    if (i >= 0) S.mk.artes.splice(i, 1);
    else if (S.mk.artes.length < 16) S.mk.artes.push({ url: p.img, prev: p.img });
    else return toast('máximo 16 artes', true);
    render();
  });
}

async function carregaLoja() {
  S.loja.carregando = true; render();
  try {
    const r = await api(`loja_produtos&page=${S.loja.page}&q=${encodeURIComponent(S.loja.busca)}&artista=${encodeURIComponent(S.loja.artista)}`);
    S.loja.produtos = r.produtos || [];
    S.loja.paginas = r.paginas || 1;
    S.loja.total = r.total || 0;
    if (r.artistas) S.loja.artistas = r.artistas;
  } catch (e) { toast(e.message, true); }
  S.loja.carregando = false; render();
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
      <div class="chips" style="margin-bottom:8px">${moldChips}</div>
      ${c.molduraId
        ? `<div class="hint">A foto da biblioteca entra como referência — a moldura sai idêntica à real.</div>`
        : `<input type="text" id="f-mo" placeholder="ex: preta fina fosca, dourada ornamentada, madeira clara" value="${esc(c.molduraText)}">`}
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
  app.querySelectorAll('[data-varn]').forEach((b) => b.onclick = () => { c.variacoes = +b.dataset.varn; render(); });
  app.querySelectorAll('[data-divr]').forEach((b) => b.onclick = () => { c.diversificar = b.dataset.divr; render(); });
  $('#go-mold2').onclick = (e) => { e.preventDefault(); S.screen = 'molduras'; render(); };
  const ab = $('#f-ab'); if (ab) ab.onclick = () => { c.temAbertura = !c.temAbertura; render(); };
  $('#cen-back').onclick = () => { S.screen = null; render(); };
  $('#cen-go').onclick = async () => {
    if (!dup && !c.descricao.trim() && (!c.avatarText.trim() || !c.ambienteText.trim())) return toast('descreva ao menos avatar e ambiente', true);
    if (dup && !c.molduraId && !c.molduraText.trim()) return toast('escolha a moldura nova', true);
    try {
      const moldNome = c.molduraId ? (S.molduras.find((m) => m.id === c.molduraId)?.nome || '') : c.molduraText;
      const nome = dup
        ? `${c.duplicarNome.split('·')[0].trim()} · ${moldNome.slice(0, 18)}`
        : (c.nome || (c.ambienteText || c.descricao).slice(0, 30));
      await api('queue_cenario', { body: { ...c, nome, variacoes: dup ? 1 : c.variacoes } });
      const nPalcos = dup ? 1 : c.variacoes;
      S.cn = { descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
        nome: '', movimento: 'medio', temAbertura: false, duplicarDe: null, duplicarNome: '',
        variacoes: 1, diversificar: 'avatar', categoria: c.categoria };
      S.screen = null; S.tab = 'fila'; await refresh();
      toast(nPalcos > 1 ? `gerando ${nPalcos} palcos — acompanhe na Fila` : 'gerando o palco — acompanhe na Fila');
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
  const cenChips = aprovados.map((c) => `<button class="chip ${m.cenarioIds.includes(c.id) ? 'on' : ''}" data-cen="${esc(c.id)}">${esc(c.nome)}</button>`).join('');
  const modoChips = [['sortear', '🎲 sortear (1 vídeo/arte, cenário aleatório)'], ['matriz', '⚡ matriz (todas × todos)']]
    .map(([id, lb]) => `<button class="chip ${m.modo === id ? 'on' : ''}" data-modo="${id}">${lb}</button>`).join('');
  const moveChips = ['calmo', 'medio', 'dinamico'].map((x) => `<button class="chip ${m.movimento === x ? 'on' : ''}" data-move="${x}">${x}</button>`).join('');
  const durChips = [15, 25, 30].map((x) => `<button class="chip ${m.duracaoAlvo === x ? 'on' : ''}" data-dur="${x}">${x}s</button>`).join('');
  const vozChips = VOZES.map((v) => `<button class="chip ${m.voz === v.id ? 'on' : ''}" data-voz="${v.id}">${v.label}</button>`).join('');
  const triChips = TRILHAS.map((t) => `<button class="chip ${m.musica === t ? 'on' : ''}" data-tri="${t}">${t}</button>`).join('');
  const legChips = LEGENDAS.map(([id, lb]) => `<button class="chip ${m.legenda === id ? 'on' : ''}" data-leg="${id}">${lb}</button>`).join('');
  const artesHtml = m.artes.map((a, i) => `<div class="arte-th"><img src="${esc(a.prev)}" alt=""><button class="arte-x" data-delarte="${i}">✕</button></div>`).join('');
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
    ${temNarr ? `<div class="field"><label>Voz</label><div class="chips">${vozChips}</div></div>
    <div class="field"><label>Legenda queimada</label><div class="chips">${legChips}</div></div>
    ${total > 1 ? `<div class="row"><span class="rl">Variar a copy por vídeo (ganchos diferentes)</span><button class="tg ${m.variar ? 'on' : ''}" id="mk-var"></button></div>
    <div class="hint" style="margin:6px 0 10px">Cada vídeo do lote abre com um ângulo diferente (pergunta, dor, prova…) mantendo sua oferta.</div>` : ''}` : ''}
    <div class="field"><label>Trilha musical</label><div class="chips">${triChips}</div></div>
    <div class="row"><span class="rl">Exportar também 4:5 (feed do Meta)</span><button class="tg ${m.fmt45 ? 'on' : ''}" id="mk-45"></button></div>
    ${umCen && umCen.temAbertura ? `<div class="row"><span class="rl">Abrir com reveal do verso</span><button class="tg ${m.abertura ? 'on' : ''}" id="mk-ab"></button></div>` : ''}
    <div class="spacer"></div>
    ${estouro ? `<div class="hint" style="color:var(--red);margin-bottom:8px">Máximo 20 vídeos por lote — reduza artes ou cenários.</div>` : ''}
    <button class="btn" id="mk-go" ${m.artes.length && !estouro ? '' : 'disabled'}>Renderizar ${total > 1 ? total + ' vídeos' : 'mockup'}</button>
  `);
  bindFmt();
  app.querySelectorAll('[data-cen]').forEach((b) => b.onclick = () => {
    const id = b.dataset.cen;
    const i = m.cenarioIds.indexOf(id);
    if (i >= 0) { if (m.cenarioIds.length > 1) m.cenarioIds.splice(i, 1); }
    else m.cenarioIds.push(id);
    render();
  });
  app.querySelectorAll('[data-modo]').forEach((b) => b.onclick = () => { m.modo = b.dataset.modo; render(); });
  app.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { m.movimento = b.dataset.move; render(); });
  app.querySelectorAll('[data-dur]').forEach((b) => b.onclick = () => { m.duracaoAlvo = +b.dataset.dur; render(); });
  app.querySelectorAll('[data-voz]').forEach((b) => b.onclick = () => { m.voz = b.dataset.voz; render(); });
  app.querySelectorAll('[data-tri]').forEach((b) => b.onclick = () => { m.musica = b.dataset.tri; render(); });
  app.querySelectorAll('[data-leg]').forEach((b) => b.onclick = () => { m.legenda = b.dataset.leg; render(); });
  app.querySelectorAll('[data-delarte]').forEach((b) => b.onclick = () => { m.artes.splice(+b.dataset.delarte, 1); render(); });
  const narr = $('#mk-narr'); if (narr) narr.oninput = (e) => { const was = temNarr; m.narracao = e.target.value; if (was !== !!m.narracao.trim()) render(); };
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
        audio: { narracao: m.narracao.trim(), voz: m.voz, musica: m.musica, legenda: m.legenda, variar: m.variar && total > 1 },
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
  const fundoChips = prontos.map((f) => `<button class="chip ${m.fundoIds.includes(f.id) ? 'on' : ''}" data-fnd="${esc(f.id)}">${esc(f.nome)}</button>`).join('');
  const moldBtns = [['preto', '⬛ Preto'], ['branco', '⬜ Branco'], ['marfim', '🟨 Marfim'], ['arabesco', '👑 Arabesco']]
    .map(([id, lb]) => `<button class="chip ${m.moldura2d === id ? 'on' : ''}" data-m2d="${id}">${lb}</button>`).join('');
  const ritmoChips = [[0.2, '⚡ 0,2s'], [0.3, '0,3s'], [0.5, '0,5s'], [0.8, '0,8s'], [1.2, '🐢 1,2s']]
    .map(([v, lb]) => `<button class="chip ${m.ritmo === v ? 'on' : ''}" data-rit="${v}">${lb}</button>`).join('');
  const durChipsEr = [6, 8, 10, 15].map((v) => `<button class="chip ${m.duracaoErmos === v ? 'on' : ''}" data-durer="${v}">${v}s</button>`).join('');
  const triChips = TRILHAS.map((t) => `<button class="chip ${m.musica === t ? 'on' : ''}" data-tri="${t}">${t}</button>`).join('');
  const artesHtml = m.artes.map((a, i) => `<div class="arte-th"><img src="${esc(a.prev)}" alt=""><button class="arte-x" data-delarte="${i}">✕</button></div>`).join('');
  const trocas = Math.round(m.duracaoErmos / m.ritmo);
  shell(`
    <h2 class="view-t">Novo mockup</h2>
    ${fmtChips}
    <p class="view-sub">O quadro flutua sobre o lugar e as artes se <b>revezam em loop</b>. ${m.artes.length ? `${m.artes.length} artes · <b>${trocas} trocas</b> em ${m.duracaoErmos}s.` : 'Sem modelo, sem espera de Veo — sai em segundos.'}</p>
    <div class="field"><label>Lugar${m.fundoIds.length > 1 ? 'es · ' + m.fundoIds.length : ''} (2+ = o fundo troca durante o vídeo)</label>
      <div class="chips">${fundoChips}</div></div>
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
    <div class="field"><label>Logo no topo (opcional)</label>
      <div class="btnrow"><button class="btn sm ghost" id="er-logo">${m.logoUrl ? '✓ logo carregado · trocar' : 'subir logo (png)'}</button>
      ${m.logoUrl ? '<button class="btn sm danger" id="er-logo-x">✕</button>' : ''}</div></div>
    <div class="field"><label>Trilha musical</label><div class="chips">${triChips}</div></div>
    <div class="row"><span class="rl">Exportar também 4:5 (feed do Meta)</span><button class="tg ${m.fmt45 ? 'on' : ''}" id="mk-45"></button></div>
    <div class="spacer"></div>
    <button class="btn" id="er-go" ${m.artes.length ? '' : 'disabled'}>Renderizar criativo Ermos</button>
  `);
  bindFmt();
  app.querySelectorAll('[data-fnd]').forEach((b) => b.onclick = () => {
    const id = b.dataset.fnd; const i = m.fundoIds.indexOf(id);
    if (i >= 0) { if (m.fundoIds.length > 1) m.fundoIds.splice(i, 1); } else m.fundoIds.push(id);
    render();
  });
  app.querySelectorAll('[data-m2d]').forEach((b) => b.onclick = () => { m.moldura2d = b.dataset.m2d; render(); });
  app.querySelectorAll('[data-rit]').forEach((b) => b.onclick = () => { m.ritmo = +b.dataset.rit; render(); });
  app.querySelectorAll('[data-durer]').forEach((b) => b.onclick = () => { m.duracaoErmos = +b.dataset.durer; render(); });
  app.querySelectorAll('[data-tri]').forEach((b) => b.onclick = () => { m.musica = b.dataset.tri; render(); });
  app.querySelectorAll('[data-delarte]').forEach((b) => b.onclick = () => { m.artes.splice(+b.dataset.delarte, 1); render(); });
  $('#er-leg').oninput = (e) => { m.legendaErmos = e.target.value; };
  $('#drop').onclick = pickArtes;
  $('#da-loja').onclick = () => { S.screen = 'loja'; render(); if (!S.loja.produtos.length) carregaLoja(); };
  $('#er-logo').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { const r = await api('upload_image', { form: fd }); m.logoUrl = r.url; render(); toast('logo ok'); }
      catch (e) { toast(e.message, true); }
    };
    inp.click();
  };
  const lx = $('#er-logo-x'); if (lx) lx.onclick = () => { m.logoUrl = null; render(); };
  const t45 = $('#mk-45'); if (t45) t45.onclick = () => { m.fmt45 = !m.fmt45; render(); };
  $('#er-go').onclick = async () => {
    try {
      await api('queue_ermos', { body: {
        fundoIds: m.fundoIds, moldura: m.moldura2d,
        arteUrls: m.artes.map((a) => a.url),
        ritmo: m.ritmo, duracao: m.duracaoErmos, legenda: m.legendaErmos.trim(),
        logoUrl: m.logoUrl, musica: m.musica,
        formatos: m.fmt45 ? ['9:16', '4:5'] : ['9:16'], nome: '',
      } });
      m.artes = [];
      S.tab = 'fila'; await refresh();
      toast('criativo Ermos na fila 🖼');
    } catch (e) { toast(e.message, true); }
  };
}

function pickArtes() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.multiple = true;
  inp.onchange = async () => {
    const files = [...inp.files].slice(0, 10 - S.mk.artes.length);
    if (!files.length) return;
    toast(`subindo ${files.length} arte${files.length > 1 ? 's' : ''}…`);
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f);
      try {
        const r = await api('upload_image', { form: fd });
        S.mk.artes.push({ url: r.url, prev: URL.createObjectURL(f) });
      } catch (e) { toast(`${f.name}: ${e.message}`, true); }
    }
    render();
  };
  inp.click();
}

// ---------- FILA ----------
function viewFila() {
  const jobs = S.jobs;
  const rows = jobs.map((j) => {
    const running = ['claimed', 'running'].includes(j.status);
    const badge = j.tipo === 'mockup' ? '<span class="jt mock">mockup</span>'
      : j.tipo === 'ermos' ? '<span class="jt mock">ermos</span>'
      : j.tipo === 'fundo' ? '<span class="jt">lugar</span>'
      : '<span class="jt">cenário</span>';
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
  if (S.screen === 'novo-cenario') return viewNovoCenario();
  if (S.screen === 'categorias') return viewCategorias();
  if (S.screen === 'molduras') return viewMolduras();
  if (S.screen === 'loja') return viewLoja();
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
