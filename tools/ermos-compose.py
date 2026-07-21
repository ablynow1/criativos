#!/usr/bin/env python3
"""Monta o QUADRO 2D do modo ERMOS: arte + moldura + sombra, PNG com alpha.

E' o "produto flutuante" que sobrepoe o video de fundo (replica da estrutura
do ad Ermos: camiseta flutuando -> aqui, quadro emoldurado flutuando).

Molduras:
  preto | branco | marfim  -> procedurais (borda flat com bevel sutil + filete)
  arabesco                 -> asset ornamentado (tools/assets/moldura-arabesco.png,
                              interior verde chroma; a arte e' warpada no verde)

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

ASSET_ARABESCO = os.path.join(os.path.dirname(__file__), 'assets', 'moldura-arabesco.png')

CORES = {
    'preto':  {'face': (26, 26, 26),    'clara': (56, 56, 56),    'escura': (10, 10, 10)},
    'branco': {'face': (242, 244, 244), 'clara': (255, 255, 255), 'escura': (205, 208, 208)},
    'marfim': {'face': (204, 224, 236), 'clara': (224, 240, 248), 'escura': (168, 190, 208)},  # BGR (marfim quente)
}
ASPECT_PADRAO = 3 / 4   # retrato 3:4 quando a arte já e' retrato
ASPECT_MIN, ASPECT_MAX = 0.6, 1.7   # limites (evita quadro exageradamente fino/largo)
BORDA_FRAC = 0.075      # largura da moldura procedural
SOMBRA_BLUR = 31        # sombra portada (baked)
SOMBRA_ALPHA = 110
SOMBRA_DESLOC = 18


def crop_aspect(img, aspect):
    h, w = img.shape[:2]
    if w / h > aspect:
        nw = int(h * aspect); x0 = (w - nw) // 2
        return img[:, x0:x0 + nw]
    nh = int(w / aspect); y0 = (h - nh) // 2
    return img[y0:y0 + nh, :]


def aspecto_da_arte(arte):
    """O quadro SEGUE a orientacao da arte: foto em pe' -> quadro em pe';
    foto deitada -> quadro deitado. Nunca girar/espremer o que o Vitor subiu."""
    h, w = arte.shape[:2]
    return float(np.clip(w / h, ASPECT_MIN, ASPECT_MAX))


def moldura_procedural(arte, cor, largura, aspect):
    """Borda flat com bevel + filete interno; devolve BGRA sem sombra."""
    c = CORES[cor]
    alt = int(largura / aspect)
    borda = int(largura * BORDA_FRAC)
    arte_w, arte_h = largura - 2 * borda, alt - 2 * borda
    arte_r = cv2.resize(arte, (arte_w, arte_h), interpolation=cv2.INTER_AREA)

    quadro = np.zeros((alt, largura, 3), np.uint8)
    quadro[:] = c['face']
    # bevel: luz em cima/esquerda, sombra embaixo/direita (45°)
    bl = max(2, borda // 6)
    quadro[:bl, :] = c['clara']; quadro[:, :bl] = c['clara']
    quadro[-bl:, :] = c['escura']; quadro[:, -bl:] = c['escura']
    # filete interno (linha fina separando moldura/arte, dá leitura de encaixe)
    f0 = borda - max(2, bl // 2)
    cv2.rectangle(quadro, (f0, f0), (largura - f0, alt - f0), c['escura'], max(1, bl // 2))
    # arte + leve sombra interna no perímetro (assenta a arte)
    quadro[borda:borda + arte_h, borda:borda + arte_w] = arte_r
    m = np.zeros((alt, largura), np.float32)
    cv2.rectangle(m, (borda, borda), (largura - borda, alt - borda), 1.0, max(2, bl))
    m = cv2.GaussianBlur(m, (0, 0), bl)
    quadro = np.clip(quadro.astype(np.float32) * (1 - 0.35 * m[..., None]), 0, 255).astype(np.uint8)

    bgra = cv2.cvtColor(quadro, cv2.COLOR_BGR2BGRA)
    return bgra


def moldura_arabesco(arte, largura, aspect):
    """Asset ornamentado: recorta do branco, warpa a arte no verde.
    O asset e' retrato — se a arte for deitada, gira a moldura 90 graus
    (o ornamento e' simetrico, entao a leitura continua correta)."""
    asset = cv2.imread(ASSET_ARABESCO, cv2.IMREAD_COLOR)
    if asset is None:
        sys.exit(f'asset nao encontrado: {ASSET_ARABESCO}')
    if aspect > 1.0:  # arte deitada -> moldura deitada
        asset = cv2.rotate(asset, cv2.ROTATE_90_CLOCKWISE)
    # bbox da moldura = tudo que nao e' branco-quase-puro
    nao_branco = (asset.astype(int).sum(axis=2) < 720).astype(np.uint8) * 255
    nao_branco = cv2.morphologyEx(nao_branco, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    ys, xs = np.where(nao_branco > 0)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    fr = asset[y0:y1 + 1, x0:x1 + 1]

    # quad verde -> warp da arte (mesma tecnica do art-keyframes)
    hsv = cv2.cvtColor(fr, cv2.COLOR_BGR2HSV)
    verde = cv2.inRange(hsv, (35, 45, 45), (90, 255, 255))
    verde = cv2.morphologyEx(verde, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cnts, _ = cv2.findContours(verde, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quad = cv2.boxPoints(cv2.minAreaRect(max(cnts, key=cv2.contourArea)))
    s = quad.sum(axis=1); d = np.diff(quad, axis=1).ravel()
    quad = np.array([quad[np.argmin(s)], quad[np.argmin(d)], quad[np.argmax(s)], quad[np.argmax(d)]], np.float32)

    ah, aw = arte.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], np.float32)
    H = cv2.getPerspectiveTransform(src, quad)
    warp = cv2.warpPerspective(arte, H, (fr.shape[1], fr.shape[0]), flags=cv2.INTER_LINEAR)
    alpha_arte = (cv2.GaussianBlur(verde, (3, 3), 0).astype(np.float32) / 255)[..., None]
    comp = (warp * alpha_arte + fr * (1 - alpha_arte)).astype(np.uint8)

    # alpha do quadro: moldura + interior (fecha buracos), fora = transparente
    solido = cv2.morphologyEx(((comp.astype(int).sum(axis=2) < 720) | (verde > 0)).astype(np.uint8) * 255,
                              cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts2, _ = cv2.findContours(solido, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    alpha = np.zeros(solido.shape, np.uint8)
    cv2.drawContours(alpha, [max(cnts2, key=cv2.contourArea)], -1, 255, -1)

    bgra = cv2.cvtColor(comp, cv2.COLOR_BGR2BGRA)
    bgra[..., 3] = alpha
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
    ap.add_argument('--moldura', required=True, choices=['preto', 'branco', 'marfim', 'arabesco'])
    ap.add_argument('--out', required=True)
    ap.add_argument('--largura', type=int, default=900)
    args = ap.parse_args()

    arte = cv2.imread(args.arte, cv2.IMREAD_COLOR)
    if arte is None:
        sys.exit(f'arte ilegivel: {args.arte}')
    # o quadro herda a ORIENTACAO da arte (nunca deitar uma foto em pe')
    aspect = aspecto_da_arte(arte)
    arte = crop_aspect(arte, aspect)   # so' apara o excesso, nao gira nada
    # arte deitada com largura fixa ficaria gigante — normaliza pela area
    largura = args.largura if aspect <= 1 else int(args.largura * 1.12)

    if args.moldura == 'arabesco':
        quadro = moldura_arabesco(arte, largura, aspect)
    else:
        quadro = moldura_procedural(arte, args.moldura, largura, aspect)
    final = com_sombra(quadro)
    cv2.imwrite(args.out, final)
    orient = 'retrato' if aspect < 0.98 else ('quadrado' if aspect <= 1.02 else 'paisagem')
    print(f'OK {args.moldura} {orient} ({aspect:.2f}) {final.shape[1]}x{final.shape[0]} -> {args.out}')


if __name__ == '__main__':
    main()
