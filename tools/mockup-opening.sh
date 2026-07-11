#!/bin/bash
# Constroi a ABERTURA (verso kraft -> giro -> verde) do mockup a partir do V10.
#
# Licoes das tentativas anteriores (nao regredir):
# - minterpolate (MCI) fazia o FUNDO piscar -> banido.
# - Slowdown 2.6x com blend no giro inteiro criava frames hibridos no flip
#   rapido -> verso rachava kraft/verde -> banido.
# - Agora: desacelera 2x SO' a fase de costas (movimento lento, blend entre
#   frames quase identicos = invisivel); o flip rapido fica NATIVO (o anuncio
#   de referencia tambem mostra o verso so' de relance).
set -euo pipefail
cd "$(dirname "$0")/.."
FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg; [ -x "$FF" ] || FF=ffmpeg
FP=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe; [ -x "$FP" ] || FP=ffprobe
PY=tools/.venv-compose/bin/python

SRC=output/mockup-loja/clips/V10.mp4
CUT=output/mockup-loja/clips/V0-cut.mp4
KRAFT=output/mockup-loja/keyframes/kraft-texture.png
OUT=output/mockup-loja/clips/V0.mp4

# costas [0:0.33] desacelerada 2x (blend leve) + flip/abre [0.33:1.67] NATIVO
"$FF" -y -v error -i "$SRC" -f lavfi -t 3 -i anullsrc=r=48000:cl=stereo -filter_complex "
[0:v]trim=0:0.33,setpts=PTS-STARTPTS,setpts=2.0*PTS,framerate=fps=30[a];
[0:v]trim=0.33:1.67,setpts=PTS-STARTPTS,fps=30[b];
[a][b]concat=n=2:v=1,scale=1080:1920,setsar=1[v]
" -map "[v]" -map "1:a" -shortest -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart "$CUT"

# pinta o kraft na fase de costas (antes do edge-on)
$PY tools/mockup-bake-verso.py --clip "$CUT" --kraft "$KRAFT" --out "$OUT" --feather 1

echo "V0 (abertura) duracao: $($FP -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT")s"
echo "$OUT"
