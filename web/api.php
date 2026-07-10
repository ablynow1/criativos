<?php
/**
 * CRICRI — API do estúdio de criativos (lventerprise.com.br/criativos)
 * Storage em JSON (data/), auth por sessão (humanos) e token (worker local).
 * O render acontece no Mac (worker puxa a fila, roda o pipeline Veo/TTS e sobe o MP4).
 */

declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED);
ini_set('display_errors', '0');

define('BASE', __DIR__);
define('DATA', BASE . '/data');
define('MEDIA', BASE . '/media');
define('UPLOADS', MEDIA . '/up');

session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'httponly' => true, 'samesite' => 'Lax']);
session_name('cricri_sid');
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// ---------- helpers ----------
function out($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }

function jread(string $file, $fallback) {
  $path = DATA . '/' . $file;
  if (!file_exists($path)) return $fallback;
  $raw = file_get_contents($path);
  $data = json_decode($raw, true);
  return $data === null ? $fallback : $data;
}
function jwrite(string $file, $data): void {
  $path = DATA . '/' . $file;
  file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
}
function body(): array {
  $raw = file_get_contents('php://input');
  $d = json_decode($raw ?: '[]', true);
  return is_array($d) ? $d : [];
}
function rid(string $p = ''): string { return $p . bin2hex(random_bytes(6)); }
function now(): string { return date('c'); }

// ---------- bootstrap / seed ----------
if (!is_dir(DATA)) { mkdir(DATA, 0755, true); }
if (!is_dir(MEDIA)) { mkdir(MEDIA, 0755, true); }
if (!is_dir(UPLOADS)) { mkdir(UPLOADS, 0755, true); }
if (!file_exists(DATA . '/.htaccess')) {
  file_put_contents(DATA . '/.htaccess', "Require all denied\n");
}

// ---------- log de erros — TODO erro do sistema ganha um número aqui ----------
// Fonte única: pipeline/worker (Mac, via worker_log_error), o próprio PHP
// (exceções/erros não tratados, capturados abaixo) e o navegador (via
// log_client_error). Guardado em data/errors.json, protegido pelo .htaccess
// acima. Consulta: Ajustes > Log de erros no site, ou tools/error-log.mjs.
function next_error_id(): int {
  $seq = (int) jread('errors_seq.json', 0);
  $seq += 1;
  jwrite('errors_seq.json', $seq);
  return $seq;
}
function log_error_entry(string $source, string $message, ?string $stack = null, array $context = []): array {
  $entry = [
    'id' => next_error_id(),
    'ts' => now(),
    'source' => $source,
    'message' => mb_substr($message, 0, 2000),
    'stack' => $stack ? mb_substr($stack, 0, 4000) : null,
    'context' => $context,
  ];
  $errors = jread('errors.json', []);
  $errors[] = $entry;
  if (count($errors) > 500) $errors = array_slice($errors, -500); // mantém só os últimos 500
  jwrite('errors.json', $errors);
  return $entry;
}

// Qualquer exceção ou erro PHP não tratado a partir daqui vira uma entrada no
// log (com stack) em vez de sumir num 500 silencioso ou num warning solto.
set_exception_handler(function (Throwable $e) {
  try {
    log_error_entry('php:uncaught', $e->getMessage(), $e->getTraceAsString(), [
      'action' => $_GET['action'] ?? ($_POST['action'] ?? null),
      'file' => $e->getFile(), 'line' => $e->getLine(),
    ]);
  } catch (Throwable $inner) { /* nunca deixa o próprio log derrubar a resposta */ }
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => false, 'error' => 'erro interno — registrado no log de erros']);
  exit;
});
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
  if (!(error_reporting() & $errno)) return false; // respeita @-supressão
  if (in_array($errno, [E_NOTICE, E_USER_NOTICE, E_DEPRECATED, E_USER_DEPRECATED, E_STRICT], true)) {
    log_error_entry('php:notice', $errstr, null, ['file' => $errfile, 'line' => $errline]);
    return true; // só registra, não muda o comportamento normal do PHP
  }
  throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

function seed_config(): array {
  return [
    'password_hash' => password_hash('cricri123', PASSWORD_DEFAULT),
    'worker_token'  => bin2hex(random_bytes(20)), // gerado no 1º boot — veja em Ajustes > Worker
    'defaults' => [
      'voz'            => 'pt-BR-Neural2-B',
      'estiloLegenda'  => 'contorno',
      'motor'          => 'veo',
      'duracao_cena'   => 8,
      'wps'            => 2.7,   // palavras/segundo (calibra o estimador da narração)
      'max_cenas'      => 4,
    ],
    'updated_at' => now(),
  ];
}

function seed_presets(): array {
  $sacred = "Create a portrait artwork based on the attached reference photo.\n\nTHE FACE IS SACRED — photographic likeness above all. The reference photo is the absolute source of truth: preserve EVERY person's exact facial features, skin tone, hair, beard and moustache density, apparent age and expression with total precision. Do NOT straighten curly or coily hair and do NOT change its texture. Add no facial hair that is not in the photo. Keep ONLY the accessories visible in the photo (glasses, caps, earrings); if there are none, add none. If more than one person appears in the photo, render ALL of them together, each one instantly and unmistakably themselves.\n\nSTYLE: {STYLE}\n\nCOMPOSITION: vertical portrait framing. The subject's head and shoulders — and the full group, if there is more than one person — must sit comfortably inside the frame, centered, with gentle margins. Never crop a face, never zoom in awkwardly.\n\nNO TEXT: do NOT write any words, names, letters, signatures, captions or numbers anywhere in the image.\n\nBACKGROUND LOCK: output ONE fully OPAQUE image that fills the entire frame edge to edge. NEVER output a transparent background, an alpha cutout, a floating/isolated subject, or a flat solid-colour background. Every pixel must be part of the image.\n\nNO PICTURE FRAME: do NOT add any decorative picture frame, gilded border, mat, passe-partout or vignette around the image. The artwork itself reaches all four edges.";
  $quadros = @include __DIR__ . '/quadros_seed.php';
  if (!is_array($quadros)) $quadros = [];
  return [
    'quadros' => $quadros,
    'molduras' => [
      ['id' => 'ornate-gold', 'label' => 'Dourada ornamentada (a do site)'],
      ['id' => 'natural-wood', 'label' => 'Madeira natural'],
      ['id' => 'thin-black', 'label' => 'Preta fina moderna'],
      ['id' => 'baroque-silver', 'label' => 'Prata barroca'],
    ],
    'templates' => [
      ['id' => rid('tp_'), 'nome' => 'Retrato — template mestre (FACE IS SACRED)', 'texto' => $sacred],
      ['id' => rid('tp_'), 'nome' => 'Cena Veo — push-in emocional', 'texto' => 'Cinematic vertical 9:16, photorealistic. A gentle slow push-in on {SUJEITO}, the emotional smile slowly deepening, eyes glistening. Soft natural window light, subtle film grain, delicate natural motion, identity fully preserved. No text overlays.'],
      ['id' => rid('tp_'), 'nome' => 'Cena Veo — revelar o quadro', 'texto' => 'Cinematic vertical 9:16, photorealistic. A slow smooth push toward the framed artwork, clearly revealing the portrait inside the ornate gilded frame, then a soft settle back to the emotional face. Warm golden light, shallow depth of field, gentle natural motion, identity of faces and framed artwork fully preserved. No text overlays.'],
    ],
    'ganchos' => [
      ['id' => rid('gc_'), 'nome' => 'Espelho + loss frame (Dia dos Pais)', 'texto' => 'Todo Dia dos Pais, a mesma dúvida: o que dar que ele não jogue na gaveta?'],
      ['id' => rid('gc_'), 'nome' => 'História 1ª pessoa (POV filho)', 'texto' => 'Meu pai jura que não quer nada no Dia dos Pais.'],
      ['id' => rid('gc_'), 'nome' => 'Prova emocional', 'texto' => 'Quando ele viu, sorriu igual criança.'],
    ],
    'arquetipos' => [
      ['id' => 'arq_reveal', 'nome' => 'Reveal do Quadro (Malta)', 'dica' => 'Gancho: história 1ª pessoa ("Meu pai jura que não quer nada…"). A emoção É a prova. CTA com deadline real.', 'cenas' => [
        ['prompt' => 'Authentic handheld smartphone footage look, vertical 9:16, photorealistic. Gentle slow push-in on the person holding the framed artwork at chest height, their moved grateful smile slowly deepening, eyes glistening. Natural window light, subtle camera sway, cozy home ambience sounds. Identity fully preserved. No text overlays.', 'duracao' => 8],
        ['prompt' => 'Authentic handheld smartphone footage look, vertical 9:16, photorealistic. Slow push toward the framed artwork clearly revealing the portrait inside the ornate frame, then a soft settle back to the emotional face. Warm golden light, shallow depth of field, quiet room tone with soft fabric rustle. No text overlays.', 'duracao' => 8],
      ]],
      ['id' => 'arq_ugc', 'nome' => 'UGC Depoimento (look nativo)', 'dica' => 'Parecer conteúdo, não anúncio. Gancho falado em 1ª pessoa nos primeiros 3s. Voz com energia de amiga contando novidade.', 'cenas' => [
        ['prompt' => 'Authentic UGC smartphone selfie-style footage, vertical 9:16, photorealistic. The person talks casually toward camera with natural expressions and hand gestures, sitting in a bright everyday room. Slightly imperfect framing, natural daylight, real skin texture, casual authentic vibe, soft room ambience. No text overlays.', 'duracao' => 8],
        ['prompt' => 'Authentic UGC smartphone footage, vertical 9:16, photorealistic. Close handheld shot of the product being shown to camera, fingers pointing at details, natural light with slight motion blur, genuine unpolished feel, subtle handling sounds. No text overlays.', 'duracao' => 8],
      ]],
      ['id' => 'arq_pas', 'nome' => 'Problema → Virada (PAS)', 'dica' => 'Cena 1 espelha a DOR (sem produto). Cena 2 é a virada com o produto. Narração: problema → agitação → solução → CTA.', 'cenas' => [
        ['prompt' => 'Cinematic vertical 9:16, photorealistic. The person looks frustrated or unsure in an everyday setting, subtle tension in the expression, muted colors, slightly desaturated grade, quiet uneasy ambience. Natural light. No text overlays.', 'duracao' => 8],
        ['prompt' => 'Cinematic vertical 9:16, photorealistic. Mood flips: warm bright colors, the person now smiling with relief and joy while engaging with the product, uplifting energy, golden light, cozy ambient sounds. No text overlays.', 'duracao' => 8],
      ]],
      ['id' => 'arq_presente', 'nome' => 'Presente Entregue (reação)', 'dica' => 'A reação de quem RECEBE é o anúncio. Gancho: "Filmei a reação do meu pai…". Prova emocional pura.', 'cenas' => [
        ['prompt' => 'Authentic handheld smartphone footage, vertical 9:16, photorealistic. One person hands a wrapped gift to another; anticipation on both faces, cozy living room, natural light, genuine candid family moment, soft paper rustling ambience. No text overlays.', 'duracao' => 8],
        ['prompt' => 'Authentic handheld smartphone footage, vertical 9:16, photorealistic. The person unwraps and sees the framed artwork — genuine emotional reaction, hand to chest, teary joyful smile, the other person smiling behind. Warm light, heartfelt ambience. No text overlays.', 'duracao' => 8],
      ]],
      ['id' => 'arq_demo', 'nome' => 'Produto Direto (retargeting)', 'dica' => 'Produto no frame 1 — quem já conhece só precisa do empurrão. Narração curta: benefício + oferta + CTA forte.', 'cenas' => [
        ['prompt' => 'Premium product showcase, vertical 9:16, photorealistic. The framed artwork prominently displayed on a beautiful living room wall, slow elegant dolly-in revealing fine details of the frame and art, perfect warm lighting, upscale interior, subtle room ambience. No text overlays.', 'duracao' => 8],
      ]],
    ],
    'vozes' => [
      ['id' => 'gemini-tts:Charon', 'label' => '★ Gemini · masculina DIRIGÍVEL (a mais humana)', 'genero' => 'M'],
      ['id' => 'gemini-tts:Kore', 'label' => '★ Gemini · feminina DIRIGÍVEL (a mais humana)', 'genero' => 'F'],
      ['id' => 'gemini-tts:Puck', 'label' => '★ Gemini · masculina jovem DIRIGÍVEL', 'genero' => 'M'],
      ['id' => 'gemini-tts:Aoede', 'label' => '★ Gemini · feminina jovem DIRIGÍVEL', 'genero' => 'F'],
      ['id' => 'pt-BR-Chirp3-HD-Charon', 'label' => 'Chirp HD · masculina profunda natural', 'genero' => 'M'],
      ['id' => 'pt-BR-Chirp3-HD-Fenrir', 'label' => 'Chirp HD · masculina firme natural', 'genero' => 'M'],
      ['id' => 'pt-BR-Chirp3-HD-Puck', 'label' => 'Chirp HD · masculina jovem natural', 'genero' => 'M'],
      ['id' => 'pt-BR-Chirp3-HD-Orus', 'label' => 'Chirp HD · masculina calorosa', 'genero' => 'M'],
      ['id' => 'pt-BR-Chirp3-HD-Kore', 'label' => 'Chirp HD · feminina clara natural', 'genero' => 'F'],
      ['id' => 'pt-BR-Chirp3-HD-Aoede', 'label' => 'Chirp HD · feminina jovem natural', 'genero' => 'F'],
      ['id' => 'pt-BR-Chirp3-HD-Leda', 'label' => 'Chirp HD · feminina suave natural', 'genero' => 'F'],
      ['id' => 'pt-BR-Chirp3-HD-Zephyr', 'label' => 'Chirp HD · feminina expressiva', 'genero' => 'F'],
      ['id' => 'pt-BR-Neural2-B', 'label' => 'Clássica · masculina (Neural2-B)', 'genero' => 'M'],
      ['id' => 'pt-BR-Neural2-A', 'label' => 'Clássica · feminina (Neural2-A)', 'genero' => 'F'],
      ['id' => 'pt-BR-Neural2-C', 'label' => 'Clássica · feminina (Neural2-C)', 'genero' => 'F'],
      ['id' => 'pt-BR-Wavenet-B', 'label' => 'Clássica · masculina (Wavenet-B)', 'genero' => 'M'],
    ],
  ];
}

$config = jread('config.json', null);
if ($config === null) { $config = seed_config(); jwrite('config.json', $config); }
$presets = jread('presets.json', null);
if ($presets === null) {
  $presets = seed_presets(); jwrite('presets.json', $presets);
} else {
  // backfill de chaves novas (ex.: quadros/molduras) sem apagar o que o usuário editou
  $seed = null; $dirty = false;
  foreach (['quadros', 'molduras', 'estilos', 'templates', 'ganchos', 'vozes', 'arquetipos'] as $k) {
    if (!isset($presets[$k])) { $seed = $seed ?? seed_presets(); $presets[$k] = $seed[$k] ?? []; $dirty = true; }
  }
  // merge por id de itens novos do seed (vozes e quadros) — aparecem sem apagar edições do usuário
  $seed = $seed ?? seed_presets();
  foreach (['vozes' => 'prepend', 'quadros' => 'append'] as $k => $mode) {
    $haveIds = array_column($presets[$k] ?? [], 'id');
    $novos = array_values(array_filter($seed[$k] ?? [], fn($v) => !in_array($v['id'], $haveIds, true)));
    if ($novos) {
      $presets[$k] = $mode === 'prepend' ? array_merge($novos, $presets[$k] ?? []) : array_merge($presets[$k] ?? [], $novos);
      $dirty = true;
    }
  }
  if ($dirty) jwrite('presets.json', $presets);
}

// ---------- auth ----------
$action = $_GET['action'] ?? ($_POST['action'] ?? '');

function is_logged(): bool { return !empty($_SESSION['cricri_auth']); }
function require_login(): void { if (!is_logged()) fail('não autenticado', 401); }
function require_worker(array $config): void {
  $tok = $_SERVER['HTTP_X_CRICRI_TOKEN'] ?? ($_GET['token'] ?? ($_POST['token'] ?? ''));
  if (!hash_equals($config['worker_token'], (string)$tok)) fail('token inválido', 401);
}
// pro log de erros: aceita a sessão do navegador (Vitor no site) OU o token
// do worker (a ferramenta de consulta tools/error-log.mjs, rodando no Mac).
function require_login_or_worker(array $config): void {
  if (is_logged()) return;
  $tok = $_SERVER['HTTP_X_CRICRI_TOKEN'] ?? ($_GET['token'] ?? '');
  if (hash_equals($config['worker_token'], (string)$tok)) return;
  fail('não autenticado', 401);
}

// CSRF leve: POSTs de sessão exigem o header custom
$method = $_SERVER['REQUEST_METHOD'];
$isWorkerAction = str_starts_with($action, 'worker_');
if ($method === 'POST' && !$isWorkerAction && $action !== 'login') {
  if (($_SERVER['HTTP_X_CRICRI'] ?? '') !== '1') fail('header ausente', 400);
}

// ---------- público: vídeo/imagem servidos direto pelo Apache em /media ----------

switch ($action) {

  // ===== sessão =====
  case 'login': {
    $b = body();
    $pass = (string)($b['password'] ?? ($_POST['password'] ?? ''));
    if (!password_verify($pass, $config['password_hash'])) { usleep(600000); fail('senha incorreta', 401); }
    $_SESSION['cricri_auth'] = true;
    out(['ok' => true]);
  }

  case 'logout': {
    session_destroy();
    out(['ok' => true]);
  }

  case 'me': {
    out(['ok' => true, 'auth' => is_logged()]);
  }

  // ===== estado inicial =====
  case 'state': {
    require_login();
    $safeConfig = $config; unset($safeConfig['password_hash']);
    out([
      'ok'        => true,
      'config'    => $safeConfig,
      'criativos' => jread('criativos.json', []),
      'jobs'      => jread('jobs.json', []),
      'presets'   => jread('presets.json', seed_presets()),
    ]);
  }

  // ===== criativos =====
  case 'save_criativo': {
    require_login();
    $b = body();
    $c = $b['criativo'] ?? null;
    if (!is_array($c)) fail('criativo ausente');
    $c['nome'] = trim((string)($c['nome'] ?? ''));
    if ($c['nome'] === '') fail('dá um nome pro criativo');
    $modo = $c['modo'] ?? 'manual';
    if (!in_array($modo, ['manual', 'lp', 'quadro'], true)) fail('modo inválido');
    if ($modo === 'lp' && !filter_var($c['lp_url'] ?? '', FILTER_VALIDATE_URL)) fail('URL da LP inválida');
    if (in_array($modo, ['manual', 'quadro'], true)) {
      if (trim((string)($c['narracao'] ?? '')) === '') fail('narração vazia');
      if (empty($c['cenas']) || !is_array($c['cenas'])) fail('adicione ao menos 1 cena');
      foreach ($c['cenas'] as $i => $cena) {
        if (trim((string)($cena['prompt'] ?? '')) === '') fail('cena ' . ($i + 1) . ' sem prompt de movimento');
        // no modo quadro a imagem é gerada; só o manual exige imagem de referência por cena
        if ($modo === 'manual' && empty($cena['imagem'])) fail('cena ' . ($i + 1) . ' sem imagem de referência');
      }
    }
    if ($modo === 'quadro') {
      // ref_foto é OPCIONAL — sem ela, o worker inventa um personagem fictício
      // pelo contexto (estilo + cenário + nome). Só o estilo é obrigatório.
      if (trim((string)($c['quadro_prompt'] ?? '')) === '') fail('escolha o estilo do quadro');
    }
    $list = jread('criativos.json', []);
    $c['updated_at'] = now();
    $found = false;
    foreach ($list as $i => $old) {
      if (($old['id'] ?? '') === ($c['id'] ?? '__none__')) { $c['created_at'] = $old['created_at'] ?? now(); $list[$i] = $c; $found = true; break; }
    }
    if (!$found) { $c['id'] = rid('cr_'); $c['created_at'] = now(); array_unshift($list, $c); }
    jwrite('criativos.json', $list);
    out(['ok' => true, 'criativo' => $c]);
  }

  case 'delete_criativo': {
    require_login();
    $b = body();
    $id = (string)($b['id'] ?? '');
    $list = array_values(array_filter(jread('criativos.json', []), fn($c) => ($c['id'] ?? '') !== $id));
    jwrite('criativos.json', $list);
    out(['ok' => true]);
  }

  // ===== fila =====
  case 'queue_job': {
    require_login();
    $b = body();
    $id = (string)($b['criativo_id'] ?? '');
    $criativo = null;
    foreach (jread('criativos.json', []) as $c) if (($c['id'] ?? '') === $id) { $criativo = $c; break; }
    if (!$criativo) fail('criativo não encontrado');
    $jobs = jread('jobs.json', []);
    foreach ($jobs as $j) {
      if (($j['criativo_id'] ?? '') === $id && in_array($j['status'], ['queued', 'claimed', 'running'], true)) {
        fail('esse criativo já está na fila');
      }
    }
    $job = [
      'id' => rid('job_'), 'criativo_id' => $id, 'nome' => $criativo['nome'],
      'snapshot' => $criativo, 'status' => 'queued', 'pct' => 0, 'stage' => 'na fila',
      'log' => [], 'video' => null, 'error' => null,
      'created_at' => now(), 'updated_at' => now(),
    ];
    array_unshift($jobs, $job);
    jwrite('jobs.json', $jobs);
    out(['ok' => true, 'job' => $job]);
  }

  case 'job_action': {
    require_login();
    $b = body();
    $id = (string)($b['id'] ?? ''); $op = (string)($b['op'] ?? '');
    $jobs = jread('jobs.json', []);
    $outJob = null;
    foreach ($jobs as $i => $j) {
      if (($j['id'] ?? '') !== $id) continue;
      if ($op === 'cancel' && in_array($j['status'], ['queued', 'claimed', 'running'], true)) {
        $jobs[$i]['status'] = 'error'; $jobs[$i]['error'] = 'cancelado'; $jobs[$i]['stage'] = 'cancelado';
      } elseif ($op === 'retry' && $j['status'] === 'error') {
        $jobs[$i]['status'] = 'queued'; $jobs[$i]['error'] = null; $jobs[$i]['pct'] = 0; $jobs[$i]['stage'] = 'na fila'; $jobs[$i]['log'] = [];
      } elseif ($op === 'delete') {
        if (!empty($j['video'])) { $p = MEDIA . '/' . basename($j['video']); if (file_exists($p)) unlink($p); }
        unset($jobs[$i]);
      } else { fail('operação inválida pro status atual'); }
      $jobs = array_values($jobs);
      $outJob = $jobs[$i] ?? null;
      break;
    }
    jwrite('jobs.json', $jobs);
    out(['ok' => true, 'job' => $outJob]);
  }

  case 'jobs': {
    require_login();
    out(['ok' => true, 'jobs' => jread('jobs.json', [])]);
  }

  // ===== upload de imagem de referência =====
  case 'upload_image': {
    require_login();
    if (empty($_FILES['file'])) fail('arquivo ausente');
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) fail('falha no upload (' . $f['error'] . ')');
    if ($f['size'] > 15 * 1024 * 1024) fail('imagem acima de 15MB');
    $info = @getimagesize($f['tmp_name']);
    if (!$info) fail('não é uma imagem válida');
    $ext = image_type_to_extension($info[2], false);
    if (!in_array($ext, ['jpeg', 'jpg', 'png', 'webp'], true)) fail('formato não suportado (use jpg/png/webp)');
    $name = rid('img_') . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
    if (!move_uploaded_file($f['tmp_name'], UPLOADS . '/' . $name)) fail('não consegui salvar');
    out(['ok' => true, 'url' => 'media/up/' . $name]);
  }

  // ===== presets (biblioteca) =====
  case 'save_presets': {
    require_login();
    $b = body();
    $tipo = (string)($b['tipo'] ?? '');
    if (!in_array($tipo, ['estilos', 'templates', 'ganchos', 'vozes', 'quadros', 'molduras', 'arquetipos'], true)) fail('tipo inválido');
    $items = $b['items'] ?? null;
    if (!is_array($items)) fail('items inválido');
    $p = jread('presets.json', seed_presets());
    $p[$tipo] = $items;
    jwrite('presets.json', $p);
    out(['ok' => true, 'presets' => $p]);
  }

  // ===== config =====
  case 'save_config': {
    require_login();
    $b = body();
    if (isset($b['defaults']) && is_array($b['defaults'])) {
      $d = $config['defaults'];
      foreach (['voz', 'estiloLegenda', 'motor'] as $k) if (isset($b['defaults'][$k])) $d[$k] = (string)$b['defaults'][$k];
      foreach (['duracao_cena', 'max_cenas'] as $k) if (isset($b['defaults'][$k])) $d[$k] = max(1, (int)$b['defaults'][$k]);
      if (isset($b['defaults']['wps'])) $d['wps'] = max(1.0, min(5.0, (float)$b['defaults']['wps']));
      $config['defaults'] = $d;
    }
    if (!empty($b['new_password'])) {
      if (strlen((string)$b['new_password']) < 6) fail('senha nova muito curta (mín. 6)');
      $config['password_hash'] = password_hash((string)$b['new_password'], PASSWORD_DEFAULT);
    }
    if (!empty($b['worker_token'])) {
      if (strlen((string)$b['worker_token']) < 12) fail('token muito curto');
      $config['worker_token'] = (string)$b['worker_token'];
    }
    $config['updated_at'] = now();
    jwrite('config.json', $config);
    $safe = $config; unset($safe['password_hash']);
    out(['ok' => true, 'config' => $safe]);
  }

  // ===== worker (Mac) =====
  case 'worker_poll': {
    require_worker($config);
    $jobs = jread('jobs.json', []);
    $picked = null;
    // pega o job em fila mais antigo; jobs "claimed" há >15min voltam pra fila
    foreach ($jobs as $i => $j) {
      if (in_array($j['status'], ['claimed', 'running'], true)) {
        $age = time() - strtotime($j['updated_at'] ?? $j['created_at']);
        if ($age > 30 * 60) { $jobs[$i]['status'] = 'queued'; $jobs[$i]['stage'] = 'na fila (retomado)'; }
      }
    }
    for ($i = count($jobs) - 1; $i >= 0; $i--) {
      if ($jobs[$i]['status'] === 'queued') { $picked = $i; }
    }
    if ($picked === null) { jwrite('jobs.json', $jobs); out(['ok' => true, 'job' => null]); }
    $jobs[$picked]['status'] = 'claimed';
    $jobs[$picked]['stage'] = 'worker pegou o job';
    $jobs[$picked]['updated_at'] = now();
    jwrite('jobs.json', $jobs);
    out(['ok' => true, 'job' => $jobs[$picked]]);
  }

  case 'worker_progress': {
    require_worker($config);
    $b = body();
    $id = (string)($b['job_id'] ?? '');
    $jobs = jread('jobs.json', []);
    foreach ($jobs as $i => $j) {
      if (($j['id'] ?? '') !== $id) continue;
      // não ressuscita job já terminal (error/done/cancelado) — evita corrida de progresso em voo
      if (in_array($j['status'], ['error', 'done'], true)) break;
      $jobs[$i]['status'] = 'running';
      if (isset($b['pct'])) $jobs[$i]['pct'] = max(0, min(99, (int)$b['pct']));
      if (isset($b['stage'])) $jobs[$i]['stage'] = mb_substr((string)$b['stage'], 0, 120);
      if (!empty($b['log'])) {
        $jobs[$i]['log'][] = '[' . date('H:i:s') . '] ' . mb_substr((string)$b['log'], 0, 400);
        $jobs[$i]['log'] = array_slice($jobs[$i]['log'], -60);
      }
      $jobs[$i]['updated_at'] = now();
      break;
    }
    jwrite('jobs.json', $jobs);
    out(['ok' => true]);
  }

  case 'worker_done': {
    require_worker($config);
    $id = (string)($_POST['job_id'] ?? '');
    if ($id === '' || empty($_FILES['video'])) fail('job_id/vídeo ausente');
    $f = $_FILES['video'];
    if ($f['error'] !== UPLOAD_ERR_OK) fail('upload do vídeo falhou (' . $f['error'] . ')');
    $name = rid('cri_') . '.mp4';
    if (!move_uploaded_file($f['tmp_name'], MEDIA . '/' . $name)) fail('não consegui salvar o vídeo');
    $jobs = jread('jobs.json', []);
    foreach ($jobs as $i => $j) {
      if (($j['id'] ?? '') !== $id) continue;
      $jobs[$i]['status'] = 'done';
      $jobs[$i]['pct'] = 100;
      $jobs[$i]['stage'] = 'pronto';
      $jobs[$i]['video'] = 'media/' . $name;
      $jobs[$i]['updated_at'] = now();
      break;
    }
    jwrite('jobs.json', $jobs);
    out(['ok' => true, 'video' => 'media/' . $name]);
  }

  case 'worker_error': {
    require_worker($config);
    $b = body();
    $id = (string)($b['job_id'] ?? '');
    $jobs = jread('jobs.json', []);
    foreach ($jobs as $i => $j) {
      if (($j['id'] ?? '') !== $id) continue;
      $jobs[$i]['status'] = 'error';
      $jobs[$i]['stage'] = 'erro';
      $jobs[$i]['error'] = mb_substr((string)($b['message'] ?? 'erro desconhecido'), 0, 600);
      $jobs[$i]['updated_at'] = now();
      break;
    }
    jwrite('jobs.json', $jobs);
    out(['ok' => true]);
  }

  // ===== log de erros =====
  case 'worker_log_error': {
    require_worker($config);
    $b = body();
    $entry = log_error_entry(
      (string)($b['source'] ?? 'worker'),
      (string)($b['message'] ?? 'erro desconhecido'),
      isset($b['stack']) ? (string)$b['stack'] : null,
      is_array($b['context'] ?? null) ? $b['context'] : []
    );
    out(['ok' => true, 'id' => $entry['id']]);
  }

  case 'log_client_error': {
    require_login();
    $b = body();
    $entry = log_error_entry(
      'browser:' . mb_substr((string)($b['source'] ?? 'app.js'), 0, 60),
      (string)($b['message'] ?? 'erro desconhecido'),
      isset($b['stack']) ? (string)$b['stack'] : null,
      ['url' => $b['url'] ?? null, 'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null]
    );
    out(['ok' => true, 'id' => $entry['id']]);
  }

  case 'errors': {
    require_login_or_worker($config);
    $errors = array_reverse(jread('errors.json', []));
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 60)));
    out(['ok' => true, 'errors' => array_slice($errors, 0, $limit)]);
  }

  case 'error_get': {
    require_login_or_worker($config);
    $id = (int)($_GET['id'] ?? 0);
    foreach (jread('errors.json', []) as $e) {
      if ((int)($e['id'] ?? 0) === $id) out(['ok' => true, 'error' => $e]);
    }
    fail('erro #' . $id . ' não encontrado', 404);
  }

  default:
    fail('ação desconhecida: ' . $action, 404);
}
