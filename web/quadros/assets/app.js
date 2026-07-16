/* ESTÚDIO DE QUADROS — SPA vanilla. Contrato: web/quadros/api.php.
   Fluxo: Cenário (palco, monta 1x) → Mockup (take, troca a arte). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');

const S = {
  auth: false, tab: 'cenarios', screen: null,
  cenarios: [], molduras: [], jobs: [], defaults: { movimento: 'medio', duracaoAlvo: 25 },
  // form do mockup (artes = lote [{url,prev}]; cenarioIds = pool multi-select)
  mk: { cenarioIds: [], artes: [], modo: 'sortear', movimento: 'medio', duracaoAlvo: 25, abertura: false,
    narracao: '', voz: 'pt-BR-Neural2-C', musica: 'nenhuma', legenda: 'caixa', fmt45: false, variar: false },
  // form do cenário (molduraId = da biblioteca; duplicarDe = herda avatar/ambiente)
  cn: { descricao: '', avatarText: '', ambienteText: '', molduraText: '', molduraId: null,
    nome: '', movimento: 'medio', temAbertura: false, duplicarDe: null, duplicarNome: '',
    variacoes: 1, diversificar: 'avatar' },
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
        ${wait ? `<button class="btn sm" data-approve="${esc(c.id)}">Ver / aprovar</button>` : `<button class="btn sm" data-use="${esc(c.id)}">Usar</button><button class="btn sm ghost" data-dup="${esc(c.id)}" title="mesmo palco, outra moldura">⟳ moldura</button>`}
        <button class="btn sm danger" data-del="${esc(c.id)}">✕</button>
      </div>
    </div>`;
  }).join('');
  shell(`
    <h2 class="view-t">Cenários</h2>
    <p class="view-sub">O palco: modelo + ambiente + moldura. Monta uma vez, reusa sempre.</p>
    <div class="btnrow">
      <button class="btn" id="new-cen">+ Novo cenário</button>
      <button class="btn ghost" id="go-mold">🖼 Molduras${S.molduras.length ? ` (${S.molduras.length})` : ''}</button>
    </div>
    <div class="spacer"></div>
    ${S.cenarios.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Nenhum cenário ainda.<br>Crie o primeiro palco acima.</div>'}
  `);
  $('#new-cen').onclick = () => { S.cn.duplicarDe = null; S.cn.duplicarNome = ''; S.screen = 'novo-cenario'; render(); };
  $('#go-mold').onclick = () => { S.screen = 'molduras'; render(); };
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
        variacoes: 1, diversificar: 'avatar' };
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
  const aprovados = S.cenarios.filter((c) => c.status === 'aprovado');
  if (!aprovados.length) {
    return shell(`<h2 class="view-t">Novo mockup</h2><div class="empty">Você precisa de um cenário aprovado primeiro.<br>Vá em Cenários e crie um palco.</div>`);
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
  if (S.screen === 'molduras') return viewMolduras();
  if (S.screen && S.screen.startsWith('aprovar:')) return viewAprovar(S.screen.slice(8));
  ({ cenarios: viewCenarios, novo: viewNovo, fila: viewFila, galeria: viewGaleria, ajustes: viewAjustes }[S.tab] || viewCenarios)();
}

// ---------- DADOS + POLLING ----------
async function refresh() {
  const st = await api('state');
  S.cenarios = st.cenarios || [];
  S.molduras = st.molduras || [];
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
