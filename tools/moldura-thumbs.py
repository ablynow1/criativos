#!/usr/bin/env python3
"""Gera as miniaturas das molduras pro seletor do estudio.

O botao de escolher moldura tem que mostrar a MOLDURA, nao um emoji: e' a
mesma foto que vai pro criativo, com o miolo em cinza neutro (quadro vazio).
Saida: web/quadros/assets/molduras/<id>.jpg

Uso: tools/.venv-compose/bin/python tools/moldura-thumbs.py
"""
import os

import cv2
import numpy as np

AQUI = os.path.dirname(__file__)
RAIZ = os.path.dirname(AQUI)
SAIDA = os.path.join(RAIZ, 'web/quadros/assets/molduras')
MOLDURAS = ['preto', 'branco', 'marfim', 'arabesco']
MIOLO = (58, 56, 54)   # BGR — cinza neutro escuro, casa com o tema do painel
LARG = 210


def main():
    os.makedirs(SAIDA, exist_ok=True)
    for nome in MOLDURAS:
        caminho = os.path.join(AQUI, 'assets', f'moldura-{nome}.png')
        img = cv2.imread(caminho, cv2.IMREAD_UNCHANGED)
        if img is None:
            print(f'· {nome}: sem asset, pulando')
            continue
        bgr = img[..., :3] if img.shape[2] == 4 else img
        alpha = (img[..., 3] if img.shape[2] == 4
                 else (bgr.astype(int).sum(axis=2) < 720).astype(np.uint8) * 255)
        ys, xs = np.where(alpha > 20)
        bgr = bgr[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        # miolo verde -> cinza neutro (le como quadro vazio, nao como bug)
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        verde = cv2.inRange(hsv, (35, 45, 45), (90, 255, 255))
        bgr[verde > 0] = MIOLO
        alt = int(LARG * bgr.shape[0] / bgr.shape[1])
        thumb = cv2.resize(bgr, (LARG, alt), interpolation=cv2.INTER_AREA)
        destino = os.path.join(SAIDA, f'{nome}.jpg')
        cv2.imwrite(destino, thumb, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f'✓ {nome}: {LARG}x{alt} -> {destino}')


if __name__ == '__main__':
    main()
