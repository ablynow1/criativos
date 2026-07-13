#!/usr/bin/env python3
"""Compoe uma arte dentro do quadro verde do mockup, com GEOMETRIA ESTAVEL.

v2 — mata o "bugando/deformando" da v1. A v1 estimava a homografia de forma
INDEPENDENTE em cada frame: o ruido da deteccao dos 4 cantos (mao ocluindo o
verde, motion-blur, angulo) fazia a arte pulsar e entortar. Aqui a geometria
e' TEMPORALMENTE COERENTE:

  1) Pass 1: detecta o quadrilatero verde em todo frame (cru) + area + um
     thumbnail (pra achar os cortes entre cenas por diferenca de frame).
  2) Corta a timeline nas transicoes (cada cena = 1 clipe Veo concatenado).
  3) Por CENA, ajusta a trajetoria de cada canto com um polinomio robusto
     (IRLS, rejeita mao/blur/angulo como outliers) — a arte passa a "grudar"
     no plano do quadro, sem tremer.
  4) Pass 2: warpa a arte com os cantos SUAVIZADOS, mas oclui com a mascara
     verde DO FRAME (mao/dedos tapam a arte certo). Geometria estavel +
     oclusao por frame = o melhor dos dois.

Uso:
  tools/.venv-compose/bin/python tools/mockup-compose.py \
      --video output/mockup-loja/mockup-loja-greenscreen-25s.mp4 \
      --arte  caminho/da/arte.png \
      [--logo caminho/do/logo.png]   # aparece no endcard branco (se houver)
      [--out  output/mockup-loja/mockup-final.mp4] \
      [--debug]                      # imprime cortes e cobertura por cena
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

# Faixa HSV do verde chroma (H em [0,179] no OpenCV; #00FF00 => H=60).
H_LO, H_HI = 35, 90
S_MIN, V_MIN = 45, 45


def green_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (H_LO, S_MIN, V_MIN), (H_HI, 255, 255))


def clean_mask(m):
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


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
    ring = cv2.dilate(mask, np.ones((5, 5), np.uint8)) & ~cv2.erode(mask, np.ones((5, 5), np.uint8))
    if not ring.any():
        return bgr
    b, g, r = cv2.split(bgr.astype(np.int16))
    cap = (b + r) // 2
    spill = (g > cap) & (ring > 0)
    g[spill] = cap[spill]
    return cv2.merge([b, g, r]).clip(0, 255).astype(np.uint8)


def kill_green(bgr):
    resid = green_mask(bgr)
    if not resid.any():
        return bgr
    b, g, r = cv2.split(bgr.astype(np.int16))
    cap = (b + r) // 2
    spill = (g > cap) & (resid > 0)
    g[spill] = cap[spill]
    return cv2.merge([b, g, r]).clip(0, 255).astype(np.uint8)


def robust_fit_eval(t_all, t_obs, v_obs, deg):
    """Ajusta polinomio robusto (IRLS, pesos de Cauchy) e avalia em t_all.
    Rejeita outliers (mao/blur/canto clipado) sem hardcode de limiar."""
    if len(v_obs) == 0:
        return None
    if len(v_obs) <= deg:
        deg = 1 if len(v_obs) >= 2 else 0
    if deg == 0:
        return np.full_like(t_all, float(v_obs[0]), dtype=float)
    w = np.ones(len(v_obs))
    coef = np.polyfit(t_obs, v_obs, deg, w=w)
    for _ in range(4):
        resid = v_obs - np.polyval(coef, t_obs)
        s = np.median(np.abs(resid)) + 1e-6
        w = 1.0 / (1.0 + (resid / (2.5 * s)) ** 2)  # Cauchy
        coef = np.polyfit(t_obs, v_obs, deg, w=w)
    return np.polyval(coef, t_all)


def smooth_segment(quads, W, Hh, border=10):
    """quads: lista (len=seg) de (4,2) ou None. Devolve (seg,4,2) suavizado
    ou None se a cena nao tem deteccao suficiente. Um canto so' vira
    'observacao' se NAO encosta na borda da tela (canto clipado = mentiroso);
    o polinomio extrapola os cantos fora de quadro nos close-ups."""
    seg = len(quads)
    idx = np.arange(seg)
    have = np.array([q is not None for q in quads])
    if have.sum() < 3:
        return None
    arr = np.full((seg, 4, 2), np.nan)
    for i, q in enumerate(quads):
        if q is not None:
            arr[i] = q
    deg = int(min(3, max(1, seg // 40)))
    out = np.full((seg, 4, 2), np.nan)
    for k in range(4):
        for c in range(2):
            v = arr[:, k, c]
            lim = W if c == 0 else Hh
            # observacao valida: detectada E longe da borda naquele eixo
            near = np.zeros(seg, bool)
            for i, q in enumerate(quads):
                if q is not None:
                    near[i] = (q[k, c] < border) or (q[k, c] > lim - border)
            obs = have & ~near
            if obs.sum() < max(4, deg + 1):
                obs = have  # cena toda clipada nesse canto: usa tudo (fill visivel)
            fit = robust_fit_eval(idx.astype(float), idx[obs].astype(float),
                                  v[obs], deg)
            if fit is None:
                return None
            out[:, k, c] = fit
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--arte", required=True)
    ap.add_argument("--logo")
    ap.add_argument("--out", default=None)
    ap.add_argument("--debug", action="store_true")
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

    # ---------- PASS 1: detecta quad + thumbnail (pra cortes) por frame ----------
    quads_raw = []
    thumbs = []
    aspects = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        m = clean_mask(green_mask(fr))
        q = find_quad(m)
        quads_raw.append(q)
        thumbs.append(cv2.resize(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), (32, 32)).astype(np.int16))
        if q is not None:
            mg = 8
            if not (q[:, 0].min() < mg or q[:, 1].min() < mg
                    or q[:, 0].max() > W - mg or q[:, 1].max() > Hh - mg):
                qw = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
                qh = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
                if qh > 40:
                    aspects.append(qw / qh)
    cap.release()
    N = len(quads_raw)
    frame_aspect = float(np.percentile(aspects, 95)) if aspects else 0.8

    # ---------- corta a timeline nas transicoes de cena ----------
    diffs = np.array([0.0] + [np.abs(thumbs[i] - thumbs[i - 1]).mean()
                              for i in range(1, N)])
    # corte = pico forte de diferenca de frame (cenas concatenadas = corte seco)
    thr = max(14.0, np.median(diffs) + 4.0 * (np.median(np.abs(diffs - np.median(diffs))) + 1e-6) * 1.4826 * 3)
    cuts = [0] + [i for i in range(1, N) if diffs[i] > thr] + [N]
    # funde cortes muito proximos (< 6 frames): mantem o de maior diff
    merged = [cuts[0]]
    for c in cuts[1:]:
        if c - merged[-1] < 6:
            if c != N and (merged[-1] != 0) and diffs[c] > diffs[merged[-1]]:
                merged[-1] = c
        else:
            merged.append(c)
    if merged[-1] != N:
        merged.append(N)
    segments = [(merged[i], merged[i + 1]) for i in range(len(merged) - 1)]

    # ---------- suaviza cada cena ----------
    smooth = [None] * N
    seg_info = []
    for (a, b) in segments:
        sm = smooth_segment(quads_raw[a:b], W, Hh)
        det = sum(quads_raw[i] is not None for i in range(a, b))
        seg_info.append((a, b, det, sm is not None))
        if sm is not None:
            for j, i in enumerate(range(a, b)):
                smooth[i] = sm[j]

    if args.debug:
        print(f"{N} frames, {len(segments)} cenas, aspecto ~{frame_aspect:.3f}")
        for (a, b, det, ok) in seg_info:
            print(f"  cena {a:4d}-{b:4d} ({(b-a)/fps:4.1f}s)  detec={det:3d}/{b-a:3d}  "
                  f"{'SUAVIZADA' if ok else 'sem arte (verso/endcard)'}")

    # arte cropada pro aspecto real do quadro (center-crop)
    ah, aw = art.shape[:2]
    cur = aw / ah
    if cur > frame_aspect:
        nw = int(ah * frame_aspect); x0 = (aw - nw) // 2
        art_fit = art[:, x0:x0 + nw]
    else:
        nh = int(aw / frame_aspect); y0 = (ah - nh) // 2
        art_fit = art[y0:y0 + nh, :]
    print(f"aspecto do quadro ~{frame_aspect:.3f}; arte cropada de {aw}x{ah} "
          f"para {art_fit.shape[1]}x{art_fit.shape[0]}")
    ah, aw = art_fit.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], dtype=np.float32)

    # ---------- PASS 2: renderiza ----------
    tmpdir = tempfile.mkdtemp(prefix="mockup-compose-")
    silent = os.path.join(tmpdir, "silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, Hh))
    cap = cv2.VideoCapture(args.video)
    comped = 0
    i = -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i += 1
        q = smooth[i]
        if q is not None:
            Hm = cv2.getPerspectiveTransform(src, q.astype(np.float32))
            warped = cv2.warpPerspective(art_fit, Hm, (W, Hh), flags=cv2.INTER_LINEAR)
            # oclusao POR FRAME: so' pixel verde recebe arte (mao/dedo tapam)
            mask = clean_mask(green_mask(frame))
            # restringe ao poligono suavizado (evita fiapo de verde de outra origem)
            poly = np.zeros((Hh, W), np.uint8)
            cv2.fillConvexPoly(poly, q.astype(np.int32), 255)
            poly = cv2.dilate(poly, np.ones((7, 7), np.uint8))
            mask = mask & poly
            alpha = cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0
            alpha = alpha[..., None]
            frame = despill(frame, mask)
            frame = (warped * alpha + frame * (1 - alpha)).astype(np.uint8)
            comped += 1
        else:
            # endcard branco + logo (se houver)
            if logo is not None and frame.mean() > 235:
                lh, lw = logo.shape[:2]
                scale = min(W * 0.55 / lw, Hh * 0.25 / lh)
                logo_r = cv2.resize(logo, (int(lw * scale), int(lh * scale)))
                lh, lw = logo_r.shape[:2]
                x, y = (W - lw) // 2, (Hh - lh) // 2
                if logo_r.ndim == 3 and logo_r.shape[2] == 4:
                    a = logo_r[..., 3:4].astype(np.float32) / 255.0
                    frame[y:y + lh, x:x + lw] = (
                        logo_r[..., :3] * a + frame[y:y + lh, x:x + lw] * (1 - a)
                    ).astype(np.uint8)
                else:
                    frame[y:y + lh, x:x + lw] = logo_r[..., :3] if logo_r.ndim == 3 else logo_r
        frame = kill_green(frame)
        vw.write(frame)
    cap.release()
    vw.release()
    print(f"{N} frames processados, {comped} com arte composta")

    subprocess.run([
        FF, "-y", "-v", "error", "-i", silent, "-i", args.video,
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", out_path,
    ], check=True)
    shutil.rmtree(tmpdir, ignore_errors=True)
    print(out_path)


if __name__ == "__main__":
    main()
