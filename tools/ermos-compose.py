#!/usr/bin/env python3
"""Monta o QUADRO 2D do modo ERMOS: arte + moldura + sombra, PNG com alpha.

E' o "produto flutuante" que sobrepoe o video de fundo (replica da estrutura
do ad Ermos: camiseta flutuando -> aqui, quadro emoldurado flutuando).

Molduras: TODAS sao foto de moldura REAL do Vitor (tools/assets/moldura-*.png,
interior verde chroma; a arte e' warpada no verde). Nada de moldura desenhada
em codigo — o anuncio mostra a moldura que ele de fato vende.
Pra somar uma moldura nova: tools/moldura-foto.py converte a foto crua.

Uso:
  tools/.venv-compose/bin/python tools/ermos-compose.py \
      --arte <img> --moldura preto --out quadro.png [--largura 900]
Saida: PNG RGBA (sombra baked no alpha), proporcao ~3:4 retrato.
"""
import argparse
import os
import sys

import cv2
import numpy as np

ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'assets')
MOLDURAS = ['preto', 'branco', 'marfim', 'arabesco']


def caminho_asset(nome):
    return os.path.join(ASSETS_DIR, f'moldura-{nome}.png')


# TAMANHO UNICO por orientacao. O acervo NAO e' padronizado (as verticais vao
# de 0.60 a 0.96), entao derivar o quadro da arte fazia a moldura mudar de
# tamanho a cada troca. Agora a moldura e' sempre a mesma e quem muda e' so' a
# arte — que entra INTEIRA sobre um passe-partout, como numa moldaria de
# verdade. Cortar as obras pra encaixar seria mutilar a pintura.
ASPECT_RETRATO = 0.707    # 1:raiz(2) — reproduz a altura aprovada pelo Vitor
ASPECT_PAISAGEM = 1.414
ASPECT_QUADRADO = 1.0
SOMBRA_BLUR = 31        # sombra portada (baked)
SOMBRA_ALPHA = 110
SOMBRA_DESLOC = 18


def painel(arte, largura, altura):
    """A ABERTURA da moldura tem sempre este tamanho e a obra PREENCHE ela
    inteira: escala pelo lado que falta e apara o excedente pelo centro.
    Nada de passe-partout e nada de esticao — a obra nunca deforma."""
    ah, aw = arte.shape[:2]
    k = max(largura / aw, altura / ah)          # cobre (nao cabe): sem margem
    nw, nh = max(largura, int(round(aw * k))), max(altura, int(round(ah * k)))
    grande = cv2.resize(arte, (nw, nh), interpolation=cv2.INTER_AREA)
    x0, y0 = (nw - largura) // 2, (nh - altura) // 2
    return grande[y0:y0 + altura, x0:x0 + largura]


def aspecto_padrao(arte):
    """Orientacao da arte -> o aspecto FIXO daquele lado. Foto em pe' nunca
    vira quadro deitado, e duas fotos em pe' geram exatamente o mesmo quadro."""
    h, w = arte.shape[:2]
    r = w / h
    if r > 1.04:
        return ASPECT_PAISAGEM
    if r < 0.96:
        return ASPECT_RETRATO
    return ASPECT_QUADRADO


def carrega_asset(nome):
    """Devolve (BGR, alpha) da foto da moldura. Assets novos (moldura-foto.py)
    ja' vem com alpha; o arabesco e' legado em fundo branco — ali a mascara sai
    do proprio branco. Por isso o alpha existe: numa moldura BRANCA nao da'
    pra separar o pau do fundo por cor."""
    caminho = caminho_asset(nome)
    img = cv2.imread(caminho, cv2.IMREAD_UNCHANGED)
    if img is None:
        sys.exit(f'asset nao encontrado: {caminho} — rode o tools/moldura-foto.py')
    if img.ndim == 3 and img.shape[2] == 4:
        return img[..., :3].copy(), img[..., 3].copy()
    bgr = img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    alpha = cv2.morphologyEx((bgr.astype(int).sum(axis=2) < 720).astype(np.uint8) * 255,
                             cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return bgr, alpha


def moldura_asset(arte, nome, largura, aspect):
    """Foto de moldura real: recorta, warpa o painel no miolo verde.
    O asset e' retrato — se a arte for deitada, gira a moldura 90 graus."""
    fr, alpha = carrega_asset(nome)
    if aspect > 1.0:  # arte deitada -> moldura deitada
        fr = cv2.rotate(fr, cv2.ROTATE_90_CLOCKWISE)
        alpha = cv2.rotate(alpha, cv2.ROTATE_90_CLOCKWISE)
    ys, xs = np.where(alpha > 20)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    fr = fr[y0:y1 + 1, x0:x1 + 1]
    alpha_fr = alpha[y0:y1 + 1, x0:x1 + 1]

    # quad verde -> warp da arte (mesma tecnica do art-keyframes)
    hsv = cv2.cvtColor(fr, cv2.COLOR_BGR2HSV)
    verde = cv2.inRange(hsv, (35, 45, 45), (90, 255, 255))
    verde = cv2.morphologyEx(verde, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cnts, _ = cv2.findContours(verde, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quad = cv2.boxPoints(cv2.minAreaRect(max(cnts, key=cv2.contourArea)))
    s = quad.sum(axis=1); d = np.diff(quad, axis=1).ravel()
    quad = np.array([quad[np.argmin(s)], quad[np.argmin(d)], quad[np.argmax(s)], quad[np.argmax(d)]], np.float32)

    # o painel nasce NA PROPORCAO da abertura verde — se nascesse na proporcao
    # da arte, o warp esticaria o passe-partout pra caber no quad
    quad_w = int(round(max(np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3]))))
    quad_h = int(round(max(np.linalg.norm(quad[3] - quad[0]), np.linalg.norm(quad[2] - quad[1]))))
    pnl = painel(arte, max(2, quad_w), max(2, quad_h))
    ah, aw = pnl.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], np.float32)
    H = cv2.getPerspectiveTransform(src, quad)
    warp = cv2.warpPerspective(pnl, H, (fr.shape[1], fr.shape[0]), flags=cv2.INTER_LINEAR)
    # o verde some ANTES da composicao: no subpixel da borda o warp nao cobre
    # 100% do miolo e sobrava um fio verde em volta da arte. Fica a cor media
    # da propria obra, entao o fio (se sobrar) some dentro dela.
    fr = fr.copy()
    fr[cv2.dilate(verde, np.ones((5, 5), np.uint8)) > 0] = pnl.reshape(-1, 3).mean(0)
    alpha_arte = (cv2.GaussianBlur(verde, (3, 3), 0).astype(np.float32) / 255)[..., None]
    comp = (warp * alpha_arte + fr * (1 - alpha_arte)).astype(np.uint8)

    # alpha do quadro: o do asset, com o miolo somado e os buracos fechados
    solido = cv2.morphologyEx(((alpha_fr > 20) | (verde > 0)).astype(np.uint8) * 255,
                              cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts2, _ = cv2.findContours(solido, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    alpha_out = np.zeros(solido.shape, np.uint8)
    cv2.drawContours(alpha_out, [max(cnts2, key=cv2.contourArea)], -1, 255, -1)

    bgra = cv2.cvtColor(comp, cv2.COLOR_BGR2BGRA)
    bgra[..., 3] = alpha_out
    alt = int(largura / aspect)
    return cv2.resize(bgra, (largura, alt), interpolation=cv2.INTER_AREA)


def com_sombra(bgra):
    """Sombra portada suave baked (canvas maior, deslocada pra baixo)."""
    h, w = bgra.shape[:2]
    pad = SOMBRA_BLUR * 2
    canvas = np.zeros((h + pad * 2 + SOMBRA_DESLOC, w + pad * 2, 4), np.uint8)
    sombra = np.zeros(canvas.shape[:2], np.float32)
    a = (bgra[..., 3].astype(np.float32) / 255)
    sombra[pad + SOMBRA_DESLOC:pad + SOMBRA_DESLOC + h, pad:pad + w] = a
    sombra = cv2.GaussianBlur(sombra, (0, 0), SOMBRA_BLUR / 2) * SOMBRA_ALPHA
    canvas[..., 3] = sombra.astype(np.uint8)  # preto transparente = sombra
    # cola o quadro por cima
    y0, x0 = pad, pad
    roi = canvas[y0:y0 + h, x0:x0 + w]
    af = a[..., None]
    roi[..., :3] = (bgra[..., :3] * af + roi[..., :3] * (1 - af)).astype(np.uint8)
    # int32 antes de somar: uint8+uint8 estoura (110+255 -> 109 = quadro fantasma)
    roi[..., 3] = np.clip(roi[..., 3].astype(np.int32) + bgra[..., 3].astype(np.int32), 0, 255).astype(np.uint8)
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--arte', required=True)
    ap.add_argument('--moldura', required=True, choices=MOLDURAS)
    ap.add_argument('--out', required=True)
    ap.add_argument('--largura', type=int, default=900)
    ap.add_argument('--aspecto', type=float, default=None,
                    help='forca o aspecto do quadro (o fromErmos manda o mesmo pra todas '
                         'as artes do video, pra moldura nao mudar de tamanho na troca)')
    args = ap.parse_args()

    arte = cv2.imread(args.arte, cv2.IMREAD_COLOR)
    if arte is None:
        sys.exit(f'arte ilegivel: {args.arte}')
    # o quadro herda a ORIENTACAO da arte (nunca deitar uma foto em pe'), mas o
    # TAMANHO e' fixo: quem muda entre uma arte e outra e' so' a obra
    aspect = args.aspecto if args.aspecto else aspecto_padrao(arte)
    largura = args.largura

    quadro = moldura_asset(arte, args.moldura, largura, aspect)
    final = com_sombra(quadro)
    cv2.imwrite(args.out, final)
    orient = 'retrato' if aspect < 0.98 else ('quadrado' if aspect <= 1.02 else 'paisagem')
    print(f'OK {args.moldura} {orient} ({aspect:.2f}) {final.shape[1]}x{final.shape[0]} -> {args.out}')


if __name__ == '__main__':
    main()
