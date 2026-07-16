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
        'molduras' => jread('molduras', []),
        'jobs' => jread('jobs', []),
        'defaults' => $CONFIG['defaults'],
        'worker_token' => $CONFIG['worker_token'], // logado é confiável (igual Cricri)
    ]);
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
                'audio' => $b['audio'] ?? new stdClass(),
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
    $cenarios = jread('cenarios', []);
    $rec = [
        'id' => $cid,
        'nome' => $meta['nome'] ?? 'Cenário',
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

    if (!empty($_POST['cenario_id']) && isset($_FILES['keyframes'])) {
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
        if ($j['id'] === ($b['job_id'] ?? '')) { $j['status'] = 'error'; $j['error'] = $b['message'] ?? 'erro'; $j['updated_at'] = now(); }
    }
    unset($j);
    jwrite('jobs', $jobs);
    out(['ok' => true]);
}

fail('ação desconhecida: ' . $action, 404);
