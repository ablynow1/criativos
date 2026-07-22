<?php
/* ESTÚDIO DE QUADROS — mockup nativo de vitrine · shell
   A versão do cache sai do próprio arquivo (filemtime): deploy novo = URL
   nova, automaticamente. Antes era um número na mão e esquecer de subir ele
   servia a versão velha em silêncio. */
$v = static fn(string $f): string => $f . '?v=' . @filemtime(__DIR__ . '/' . $f);
// o HTML NUNCA pode ficar em cache: é ele que carrega a versão dos assets.
// Cacheado, o navegador continua pedindo o app.js velho pra sempre.
header('Cache-Control: no-store, must-revalidate');
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#14100b">
<meta name="robots" content="noindex,nofollow">
<title>Quadros · Estúdio de Mockups</title>
<link rel="stylesheet" href="<?= $v('assets/style.css') ?>">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🖼️</text></svg>">
</head>
<body>
<div id="app" aria-live="polite">
  <div class="boot"><div class="boot-mark">Quadros</div><div class="boot-sk"><i></i><i></i><i></i></div></div>
</div>
<script src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
