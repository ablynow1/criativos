<?php
/**
 * Roteador do servidor LOCAL de desenvolvimento do estúdio (php -S).
 *
 * Mora fora de web/quadros de propósito: o deploy é um mirror da pasta, então
 * nada aqui sobe pro servidor por acidente.
 *
 * Serve os arquivos locais normalmente e faz PROXY do que é pesado e não vive
 * no Mac — media/ (keyframes, vídeos, thumbs) — direto da produção. Assim a UI
 * local fica visualmente idêntica à real sem baixar gigabytes.
 *
 * Uso (via .claude/launch.json):
 *   php -S 127.0.0.1:8788 -t criativos/web/quadros criativos/tools/dev-router.php
 */
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$local = __DIR__ . '/../web/quadros' . $uri;

// mídia que não existe local: puxa da produção e cacheia em memória do browser
if (preg_match('#^/media/#', $uri) && !file_exists($local)) {
    $remoto = 'https://lventerprise.com.br/criativos/quadros' . $uri;
    $ctx = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true]]);
    $bin = @file_get_contents($remoto, false, $ctx);
    if ($bin === false) { http_response_code(404); exit; }
    $tipo = str_ends_with($uri, '.mp4') ? 'video/mp4'
          : (str_ends_with($uri, '.png') ? 'image/png' : 'image/jpeg');
    header("Content-Type: $tipo");
    header('Cache-Control: public, max-age=86400');
    echo $bin;
    exit;
}

return false;   // o servidor embutido resolve o resto
