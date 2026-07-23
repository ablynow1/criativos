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
<meta name="theme-color" content="#0a0a0c">
<meta name="robots" content="noindex,nofollow">
<title>Quadros · Estúdio</title>
<?php /* As fontes da marca LV: Instrument Serif (display) + Geist (texto).
         O CSS já as pedia, mas ninguém as baixava — a serif que aparecia era
         o fallback do sistema. A CSP da pasta já libera o Google Fonts. */ ?>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="<?= $v('assets/style.css') ?>">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='3' y='2' width='18' height='20' rx='2' fill='none' stroke='%23e8b44a' stroke-width='2'/><rect x='7' y='6' width='10' height='12' fill='%23e8b44a'/></svg>">
</head>
<body>
<div id="app" aria-live="polite">
  <div class="boot"><div class="boot-mark">Quadros</div><div class="boot-sk"><i></i><i></i><i></i></div></div>
</div>
<script src="<?= $v('assets/app.js') ?>"></script>
</body>
</html>
