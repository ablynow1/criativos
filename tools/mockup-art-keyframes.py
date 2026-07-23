#!/usr/bin/env python3
"""Aplica uma arte DENTRO do quadro verde dos KEYFRAMES (stills) do mockup.

Modo NATIVO do pipeline (pedido do Vitor): em vez de compor a arte no video
verde (que le como colagem por melhor que seja a fisica), a arte e' aplicada
na IMAGEM BASE de cada cena e o Veo gera o video ja' com a arte fazendo parte
da cena — luz, movimento e perspectiva saem nativos do proprio modelo, a arte
nao tem como "dancar" dentro do quadro.

Fluxo completo:
  1) este script: K1..K6 (verde) + arte  ->  K1A..K6A (arte aplicada)
  2) node tools/mockup-loja.mjs clips V1A V2A V3A V4A V5A V6A   (Veo 3.1)
  3) tools/mockup-loja-montagem-arte.sh  ->  25s finais

A integracao no still usa a mesma fisica do mockup-compose.py, calibrada pra
imagem parada (sem grao — o Veo poe o ruido dele; blur mais leve — o still e'
mais nitido que o video): sombra interna bevel + linha de contato, tom/lift
ambiente, sheen, gradiente de luminaria (detectada acima do quadro, cenas de
parede) e escurecimento por inclinacao (aspecto aparente vs o mais frontal).

Uso:
  tools/.venv-compose/bin/python tools/mockup-art-keyframes.py \
      --arte inputs/pastor-alemao.jpg \
      [--kf-dir output/mockup-loja/keyframes] \
      [--ids K1,K2,K3,K4,K5,K6] [--suffix A]
"""
import argparse
import os
import sys

import cv2
import numpy as np

# Faixa HSV do verde chroma (H em [0,179] no OpenCV; #00FF00 => H=60).
H_LO, H_HI = 35, 90
S_MIN, V_MIN = 45, 45

# Integracao no STILL (keyframe e' mais nitido que video: blur leve, sem grao).
ART_BLUR = 0.9       # sigma: casa a maciez do render Nano Banana
ART_GAIN = 0.93      # escurece a arte (loja meio-escura)
ART_LIFT = 7.0       # levanta os pretos (luz ambiente)
ART_DESAT = 0.08     # dessatura leve
ART_WARM_B, ART_WARM_R = 0.975, 1.025  # tom quente da loja (BGR)
EDGE_FRAC = 0.055    # sombra interna = 5.5% do lado
SHADOW_STR = 0.42
TOP_EXTRA = 0.16
CONTACT_FRAC = 0.013  # linha de contato tela<->moldura
CONTACT_STR = 0.50
SHEEN_STR = 0.06
TILT_DIM = 0.22       # escurecimento maximo por inclinacao
LAMP_V_MIN = 242      # p90 de V acima do quadro pra considerar "luminaria"
LAMP_TOP = 1.11
LAMP_BOTTOM = 0.93


def green_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (H_LO, S_MIN, V_MIN), (H_HI, 255, 255))


def clean_mask(m):
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))


def order_corners(pts):
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                     pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def find_quad(mask, min_area_frac=0.02):
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
    box = cv2.boxPoints(cv2.minAreaRect(c))
    return order_corners(box)


def quad_aspect(q):
    qw = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    qh = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    return qw / max(qh, 1.0)


def lamp_above(frame, q):
    x0 = int(max(q[:, 0].min(), 0)); x1 = int(min(q[:, 0].max(), frame.shape[1]))
    ytop = int(max(min(q[0, 1], q[1, 1]), 0))
    y0 = max(ytop - int(0.10 * (q[:, 1].max() - q[:, 1].min())), 0)
    if y0 >= ytop or x1 - x0 < 20:
        return False
    band = cv2.cvtColor(frame[y0:ytop, x0:x1], cv2.COLOR_BGR2HSV)[..., 2]
    return band.size > 0 and np.percentile(band, 90) >= LAMP_V_MIN


def season_art(art):
    """Mesma integracao fisica do compose, sem grao (stills p/ Veo)."""
    a = cv2.GaussianBlur(art.astype(np.float32), (0, 0), ART_BLUR)
    a = a * ART_GAIN + ART_LIFT
    gray = a.mean(axis=2, keepdims=True)
    a = a * (1 - ART_DESAT) + gray * ART_DESAT
    a[..., 0] *= ART_WARM_B
    a[..., 2] *= ART_WARM_R

    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = np.clip(np.minimum(xx, w - 1 - xx) / (w * EDGE_FRAC), 0, 1)
    dy = np.clip(np.minimum(yy, h - 1 - yy) / (h * EDGE_FRAC), 0, 1)
    d = np.minimum(dx, dy)
    shade = 1.0 - SHADOW_STR * (1 - d) ** 2
    topband = np.clip(yy / (h * EDGE_FRAC), 0, 1)
    shade *= 1.0 - TOP_EXTRA * (1 - topband) ** 2
    dxc = np.clip(np.minimum(xx, w - 1 - xx) / (w * CONTACT_FRAC), 0, 1)
    dyc = np.clip(np.minimum(yy, h - 1 - yy) / (h * CONTACT_FRAC), 0, 1)
    dc = np.minimum(dxc, dyc)
    shade *= 1.0 - CONTACT_STR * (1 - dc) ** 1.5
    a *= shade[..., None]
    sheen = np.clip(1 - yy / h, 0, 1) ** 2
    a += (255 - a) * (SHEEN_STR * sheen[..., None])
    return np.clip(a, 0, 255).astype(np.uint8)


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arte", required=True)
    ap.add_argument("--kf-dir", default="output/mockup-loja/keyframes")
    ap.add_argument("--ids", default="K1,K2,K3,K4,K5,K6")
    ap.add_argument("--suffix", default="A")
    args = ap.parse_args()

    art = cv2.imread(args.arte, cv2.IMREAD_COLOR)
    if art is None:
        sys.exit(f"arte ilegivel: {args.arte}")
    ids = [s.strip() for s in args.ids.split(",") if s.strip()]

    # Pass 1: le todos os keyframes e detecta os quads (preciso do aspecto mais
    # frontal como referencia do crop e do tilt ANTES de compor qualquer um).
    frames, quads = {}, {}
    for kid in ids:
        p = os.path.join(args.kf_dir, f"{kid}.png")
        fr = cv2.imread(p, cv2.IMREAD_COLOR)
        if fr is None:
            sys.exit(f"keyframe ilegivel: {p}")
        q = find_quad(clean_mask(green_mask(fr)))
        if q is None:
            sys.exit(f"{kid}: quadrilatero verde nao encontrado")
        frames[kid], quads[kid] = fr, q

    aspects = {kid: quad_aspect(q) for kid, q in quads.items()}
    # Aspecto de referencia = o mais frontal (maior largura/altura), MAS so' entre
    # os keyframes cujo quad NAO toca a borda da tela. Quadro cortado mente o
    # aspecto (fica falso-largo/estreito) — incluir K4/close clipado poluia o crop
    # (ver MOCKUP-NATIVO.md §4.4). Fallback: se todos tocam a borda, usa todos.
    def _touches_border(q, W, Hh, mg=8):
        return (q[:, 0].min() < mg or q[:, 1].min() < mg
                or q[:, 0].max() > W - mg or q[:, 1].max() > Hh - mg)
    limpos = {kid: a for kid, a in aspects.items()
              if not _touches_border(quads[kid], frames[kid].shape[1], frames[kid].shape[0])}
    ref_aspect = max((limpos or aspects).values())
    if limpos:
        print(f"aspecto medido em {len(limpos)}/{len(aspects)} keyframes inteiros "
              f"(descartados os cortados na borda)")

    # Encaixe da arte no quadro da CENA (que e' fixo, gerado nos keyframes).
    # Se a orientacao da arte bate com a do quadro, corta o excesso (preenche).
    # Se NAO bate (arte deitada num quadro em pe'), NUNCA espremer/girar: entra
    # inteira com passe-partout em volta — e' o que uma moldureria faz de verdade.
    ah, aw = art.shape[:2]
    art_asp = aw / ah
    mesma_orientacao = (art_asp > 1) == (ref_aspect > 1) or abs(art_asp - ref_aspect) < 0.18
    if mesma_orientacao:
        if art_asp > ref_aspect:
            nw = int(ah * ref_aspect); x0 = (aw - nw) // 2
            art_fit = art[:, x0:x0 + nw]
        else:
            nh = int(aw / ref_aspect); y0 = (ah - nh) // 2
            art_fit = art[y0:y0 + nh, :]
    else:
        # passe-partout: a arte cabe inteira, orientacao preservada
        margem = 0.06
        if art_asp > ref_aspect:                     # arte deitada, quadro em pe'
            box_w = int(aw / (1 - 2 * margem))
            box_h = int(box_w / ref_aspect)
        else:                                        # arte em pe', quadro deitado
            box_h = int(ah / (1 - 2 * margem))
            box_w = int(box_h * ref_aspect)
        art_fit = np.full((box_h, box_w, 3), (238, 240, 242), np.uint8)  # marfim claro
        y0, x0 = (box_h - ah) // 2, (box_w - aw) // 2
        art_fit[y0:y0 + ah, x0:x0 + aw] = art
        # sombrinha do rebaixo da arte sobre o passe-partout
        cv2.rectangle(art_fit, (x0 - 2, y0 - 2), (x0 + aw + 1, y0 + ah + 1), (176, 178, 182), 3)
        print(f"arte {('deitada' if art_asp > 1 else 'em pe')} num quadro "
              f"{('deitado' if ref_aspect > 1 else 'em pe')} — entrou inteira com passe-partout "
              f"(orientacao preservada)")
    print(f"aspecto do quadro ~{ref_aspect:.3f}; arte cropada de {aw}x{ah} "
          f"para {art_fit.shape[1]}x{art_fit.shape[0]}")
    art_fit = season_art(art_fit)
    ah, aw = art_fit.shape[:2]
    src = np.array([[0, 0], [aw, 0], [aw, ah], [0, ah]], dtype=np.float32)

    yy = np.linspace(0, 1, ah, dtype=np.float32)[:, None, None]
    lamp_art = np.clip(art_fit.astype(np.float32)
                       * (LAMP_TOP + (LAMP_BOTTOM - LAMP_TOP) * yy), 0, 255
                       ).astype(np.uint8)

    for kid in ids:
        fr, q = frames[kid], quads[kid]
        Hh, W = fr.shape[:2]
        lamp = lamp_above(fr, q)
        tilt = float(np.clip(1.0 - TILT_DIM * (1.0 - aspects[kid] / ref_aspect),
                             1.0 - TILT_DIM, 1.0))
        base = lamp_art if lamp else art_fit
        # PRE-DOWNSCALE com INTER_AREA antes do warp. A arte tem ~1400-2000px
        # e o quad ~300-900px: warpPerspective INTER_LINEAR le so' 2x2 vizinhos
        # e joga o resto fora — decimacao pontual = aliasing/moire em linha
        # fina, que o Veo depois AMPLIFICA ao animar. Reduzir por area primeiro
        # (filtro correto pra encolher) e warpar ja' perto do tamanho final
        # mata o artefato na origem. Margem de 1.3x preserva nitidez no warp.
        lado_quad = max(
            np.linalg.norm(q[0] - q[1]), np.linalg.norm(q[1] - q[2]),
            np.linalg.norm(q[2] - q[3]), np.linalg.norm(q[3] - q[0]))
        bh, bw = base.shape[:2]
        escala = min(1.0, (lado_quad * 1.3) / max(bh, bw))
        if escala < 0.95:
            base_w = cv2.resize(base, (max(2, int(bw * escala)), max(2, int(bh * escala))),
                                interpolation=cv2.INTER_AREA)
        else:
            base_w = base
        wh, ww = base_w.shape[:2]
        src_w = np.array([[0, 0], [ww, 0], [ww, wh], [0, wh]], dtype=np.float32)
        Hm = cv2.getPerspectiveTransform(src_w, q.astype(np.float32))
        warped = cv2.warpPerspective(base_w, Hm, (W, Hh), flags=cv2.INTER_LINEAR)
        if tilt < 0.998:
            warped = np.clip(warped.astype(np.float32) * tilt, 0, 255).astype(np.uint8)

        # so' pixel verde recebe arte (mao/dedo sobre o quadro ficam por cima)
        mask = clean_mask(green_mask(fr))
        poly = np.zeros((Hh, W), np.uint8)
        cv2.fillConvexPoly(poly, q.astype(np.int32), 255)
        poly = cv2.dilate(poly, np.ones((7, 7), np.uint8))
        mask = mask & poly
        alpha = (cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0)[..., None]
        out = despill(fr, mask)
        out = (warped * alpha + out * (1 - alpha)).astype(np.uint8)
        out = kill_green(out)

        dst = os.path.join(args.kf_dir, f"{kid}{args.suffix}.png")
        cv2.imwrite(dst, out)
        cover = mask.mean() / 255 * 100
        print(f"{kid} -> {os.path.basename(dst)}  aspecto={aspects[kid]:.3f} "
              f"tilt={tilt:.3f} luminaria={'SIM' if lamp else 'nao'} verde={cover:.1f}%")


if __name__ == "__main__":
    main()
