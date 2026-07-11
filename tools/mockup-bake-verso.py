#!/usr/bin/env python3
"""Pinta a textura do VERSO (kraft) na fase 'de costas' de um giro de quadro verde.

Veo nao anima o quadro com o verso kraft (bloqueia no RAI), mas anima liso ela
GIRANDO o quadro verde. Este script pega esse giro e, nos frames em que o quadro
esta' de costas (antes do momento edge-on), projeta a textura kraft por cima do
painel; depois do edge-on deixa o verde intacto (pra arte entrar no compose).

COMO (aprendido a duras penas — nao regredir pra heuristica de cor):
- Segmentar o painel POR COR frame a frame racha a pintura: o painel escurece em
  angulo, reflete o vidro azul do fundo, e mascaras "escuro perto de verde"
  contaminam teto/moldura -> kraft em pedacos, manchas pretas, PISCA.
- Em vez disso: detecta o quad verde ESTRITO so' nos frames em que ele e'
  confiavel (painel bem aberto), FITA a trajetoria de cada canto como polinomio
  no tempo (movimento fisico e' suave) e pinta o POLIGONO FITADO em todos os
  frames da fase de costas. Deterministico, suave, sem depender de cor.
- A moldura preta REAL do video fica intacta: pintamos so' o painel interno com
  o MIOLO da textura (crop tira a borda de moldura da foto de referencia).
- Oclusao: pixels de PELE clara (maos/dedos) dentro do poligono nao sao pintados.

Uso:
  tools/.venv-compose/bin/python tools/mockup-bake-verso.py \
      --clip output/mockup-loja/clips/V0-cut.mp4 \
      --kraft output/mockup-loja/keyframes/kraft-texture.png \
      --out output/mockup-loja/clips/V0.mp4 \
      [--split N]   # forca o frame de edge-on (senao detecta pelo menor quad)
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
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < min_area_frac * mask.shape[0] * mask.shape[1]:
        return None
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    for eps in (0.01, 0.02, 0.03, 0.05, 0.08):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4:
            return order_corners(ap)
    return order_corners(cv2.boxPoints(cv2.minAreaRect(c)))


def quad_width(q):
    return (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2


def skin_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    skin = cv2.inRange(hsv, (0, 30, 90), (27, 170, 255))
    return cv2.morphologyEx(skin, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--kraft", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--split", type=int, default=-1)
    ap.add_argument("--feather", type=int, default=1)
    args = ap.parse_args()

    kraft_full = cv2.imread(args.kraft, cv2.IMREAD_COLOR)
    if kraft_full is None:
        raise SystemExit(f"kraft ilegivel: {args.kraft}")
    # miolo da textura: tira a borda de moldura preta da foto (a moldura REAL do
    # video fica visivel ao redor do poligono pintado)
    kh, kw = kraft_full.shape[:2]
    mx, my = int(kw * 0.045), int(kh * 0.035)
    kraft = kraft_full[my:kh - my, mx:kw - mx]

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
    n = len(frames)

    # passa 1: quad estrito + largura por frame
    quads, widths = [], []
    for f in frames:
        q = find_quad(green_mask(f))
        quads.append(q)
        widths.append(quad_width(q) if q is not None else 0.0)

    valid_w = [w for w in widths if w > 0]
    if not valid_w:
        raise SystemExit("nenhum painel verde detectado no clipe")
    wmax = max(valid_w)

    # split = momento em que o painel esta' QUASE INVISIVEL (largura < 8% do max
    # ou quad sumiu) — trocar kraft->verde antes disso deixa fantasma hibrido
    if args.split >= 0:
        split = args.split
    else:
        last_open = max((i for i, w in enumerate(widths) if w > 0.45 * wmax), default=0)
        split = next((i for i in range(last_open + 1, n)
                      if widths[i] == 0 or widths[i] < 0.08 * wmax), None)
        if split is None:
            cand = [(w if w > 0 else 0.0, i) for i, w in enumerate(widths)]
            split = min(cand)[1]

    # frames confiaveis DA FASE DE COSTAS: painel bem aberto (quad integro)
    good = [i for i in range(split) if quads[i] is not None and widths[i] > 0.45 * wmax]
    if len(good) < 4:
        raise SystemExit(f"so {len(good)} frames confiaveis antes do split={split} — confira o clipe")

    # fit polinomial (grau 2) da trajetoria de cada canto -> quad suave/extrapolado
    deg = 2
    ts = np.array(good, dtype=np.float64)
    fits = []  # 4 cantos x (fx, fy)
    for c in range(4):
        xs = np.array([quads[i][c][0] for i in good])
        ys = np.array([quads[i][c][1] for i in good])
        fits.append((np.polyfit(ts, xs, deg), np.polyfit(ts, ys, deg)))

    last_good = max(good)

    def quad_fit(i):
        q = np.array([[np.polyval(fx, i), np.polyval(fy, i)] for fx, fy in fits],
                     dtype=np.float32)
        # expande pra cobrir o erro do fit na borda (a tira verde que vazava);
        # nos frames EXTRAPOLADOS (alem do ultimo good) a incerteza cresce, entao
        # a expansao cresce junto. O excesso cai sobre a moldura preta real.
        ex = 1.03
        if i > last_good and split > last_good:
            ex += 0.05 * (i - last_good) / (split - last_good)
        ctr = q.mean(axis=0, keepdims=True)
        return ctr + (q - ctr) * ex

    print(f"{n} frames @{fps:.0f}fps | split(edge-on)={split} ({split/fps:.2f}s) | "
          f"{len(good)} frames confiaveis no fit")

    ah, aw = kraft.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], dtype=np.float32)

    tmpdir = tempfile.mkdtemp(prefix="verso-")
    silent = os.path.join(tmpdir, "silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, Hh))

    painted = 0
    for i, f in enumerate(frames):
        if i < split - args.feather:
            w_kraft = 1.0
        elif i > split + args.feather:
            w_kraft = 0.0
        else:
            w_kraft = np.clip((split + args.feather - i) / (2 * args.feather + 1), 0, 1)

        if w_kraft > 0.01:
            q = quad_fit(i)
            Hm = cv2.getPerspectiveTransform(src, q)
            warped = cv2.warpPerspective(kraft, Hm, (W, Hh), flags=cv2.INTER_LINEAR)
            poly = np.zeros((Hh, W), np.uint8)
            cv2.fillConvexPoly(poly, q.astype(np.int32), 255)
            poly &= ~skin_mask(f)  # maos/dedos na frente ficam de fora
            alpha = (cv2.GaussianBlur(poly, (9, 9), 0).astype(np.float32) / 255.0) * w_kraft
            alpha = alpha[..., None]
            f = (warped * alpha + f * (1 - alpha)).astype(np.uint8)
            # verde estrito que sobrou FORA do poligono = borda do painel que o
            # fit nao alcancou -> neutraliza (vira sombra escura, nao verde)
            resid = green_mask(f) & ~poly
            if resid.any():
                b, g, r = cv2.split(f.astype(np.int16))
                capv = (b + r) // 2
                sel = (g > capv) & (resid > 0)
                g[sel] = capv[sel]
                f = cv2.merge([b, g, r]).clip(0, 255).astype(np.uint8)
            painted += 1
        vw.write(f)
    vw.release()
    print(f"{painted} frames com verso kraft pintado (poligono fitado)")

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
