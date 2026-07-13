<?php
// ESTÚDIO DE QUADROS — API (web enfileira, worker no Mac renderiza).
// App irmão do Cricri: mesmo padrão (JSON em disco, sem banco; sessão humana +
// token de worker). Namespace próprio em /criativos/quadros — não colide com o
// modo "quadro" do Cricri. Ver MOCKUP-NATIVO.md.

declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
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
        'jobs' => jread('jobs', []),
        'defaults' => $CONFIG['defaults'],
    ]);
}

// ============ CENÁRIOS ============
// cria um job que GERA os 6 keyframes de um palco novo (texto livre → prompts)
if ($action === 'queue_cenario') {
    require_login(); require_csrf();
    $b = body();
    $desc = trim($b['descricao'] ?? '');
    $av = trim($b['avatarText'] ?? '');
    $am = trim($b['ambienteText'] ?? '');
    if ($desc === '' && ($av === '' || $am === '')) fail('descreva ao menos avatar e ambiente');
    $id = preg_replace('/[^a-z0-9]+/', '-', strtolower($b['id'] ?? '')) ?: rid('cen_');
    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'),
        'tipo' => 'cenario',
        'nome' => $b['nome'] ?? 'Cenário novo',
        'snapshot' => [
            'tipo' => 'cenario', 'id' => $id,
            'descricao' => $desc, 'avatarText' => $av, 'ambienteText' => $am,
            'molduraText' => trim($b['molduraText'] ?? ''),
            'movimento' => $b['movimento'] ?? 'medio',
            'temAbertura' => !empty($b['temAbertura']),
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
    if (empty($b['cenarioId'])) fail('escolha um cenário');
    if (empty($b['arteUrl'])) fail('suba a arte do quadro');
    // o cenário precisa estar aprovado
    $cenarios = jread('cenarios', []);
    $cen = null;
    foreach ($cenarios as $c) if ($c['id'] === $b['cenarioId']) $cen = $c;
    if (!$cen) fail('cenário não encontrado', 404);
    if (($cen['status'] ?? '') !== 'aprovado') fail('aprove o cenário antes de usar');
    $jobs = jread('jobs', []);
    $job = [
        'id' => rid('job_'),
        'tipo' => 'mockup',
        'nome' => $b['nome'] ?: ($cen['nome'] . ' · mockup'),
        'snapshot' => [
            'tipo' => 'mockup',
            'cenarioId' => $b['cenarioId'],
            'arteUrl' => $b['arteUrl'],
            'movimento' => $b['movimento'] ?? 'medio',
            'duracaoAlvo' => (int)($b['duracaoAlvo'] ?? 25),
            'abertura' => !empty($b['abertura']),
            'audio' => $b['audio'] ?? new stdClass(),
        ],
        'status' => 'queued', 'pct' => 0, 'stage' => 'na fila', 'log' => [],
        'video' => null, 'error' => null, 'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs', $jobs);
    out(['ok' => true, 'job' => $job]);
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
// worker_done: recebe (a) cenário = cenario.json + 6 keyframes, ou (b) mockup = mp4
if ($action === 'worker_done') {
    require_worker();
    $job_id = $_POST['job_id'] ?? '';
    $jobs = jread('jobs', []);

    if (!empty($_POST['cenario_id']) && isset($_FILES['keyframes'])) {
        // salva os keyframes em media/cenarios/<id>/ e registra o cenário
        $cid = preg_replace('/[^a-z0-9\-_]/', '', $_POST['cenario_id']);
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
    } else if (isset($_FILES['video'])) {
        $name = 'mockup_' . $job_id . '.mp4';
        move_uploaded_file($_FILES['video']['tmp_name'], MEDIA . '/' . $name);
    }

    foreach ($jobs as &$j) {
        if ($j['id'] === $job_id) {
            $j['status'] = 'done'; $j['pct'] = 100; $j['stage'] = 'pronto';
            if (isset($_FILES['video'])) $j['video'] = 'media/mockup_' . $job_id . '.mp4';
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
