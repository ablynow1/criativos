#!/usr/bin/env python3
"""Converte a FOTO de uma moldura real (no chao, de qualquer angulo) no asset
do modo Ermos: moldura de frente, miolo VERDE chroma, fundo transparente.

Diferente do moldura-asset.py (que exigia foto ja recortada em fundo branco),
aqui entra foto crua de celular: concreto de fundo e perspectiva.

Duas etapas, nessa ordem de proposito:
  1. MOLDURA vs CHAO — o concreto e' cinza (dessaturado) e tem uma luminancia
     propria; preto, branco e madeira clara escapam dessa faixa cada um pro seu
     lado. Os 4 cantos dessa mancha retificam a foto: a moldura fica de frente.
  2. ABERTURA — dentro da moldura ja' retificada so' existem duas coisas: o pau
     e o fundo kraft. Amostramos a cor de cada um (centro = kraft, anel colado
     na borda = pau) e classificamos cada pixel pelo mais parecido. A boca e' a
     caixa da mancha central.

Detectar o miolo pela cor do kraft na foto INTEIRA nao funciona: em moldura de
madeira clara o pau e' tao quente e saturado quanto o kraft. Procurar a boca
pelo maior gradiente tambem nao: os logos impressos no kraft dao degraus mais
fortes que o lipe da moldura. Comparar com as duas cores de referencia resolve
os dois casos.

Uso:
  tools/.venv-compose/bin/python tools/moldura-foto.py \
      --in ~/Downloads/foto.jpeg --out tools/assets/moldura-preto.png [--debug d.jpg]
"""
import argparse
import sys

import cv2
import numpy as np


def candidato(img, lab, hsv, chao, sat_chao, tol, abrir=True):
    """Maior mancha 'nao-chao' que nao encosta na borda da foto — o que encosta
    e' cenario (prateleira, movel), a moldura esta inteira no enquadramento.
    A saturacao entra junto porque moldura de madeira clara tem quase a mesma
    luminancia do concreto: o que a separa e' ser quente.

    `abrir=False` em fundo liso: moldura branca recortada tem trechos estourados
    em branco PURO — a mascara do pau fica esburacada e o OPEN apagava o que
    restava, sobrando so' o kraft (o quadro saia sem moldura nenhuma). O CLOSE
    largo preenche os buracos; sem ruido de cenario, o OPEN nao faz falta."""
    obj = (((np.abs(lab - chao).sum(axis=2) >= tol) | (hsv[..., 1] > sat_chao + 22))
           .astype(np.uint8)) * 255
    obj = cv2.morphologyEx(obj, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
    if abrir:
        obj = cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((21, 21), np.uint8))
    cnts, _ = cv2.findContours(obj, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = img.shape[:2]
    livres = [c for c in cnts if (lambda r: r[0] > 2 and r[1] > 2
                                  and r[0] + r[2] < w - 2 and r[1] + r[3] < h - 2)(cv2.boundingRect(c))]
    if not livres:
        return None
    c = max(livres, key=cv2.contourArea)
    x, y, cw, ch = cv2.boundingRect(c)
    area = cv2.contourArea(c)
    ok = (0.12 * h * w < area < 0.65 * h * w      # ocupa boa parte, mas nao tudo
          and area / (cw * ch) > 0.85             # e' retangular (moldura, nao mancha)
          and 0.3 < cw / ch < 3.0)
    return c if ok else None


def quad_externo(img):
    """4 cantos da moldura (TL TR BR BL)."""
    b = cv2.GaussianBlur(img, (7, 7), 0)
    lab = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.int16)
    hsv = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
    h, w = lab.shape[:2]
    k = max(10, int(min(h, w) * 0.06))
    def bordas(a):
        return np.concatenate([a[:k].reshape(-1, 3), a[-k:].reshape(-1, 3),
                               a[:, :k].reshape(-1, 3), a[:, -k:].reshape(-1, 3)])
    chao = np.median(bordas(lab), axis=0)
    sat_chao = np.percentile(bordas(hsv)[:, 1], 90)

    # fundo LISO (recorte do Canva/Photoshop achatado em branco puro): o desvio
    # da borda é ~zero. Ai a tolerancia pode ser minuscula — e PRECISA ser,
    # senao moldura branca em fundo branco escapa por baixo do limiar.
    uniforme = float(bordas(lab).std(axis=0).sum()) < 4.0
    tols = (24, 16, 10, 6) if uniforme else (70, 62, 55, 48, 42, 36)

    c = None
    for tol in tols:                       # do exigente pro tolerante
        c = candidato(img, lab, hsv, chao, sat_chao, tol, abrir=not uniforme)
        if c is not None:
            break
    if c is None:
        sys.exit('nao separei a moldura do chao — tente uma foto com o quadro '
                 'inteiro no enquadramento e o fundo mais liso')
    per = cv2.arcLength(c, True)
    quad = None
    for k in np.arange(0.01, 0.09, 0.003):
        ap = cv2.approxPolyDP(c, k * per, True)
        if len(ap) == 4:
            quad = ap.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        quad = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float32)
    s_ = quad.sum(axis=1)
    d_ = np.diff(quad, axis=1).ravel()
    ordenado = np.array([quad[np.argmin(s_)], quad[np.argmin(d_)],
                         quad[np.argmax(s_)], quad[np.argmax(d_)]], np.float32)
    return ordenado, chao, uniforme


def apara_chao(plano, chao, max_apara=0.06):
    """Tira a franja de chao que sobra na borda do plano. A mancha do passo
    anterior inclui um fio da sombra portada; sem aparar, o quadro flutuante
    sai com uma tira de concreto colada numa das bordas."""
    lab = cv2.cvtColor(cv2.GaussianBlur(plano, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    H, W = lab.shape[:2]

    def franja(linhas, teto):
        n = 0
        for ln in linhas[:teto]:
            if np.abs(np.median(ln, axis=0) - chao).sum() > 30:
                break
            n += 1
        return n

    m0, m1, n0, n1 = int(H * 0.25), int(H * 0.75), int(W * 0.25), int(W * 0.75)
    tx, ty = int(W * max_apara), int(H * max_apara)
    e = franja([lab[m0:m1, x] for x in range(W)], tx)
    d = franja([lab[m0:m1, W - 1 - x] for x in range(W)], tx)
    t = franja([lab[y, n0:n1] for y in range(H)], ty)
    b = franja([lab[H - 1 - y, n0:n1] for y in range(H)], ty)
    return plano[t:H - b, e:W - d], (e, t, d, b)


def apara_franja(plano, boca, max_apara=0.09):
    """Tira a franja que sobra em volta do pau.

    A foto e' de cima e o quadro tem espessura: a silhueta externa pega tambem
    a lateral e um pedaco do VERSO (kraft) do lado pra onde ele estava caido.
    Sem aparar, o quadro flutuante sai com uma tira marrom colada numa borda.
    A cor de referencia de cada lado vem do meio-caminho entre a borda e a
    boca — ali e' pau puro, seja qual for a espessura da moldura."""
    lab = cv2.cvtColor(cv2.GaussianBlur(plano, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    H, W = lab.shape[:2]
    esq, top, dir_, bot = boca
    m0, m1, n0, n1 = int(H * 0.30), int(H * 0.70), int(W * 0.30), int(W * 0.70)

    def franja(linhas, ref, teto):
        n = 0
        for ln in linhas[:teto]:
            if np.linalg.norm(np.median(ln, axis=0) - ref) < 17:
                break
            n += 1
        return n if n < teto else 0        # nao achou pau: melhor nao cortar nada

    tx, ty = int(W * max_apara), int(H * max_apara)
    e = franja([lab[m0:m1, x] for x in range(W)], np.median(lab[m0:m1, esq // 2], axis=0), tx)
    d = franja([lab[m0:m1, W - 1 - x] for x in range(W)],
               np.median(lab[m0:m1, (dir_ + W) // 2], axis=0), tx)
    t = franja([lab[y, n0:n1] for y in range(H)], np.median(lab[top // 2, n0:n1], axis=0), ty)
    b = franja([lab[H - 1 - y, n0:n1] for y in range(H)],
               np.median(lab[(bot + H) // 2, n0:n1], axis=0), ty)
    return plano[t:H - b, e:W - d], (e, t, d, b)


def quad_do_miolo(img):
    """4 cantos do MIOLO kraft (quente + saturado). So' presta quando o pau NAO
    e' cor de madeira — em moldura preta/branca o kraft e' a unica mancha
    quente da foto e seus cantos sao nitidos. Miolo e moldura sao coplanares:
    retificar pelo miolo endireita a moldura junto, e com mais precisao que os
    cantos externos (que borram quando o recorte estoura no branco)."""
    hsv = cv2.cvtColor(cv2.GaussianBlur(img, (7, 7), 0), cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (5, 45, 45), (32, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.10 * img.shape[0] * img.shape[1]:
        return None
    per = cv2.arcLength(c, True)
    quad = None
    for k in np.arange(0.01, 0.06, 0.003):
        ap = cv2.approxPolyDP(c, k * per, True)
        if len(ap) == 4:
            quad = ap.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        return None
    s_ = quad.sum(axis=1)
    d_ = np.diff(quad, axis=1).ravel()
    return np.array([quad[np.argmin(s_)], quad[np.argmin(d_)],
                     quad[np.argmax(s_)], quad[np.argmax(d_)]], np.float32)


def retifica_pelo_miolo(img, quadM, chao):
    """Warpa a foto pra o MIOLO virar um retangulo perfeito (a moldura, coplanar,
    endireita junto) e recorta na borda externa varrendo contra o fundo."""
    larg = int(round((np.linalg.norm(quadM[1] - quadM[0]) + np.linalg.norm(quadM[2] - quadM[3])) / 2))
    alt = int(round((np.linalg.norm(quadM[3] - quadM[0]) + np.linalg.norm(quadM[2] - quadM[1])) / 2))
    p = int(min(larg, alt) * 0.25)          # folga: a moldura mora aqui
    dst = np.array([[p, p], [p + larg, p], [p + larg, p + alt], [p, p + alt]], np.float32)
    H = cv2.getPerspectiveTransform(quadM, dst)
    plano = cv2.warpPerspective(img, H, (larg + 2 * p, alt + 2 * p), flags=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_REPLICATE)
    lab = cv2.cvtColor(cv2.GaussianBlur(plano, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    Hh, Ww = lab.shape[:2]

    def externo(faixa_em, teto):
        """de FORA pra dentro: profundidade onde o fundo acaba (mediana da faixa)"""
        for i in range(teto):
            if np.abs(np.median(faixa_em(i), axis=0) - chao).sum() >= 12:
                return i
        return 0   # nao achou transicao: nao corta nada

    m0, m1, n0, n1 = int(Hh * 0.25), int(Hh * 0.75), int(Ww * 0.25), int(Ww * 0.75)
    e = externo(lambda i: lab[m0:m1, i], p)
    d = externo(lambda i: lab[m0:m1, Ww - 1 - i], p)
    t = externo(lambda i: lab[i, n0:n1], p)
    b = externo(lambda i: lab[Hh - 1 - i, n0:n1], p)
    return plano[t:Hh - b, e:Ww - d]


def retifica(img, quad):
    """Warpa a foto pra moldura ficar de frente, preenchendo o canvas."""
    larg = int(round((np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2))
    alt = int(round((np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2))
    dst = np.array([[0, 0], [larg, 0], [larg, alt], [0, alt]], np.float32)
    H = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(img, H, (larg, alt), flags=cv2.INTER_CUBIC)


def abertura(plano, max_pau=0.28):
    """Caixa da boca da moldura, um lado de cada vez.

    Dentro do plano so' ha' pau e kraft, mas NAO da' pra usar uma cor de pau
    unica: a luz vem de um lado so', e o pau sombreado da lateral fica tao
    escuro quanto o kraft. Entao cada lado usa a cor do SEU proprio pau como
    referencia e anda pra dentro ate' a linha virar kraft. A mediana de cada
    linha ignora os logos impressos no fundo."""
    lab = cv2.cvtColor(cv2.GaussianBlur(plano, (7, 7), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    H, W = lab.shape[:2]
    kraft = np.median(lab[int(H * 0.42):int(H * 0.58), int(W * 0.42):int(W * 0.58)]
                      .reshape(-1, 3), axis=0)

    def limite(linhas, ref_pau, teto):
        """primeira linha (de fora pra dentro) que vira kraft e assim fica"""
        if np.abs(kraft - ref_pau).sum() < 10:
            sys.exit('pau e miolo com a mesma cor — nao consigo achar a boca nessa foto')
        corr = 0
        for i, ln in enumerate(linhas[:teto]):
            c = np.median(ln, axis=0)
            corr = corr + 1 if np.linalg.norm(c - kraft) < np.linalg.norm(c - ref_pau) else 0
            if corr >= 5:
                return i - 4
        sys.exit('nao achei a boca da moldura — o pau esta muito parecido com o fundo')

    b = max(3, int(min(H, W) * 0.015))
    m0, m1 = int(H * 0.20), int(H * 0.80)          # miolo vertical (evita cantos)
    n0, n1 = int(W * 0.20), int(W * 0.80)
    tx, ty = int(W * max_pau), int(H * max_pau)
    esq = limite([lab[m0:m1, x] for x in range(W)], np.median(lab[m0:m1, :b].reshape(-1, 3), axis=0), tx)
    dir_ = W - limite([lab[m0:m1, W - 1 - x] for x in range(W)],
                      np.median(lab[m0:m1, -b:].reshape(-1, 3), axis=0), tx)
    top = limite([lab[y, n0:n1] for y in range(H)], np.median(lab[:b, n0:n1].reshape(-1, 3), axis=0), ty)
    bot = H - limite([lab[H - 1 - y, n0:n1] for y in range(H)],
                     np.median(lab[-b:, n0:n1].reshape(-1, 3), axis=0), ty)
    return esq, top, dir_, bot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--debug')
    args = ap.parse_args()

    img = cv2.imread(args.inp, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f'imagem ilegivel: {args.inp}')

    quad, chao, uniforme = quad_externo(img)
    # PREFERE retificar pelo miolo: os cantos do kraft sao nitidos, os externos
    # borram quando o recorte estoura no branco (a moldura saia torta). So' vale
    # quando o miolo e' a unica mancha quente — em pau de madeira ele vaza.
    quadM = quad_do_miolo(img) if uniforme else None
    if quadM is not None:
        hsvM = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        # o pau e' cor de madeira? amostra o anel entre o miolo e a borda externa
        cx, cy = quadM.mean(axis=0)
        esc = 1.12
        anel = ((quadM - [cx, cy]) * esc + [cx, cy]).astype(int)
        cores = [hsvM[min(max(y, 0), img.shape[0] - 1), min(max(x, 0), img.shape[1] - 1)] for x, y in anel]
        pau_quente = np.mean([(5 <= c[0] <= 32 and c[1] >= 45) for c in cores]) > 0.5
        if pau_quente:
            quadM = None
    if quadM is not None:
        plano = retifica_pelo_miolo(img, quadM, chao)
    else:
        plano = retifica(img, quad)
        # a franja de chao so' existe em foto crua. Em recorte de fundo liso o
        # apara_chao e' VENENO: pau branco ≈ fundo branco, comia a moldura toda.
        if not uniforme:
            plano, _ = apara_chao(plano, chao)
    # aparar muda a boca e a boca e' a referencia pra aparar: duas passadas
    # bastam (a segunda so' confirma que nao sobrou nada)
    apara = (0, 0, 0, 0)
    for _ in range(2):
        plano, corte = apara_franja(plano, abertura(plano))
        apara = tuple(a + c for a, c in zip(apara, corte))
        if not any(corte):
            break
    esq, top, dir_, bot = abertura(plano)

    asset = cv2.cvtColor(plano, cv2.COLOR_BGR2BGRA)
    asset[top:bot, esq:dir_, :3] = (0, 255, 0)   # miolo = verde chroma
    asset[..., 3] = 255                          # a moldura E' o canvas inteiro
    cv2.imwrite(args.out, asset)

    H, W = plano.shape[:2]
    print(f'OK {W}x{H} · miolo {dir_ - esq}x{bot - top} '
          f'· pau {esq}px esq / {W - dir_}px dir / {top}px topo / {H - bot}px base '
          f'· chao aparado {apara} -> {args.out}')

    if args.debug:
        dbg = plano.copy()
        cv2.rectangle(dbg, (esq, top), (dir_ - 1, bot - 1), (0, 0, 255), 3)
        cv2.imwrite(args.debug, dbg)
        print(f'   debug -> {args.debug} (vermelho = boca da moldura)')


if __name__ == '__main__':
    main()
