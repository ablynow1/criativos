#!/usr/bin/env python3
"""Compoe a FOTO REAL do verso do quadro no keyframe estatico (K12 -> K15).

Etapa 1 do fluxo aprovado com o Vitor: primeiro a IMAGEM com o verso correto
(pra aprovacao), so depois o video. Nada de img2img aqui — o Nano Banana lava
as cores da fita/MDF; a foto entra por warp direto (homografia unica), entao
as cores sao literalmente as da foto.

- Retifica o verso na foto real (4 cantos da borda de pinus) pra um retangulo.
- Warpa esse retangulo pros 4 cantos da silhueta do verso no keyframe.
- Luz: fit PLANAR (linear em x,y) da luminancia L da cena dentro do quad,
  aplicado como mapa de ganho na textura — preserva o gradiente da loja sem
  imprimir fantasmas do verso antigo; a/b (cor) ficam os da foto real.
- Oclusao: maos (mascara de pele) ficam POR CIMA.
- Borda: mascara erodida 1px + feather curto — a linha escura fina da
  silhueta original sobrevive e ancora o quadro no fundo.
- Nitidez: a textura e' levemente borrada pra casar com a acutancia da cena.

Uso:
  tools/.venv-compose/bin/python tools/mockup-verso-static.py
(cantos hardcoded pro par K12 + inputs/verso-real.jpeg; editar abaixo se mudar)
"""
import cv2
import numpy as np

FOTO = "inputs/verso-real.jpeg"
KEYFRAME = "output/mockup-loja/keyframes/K12.png"
OUT = "output/mockup-loja/keyframes/K15.png"
OUT_FLAT = "output/mockup-loja/keyframes/verso-real-full-flat.png"

# cantos do verso COMPLETO (borda externa de pinus) na foto real (1200x1600)
FOTO_QUAD = np.array([[202, 248], [1044, 233], [1030, 1300], [243, 1313]],
                     dtype=np.float32)
# cantos da silhueta do verso no K12 (768x1376), lidos em zoom 5x
KEY_QUAD = np.array([[411, 497], [743, 541], [615, 1068], [328, 1003]],
                    dtype=np.float32)
# Poligonos dos DEDOS dela por cima do quadro (lidos em zoom 4x no K12).
# Range HSV de pele nao serve aqui: pinus/kraft caem no mesmo range e a pintura
# fura (v1) ou fita original vaza dentro do ROI (v2). Copiar o original de
# volta nesses poligonos e' exato — e se pegarem 2-3px de pinus, o pinus da
# foto cai no mesmo lugar, invisivel.
FINGER_POLYS = [
    # ponta do dedo + unha da mao direita, pega de cima na aresta esquerda
    [(363, 610), (400, 614), (401, 655), (385, 664), (363, 650)],
    # dedos + unha vermelha + sombra deles, pega de baixo na aresta esquerda
    [(296, 912), (345, 918), (360, 940), (362, 985), (330, 990), (298, 960)],
]
INSET = 2.0     # px pra dentro na foto: evita fiapo de chao na borda da textura
BLUR_TEX = 1.1  # sigma: casa a nitidez da foto com a do keyframe


def inset_quad(q, px):
    c = q.mean(axis=0)
    v = c - q
    n = np.linalg.norm(v, axis=1, keepdims=True)
    return q + v / n * px


def finger_mask(shape):
    m = np.zeros(shape, np.uint8)
    for poly in FINGER_POLYS:
        cv2.fillPoly(m, [np.array(poly, np.int32)], 255)
    return m


def main():
    foto = cv2.imread(FOTO)
    key = cv2.imread(KEYFRAME)
    Hh, W = key.shape[:2]

    # --- 1) retifica o verso real pra um retangulo flat ---
    fq = inset_quad(FOTO_QUAD, INSET)
    wt = (np.linalg.norm(fq[1] - fq[0]) + np.linalg.norm(fq[2] - fq[3])) / 2
    ht = (np.linalg.norm(fq[3] - fq[0]) + np.linalg.norm(fq[2] - fq[1])) / 2
    tw, th = int(round(wt)), int(round(ht))
    dst = np.array([[0, 0], [tw, 0], [tw, th], [0, th]], dtype=np.float32)
    Hf = cv2.getPerspectiveTransform(fq, dst)
    flat = cv2.warpPerspective(foto, Hf, (tw, th), flags=cv2.INTER_LANCZOS4)
    cv2.imwrite(OUT_FLAT, flat)
    print(f"flat: {tw}x{th} (aspecto {tw/th:.3f})")

    # --- 2) luz da cena: fit planar de L SO' no MIOLO do quad ---
    # O quad inteiro inclui a barra de pinus clara e a banda escura do rebaixo
    # do K12 — um plano nao representa "aro claro + miolo": ele tomba e lava a
    # textura (v2). Amostrar so o interior (quad encolhido 15%) e amortecer o
    # gradiente resolve.
    poly = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(poly, KEY_QUAD.astype(np.int32), 255)
    ctr = KEY_QUAD.mean(axis=0)
    inner_q = (ctr + (KEY_QUAD - ctr) * 0.85).astype(np.int32)
    inner = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(inner, inner_q, 255)
    sample = inner & ~finger_mask((Hh, W))
    L_key = cv2.cvtColor(key, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    ys, xs = np.nonzero(sample)
    vals = L_key[ys, xs]
    lo, hi = np.percentile(vals, [5, 95])
    keep = (vals >= lo) & (vals <= hi)
    ys, xs, vals = ys[keep], xs[keep], vals[keep]
    A = np.stack([xs, ys, np.ones_like(xs)], axis=1).astype(np.float64)
    coef, *_ = np.linalg.lstsq(A, vals.astype(np.float64), rcond=None)
    m_scene = vals.mean()
    gx, gy = np.meshgrid(np.arange(W), np.arange(Hh))
    plane = (coef[0] * gx + coef[1] * gy + coef[2]).astype(np.float32)
    plane = m_scene + (plane - m_scene) * 0.7  # amortece o gradiente
    print(f"luz: plano L = {coef[0]:+.4f}x {coef[1]:+.4f}y + {coef[2]:.1f} "
          f"(media miolo cena {m_scene:.1f})")

    # --- 3) warpa a textura pro quad do keyframe ---
    src = np.array([[0, 0], [tw, 0], [tw, th], [0, th]], dtype=np.float32)
    Hk = cv2.getPerspectiveTransform(src, KEY_QUAD)
    warped = cv2.warpPerspective(flat, Hk, (W, Hh), flags=cv2.INTER_AREA)
    warped = cv2.GaussianBlur(warped, (0, 0), BLUR_TEX)

    # ganho de luz: plano da cena / media de L do MIOLO da textura warpada
    wl = cv2.cvtColor(warped, cv2.COLOR_BGR2LAB).astype(np.float32)
    m_tex = wl[..., 0][inner > 0].mean()
    gain = np.clip(plane / max(m_tex, 1.0), 0.8, 1.25)
    wl[..., 0] = np.clip(wl[..., 0] * gain, 0, 255)
    warped = cv2.cvtColor(wl.astype(np.uint8), cv2.COLOR_LAB2BGR)
    print(f"luz: L miolo textura {m_tex:.1f} -> ganho medio {gain[poly > 0].mean():.2f}")

    # --- 4) compoe: mascara erodida (preserva a linha escura da silhueta),
    #        dedos por cima, feather curto ---
    mask = cv2.erode(poly, np.ones((3, 3), np.uint8))  # ~1px pra dentro
    mask &= ~finger_mask((Hh, W))
    alpha = cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0
    alpha = alpha[..., None]
    out = (warped * alpha + key * (1 - alpha)).astype(np.uint8)
    cv2.imwrite(OUT, out)
    print(OUT)


if __name__ == "__main__":
    main()
