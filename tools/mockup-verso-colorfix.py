#!/usr/bin/env python3
"""K15 = K13 (img2img: geometria/luz PERFEITAS, cores lavadas) + cores da
foto real via histogram matching mascarado — zero operacao espacial, zero
risco de torto.

Por que assim: 7 versoes de composite por homografia provaram que projetar
uma foto de flash-no-chao numa cena de loja quente via warp+ganho sempre
deixa banda/assimetria que le como "torto". O img2img (K13) integra o verso
na cena com 3D coerente — so lava as cores da fita/MDF. Cor se conserta sem
geometria: matching de histograma LAB por canal, dentro da mascara do verso.

Uso:
  tools/.venv-compose/bin/python tools/mockup-verso-colorfix.py
"""
import cv2
import numpy as np

K13 = "output/mockup-loja/keyframes/K13.png"
FLAT = "output/mockup-loja/keyframes/verso-real-full-flat.png"
OUT = "output/mockup-loja/keyframes/K15.png"

# silhueta do verso NO K13 (o img2img mudou a pose do quadro em relacao ao
# K12 — quad lido em zoom 4x direto no K13)
KEY_OUTER = np.array([[377, 492], [713, 496], [638, 1027], [304, 974]],
                     dtype=np.int32)
# dedos dela por cima do quadro no K13 (nao recolorir pele/unha)
FINGER_POLYS = [
    [(334, 612), (364, 618), (366, 662), (340, 668), (330, 640)],
    [(265, 905), (350, 915), (358, 940), (360, 985), (300, 990), (262, 950)],
]
STRENGTH = 1.0  # 1 = matching pleno


def match_stats(vals, src_vals, ref_vals):
    """Matching mean/std por canal (histograma pleno criava speckles nos
    bins extremos). Suave e monotono."""
    ms, ss = src_vals.mean(), max(src_vals.std(), 1e-3)
    mr, sr = ref_vals.mean(), ref_vals.std()
    return (vals - ms) / ss * sr + mr


def main():
    k13 = cv2.imread(K13)
    flat = cv2.imread(FLAT)
    Hh, W = k13.shape[:2]

    mask = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(mask, KEY_OUTER, 255)
    fingers = np.zeros((Hh, W), np.uint8)
    for p in FINGER_POLYS:
        cv2.fillPoly(fingers, [np.array(p, np.int32)], 255)
    fingers = cv2.dilate(fingers, np.ones((11, 11), np.uint8))
    sample_mask = mask & ~fingers

    lab13 = cv2.cvtColor(k13, cv2.COLOR_BGR2LAB).astype(np.float32)
    labref = cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).astype(np.float32)

    out_lab = lab13.copy()
    ys, xs = np.nonzero(sample_mask)
    for c in range(3):
        mapped = match_stats(lab13[..., c], lab13[ys, xs, c],
                             labref[..., c].ravel())
        out_lab[..., c] = lab13[..., c] * (1 - STRENGTH) + mapped * STRENGTH
        print(f"canal {'Lab'[c]}: media {lab13[ys, xs, c].mean():.1f} -> "
              f"{out_lab[ys, xs, c].mean():.1f} "
              f"(ref {labref[..., c].mean():.1f})")

    recolored = cv2.cvtColor(np.clip(out_lab, 0, 255).astype(np.uint8),
                             cv2.COLOR_LAB2BGR)
    alpha = cv2.GaussianBlur(sample_mask, (7, 7), 0).astype(np.float32) / 255.0
    alpha = alpha[..., None]
    out = (recolored * alpha + k13 * (1 - alpha)).astype(np.uint8)
    cv2.imwrite(OUT, out)
    print(OUT)


if __name__ == "__main__":
    main()
