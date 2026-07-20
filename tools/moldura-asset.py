#!/usr/bin/env python3
"""Converte a FOTO de uma moldura real (PNG com fundo transparente OU branco)
no asset padrao do modo Ermos: moldura + interior VERDE chroma + fundo branco.

E' o formato que o ermos-compose.py espera pra warpar a arte no miolo.
Uso (a cada moldura nova que o Vitor mandar):
  tools/.venv-compose/bin/python tools/moldura-asset.py \
      --in ~/Downloads/moldura.png --out tools/assets/moldura-arabesco.png
"""
import argparse
import sys

import cv2
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    img = cv2.imread(args.inp, cv2.IMREAD_UNCHANGED)
    if img is None:
        sys.exit(f'imagem ilegivel: {args.inp}')

    if img.ndim == 3 and img.shape[2] == 4:
        alpha = img[..., 3]
        rgb = img[..., :3]
        vazio = (alpha < 20).astype(np.uint8)          # transparente
    else:
        rgb = img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        vazio = (rgb.astype(int).sum(axis=2) > 735).astype(np.uint8)  # branco-quase-puro
        alpha = (1 - vazio) * 255

    # exterior = vazio conectado a borda (flood fill); interior = vazio restante
    h, w = vazio.shape
    ff = vazio.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if ff[seed[1], seed[0]]:
            cv2.floodFill(ff, mask, seed, 2)
    exterior = (ff == 2)
    interior = (vazio == 1) & ~exterior
    if interior.sum() < 0.05 * h * w:
        sys.exit('nao achei o miolo da moldura (interior fechado) — a foto esta inteira?')

    # composita a moldura sobre branco (bordas antialiased ficam limpas)
    a = (alpha.astype(np.float32) / 255)[..., None]
    canvas = (rgb * a + 255 * (1 - a)).astype(np.uint8)
    canvas[interior] = (0, 255, 0)  # miolo = verde chroma puro

    # recorta com folga minima em volta da moldura
    ys, xs = np.where(alpha > 20)
    pad = 8
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad)
    out = canvas[y0:y1, x0:x1]
    cv2.imwrite(args.out, out)
    print(f'OK asset {out.shape[1]}x{out.shape[0]} -> {args.out}')


if __name__ == '__main__':
    main()
