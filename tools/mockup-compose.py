#!/usr/bin/env python3
"""Compoe uma arte dentro do quadro verde do mockup, frame a frame.

Nao e' um chroma key "janela": detecta o quadrilatero verde em cada frame,
estima a homografia e projeta a arte NA PERSPECTIVA do quadro — a arte
acompanha giro/inclinacao, e maos/objetos na frente do verde ocluem a arte
corretamente (so' pixels verdes sao substituidos).

Uso:
  tools/.venv-compose/bin/python tools/mockup-compose.py \
      --video output/mockup-loja/mockup-loja-greenscreen-25s.mp4 \
      --arte  caminho/da/arte.png \
      [--logo caminho/do/logo.png]   # aparece no endcard branco
      [--out  output/mockup-loja/mockup-final.mp4]

O audio do video original e' preservado (remux via ffmpeg no final).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
if not os.path.exists(FF):
    FF = "ffmpeg"

# Faixa HSV do verde chroma (H em [0,179] no OpenCV; #00FF00 => H=60)
H_LO, H_HI = 35, 90
S_MIN, V_MIN = 70, 60


def green_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (H_LO, S_MIN, V_MIN), (H_HI, 255, 255))


def order_corners(pts):
    """Ordena 4 pontos em tl, tr, br, bl."""
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                     pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def find_quad(mask, min_area_frac=0.02):
    """Maior regiao verde -> 4 cantos (ou None)."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < min_area_frac * mask.shape[0] * mask.shape[1]:
        return None
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    for eps in (0.01, 0.02, 0.03, 0.05, 0.08):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4:
            return order_corners(approx)
    box = cv2.boxPoints(cv2.minAreaRect(c))  # fallback: retangulo rotacionado
    return order_corners(box)


def despill(bgr, mask):
    """Remove contaminacao verde na borda da mascara (g = min(g,(r+b)/2))."""
    ring = cv2.dilate(mask, np.ones((5, 5), np.uint8)) & ~cv2.erode(mask, np.ones((5, 5), np.uint8))
    if not ring.any():
        return bgr
    b, g, r = cv2.split(bgr.astype(np.int16))
    cap = (b + r) // 2
    spill = (g > cap) & (ring > 0)
    g[spill] = cap[spill]
    return cv2.merge([b, g, r]).clip(0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--arte", required=True)
    ap.add_argument("--logo")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out_path = args.out or os.path.join(os.path.dirname(args.video), "mockup-final.mp4")
    art = cv2.imread(args.arte, cv2.IMREAD_COLOR)
    if art is None:
        sys.exit(f"arte ilegivel: {args.arte}")
    logo = cv2.imread(args.logo, cv2.IMREAD_UNCHANGED) if args.logo else None

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    Hh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Pre-passada: aspecto REAL do quadro = maior aspecto aparente observado
    # (de frente o aspecto e' o real; em angulo/giro e' sempre menor).
    aspects = []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    for fi in range(0, total, 10):
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, fr = cap.read()
        if not ok:
            continue
        m = green_mask(fr)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        q = find_quad(m)
        if q is None:
            continue
        # so' vale se o quadro esta' INTEIRO no frame (canto tocando borda =
        # quadro cortado -> aspecto aparente mentiroso)
        mg = 8
        if (q[:, 0].min() < mg or q[:, 1].min() < mg
                or q[:, 0].max() > W - mg or q[:, 1].max() > Hh - mg):
            continue
        qw = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
        qh = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
        if qh > 40:
            aspects.append(qw / qh)
    frame_aspect = float(np.percentile(aspects, 95)) if aspects else 0.8
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    tmpdir = tempfile.mkdtemp(prefix="mockup-compose-")
    silent = os.path.join(tmpdir, "silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, Hh))

    prev_quad = None
    art_fit = None  # arte cropada pro aspecto real do quadro (definido no 1o frame detectado)
    n = comped = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        mask = green_mask(frame)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        quad = find_quad(mask)

        if quad is not None and art_fit is None:
            # center-crop da arte pro aspecto REAL do quadro (da pre-passada)
            target = frame_aspect
            ah, aw = art.shape[:2]
            cur = aw / ah
            if cur > target:  # arte mais larga -> corta laterais
                nw = int(ah * target)
                x0 = (aw - nw) // 2
                art_fit = art[:, x0:x0 + nw]
            else:  # arte mais alta -> corta topo/base
                nh = int(aw / target)
                y0 = (ah - nh) // 2
                art_fit = art[y0:y0 + nh, :]
            print(f"aspecto do quadro ~{target:.3f}; arte cropada de {aw}x{ah} para {art_fit.shape[1]}x{art_fit.shape[0]}")

        if quad is not None:
            if prev_quad is not None and np.linalg.norm(quad - prev_quad) < 200:
                quad = 0.6 * quad + 0.4 * prev_quad  # suaviza jitter entre frames
            prev_quad = quad

            ah, aw = art_fit.shape[:2]
            src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], dtype=np.float32)
            Hm = cv2.getPerspectiveTransform(src, quad.astype(np.float32))
            warped = cv2.warpPerspective(art_fit, Hm, (W, Hh), flags=cv2.INTER_LINEAR)

            alpha = cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0
            alpha = alpha[..., None]
            frame = despill(frame, mask)
            frame = (warped * alpha + frame * (1 - alpha)).astype(np.uint8)
            comped += 1
        else:
            prev_quad = None
            # endcard branco + logo
            if logo is not None and frame.mean() > 235:
                lh, lw = logo.shape[:2]
                scale = min(W * 0.55 / lw, Hh * 0.25 / lh)
                logo_r = cv2.resize(logo, (int(lw * scale), int(lh * scale)))
                lh, lw = logo_r.shape[:2]
                x, y = (W - lw) // 2, (Hh - lh) // 2
                if logo_r.shape[2] == 4:
                    a = logo_r[..., 3:4].astype(np.float32) / 255.0
                    frame[y:y + lh, x:x + lw] = (
                        logo_r[..., :3] * a + frame[y:y + lh, x:x + lw] * (1 - a)
                    ).astype(np.uint8)
                else:
                    frame[y:y + lh, x:x + lw] = logo_r

        vw.write(frame)
        n += 1

    cap.release()
    vw.release()
    print(f"{n} frames processados, {comped} com arte composta")

    # Reencoda h264 + devolve o audio do video original
    subprocess.run([
        FF, "-y", "-v", "error",
        "-i", silent, "-i", args.video,
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart",
        out_path,
    ], check=True)
    shutil.rmtree(tmpdir, ignore_errors=True)
    print(out_path)


if __name__ == "__main__":
    main()
