#!/usr/bin/env python3
"""Pinta a textura do VERSO (kraft) na fase 'de costas' de um giro de quadro verde.

Veo nao anima o quadro com o verso kraft (bloqueia no RAI), mas anima liso ela
GIRANDO o quadro verde. Este script pega esse giro e, nos frames em que o quadro
esta' de costas (antes do momento edge-on), projeta a textura kraft por cima do
verde; depois do edge-on deixa o verde intacto (pra arte entrar no compose).

Resultado: no master, a abertura vira 'verso kraft girando -> edge-on -> verde',
com o movimento REAL dos bracos dela (do Veo). O compose.py depois poe a arte
so' no verde (frente).

Uso:
  tools/.venv-compose/bin/python tools/mockup-bake-verso.py \
      --clip output/mockup-loja/clips/V10.mp4 \
      --kraft output/mockup-loja/keyframes/kraft-texture.png \
      --out output/mockup-loja/clips/V10-verso.mp4 \
      [--reverse]   # se o giro do Veo for frente->costas, inverte o clipe
      [--split N]    # forca o frame de edge-on (senao detecta pelo menor quad)
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

H_LO, H_HI = 35, 90
S_MIN, V_MIN = 70, 60


def green_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (H_LO, S_MIN, V_MIN), (H_HI, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


def order_corners(pts):
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                     pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def find_quad(mask, min_area_frac=0.008):
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        return None, 0.0
    c = max(cs, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area < min_area_frac * mask.shape[0] * mask.shape[1]:
        return None, 0.0
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    quad = None
    for eps in (0.01, 0.02, 0.03, 0.05, 0.08):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4:
            quad = order_corners(ap)
            break
    if quad is None:
        quad = order_corners(cv2.boxPoints(cv2.minAreaRect(c)))
    return quad, area


def quad_width(q):
    return (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--kraft", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reverse", action="store_true")
    ap.add_argument("--split", type=int, default=-1)
    ap.add_argument("--feather", type=int, default=6, help="frames de crossfade no edge-on")
    args = ap.parse_args()

    kraft = cv2.imread(args.kraft, cv2.IMREAD_COLOR)
    if kraft is None:
        raise SystemExit(f"kraft ilegivel: {args.kraft}")

    cap = cv2.VideoCapture(args.clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    Hh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    if args.reverse:
        frames = frames[::-1]
    n = len(frames)

    # mede quad + largura por frame
    quads, widths = [], []
    for f in frames:
        q, _ = find_quad(green_mask(f))
        quads.append(q)
        widths.append(quad_width(q) if q is not None else 1e9)

    # edge-on = menor largura de quad (quadro visto de lado)
    split = args.split if args.split >= 0 else int(np.argmin(widths))
    print(f"{n} frames | edge-on (split) no frame {split} ({split/fps:.2f}s) "
          f"| largura minima {min(widths):.0f}px")

    ah, aw = kraft.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], dtype=np.float32)

    tmpdir = tempfile.mkdtemp(prefix="verso-")
    silent = os.path.join(tmpdir, "silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, Hh))

    painted = 0
    for i, f in enumerate(frames):
        q = quads[i]
        # peso do kraft: 1 antes do edge-on, 0 depois, com crossfade curto
        if i < split - args.feather:
            w_kraft = 1.0
        elif i > split + args.feather:
            w_kraft = 0.0
        else:
            w_kraft = np.clip((split + args.feather - i) / (2 * args.feather + 1), 0, 1)

        if q is not None and w_kraft > 0.01:
            Hm = cv2.getPerspectiveTransform(src, q.astype(np.float32))
            warped = cv2.warpPerspective(kraft, Hm, (W, Hh), flags=cv2.INTER_LINEAR)
            gm = green_mask(f)
            alpha = (cv2.GaussianBlur(gm, (5, 5), 0).astype(np.float32) / 255.0) * w_kraft
            alpha = alpha[..., None]
            f = (warped * alpha + f * (1 - alpha)).astype(np.uint8)
            painted += 1
        vw.write(f)
    vw.release()
    print(f"{painted} frames com verso kraft pintado (antes do edge-on)")

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
