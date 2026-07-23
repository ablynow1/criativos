<?php
// ESTÚDIO DE QUADROS — API (web enfileira, worker no Mac renderiza).
// App irmão do Cricri: mesmo padrão (JSON em disco, sem banco; sessão humana +
// token de worker). Namespace próprio em /criativos/quadros — não colide com o
// modo "quadro" do Cricri. Ver MOCKUP-NATIVO.md.

declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
ini_set('display_errors', '0'); // warning impresso corrompe o JSON da resposta
header('Content-Type: application/json; charset=utf-8');

define('DATA', __DIR__ . '/data');
define('MEDIA', __DIR__ . '/media');
define('UPLOADS', MEDIA . '/up');
define('CENMEDIA', MEDIA . '/cenarios');

foreach ([DATA, MEDIA, UPLOADS, CENMEDIA] as $d) {
    if (!is_dir($d)) @mkdir($d, 0775, true);
}
// data/ nunca é servido direto
$ht = DATA . '/.htaccess';
if (!file_exists($ht)) @file_put_contents($ht, "Require all denied\n");

session_set_cookie_params(['lifetime' => 2592000, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_name('quadros_sid');
session_start();

function jread(string $name, $default) {
    $p = DATA . "/$name.json";
    if (!file_exists($p)) return $default;
    $d = json_decode((string)file_get_contents($p), true);
    return $d === null ? $default : $d;
}
function jwrite(string $name, $data): void {
    file_put_contents(DATA . "/$name.json", json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
}
function rid(string $prefix = ''): string { return $prefix . bin2hex(random_bytes(6)); }
function now(): int { return time(); }
function out($data): void { echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail(string $msg, int $code = 400): void { http_response_code($code); out(['ok' => false, 'error' => $msg]); }

// ---- config (senha + token do worker) ----
function seed_config(): array {
    $cfg = jread('config', null);
    if ($cfg === null) {
        $cfg = [
            'password_hash' => password_hash('cricri123', PASSWORD_DEFAULT),
            'worker_token' => bin2hex(random_bytes(20)),
            'defaults' => ['movimento' => 'medio', 'duracaoAlvo' => 25],
        ];
        jwrite('config', $cfg);
    }
    return $cfg;
}
$CONFIG = seed_config();

// ---- categorias de cenário (organização do acervo) ----
// UGC = o formato original (modelo apresentando o quadro numa loja/galeria).
// Ermos/POV entram vazias pra receber cenários com outra linguagem.
function seed_categorias(): array {
    $cats = jread('categorias', null);
    if ($cats === null) {
        $cats = [
            ['id' => 'ugc', 'nome' => 'UGC'],
            ['id' => 'ermos', 'nome' => 'Ermos'],
            ['id' => 'pov', 'nome' => 'POV'],
        ];
        jwrite('categorias', $cats);
        // migra o acervo existente pro UGC (tudo que veio antes é UGC)
        $cenarios = jread('cenarios', []);
        $mudou = false;
        foreach ($cenarios as &$c) {
            if (empty($c['categoria'])) { $c['categoria'] = 'ugc'; $mudou = true; }
        }
        unset($c);
        if ($mudou) jwrite('cenarios', $cenarios);
    }
    return $cats;
}
$CATEGORIAS = seed_categorias();

function require_login(): void {
    if (empty($_SESSION['quadros_auth'])) fail('não autenticado', 401);
}
function require_worker(): void {
    global $CONFIG;
    $tok = $_SERVER['HTTP_X_QUADROS_TOKEN'] ?? '';
    if (!hash_equals($CONFIG['worker_token'], $tok)) fail('token inválido', 403);
}
function require_csrf(): void {
    if (($_SERVER['HTTP_X_QUADROS'] ?? '') !== '1') fail('csrf', 403);
}
function body(): array {
    $raw = file_get_contents('php://input');
    $d = json_decode((string)$raw, true);
    return is_array($d) ? $d : [];
}

$action = $_GET['action'] ?? '';

// ============ AUTENTICAÇÃO ============
if ($action === 'login') {
    $b = body();
    if (!password_verify($b['password'] ?? '', $CONFIG['password_hash'])) fail('senha incorreta', 401);
    $_SESSION['quadros_auth'] = true;
    out(['ok' => true]);
}
if ($action === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }
if ($action === 'me') { out(['ok' => true, 'auth' => !empty($_SESSION['quadros_auth'])]); }

// ============ ESTADO INICIAL ============
if ($action === 'state') {
    require_login();
    out([
        'ok' => true,
        'cenarios' => jread('cenarios', []),
        'categorias' => jread('categorias', []),
        'molduras' => jread('molduras', []),
        'fundos' => fundos_com_status(),
        'jobs' => jread('jobs', []),
        'defaults' => $CONFIG['defaults'],
        'worker_token' => $CONFIG['worker_token'], // logado é confiável (igual Cricri)
    ]);
}

// ============ FUNDOS (modo ERMOS) ============
// A lista de lugares vem do manifest estático (deployado com o app); o estado
// de ativação (disponivel|gerando|pronto|erro) vive em data/fundos.json.
function fundos_com_status(): array {
    $manifest = json_decode((string)@file_get_contents(__DIR__ . '/assets/fundos/manifest.json'), true) ?: [];
    $status = jread('fundos', []);
    foreach ($manifest as &$f) {
        $f['thumb'] = 'assets/fundos/' . $f['id'] . '.jpg';
        $f['status'] = $status[$f['id']]['status'] ?? 'disponivel';
    }
    unset($f);
    return $manifest;
}
if ($action === 'queue_fundo') {
    require_login(); require_csrf();
    $b = body();
    $fid = $b['id'] ?? '';
    $manifest = fundos_com_status();
    $preset = null;
    foreach ($manifest as $f) if ($f['id'] === $fid) $preset = $f;
    if (!$preset) fail('lugar desconhecido');
    if (in_array($preset['status'], ['gerando', 'pronto'])) fail('esse lugar já está ' . $preset['status']);
    $status = jread('fundos', []);
    $status[$fid] = ['status' => 'gerando', 'updated_at' => now()];
    jwrite('fundos', $status);
    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'), 'tipo' => 'fundo',
        'nome' => 'Fundo · ' . $preset['nome'],
        'snapshot' => ['tipo' => 'fundo', 'fundoId' => $fid],
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'video' => null, 'error' => null, 'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
}
if ($action === 'queue_ermos') {
    require_login(); require_csrf();
    $b = body();
    $fundoIds = array_values(array_filter($b['fundoIds'] ?? []));
    if (!$fundoIds) fail('escolha ao menos um lugar pronto');
    $prontos = [];
    foreach (fundos_com_status() as $f) if ($f['status'] === 'pronto') $prontos[] = $f['id'];
    foreach ($fundoIds as $fid) if (!in_array($fid, $prontos, true)) fail("o lugar $fid ainda não está pronto");
    $artes = array_values(array_filter($b['arteUrls'] ?? []));
    if (!$artes) fail('escolha as artes (upload ou da loja)');
    if (count($artes) > 16) fail('máximo 16 artes por vídeo');
    if (!in_array($b['moldura'] ?? '', ['preto', 'branco', 'marfim', 'arabesco'])) fail('escolha a moldura');
    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'), 'tipo' => 'ermos',
        'nome' => ($b['nome'] ?? '') ?: ('Ermos · ' . $b['moldura'] . ' · ' . count($artes) . ' artes'),
        'snapshot' => [
            'tipo' => 'ermos', 'fundoIds' => $fundoIds,
            'moldura' => $b['moldura'], 'arteUrls' => $artes,
            // nome do artista de cada arte, na mesma ordem (vazio = sem crédito)
            'artistas' => array_map(fn($i) => mb_substr(trim((string)(($b['artistas'][$i] ?? ''))), 0, 42),
                                    array_keys($artes)),
            'ritmo' => max(0.15, min(2, (float)($b['ritmo'] ?? 0.3))),
            'duracao' => max(5, min(20, (int)($b['duracao'] ?? 8))),
            'legenda' => trim($b['legenda'] ?? ''),
            // véu sobre o fundo pra legenda ficar legível
            'pelicula' => in_array($b['pelicula'] ?? '', ['preta', 'branca'], true) ? $b['pelicula'] : 'nenhuma',
            'peliculaOp' => max(0.0, min(0.9, (float)($b['peliculaOp'] ?? 0.3))),
            'logoUrl' => $b['logoUrl'] ?? null,
            'semLogo' => !empty($b['semLogo']),
            'musica' => $b['musica'] ?? 'nenhuma',
            'ytId' => preg_match('/^[\w-]{11}$/', $b['ytId'] ?? '') ? $b['ytId'] : null,
            // o título é só pra UI (o painel de refazer mostra qual música é —
            // sem ele apareceria o ID cru do YouTube)
            'ytTitulo' => mb_substr(trim((string)($b['ytTitulo'] ?? '')), 0, 120),
            'ytInicio' => max(0, (int)($b['ytInicio'] ?? 0)),
            'formatos' => (!empty($b['formatos']) && is_array($b['formatos'])) ? $b['formatos'] : ['9:16'],
        ],
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'video' => null, 'video45' => null, 'error' => null,
        'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
}

// REFAZER: clona um Ermos pronto trocando SÓ a moldura e/ou os lugares. Tudo
// o mais (artes, ritmo, duração, trilha, legenda, logo) vem do original — a
// graça é comparar variações do mesmo criativo sem remontar nada na mão.
if ($action === 'requeue_ermos') {
    require_login(); require_csrf();
    $b = body();
    $jobs = jread('jobs', []);
    $orig = null;
    foreach ($jobs as $j) if ($j['id'] === ($b['id'] ?? '')) { $orig = $j; break; }
    if (!$orig || ($orig['snapshot']['tipo'] ?? '') !== 'ermos') fail('criativo Ermos não encontrado');
    $snap = $orig['snapshot'];
    $mudou = [];

    $moldura = $b['moldura'] ?? '';
    if ($moldura !== '' && $moldura !== ($snap['moldura'] ?? '')) {
        if (!in_array($moldura, ['preto', 'branco', 'marfim', 'arabesco'], true)) fail('moldura inválida');
        $snap['moldura'] = $moldura;
        $mudou[] = 'moldura ' . $moldura;
    }
    // trilha: YouTube OU mood gerado, nunca os dois
    if (array_key_exists('musica', $b) || array_key_exists('ytId', $b)) {
        $yt = preg_match('/^[\w-]{11}$/', (string)($b['ytId'] ?? '')) ? $b['ytId'] : null;
        $mus = $yt ? 'nenhuma' : (string)($b['musica'] ?? 'nenhuma');
        $ini = max(0, (int)($b['ytInicio'] ?? 0));
        $antesYt = $snap['ytId'] ?? null;
        if ($yt !== $antesYt || $mus !== ($snap['musica'] ?? 'nenhuma')
            || ($yt && $ini !== (int)($snap['ytInicio'] ?? 0))) {
            $snap['ytId'] = $yt;
            $snap['ytTitulo'] = $yt ? mb_substr(trim((string)($b['ytTitulo'] ?? '')), 0, 120) : '';
            $snap['ytInicio'] = $ini;
            $snap['musica'] = $mus;
            $mudou[] = $yt ? 'trilha do YouTube' : ($mus === 'nenhuma' ? 'sem trilha' : "trilha $mus");
        }
    }
    if (array_key_exists('pelicula', $b)) {
        $pel = in_array($b['pelicula'], ['preta', 'branca'], true) ? $b['pelicula'] : 'nenhuma';
        $op = max(0.0, min(0.9, (float)($b['peliculaOp'] ?? 0.3)));
        if ($pel !== ($snap['pelicula'] ?? 'nenhuma')
            || ($pel !== 'nenhuma' && abs($op - (float)($snap['peliculaOp'] ?? 0.3)) > 0.001)) {
            $snap['pelicula'] = $pel;
            $snap['peliculaOp'] = $op;
            $mudou[] = $pel === 'nenhuma' ? 'sem película' : "película $pel " . round($op * 100) . '%';
        }
    }
    if (!empty($b['fundoIds']) && is_array($b['fundoIds'])) {
        $novos = array_values(array_filter($b['fundoIds']));
        $prontos = [];
        foreach (fundos_com_status() as $f) if ($f['status'] === 'pronto') $prontos[$f['id']] = $f['nome'];
        foreach ($novos as $fid) if (!isset($prontos[$fid])) fail("o lugar $fid ainda não está pronto");
        if ($novos && $novos !== ($snap['fundoIds'] ?? [])) {
            $snap['fundoIds'] = $novos;
            $mudou[] = count($novos) === 1 ? $prontos[$novos[0]] : count($novos) . ' lugares';
        }
    }
    if (!$mudou) fail('mude a moldura ou o lugar — senão sai igualzinho');

    // nome enxuto: original sem o "(refeito: …)" antigo + o que mudou agora
    $baseNome = preg_replace('/\s*\(refeito:.*\)$/u', '', (string)$orig['nome']);
    $job = [
        'id' => rid('job_'), 'tipo' => 'ermos',
        'nome' => $baseNome . ' (refeito: ' . implode(' + ', $mudou) . ')',
        'snapshot' => $snap,
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'video' => null, 'video45' => null, 'error' => null,
        'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job, 'mudou' => $mudou]);
}

// ============ LOJA (catálogo Shopify: busca + filtro por artista) ============
// Baixa TODAS as páginas do products.json uma vez e cacheia (o catálogo tem
// ~2000 obras). `vendor` é o artista (campo limpo da loja). Cache 1h.
// O catálogo tem milhares de obras (21+ páginas). Buscar tudo numa requisição
// estoura o tempo do PHP compartilhado — então carregamos INCREMENTALMENTE:
// cada chamada puxa mais algumas páginas e guarda o progresso. A UI mostra o
// que já tem e continua pedindo até completar.
function loja_catalogo(array $CONFIG, int $paginasPorChamada = 4): array {
    $cacheFile = DATA . '/loja_catalogo.json';
    $est = ['produtos' => [], 'proxima' => 1, 'completo' => false, 'ts' => 0];
    if (file_exists($cacheFile)) {
        $c = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($c) && isset($c['produtos'])) $est = $c;
    }
    // cache completo e fresco (6h) — devolve na hora
    if ($est['completo'] && (time() - ($est['ts'] ?? 0)) < 21600) return $est;
    // expirou: recomeça do zero
    if ($est['completo']) $est = ['produtos' => [], 'proxima' => 1, 'completo' => false, 'ts' => 0];

    $loja = rtrim($CONFIG['defaults']['lojaUrl'] ?? 'https://ateliermalta.com.br', '/');
    $ctx = stream_context_create(['http' => ['timeout' => 12, 'header' => "User-Agent: QuadrosStudio/1.0\r\n"]]);
    for ($i = 0; $i < $paginasPorChamada; $i++) {
        $page = $est['proxima'];
        if ($page > 60) { $est['completo'] = true; break; }  // teto de segurança
        $raw = false;
        for ($t = 0; $t < 2 && $raw === false; $t++) {        // 1 retentativa por página
            $raw = @file_get_contents("$loja/products.json?limit=250&page=$page", false, $ctx);
            if ($raw === false) usleep(400000);
        }
        if ($raw === false) break;                            // tenta de novo na próxima chamada
        $lote = json_decode($raw, true)['products'] ?? [];
        foreach ($lote as $p) {
            $im = $p['images'][0] ?? null;
            if (empty($im['src'])) continue;
            $est['produtos'][] = ['titulo' => $p['title'], 'img' => $im['src'], 'artista' => $p['vendor'] ?? '',
                                  'orient' => orientacao((int)($im['width'] ?? 0), (int)($im['height'] ?? 0))];
        }
        $est['proxima'] = $page + 1;
        if (count($lote) < 250) { $est['completo'] = true; break; }
    }
    $est['ts'] = time();
    @file_put_contents($cacheFile, json_encode($est, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $est;
}
// O id do YouTube acaba virando argumento do yt-dlp no Mac — só passa se for
// exatamente um id (11 chars). Vale pro UGC e pro Ermos.
function audio_limpo($a): array {
    $a = is_array($a) ? $a : [];
    $a['ytId'] = preg_match('/^[\w-]{11}$/', (string)($a['ytId'] ?? '')) ? $a['ytId'] : null;
    $a['ytInicio'] = max(0, (int)($a['ytInicio'] ?? 0));
    return $a;
}

// em pé / deitada / quadrada — a régua de 4% evita chamar de "deitada" uma
// obra praticamente quadrada (1010x1000 é quadrada pra qualquer efeito prático)
function orientacao(int $w, int $h): string {
    if ($w <= 0 || $h <= 0) return 'v';   // sem medida: trata como em pé (o padrão da loja)
    $r = $w / $h;
    if ($r > 1.04) return 'h';
    if ($r < 0.96) return 'v';
    return 'q';
}

// O worker (Mac) empurra o catálogo inteiro — o Hostgator trava depois de
// poucas páginas na saída pra Shopify, então quem busca é quem tem internet
// liberada. Fica em data/loja_catalogo.json no formato do loja_catalogo().
if ($action === 'worker_catalogo') {
    require_worker();
    $raw = file_get_contents('php://input');
    $produtos = json_decode((string)$raw, true);
    if (!is_array($produtos) || !$produtos) fail('catálogo vazio');
    $limpos = [];
    foreach ($produtos as $p) {
        if (empty($p['img']) || empty($p['titulo'])) continue;
        $limpos[] = ['titulo' => $p['titulo'], 'img' => $p['img'], 'artista' => $p['artista'] ?? '',
                     'orient' => orientacao((int)($p['w'] ?? 0), (int)($p['h'] ?? 0))];
    }
    @file_put_contents(DATA . '/loja_catalogo.json', json_encode(
        ['produtos' => $limpos, 'proxima' => 999, 'completo' => true, 'ts' => now(), 'via' => 'worker'],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    out(['ok' => true, 'guardados' => count($limpos)]);
}

if ($action === 'loja_produtos') {
    require_login();
    $est = loja_catalogo($CONFIG);
    $todos = $est['produtos'];
    if (!$todos) fail('não consegui falar com a loja', 502);
    $q = mb_strtolower(trim($_GET['q'] ?? ''));
    $artista = trim($_GET['artista'] ?? '');
    $orient = trim($_GET['orient'] ?? '');   // '' | v | h  (nunca se mistura num vídeo)
    $filtrados = $todos;
    // contagem por orientação SEMPRE do catálogo inteiro (os chips não podem
    // mudar de número conforme ele filtra, senão parece que sumiu obra)
    $porOrient = ['v' => 0, 'h' => 0, 'q' => 0];
    foreach ($todos as $p) $porOrient[$p['orient'] ?? 'v'] = ($porOrient[$p['orient'] ?? 'v'] ?? 0) + 1;
    if ($orient === 'v' || $orient === 'h') {
        // quadradas entram nos dois lados: cabem em qualquer moldura
        $filtrados = array_values(array_filter($filtrados,
            fn($p) => ($p['orient'] ?? 'v') === $orient || ($p['orient'] ?? 'v') === 'q'));
    }
    $doLado = $filtrados;   // universo da orientação escolhida (antes de artista/busca)
    if ($artista !== '') {
        $filtrados = array_values(array_filter($filtrados, fn($p) => $p['artista'] === $artista));
    }
    if ($q !== '') {
        $filtrados = array_values(array_filter($filtrados, fn($p) =>
            str_contains(mb_strtolower($p['titulo']), $q) || str_contains(mb_strtolower($p['artista']), $q)));
    }
    // artistas com contagem — respeita a orientação escolhida, senão o chip
    // diria "Renoir · 86" e ao clicar viriam 3 obras
    $cont = [];
    foreach ($doLado as $p) {
        $a = $p['artista'];
        if ($a !== '') $cont[$a] = ($cont[$a] ?? 0) + 1;
    }
    arsort($cont);
    $artistas = [];
    foreach ($cont as $nome => $n) $artistas[] = ['nome' => $nome, 'n' => $n];
    // paginação da UI (60 por vez)
    $page = max(1, (int)($_GET['page'] ?? 1));
    $porPag = 60;
    $total = count($filtrados);
    $pagina = array_slice($filtrados, ($page - 1) * $porPag, $porPag);
    out(['ok' => true, 'produtos' => array_values($pagina), 'page' => $page,
         'total' => $total, 'paginas' => max(1, (int)ceil($total / $porPag)),
         'artistas' => $artistas, 'catalogo' => count($todos),
         'orientacoes' => $porOrient, 'completo' => (bool)$est['completo']]);
}

// ============ YOUTUBE (busca de trilha) ============
// Lê a página de resultados e extrai os videoRenderer do ytInitialData.
// Sem chave de API: o download real é feito pelo worker (yt-dlp) no Mac.
if ($action === 'yt_busca') {
    require_login();
    $q = trim($_GET['q'] ?? '');
    if ($q === '') fail('digite o que buscar');
    $url = 'https://www.youtube.com/results?search_query=' . urlencode($q) . '&sp=EgIQAQ%253D%253D'; // só vídeos
    $ctx = stream_context_create(['http' => [
        'timeout' => 15,
        'header' => "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36\r\n" .
                    "Accept-Language: pt-BR,pt;q=0.9\r\n",
    ]]);
    $html = @file_get_contents($url, false, $ctx);
    if ($html === false) fail('não consegui falar com o YouTube daqui', 502);
    if (!preg_match('/ytInitialData\s*=\s*(\{.+?\});<\/script>/s', $html, $m)) {
        fail('YouTube mudou o formato da página', 502);
    }
    $data = json_decode($m[1], true);
    if (!$data) fail('não consegui ler os resultados', 502);
    // caminha na árvore procurando videoRenderer (posição varia)
    $achados = [];
    $anda = function ($n) use (&$anda, &$achados) {
        if (!is_array($n)) return;
        if (isset($n['videoRenderer'])) {
            $v = $n['videoRenderer'];
            $id = $v['videoId'] ?? null;
            $tit = $v['title']['runs'][0]['text'] ?? null;
            $durTxt = $v['lengthText']['simpleText'] ?? null;
            if ($id && $tit && $durTxt) {   // sem lengthText = live/short, ignora
                $p = array_reverse(array_map('intval', explode(':', $durTxt)));
                $seg = ($p[0] ?? 0) + (($p[1] ?? 0) * 60) + (($p[2] ?? 0) * 3600);
                $achados[$id] = [
                    'id' => $id, 'titulo' => $tit, 'dur' => $seg, 'durTxt' => $durTxt,
                    'canal' => $v['ownerText']['runs'][0]['text'] ?? '',
                    'thumb' => "https://i.ytimg.com/vi/$id/mqdefault.jpg",
                ];
            }
        }
        foreach ($n as $f) if (is_array($f)) $anda($f);
    };
    $anda($data);
    out(['ok' => true, 'videos' => array_slice(array_values($achados), 0, 18)]);
}

// ============ CATEGORIAS ============
if ($action === 'save_categoria') {
    require_login(); require_csrf();
    $b = body();
    $nome = trim($b['nome'] ?? '');
    if ($nome === '') fail('dê um nome pra categoria');
    if (mb_strlen($nome) > 24) fail('nome muito longo (máx 24)');
    $cats = jread('categorias', []);
    if (!empty($b['id'])) { // renomear
        $achou = false;
        foreach ($cats as &$c) if ($c['id'] === $b['id']) { $c['nome'] = $nome; $achou = true; }
        unset($c);
        if (!$achou) fail('categoria não encontrada', 404);
    } else {             // criar
        $id = preg_replace('/[^a-z0-9]+/', '-', strtolower($nome));
        $id = trim($id, '-') ?: rid('cat_');
        foreach ($cats as $c) if ($c['id'] === $id) fail('já existe uma categoria com esse nome');
        $cats[] = ['id' => $id, 'nome' => $nome];
    }
    jwrite('categorias', $cats);
    out(['ok' => true, 'categorias' => $cats]);
}
if ($action === 'delete_categoria') {
    require_login(); require_csrf();
    $b = body();
    $id = $b['id'] ?? '';
    $cats = jread('categorias', []);
    $restantes = array_values(array_filter($cats, fn($c) => $c['id'] !== $id));
    if (count($restantes) === count($cats)) fail('categoria não encontrada', 404);
    if (!$restantes) fail('mantenha ao menos uma categoria');
    // cenários órfãos migram pra primeira categoria restante
    $destino = $restantes[0]['id'];
    $cenarios = jread('cenarios', []);
    foreach ($cenarios as &$c) if (($c['categoria'] ?? '') === $id) $c['categoria'] = $destino;
    unset($c);
    jwrite('cenarios', $cenarios);
    jwrite('categorias', $restantes);
    out(['ok' => true, 'categorias' => $restantes, 'movidos_para' => $destino]);
}
if ($action === 'move_cenario') {
    require_login(); require_csrf();
    $b = body();
    $cats = array_column(jread('categorias', []), 'id');
    if (!in_array($b['categoria'] ?? '', $cats, true)) fail('categoria inválida');
    $cenarios = jread('cenarios', []);
    $achou = false;
    foreach ($cenarios as &$c) if ($c['id'] === ($b['id'] ?? '')) { $c['categoria'] = $b['categoria']; $c['updated_at'] = now(); $achou = true; }
    unset($c);
    if (!$achou) fail('cenário não encontrado', 404);
    jwrite('cenarios', $cenarios);
    out(['ok' => true]);
}

// ============ MOLDURAS (biblioteca) ============
if ($action === 'save_moldura') {
    require_login(); require_csrf();
    $b = body();
    if (empty($b['url'])) fail('suba a foto da moldura primeiro');
    $molduras = jread('molduras', []);
    $rec = [
        'id' => rid('mold_'),
        'nome' => trim($b['nome'] ?? '') ?: 'Moldura',
        'url' => $b['url'],
        'created_at' => now(),
    ];
    array_unshift($molduras, $rec);
    jwrite('molduras', $molduras);
    out(['ok' => true, 'moldura' => $rec]);
}
if ($action === 'delete_moldura') {
    require_login(); require_csrf();
    $b = body();
    $molduras = jread('molduras', []);
    foreach ($molduras as $m) {
        if ($m['id'] === ($b['id'] ?? '') && !empty($m['url'])) @unlink(__DIR__ . '/' . $m['url']);
    }
    $molduras = array_values(array_filter($molduras, fn($m) => $m['id'] !== ($b['id'] ?? '')));
    jwrite('molduras', $molduras);
    out(['ok' => true]);
}

// ============ CENÁRIOS ============
// cria um job que GERA os 6 keyframes de um palco novo (texto livre → prompts)
if ($action === 'queue_cenario') {
    require_login(); require_csrf();
    $b = body();
    $desc = trim($b['descricao'] ?? '');
    $av = trim($b['avatarText'] ?? '');
    $am = trim($b['ambienteText'] ?? '');
    // "duplicar com outra moldura": herda avatar/ambiente canônicos (EN) de um
    // cenário existente — só a moldura muda, a identidade/lugar ficam idênticos.
    $avatarEN = ''; $ambienteEN = '';
    if (!empty($b['duplicarDe'])) {
        foreach (jread('cenarios', []) as $c) {
            if ($c['id'] === $b['duplicarDe']) { $avatarEN = $c['avatar'] ?? ''; $ambienteEN = $c['ambiente'] ?? ''; }
        }
        if ($avatarEN === '') fail('cenário de origem não encontrado');
    }
    if ($avatarEN === '' && $desc === '' && ($av === '' || $am === '')) fail('descreva ao menos avatar e ambiente');
    // moldura da biblioteca (foto vira referência na geração)
    $molduraUrl = null; $molduraNome = null;
    if (!empty($b['molduraId'])) {
        foreach (jread('molduras', []) as $m) {
            if ($m['id'] === $b['molduraId']) { $molduraUrl = $m['url']; $molduraNome = $m['nome']; }
        }
        if (!$molduraUrl) fail('moldura não encontrada na biblioteca');
    }
    $id = preg_replace('/[^a-z0-9]+/', '-', strtolower($b['id'] ?? '')) ?: rid('cen_');
    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'),
        'tipo' => 'cenario',
        'nome' => $b['nome'] ?? 'Cenário novo',
        'snapshot' => [
            'tipo' => 'cenario', 'id' => $id,
            'descricao' => $desc, 'avatarText' => $av, 'ambienteText' => $am,
            'avatar' => $avatarEN ?: null, 'ambiente' => $ambienteEN ?: null,
            'molduraText' => trim($b['molduraText'] ?? ''),
            'molduraUrl' => $molduraUrl, 'molduraNome' => $molduraNome,
            'movimento' => $b['movimento'] ?? 'medio',
            'temAbertura' => !empty($b['temAbertura']),
            'variacoes' => max(1, min(4, (int)($b['variacoes'] ?? 1))),
            'diversificar' => in_array($b['diversificar'] ?? '', ['avatar', 'ambiente', 'ambos']) ? $b['diversificar'] : 'avatar',
            'categoria' => in_array($b['categoria'] ?? '', array_column($CATEGORIAS, 'id'), true) ? $b['categoria'] : 'ugc',
        ],
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'result' => null, 'error' => null, 'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
}
if ($action === 'approve_cenario') {
    require_login(); require_csrf();
    $b = body();
    $cenarios = jread('cenarios', []);
    $found = false;
    foreach ($cenarios as &$c) {
        if ($c['id'] === ($b['id'] ?? '')) { $c['status'] = 'aprovado'; $c['updated_at'] = now(); $found = true; break; }
    }
    unset($c);
    if (!$found) fail('cenário não encontrado', 404);
    jwrite('cenarios', $cenarios);
    out(['ok' => true]);
}
if ($action === 'delete_cenario') {
    require_login(); require_csrf();
    $b = body();
    $cenarios = array_values(array_filter(jread('cenarios', []), fn($c) => $c['id'] !== ($b['id'] ?? '')));
    jwrite('cenarios', $cenarios);
    out(['ok' => true]);
}

// ============ MOCKUPS (o vídeo) ============
if ($action === 'queue_mockup') {
    require_login(); require_csrf();
    $b = body();
    // LOTE de artes: arteUrls[] (N artes) ou arteUrl único
    $artes = [];
    if (!empty($b['arteUrls']) && is_array($b['arteUrls'])) $artes = array_values(array_filter($b['arteUrls']));
    elseif (!empty($b['arteUrl'])) $artes = [$b['arteUrl']];
    if (!$artes) fail('suba a arte do quadro');
    if (count($artes) > 10) fail('máximo 10 artes por lote');
    // CENÁRIOS: cenarioIds[] (multi) ou cenarioId único — todos aprovados
    $ids = [];
    if (!empty($b['cenarioIds']) && is_array($b['cenarioIds'])) $ids = array_values(array_filter($b['cenarioIds']));
    elseif (!empty($b['cenarioId'])) $ids = [$b['cenarioId']];
    if (!$ids) fail('escolha ao menos um cenário');
    $cenarios = jread('cenarios', []);
    $pool = [];
    foreach ($ids as $cid) {
        $found = null;
        foreach ($cenarios as $c) if ($c['id'] === $cid) $found = $c;
        if (!$found) fail("cenário $cid não encontrado", 404);
        if (($found['status'] ?? '') !== 'aprovado') fail("aprove o cenário \"{$found['nome']}\" antes de usar");
        $pool[] = $found;
    }
    // MODO da matriz de produção:
    //   um      — todas as artes no primeiro cenário (comportamento clássico)
    //   sortear — cada arte pega um cenário ALEATÓRIO do pool
    //   matriz  — todas as artes × todos os cenários (produção em massa)
    $modo = in_array($b['modo'] ?? '', ['um', 'sortear', 'matriz']) ? $b['modo'] : 'um';
    $combos = [];
    if ($modo === 'matriz') {
        foreach ($artes as $arte) foreach ($pool as $cen) $combos[] = [$arte, $cen];
    } elseif ($modo === 'sortear') {
        foreach ($artes as $arte) $combos[] = [$arte, $pool[random_int(0, count($pool) - 1)]];
    } else {
        foreach ($artes as $arte) $combos[] = [$arte, $pool[0]];
    }
    if (count($combos) > 20) fail('máximo 20 vídeos por lote (' . count($combos) . ' na conta) — reduza artes ou cenários');

    $jobs = jread('jobs', []);
    $criados = [];
    $n = count($combos);
    foreach ($combos as $i => [$arte, $cen]) {
        $sufixo = $n > 1 ? (' · ' . ($i + 1) . '/' . $n) : '';
        $job = [
            'id' => rid('job_'),
            'tipo' => 'mockup',
            'nome' => (($b['nome'] ?? '') ?: ($cen['nome'] . ' · mockup')) . $sufixo,
            'snapshot' => [
                'tipo' => 'mockup',
                'cenarioId' => $cen['id'],
                'arteUrl' => $arte,
                'movimento' => $b['movimento'] ?? 'medio',
                'duracaoAlvo' => (int)($b['duracaoAlvo'] ?? 25),
                'abertura' => !empty($b['abertura']),
                'audio' => audio_limpo($b['audio'] ?? []),
                'formatos' => (!empty($b['formatos']) && is_array($b['formatos'])) ? $b['formatos'] : ['9:16'],
            ],
            'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
            'video' => null, 'video45' => null, 'error' => null,
            'created_at' => now(), 'updated_at' => now(),
        ];
        array_unshift($jobs, $job);
        $criados[] = $job;
    }
    jwrite('jobs', $jobs);
    out(['ok' => true, 'jobs' => $criados]);
}

// ============ FILA ============
if ($action === 'jobs') { require_login(); out(['ok' => true, 'jobs' => jread('jobs', [])]); }
if ($action === 'job_action') {
    require_login(); require_csrf();
    $b = body();
    $op = $b['op'] ?? '';
    $jobs = jread('jobs', []);
    $out = [];
    foreach ($jobs as $j) {
        if ($j['id'] === ($b['job_id'] ?? '')) {
            if ($op === 'delete') {
                if (!empty($j['video'])) @unlink(__DIR__ . '/' . $j['video']);
                if (!empty($j['video45'])) @unlink(__DIR__ . '/' . $j['video45']);
                continue;
            }
            if ($op === 'cancel' && in_array($j['status'], ['queued', 'claimed', 'running'])) { $j['status'] = 'error'; $j['error'] = 'cancelado'; }
            if ($op === 'retry' && $j['status'] === 'error') { $j['status'] = 'queued'; $j['pct'] = 0; $j['stage'] = 'na fila'; $j['error'] = null; }
        }
        $out[] = $j;
    }
    jwrite('jobs', $out);
    out(['ok' => true]);
}

// ============ UPLOAD DA ARTE ============
if ($action === 'upload_image') {
    require_login(); require_csrf();
    if (empty($_FILES['file'])) fail('sem arquivo');
    $f = $_FILES['file'];
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['png', 'jpg', 'jpeg', 'webp'])) fail('formato inválido (png/jpg/webp)');
    $name = 'art_' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], UPLOADS . '/' . $name)) fail('falha ao salvar');
    out(['ok' => true, 'url' => 'media/up/' . $name]);
}

// ============ WORKER ============
function claim_next(array &$jobs): ?array {
    $now = now();
    foreach ($jobs as &$j) { // devolve presos > 30min
        if (in_array($j['status'], ['claimed', 'running']) && ($now - ($j['updated_at'] ?? 0)) > 1800) {
            $j['status'] = 'queued';
        }
    }
    unset($j);
    for ($i = count($jobs) - 1; $i >= 0; $i--) {
        if ($jobs[$i]['status'] === 'queued') {
            $jobs[$i]['status'] = 'claimed';
            $jobs[$i]['updated_at'] = now();
            return $jobs[$i];
        }
    }
    return null;
}
if ($action === 'worker_poll') {
    require_worker();
    $jobs = jread('jobs', []);
    $job = claim_next($jobs);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
}
if ($action === 'worker_progress') {
    require_worker();
    $b = body();
    $jobs = jread('jobs', []);
    foreach ($jobs as &$j) {
        if ($j['id'] === ($b['job_id'] ?? '')) {
            if (isset($b['pct'])) $j['pct'] = max(0, min(99, (int)$b['pct']));
            if (!empty($b['stage'])) $j['stage'] = $b['stage'];
            if ($j['status'] === 'claimed') $j['status'] = 'running';
            if (!empty($b['log'])) { $j['log'][] = $b['log']; $j['log'] = array_slice($j['log'], -30); }
            $j['updated_at'] = now();
        }
    }
    unset($j);
    jwrite('jobs', $jobs);
    out(['ok' => true]);
}
// registra UM palco (cenario.json + 6 keyframes) — usado 1x por palco; a
// produção em massa chama várias vezes no mesmo job antes do worker_done.
function register_cenario(): void {
    $cid = preg_replace('/[^a-z0-9\-_]/', '', $_POST['cenario_id'] ?? '');
    if ($cid === '' || !isset($_FILES['keyframes'])) fail('cenario_id/keyframes ausentes');
    $dir = CENMEDIA . '/' . $cid;
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    $thumbs = [];
    $files = $_FILES['keyframes'];
    $n = is_array($files['name']) ? count($files['name']) : 0;
    for ($i = 0; $i < $n; $i++) {
        $fn = preg_replace('/[^A-Za-z0-9._-]/', '', $files['name'][$i]);
        if (move_uploaded_file($files['tmp_name'][$i], "$dir/$fn")) {
            $thumbs[] = "media/cenarios/$cid/$fn";
        }
    }
    $meta = json_decode((string)($_POST['cenario'] ?? '{}'), true) ?: [];
    $cats = array_column(jread('categorias', []), 'id');
    $cat = $_POST['categoria'] ?? ($meta['categoria'] ?? 'ugc');
    if (!in_array($cat, $cats, true)) $cat = $cats[0] ?? 'ugc';
    $cenarios = jread('cenarios', []);
    $rec = [
        'id' => $cid,
        'nome' => $meta['nome'] ?? 'Cenário',
        'categoria' => $cat,
        'avatar' => $meta['avatar'] ?? '', 'ambiente' => $meta['ambiente'] ?? '',
        'moldura' => $meta['moldura'] ?? '', 'movimento' => $meta['movimento'] ?? 'medio',
        'temAbertura' => !empty($meta['temAbertura']),
        'thumbs' => $thumbs, 'status' => 'aguardando_aprovacao',
        'created_at' => now(), 'updated_at' => now(),
    ];
    // upsert por id
    $cenarios = array_values(array_filter($cenarios, fn($c) => $c['id'] !== $cid));
    array_unshift($cenarios, $rec);
    jwrite('cenarios', $cenarios);
}

// REFAZER 1 CENA: quando uma das 6 sai errada, regerar o cenário inteiro é
// caro e ainda arrisca estragar as 5 boas. K1 fica de fora — é a raiz da
// identidade, refazer ele sozinho descasaria as outras cinco.
if ($action === 'queue_keyframe') {
    require_login(); require_csrf();
    $b = body();
    $cid = preg_replace('/[^a-z0-9\-_]/', '', $b['id'] ?? '');
    $kf = strtoupper(trim($b['kf'] ?? ''));
    if (!in_array($kf, ['K2', 'K3', 'K4', 'K5', 'K6'], true)) {
        fail('só dá pra refazer da 2ª à 6ª cena — a 1ª é a que define a pessoa');
    }
    $cen = null;
    foreach (jread('cenarios', []) as $c) if ($c['id'] === $cid) { $cen = $c; break; }
    if (!$cen) fail('cenário não encontrado');
    $k1 = null;
    foreach ($cen['thumbs'] ?? [] as $t) if (str_contains($t, '/K1.')) $k1 = $t;
    if (!$k1) fail('esse cenário não tem a 1ª cena guardada — refaça o cenário inteiro');

    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'), 'tipo' => 'keyframe',
        'nome' => ($cen['nome'] ?? 'Cenário') . " · refazendo a cena $kf",
        'snapshot' => [
            'tipo' => 'keyframe', 'cenarioId' => $cid, 'kf' => $kf,
            'k1Url' => $k1, 'molduraUrl' => $cen['molduraFotoUrl'] ?? null,
            'avatar' => $cen['avatar'] ?? '', 'ambiente' => $cen['ambiente'] ?? '',
            'moldura' => $cen['moldura'] ?? '',
        ],
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'video' => null, 'error' => null, 'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
}

// troca UMA imagem do cenário no lugar. O ?v= no fim é o que faz o navegador
// largar a versão antiga — o caminho do arquivo continua o mesmo.
if ($action === 'worker_keyframe') {
    require_worker();
    $cid = preg_replace('/[^a-z0-9\-_]/', '', $_POST['cenario_id'] ?? '');
    $kf = preg_replace('/[^A-Z0-9]/', '', strtoupper($_POST['kf'] ?? ''));
    if ($cid === '' || $kf === '' || !isset($_FILES['keyframe'])) fail('cenario_id/kf/keyframe ausentes');
    $dir = CENMEDIA . '/' . $cid;
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!move_uploaded_file($_FILES['keyframe']['tmp_name'], "$dir/$kf.png")) fail('não consegui salvar a cena');
    $base = "media/cenarios/$cid/$kf.png";
    $cenarios = jread('cenarios', []);
    foreach ($cenarios as &$c) {
        if ($c['id'] !== $cid) continue;
        $c['thumbs'] = array_map(
            fn($t) => str_contains(explode('?', $t)[0], "/$kf.") ? $base . '?v=' . time() : $t,
            $c['thumbs'] ?? []);
        $c['updated_at'] = now();
    }
    unset($c);
    jwrite('cenarios', $cenarios);
    // fecha o job aqui mesmo: uma chamada só, sem chance de a imagem subir e o
    // job ficar preso em "subindo a cena" se a segunda chamada falhar
    $job_id = $_POST['job_id'] ?? '';
    if ($job_id !== '') {
        $jobs = jread('jobs', []);
        foreach ($jobs as &$j) {
            if ($j['id'] !== $job_id) continue;
            $j['status'] = 'done'; $j['pct'] = 100; $j['stage'] = 'pronto';
            $j['updated_at'] = now();
        }
        unset($j);
        jwrite('jobs', $jobs);
    }
    out(['ok' => true, 'thumb' => $base]);
}

if ($action === 'worker_add_cenario') {
    require_worker();
    register_cenario();
    out(['ok' => true]);
}

// worker_done: recebe (a) cenário = cenario.json + 6 keyframes, ou (b) mockup = mp4,
// ou (c) só job_id (produção em massa — os palcos já subiram via worker_add_cenario)
if ($action === 'worker_done') {
    require_worker();
    $job_id = $_POST['job_id'] ?? '';
    $jobs = jread('jobs', []);

    if (!empty($_POST['fundo_id'])) {
        // fundo do modo Ermos ficou pronto (vídeo vive no Mac; aqui só o status)
        $status = jread('fundos', []);
        $status[preg_replace('/[^a-z0-9\-]/', '', $_POST['fundo_id'])] = ['status' => 'pronto', 'updated_at' => now()];
        jwrite('fundos', $status);
    } else if (!empty($_POST['cenario_id']) && isset($_FILES['keyframes'])) {
        register_cenario();
    } else if (isset($_FILES['video'])) {
        $name = 'mockup_' . $job_id . '.mp4';
        move_uploaded_file($_FILES['video']['tmp_name'], MEDIA . '/' . $name);
        if (isset($_FILES['video45'])) {
            move_uploaded_file($_FILES['video45']['tmp_name'], MEDIA . '/mockup_' . $job_id . '_45.mp4');
        }
    }

    foreach ($jobs as &$j) {
        if ($j['id'] === $job_id) {
            $j['status'] = 'done'; $j['pct'] = 100; $j['stage'] = 'pronto';
            if (isset($_FILES['video'])) $j['video'] = 'media/mockup_' . $job_id . '.mp4';
            if (isset($_FILES['video45'])) $j['video45'] = 'media/mockup_' . $job_id . '_45.mp4';
            $j['updated_at'] = now();
        }
    }
    unset($j);
    jwrite('jobs', $jobs);
    out(['ok' => true]);
}
if ($action === 'worker_error') {
    require_worker();
    $b = body();
    $jobs = jread('jobs', []);
    foreach ($jobs as &$j) {
        if ($j['id'] === ($b['job_id'] ?? '')) {
            $j['status'] = 'error'; $j['error'] = $b['message'] ?? 'erro'; $j['updated_at'] = now();
            // fundo que falhou volta pra "erro" (senão fica "gerando" pra sempre)
            if (($j['snapshot']['tipo'] ?? '') === 'fundo' && !empty($j['snapshot']['fundoId'])) {
                $st = jread('fundos', []);
                $st[$j['snapshot']['fundoId']] = ['status' => 'erro', 'updated_at' => now()];
                jwrite('fundos', $st);
            }
        }
    }
    unset($j);
    jwrite('jobs', $jobs);
    out(['ok' => true]);
}

fail('ação desconhecida: ' . $action, 404);
