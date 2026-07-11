#!/bin/bash
# Constroi a ABERTURA (verso kraft -> giro -> verde) do mockup.
# ORDEM IMPORTA: desacelera o giro verde PRIMEIRO (rampa + interpolacao de
# movimento), e SO' DEPOIS pinta o kraft por cima. Se pintar antes da rampa, o
# minterpolate borra kraft+verde e vaza verde no key. Saida = clips/V0.mp4.
set -euo pipefail
cd "$(dirname "$0")/.."
FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg; [ -x "$FF" ] || FF=ffmpeg
FP=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe; [ -x "$FP" ] || FP=ffprobe
PY=tools/.venv-compose/bin/python

RAW=output/mockup-loja/clips/V10.mp4
GREEN=output/mockup-loja/clips/V0-green.mp4        # giro verde ja' desacelerado
KRAFT=output/mockup-loja/keyframes/kraft-texture.png
OUT=output/mockup-loja/clips/V0.mp4

# 1) rampa de velocidade no giro VERDE cru (verso/flip lento -> le-se; verde normal)
"$FF" -y -v error -i "$RAW" -f lavfi -t 3 -i anullsrc=r=48000:cl=stereo -filter_complex "
[0:v]trim=0:0.79,setpts=PTS-STARTPTS,setpts=2.6*PTS,
     minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,
     scale=1080:1920,setsar=1[a];
[0:v]trim=0.79:1.67,setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1[b];
[a][b]concat=n=2:v=1[v]
" -map "[v]" -map "1:a" -shortest -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart "$GREEN"

# 2) pinta o kraft na fase de costas (antes do edge-on) do clipe JA' desacelerado
$PY tools/mockup-bake-verso.py --clip "$GREEN" --kraft "$KRAFT" --out "$OUT" --feather 4

echo "V0 (abertura) duracao: $($FP -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT")s"
echo "$OUT"
