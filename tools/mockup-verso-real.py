#!/usr/bin/env python3
"""Projeta a FOTO REAL do verso do quadro (do cliente) na traseira do V14.

O V14 ja' tem um verso gerado por IA; o cliente quer a foto REAL dele ali.
Como o verso do V14 nao e' verde, nao da' pra usar chroma: rastreamos os 4
cantos do miolo (fita+MDF) com optical flow Lucas-Kanade a partir de seeds
marcados manualmente no frame inicial, e projetamos a foto retificada
(verso-real-flat.png) frame a frame com homografia.

- Oclusao: pixels de PELE dentro do poligono nao sao pintados (dedos/maos).
- Brilho: a textura e' ajustada (ganho+offset em L) pra casar com a luz da cena.
- Fade: quando o quad colapsa (flip), a pintura desvanece e o verso nativo
  (praticamente identico em tira fina) assume.

Uso:
  tools/.venv-compose/bin/python tools/mockup-verso-real.py \
      --clip output/mockup-loja/clips/V14.mp4 \
      --textura output/mockup-loja/keyframes/verso-real-flat.png \
      --out output/mockup-loja/clips/V14-real.mp4
"""
import argparse
import os
import shutil
import subprocess
import tempfile

import cv2
import numpy as np

FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
if not os.path.exists(FF):
    FF = "ffmpeg"

# Cantos do MIOLO (fita+MDF) no frame SEED do V14 (marcados sobre grid).
SEED_FRAME = 5
SEED_QUAD = np.array([[558, 758], [882, 792], [852, 1348], [528, 1300]],
                     dtype=np.float32)


def skin_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    skin = cv2.inRange(hsv, (0, 30, 90), (27, 170, 255))
    return cv2.morphologyEx(skin, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


def quad_width(q):
    return (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--textura", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tex = cv2.imread(args.textura, cv2.IMREAD_COLOR)
    if tex is None:
        raise SystemExit(f"textura ilegivel: {args.textura}")

    cap = cv2.VideoCapture(args.clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    Hh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    n = len(frames)

    # --- rastreia os 4 cantos com LK a partir do seed (frente e tras) ---
    lk = dict(winSize=(41, 41), maxLevel=4,
              criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.005))
    quads = [None] * n
    quads[SEED_FRAME] = SEED_QUAD.copy()

    def track(dir_range):
        prev_gray = cv2.cvtColor(frames[SEED_FRAME], cv2.COLOR_BGR2GRAY)
        pts = SEED_QUAD.reshape(-1, 1, 2).copy()
        prev_i = SEED_FRAME
        for i in dir_range:
            gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
            nxt, st, err = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts, None, **lk)
            if st.min() == 0:  # algum canto perdeu o tracking
                return
            pts = nxt
            quads[i] = pts.reshape(4, 2).copy()
            prev_gray = gray
            prev_i = i

    track(range(SEED_FRAME + 1, n))
    track(range(SEED_FRAME - 1, -1, -1))

    w0 = quad_width(SEED_QUAD)
    th, tw = tex.shape[:2]
    src = np.array([[0, 0], [tw, 0], [tw, th], [0, th]], dtype=np.float32)

    # --- ajuste de brilho: casa a textura com a luz da cena no frame seed ---
    poly0 = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(poly0, SEED_QUAD.astype(np.int32), 255)
    scene = cv2.cvtColor(frames[SEED_FRAME], cv2.COLOR_BGR2LAB)[..., 0]
    tex_lab = cv2.cvtColor(tex, cv2.COLOR_BGR2LAB).astype(np.float32)
    m_scene = scene[poly0 > 0].mean()
    m_tex = tex_lab[..., 0].mean()
    tex_lab[..., 0] = np.clip(tex_lab[..., 0] * (m_scene / max(m_tex, 1)), 0, 255)
    tex_lit = cv2.cvtColor(tex_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    print(f"brilho: cena L={m_scene:.0f}, textura L={m_tex:.0f} -> ganho {m_scene/m_tex:.2f}")

    tmpdir = tempfile.mkdtemp(prefix="verso-real-")
    silent = os.path.join(tmpdir, "silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, Hh))

    painted = 0
    for i, f in enumerate(frames):
        q = quads[i]
        if q is not None:
            wr = quad_width(q) / w0
            # fade no colapso do flip (painel fino: verso nativo assume)
            w_tex = 1.0 if wr > 0.38 else np.clip((wr - 0.22) / 0.16, 0, 1)
            if w_tex > 0.01:
                Hm = cv2.getPerspectiveTransform(src, q.astype(np.float32))
                warped = cv2.warpPerspective(tex_lit, Hm, (W, Hh), flags=cv2.INTER_LINEAR)
                poly = np.zeros((Hh, W), np.uint8)
                cv2.fillConvexPoly(poly, q.astype(np.int32), 255)
                poly = cv2.erode(poly, np.ones((3, 3), np.uint8))
                poly &= ~skin_mask(f)
                alpha = (cv2.GaussianBlur(poly, (7, 7), 0).astype(np.float32) / 255.0) * w_tex
                alpha = alpha[..., None]
                f = (warped * alpha + f * (1 - alpha)).astype(np.uint8)
                painted += 1
        vw.write(f)
    vw.release()
    print(f"{painted}/{n} frames com a foto real projetada")

    subprocess.run([
        FF, "-y", "-v", "error", "-i", silent, "-i", args.clip,
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", args.out,
    ], check=True)
    shutil.rmtree(tmpdir, ignore_errors=True)
    print(args.out)


if __name__ == "__main__":
    main()
