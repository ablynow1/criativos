#!/usr/bin/env python3
"""Compoe a FOTO REAL do verso do quadro no keyframe estatico (K12 -> K15).

v4 — correcao do "torto" apontado pelo Vitor na v3:
A v3 ancorava a foto nos 4 cantos EXTERNOS da silhueta. So que o verso do K12
nao e' plano unico: o painel (fita+MDF) e' REBAIXADO dentro da moldura (bar ->
sulco -> friso -> degrau -> painel). Ancorar no contorno externo mistura dois
planos de profundidade e a paralaxe roda o miolo (~2 graus = torto visivel).

O certo (v4): mapear o RETANGULO DO PAINEL da foto retificada direto no quad
do PAINEL visivel do K12 (as linhas de degrau onde a fita comeca). A borda de
pinus, o friso e a banda escura do rebaixo do K12 ficam originais — sao eles
que dao o 3D — e qualquer sobra de fita do K12 entre o paste e o degrau e'
kraft-sobre-kraft (continua, invisivel). No TOPO a mascara sobe ate' perto da
silhueta pra engolir a ripa+pendural+fitas do K12 (senao ficam tocos duplos);
o excesso de fonte vem de BORDER_REPLICATE (vira pinus, que casa com a barra).

Uso:
  tools/.venv-compose/bin/python tools/mockup-verso-static.py
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
# silhueta externa do verso no K12 (so pra CLIPAR a mascara)
KEY_OUTER = np.array([[411, 497], [743, 541], [615, 1068], [328, 1003]],
                     dtype=np.float32)
# retangulo do PAINEL (fita+ripa+MDF, sem pinus) na textura flat retificada
PANEL_FLAT = (13, 45, 800, 1043)  # x0,y0,x1,y1
# Margens (px de cena) da silhueta ate' o painel colado, POR LADO.
# O quad do painel e' a silhueta ENCOLHIDA por essas margens (offset de reta +
# intersecao) — paralelismo com a moldura POR CONSTRUCAO, que e' o que o olho
# le como "reto". Ler o degrau do K12 ponto a ponto nao funciona: a borda
# gerada varia de perfil (37-44px no canto sup-esq, ~15px no meio-esq) e a
# fita gerada e' MAIS saturada que a da foto, entao qualquer sobra grita.
# Margens ficam ABAIXO do minimo real de cada lado pra fita do K12 sumir
# inteira embaixo do paste (fita da foto contra pinus do K12 = degrau limpo).
FLATTEN_SIGMA = 80    # achata a luz baked da foto (vinco de sombra na direita)
FLATTEN_AMT = 0.7     # forca do achatamento (1 = total)
MARGIN_CLAMP = (6.0, 20.0)  # limites da margem medida por lado
TOP_RAISE = 70  # px de cena que a mascara sobe no topo (engole ripa/pendural
                # do K12); clipado pela silhueta externa
# Poligonos dos DEDOS dela por cima do quadro (copiar original de volta).
# Range HSV de pele nao serve: pinus/kraft caem no mesmo range.
FINGER_POLYS = [
    [(363, 610), (400, 614), (401, 655), (385, 664), (363, 650)],
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


def scale_L(lab, new_L):
    """Troca o canal L acompanhando o croma (a,b escalam junto), senao
    escurecer com a/b constantes SATURA a fita (foi o 'dourado' da v6)."""
    g = np.clip(new_L / np.maximum(lab[..., 0], 1.0), 0.7, 1.3)
    lab[..., 0] = np.clip(lab[..., 0] * g, 0, 255)
    lab[..., 1] = np.clip(128 + (lab[..., 1] - 128) * g, 0, 255)
    lab[..., 2] = np.clip(128 + (lab[..., 2] - 128) * g, 0, 255)
    return lab


def measure_margins(key, outer):
    """Mede, por lado, a que distancia da silhueta comeca a FITA saturada do
    K12 (S>140) e devolve margens que deixam essa fita INTEIRA sob o paste
    (percentil 10 - 2px), clampadas. Elimina sobra de fita vivida na borda."""
    hsv = cv2.cvtColor(key, cv2.COLOR_BGR2HSV)
    sat = hsv[..., 1]
    sides = {}
    names = ["top", "right", "bottom", "left"]
    for i, name in enumerate(names):
        p0, p1 = outer[i], outer[(i + 1) % 4]
        c = outer.mean(axis=0)
        v = p1 - p0
        n = np.array([-v[1], v[0]])
        n = n / np.linalg.norm(n)
        if np.dot(c - p0, n) < 0:
            n = -n
        dists = []
        for t in np.linspace(0.12, 0.88, 24):
            base = p0 + v * t
            for d in range(3, 46):
                x, y = (base + n * d).astype(int)
                if 0 <= x < sat.shape[1] and 0 <= y < sat.shape[0] \
                        and sat[y, x] > 140:
                    dists.append(d)
                    break
        m = (np.percentile(dists, 10) - 2.0) if dists else MARGIN_CLAMP[1]
        sides[name] = float(np.clip(m, *MARGIN_CLAMP))
    return sides


def shrink_quad(q, margins):
    """Encolhe o quad deslocando cada aresta pra DENTRO ao longo da normal
    (top/right/bottom/left) e re-intersectando as retas vizinhas."""
    def offset_line(p0, p1, d):
        v = p1 - p0
        n = np.array([-v[1], v[0]], dtype=np.float64)
        n /= np.linalg.norm(n)
        c = q.mean(axis=0)
        if np.dot(c - p0, n) < 0:
            n = -n  # normal aponta pro centro
        return p0 + n * d, p1 + n * d

    def intersect(a0, a1, b0, b1):
        r, s = a1 - a0, b1 - b0
        t = np.cross(b0 - a0, s) / np.cross(r, s)
        return a0 + t * r

    q = q.astype(np.float64)
    sides = ["top", "right", "bottom", "left"]
    lines = [offset_line(q[i], q[(i + 1) % 4], margins[sides[i]])
             for i in range(4)]
    out = [intersect(*lines[(i - 1) % 4], *lines[i]) for i in range(4)]
    return np.array(out, dtype=np.float32)


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

    # achata PARCIALMENTE a iluminacao baked da foto (croma acompanha o L)
    fl = cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = fl[..., 0].copy()
    low = cv2.GaussianBlur(L, (0, 0), FLATTEN_SIGMA)
    L_flat = L / np.maximum(low, 1.0) * L.mean()
    fl = scale_L(fl, L * (1 - FLATTEN_AMT) + L_flat * FLATTEN_AMT)
    flat = cv2.cvtColor(fl.astype(np.uint8), cv2.COLOR_LAB2BGR)

    # --- 2) homografia PAINEL->PAINEL (nao mistura planos: sem torto) ---
    margins = measure_margins(key, KEY_OUTER.astype(np.float64))
    print("margens medidas:", {k: round(v, 1) for k, v in margins.items()})
    key_panel = shrink_quad(KEY_OUTER, margins)
    print("painel na cena:", key_panel.astype(int).tolist())
    px0, py0, px1, py1 = PANEL_FLAT
    src = np.array([[px0, py0], [px1, py0], [px1, py1], [px0, py1]],
                   dtype=np.float32)
    Hk = cv2.getPerspectiveTransform(src, key_panel)
    warped = cv2.warpPerspective(flat, Hk, (W, Hh), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
    warped = cv2.GaussianBlur(warped, (0, 0), BLUR_TEX)

    # --- 3) mascara: painel + faixa extra no topo, clipado na silhueta ---
    top_dir = np.array([0, -TOP_RAISE], dtype=np.float32)
    paste_q = np.array([key_panel[0] + top_dir, key_panel[1] + top_dir,
                        key_panel[2], key_panel[3]], dtype=np.float32)
    mask = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(mask, paste_q.astype(np.int32), 255)
    outer = np.zeros((Hh, W), np.uint8)
    cv2.fillConvexPoly(outer, KEY_OUTER.astype(np.int32), 255)
    outer = cv2.erode(outer, np.ones((3, 3), np.uint8))  # preserva a linha
    mask &= outer                                        # escura da silhueta
    mask &= ~finger_mask((Hh, W))

    # --- 4) luz da cena: fit planar de L dentro do painel, amortecido ---
    ctr = key_panel.mean(axis=0)
    inner_q = (ctr + (key_panel - ctr) * 0.9).astype(np.int32)
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
    plane = m_scene + (plane - m_scene) * 0.7
    print(f"luz: plano L = {coef[0]:+.4f}x {coef[1]:+.4f}y + {coef[2]:.1f} "
          f"(media painel cena {m_scene:.1f})")

    # ganho UNIFORME suave, croma acompanhando (o plano fitado compunha com a
    # luz baked da foto e o resultado eram bandas assimetricas = "torto")
    wl = cv2.cvtColor(warped, cv2.COLOR_BGR2LAB).astype(np.float32)
    m_tex = wl[..., 0][inner > 0].mean()
    g = float(np.clip(m_scene / max(m_tex, 1.0), 0.9, 1.1))
    wl = scale_L(wl, wl[..., 0] * g)
    warped = cv2.cvtColor(wl.astype(np.uint8), cv2.COLOR_LAB2BGR)
    print(f"luz: L painel textura {m_tex:.1f} -> ganho uniforme {g:.2f}")

    # --- 5) compoe com feather curto ---
    alpha = cv2.GaussianBlur(mask, (5, 5), 0).astype(np.float32) / 255.0
    alpha = alpha[..., None]
    out = (warped * alpha + key * (1 - alpha)).astype(np.uint8)
    cv2.imwrite(OUT, out)
    print(OUT)


if __name__ == "__main__":
    main()
