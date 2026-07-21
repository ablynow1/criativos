# MOCKUP NATIVO — o padrão da casa

> Fonte de verdade do formato "mockup de vitrine": um vídeo UGC de ~25s onde
> uma modelo, numa loja de molduras/galeria, apresenta um quadro que carrega
> **qualquer arte** — e a arte parece **pintada de verdade dentro do quadro**,
> não colada por cima. Este documento manda; se algo divergir daqui, daqui vale.

---

## 1. O princípio (por que "nativo")

Compor a arte **por cima de um vídeo com tela verde** tem um teto perceptual:
por melhor que seja a física sintetizada (sombra, luz, grão, motion-blur), o
olho ainda pega a arte "dançando" dentro do quadro. Isso foi exaustivamente
tentado (compose v2→v4) e **rejeitado**.

O padrão é o inverso:

> **A arte é aplicada na IMAGEM BASE de cada cena, e só ENTÃO o vídeo é gerado.**

O quadro com a arte já **nasce dentro da cena**. Luz, sombra, borrão de
movimento e perspectiva saem do próprio modelo de vídeo (Veo), como sairiam de
um quadro físico. Não existe nada colado ⇒ **não tem como dançar**. Impossível
por construção, não por calibragem.

---

## 2. Os dois conceitos

| Conceito | O que é | Frequência |
|----------|---------|------------|
| **Cenário** (o palco) | modelo + ambiente + moldura → 6 keyframes em **tela verde** validados | monta **1 vez**, reusa sempre |
| **Mockup** (o take) | cenário + arte + parâmetros → o vídeo final de ~25s | **toda arte nova** |

Separar é deliberado: gerar um cenário (identidade consistente em 6 cenas) é a
parte cara e que **pede olho humano** (o RAI bloqueia, a identidade varia).
Aplicar arte num cenário pronto é barato e **à prova de falha**. Aprova-se o
difícil uma vez.

---

## 3. O pipeline (3 passos)

```
                 ┌─ CENÁRIO (1x) ────────────────────────────┐
 texto livre  →  │ src/cenarios.js  monta os prompts fixos    │
 (avatar,        │ Nano Banana Pro: K1 (text2img) +           │  →  keyframes/
  ambiente,      │ K2..K6 (img2img de K1) = 6 quadros VERDES  │     K1..K6.png
  moldura)       └───────────────────────────────────────────┘
                 ┌─ MOCKUP (por arte) ───────────────────────┐
 arte + params → │ 1. mockup-art-keyframes.py                 │
                 │    aplica a arte nos K1..K6 → K1A..K6A      │  →  keyframes/
                 │    (física de still: sombra, luz, contato) │     K1A..K6A.png
                 │ 2. Veo 3.1 anima K*A → V1A..V6A             │  →  clips/V*A.mp4
                 │    (arte = "STATIC physical painting")      │
                 │ 3. montagem → 25.00s                        │  →  mockup-*.mp4
                 └───────────────────────────────────────────┘
```

**Passo 1 — aplicar a arte no still** (`tools/mockup-art-keyframes.py`):
compõe a arte no quadro verde de cada keyframe, com a física calibrada pra
imagem parada (sem grão — o Veo põe o dele; blur leve 0.9; sombra interna
bevel + linha de contato; gradiente de luminária e escurecimento por inclinação
medidos por keyframe). Center-crop automático pro aspecto real do quadro.

**Passo 2 — animar** (`generateVideoClip` via Veo 3.1): cada K*A vira um clipe
de 8s. O prompt de movimento é o do cenário/mockup, **sempre** com a cláusula
de arte estática (§4).

**Passo 3 — montar**: concatena trechos dos V*A no ritmo do formato, `-t 25`
crava 25.00s. Áudio: só ambiente, ou narração+trilha (opcional).

---

## 4. Regras invioláveis (as pegadinhas que custaram sangue)

1. **Arte = pintura estática no prompt do Veo.** Todo prompt de clipe TEM que
   conter, em substância:
   > *"The artwork inside the moulding is a STATIC physical painting — it stays
   > EXACTLY as in the reference image, rigid, moving only together with the
   > frame as one solid object; nothing inside the picture moves or morphs."*
   Sem isso, o Veo **anima o conteúdo do retrato** (o cachorro mexe, deforma).

2. **O wide 45° com arte + rosto bloqueia no RAI.** O keyframe tipo K1 (modelo
   de corpo inteiro girando o quadro grande perto do rosto) foi **bloqueado 4x**
   (3x com giro, 1x sem giro — é a *imagem*, não o movimento). Regra: **não
   contar com o wide-giro**. A gramática usa os outros beats (frontal, close,
   mãos, parede) e, quando precisa do wide, usa a **abertura do verso** ou
   janelas progressivas de outra cena.

3. **Chroma verde 100% chapado no keyframe.** O prompt do keyframe verde exige
   `#00FF00` sólido, sem reflexo/gradiente/sombra — é o que garante recorte
   perfeito na hora de aplicar a arte. (Não é onde a física vem; a física vem
   da geometria e do render do Veo.)

4. **Aspecto do quadro medido só onde o quad NÃO toca a borda.** Quadro cortado
   mente o aspecto (close deu 1.13 falso). Percentil 95 dos frames "inteiros" =
   aspecto real (~0.775 vertical no cenário #1).

5. **Fidelidade conferida no close extremo.** Sempre validar o retrato contra a
   arte original no frame mais fechado do dolly — pose, marcações e olhos.

6. **Cortes afinados por take.** Cada geração do Veo tem timing próprio; os
   pontos de corte da montagem são reconferidos por clipe (ex: dolly de parede
   que fecha rápido → cortar antes de virar só focinho).

---

## 5. Anatomia da gramática (os 6 shots fixos)

Os **movimentos de câmera/pose são fixos** — são a linguagem do formato,
espelhando o anúncio de referência (Ad Library `34784776947833729`). O que
muda por cenário é **quem** (avatar), **onde** (ambiente) e **a moldura**.

| Keyframe | Shot | Papel na montagem |
|----------|------|-------------------|
| K1 | wide, corpo inteiro apresentando (45°) | ⚠️ RAI-frágil — ver §4.2 |
| K2 | medium frontal, quadro de frente + rosto acima | reveal frontal |
| K3 | close no quadro, mão na borda | textura da arte |
| K4 | frontal, só o rosto acima da borda, mãos no topo | intimidade |
| K5 | parede, ela admirando de lado | produto na parede |
| K6 | parede sem pessoa, ângulo 30° | fecho/dolly |

Abertura opcional: **reveal do verso** — a modelo segura o quadro de costas
(verso realista) e gira até revelar a frente. Específico por cenário (o verso
é uma imagem própria); no cenário #1 é o **verso real do quadro físico do
Vitor** (custou 6 rodadas; ver histórico em `[[project_mockup_loja_greenscreen]]`).

---

## 5.5 Moldura por FOTO (biblioteca) e áudio de anúncio

**Moldura real:** suba a foto de uma moldura na biblioteca do estúdio — ela
entra como **referência img2img em todos os keyframes** do cenário (o mesmo
padrão que reproduziu o verso kraft no K12) e o Gemini vision gera a descrição
canônica pro texto do prompt (`src/describeMoldura.js`). K1 = img2img([foto]);
K2..K6 = img2img([K1, foto]). A moldura é **parte do palco** (baked nos
keyframes): pra trocar a moldura de um cenário aprovado, use "⟳ moldura"
(duplica herdando avatar/ambiente canônicos — só a moldura muda).

**Áudio:** o mockup aceita `audio: {narracao, voz, musica, legenda}` —
narração TTS (Neural2 com timestamps por palavra), trilha Lyria (moods em
`MUSIC_MOODS`), legenda queimada (caixa/contorno) e mixagem de estúdio via
`mergeFinal` (ducking sidechain, master -14 LUFS). Sem narração + com trilha =
mix simples com fade. `formatos: ['9:16','4:5']` exporta também o center-crop
1080x1350 pro feed.

## 5.6 Ermos: lugares e o "refazer"

**Lugares** (`src/fundos.js`, 16 presets): 8 externos de luxo + 8 **interiores
de casa** cujo eixo de variação é justamente serem incomparáveis entre si —
época, paleta, material da parede, piso e principalmente a *qualidade da luz*
(dura recortada, difusa sem sombra, high key, low key de lareira, noturna).
Todo preset de interior herda `BASE_INT`, que exige **parede central vazia** (o
quadro flutua ali) e móveis baixos nas laterais.

O keyframe é gerado uma vez por `tools/fundo-keyframes.mjs`, que grava em
`output/quadros/fundos/<id>/keyframe.png` (**o mesmo caminho que o
`fromFundo.js` procura**) e publica a thumb em `web/quadros/assets/fundos/`.
Sem isso o preview seria uma imagem e o vídeo outra. O manifest é sempre
derivado do `FUNDOS` — nunca editado à mão.

**Refazer** (`requeue_ermos`): clona um Ermos pronto trocando só a moldura
e/ou os lugares; artes, ritmo, duração, trilha e legenda vêm do snapshot
original. É o jeito barato de comparar variações do mesmo criativo — não passa
por Veo, roda em ~1 min.

## 6. Como adicionar um cenário novo

1. Descreve avatar + ambiente + moldura (texto livre).
2. `src/expandCenario.js` normaliza pra EN canônico e injeta nos templates
   fixos (`src/cenarios.js`).
3. `src/fromCenario.js` gera K1 (text2img) + K2..K6 (img2img) — 6 quadros verdes.
4. **Conferência humana**: identidade consistente entre as 6? verde chapado?
   Se não, regera a(s) cena(s) ruim(ns). (O K1 wide pode falhar no RAI — ok,
   ele é opcional na montagem.)
5. Aprovado → o cenário fica salvo (keyframes + `cenario.json`) e entra na
   biblioteca. Reusa à vontade.

---

## 7. Arquivos

| Arquivo | Papel |
|---------|-------|
| `src/cenarios.js` | templates fixos de prompt (keyframes + movimentos), parametrizados por `{avatar, ambiente, moldura, movimento}` |
| `src/expandCenario.js` | texto livre PT → `{avatar, ambiente, moldura}` canônico EN (Gemini) |
| `src/fromCenario.js` | CLI: gera os 6 keyframes verdes de um cenário |
| `src/fromMockup.js` | CLI: cenário + arte + params → vídeo 25s |
| `tools/mockup-art-keyframes.py` | aplica a arte nos keyframes (física de still) |
| `tools/mockup-loja.mjs` | (legado/cenário #1) gerador dos keyframes e clipes originais |
| `tools/mockup-loja-montagem-arte.sh` | (legado/cenário #1) montagem de referência |

O cenário **#1** ("Loja noturna · Loira", com o verso real) é o estado atual
já validado e entregue — serve de gabarito pros novos.

---

## 8. Custo e tempo (a verdade)

- **Cenário novo**: ~6-7 imagens Nano Banana (barato) + conferência humana
  (pode pedir 1-2 regeragens até a identidade fechar).
- **Mockup (por arte)**: ~5-6 clipes Veo 3.1 (custo real por clipe + alguns
  minutos). É o preço de parecer real. O master verde + compose fica guardado
  como caminho grátis/rápido pra volume, quando fidelidade máxima não importa.
